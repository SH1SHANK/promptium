(() => {
/**
 * File: utils/continuation.js
 * Purpose: Build and hydrate AI continuation handoffs for same/cross-LLM chat continuation.
 */

const CONTINUATION_KEY = 'pendingContinuation';
const CONTINUATION_TTL_MS = 180000;
const FALLBACK_MESSAGE_COUNT = 6;
const MAX_SOURCE_MESSAGES = 24;
const LONG_CONVERSATION_THRESHOLD = 20;
const LONG_NO_KEY_ADVISORY = 'Long conversation: quality may be limited without a cloud API key.';

const MODE_ALIASES = Object.freeze({
  full_summary: 'FULL_SUMMARY',
  full: 'FULL_SUMMARY',
  key_points: 'KEY_POINTS',
  points: 'KEY_POINTS',
  recent_only: 'RECENT_ONLY',
  recent: 'RECENT_ONLY',
  last_messages: 'RECENT_ONLY'
});

const normalizeMode = (value) => {
  const key = String(value || '').trim().toLowerCase();
  return MODE_ALIASES[key] || (['FULL_SUMMARY', 'KEY_POINTS', 'RECENT_ONLY'].includes(String(value || '').trim())
    ? String(value || '').trim()
    : 'FULL_SUMMARY');
};

const normalizeRole = (role) => {
  const value = String(role || '').trim().toLowerCase();
  if (['user', 'you', 'human'].includes(value)) return 'Human';
  if (['assistant', 'model', 'bot', 'ai'].includes(value)) return 'Assistant';
  return value.includes('user') ? 'Human' : 'Assistant';
};

const normalizeMessages = (messages) => {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message) => ({
      role: normalizeRole(message?.role),
      text: String(message?.text || '').trim()
    }))
    .filter((message) => message.text.length > 0);
};

const buildFallback = (messages) => {
  const rows = normalizeMessages(messages)
    .slice(-FALLBACK_MESSAGE_COUNT)
    .map((message) => `${message.role}: ${message.text}`)
    .join('\n\n');

  if (!rows) {
    return 'We were working on this conversation. Continue from here:';
  }

  return [
    'We were working on this conversation and need to continue in this new chat.',
    '',
    rows,
    '',
    'Continue from here:'
  ].join('\n');
};

const resolveCloudKey = async (explicitKey) => {
  const fromArg = String(explicitKey || '').trim();
  if (fromArg) return fromArg;

  let activeProvider = 'gemini';
  try {
    const snapshot = await chrome.storage.local.get(['promptiumSettings']);
    const settings = snapshot?.promptiumSettings && typeof snapshot.promptiumSettings === 'object'
      ? snapshot.promptiumSettings
      : {};
    activeProvider = String(settings?.activeProvider || 'gemini').trim().toLowerCase() || 'gemini';
  } catch (_error) {
    activeProvider = 'gemini';
  }

  if (window.SessionStorage?.getStoredProviderKey) {
    try {
      return String(await window.SessionStorage.getStoredProviderKey(activeProvider) || '').trim();
    } catch (_error) {
      return '';
    }
  }

  if (window.SessionStorage?.getStoredGeminiKey) {
    try {
      return String(await window.SessionStorage.getStoredGeminiKey() || '').trim();
    } catch (_error) {
      return '';
    }
  }

  return '';
};

const isLocalContinuationAvailable = async () => {
  try {
    const snapshot = await chrome.storage.local.get(['promptiumSettings']);
    const settings = snapshot?.promptiumSettings && typeof snapshot.promptiumSettings === 'object'
      ? snapshot.promptiumSettings
      : {};
    if (settings?.enableAI === false) return false;
    if (settings?.localFeatureFlags?.continueSummary === false) return false;
  } catch (_error) {
    // Ignore settings read failures and continue with runtime status probe.
  }

  try {
    const status = await chrome.runtime.sendMessage({ type: 'AI_LOCAL_MODEL_STATUS' });
    const value = String(status?.status || '').trim().toLowerCase();
    return ['ready', 'cached', 'loading', 'downloading'].includes(value);
  } catch (_error) {
    return false;
  }
};

const buildHandoff = async (messages, mode = 'FULL_SUMMARY', userNote = '', cloudKey = '') => {
  const normalized = normalizeMessages(messages).slice(-MAX_SOURCE_MESSAGES);
  if (!normalized.length) {
    return { ok: false, error: 'no_messages' };
  }

  const key = await resolveCloudKey(cloudKey);
  const isLongConversation = normalized.length > LONG_CONVERSATION_THRESHOLD;

  if (isLongConversation && !key) {
    const localAvailable = await isLocalContinuationAvailable();
    if (!localAvailable) {
      return { ok: false, error: 'no_ai_available' };
    }
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AI_CONTINUE_SUMMARY',
        key: '',
        mode: normalizeMode(mode),
        userNote: String(userNote || '').trim(),
        messages: normalized,
        forceLocal: true
      });
      const text = String(response?.text || '').trim();
      if (!response?.ok || !text) {
        return { ok: false, error: 'no_ai_available' };
      }
      return {
        ok: true,
        text,
        backend: 'local',
        advisory: LONG_NO_KEY_ADVISORY
      };
    } catch (_error) {
      return { ok: false, error: 'no_ai_available' };
    }
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AI_CONTINUE_SUMMARY',
      key,
      mode: normalizeMode(mode),
      userNote: String(userNote || '').trim(),
      messages: normalized
    });

    const text = String(response?.text || '').trim();
    if (!response?.ok || !text) {
      if (!key) {
        return {
          ok: true,
          text: buildFallback(normalized),
          backend: 'fallback',
          advisory: String(response?.advisory || '').trim() || undefined
        };
      }
      return {
        ok: true,
        text: buildFallback(normalized),
        backend: 'fallback',
        advisory: String(response?.advisory || '').trim() || undefined
      };
    }

    return {
      ok: true,
      text,
      backend: String(response?.backend || '').trim() || 'cloud',
      advisory: String(response?.advisory || '').trim() || undefined
    };
  } catch (_error) {
    if (!key) {
      return { ok: true, text: buildFallback(normalized), backend: 'fallback' };
    }
    return { ok: false, error: 'continuation_failed' };
  }
};

const store = async (handoffText, targetPlatform, sourcePlatform = 'unknown') => {
  const text = String(handoffText || '').trim();
  const target = String(targetPlatform || '').trim().toLowerCase();
  if (!text || !target) {
    throw new Error('Missing handoff text or target platform.');
  }

  await chrome.storage.local.set({
    [CONTINUATION_KEY]: {
      text,
      sourcePlatform: String(sourcePlatform || 'unknown').trim().toLowerCase(),
      targetPlatform: target,
      createdAt: Date.now()
    }
  });
};

const checkPending = async (currentPlatform) => {
  const snapshot = await chrome.storage.local.get([CONTINUATION_KEY]).catch(() => ({}));
  const pending = snapshot?.[CONTINUATION_KEY];
  if (!pending) return null;

  const current = String(currentPlatform || '').trim().toLowerCase();
  const target = String(pending?.targetPlatform || '').trim().toLowerCase();
  if (!target || !pending?.text) {
    await chrome.storage.local.remove([CONTINUATION_KEY]).catch(() => {});
    return null;
  }

  if (current && current !== target) {
    return null;
  }

  const createdAt = Number(pending?.createdAt) || 0;
  if (!createdAt || (Date.now() - createdAt) > CONTINUATION_TTL_MS) {
    await chrome.storage.local.remove([CONTINUATION_KEY]).catch(() => {});
    return { kind: 'expired', sourcePlatform: String(pending?.sourcePlatform || 'unknown') };
  }

  return {
    kind: 'ready',
    text: String(pending?.text || ''),
    sourcePlatform: String(pending?.sourcePlatform || 'unknown'),
    targetPlatform: target
  };
};

window.Continuation = {
  CONTINUATION_KEY,
  CONTINUATION_TTL_MS,
  normalizeMode,
  buildHandoff,
  buildFallback,
  store,
  checkPending
};
})();
