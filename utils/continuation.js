(() => {
/**
 * File: utils/continuation.js
 * Purpose: Build and hydrate AI continuation handoffs for same/cross-LLM chat continuation.
 */

const CONTINUATION_KEY = 'pendingContinuation';
const CONTINUATION_TTL_MS = 180000;
const FALLBACK_MESSAGE_COUNT = 6;
const MAX_SOURCE_MESSAGES = 24;

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

const resolveGeminiKey = async (explicitKey) => {
  const fromArg = String(explicitKey || '').trim();
  if (fromArg) return fromArg;

  if (window.SessionStorage?.getStoredGeminiKey) {
    try {
      return String(await window.SessionStorage.getStoredGeminiKey() || '').trim();
    } catch (_error) {
      return '';
    }
  }

  return '';
};

const buildHandoff = async (messages, mode = 'FULL_SUMMARY', userNote = '', geminiKey = '') => {
  const normalized = normalizeMessages(messages).slice(-MAX_SOURCE_MESSAGES);
  if (!normalized.length) {
    return buildFallback([]);
  }

  const key = await resolveGeminiKey(geminiKey);
  if (!key) {
    return buildFallback(normalized);
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
      return buildFallback(normalized);
    }

    return text;
  } catch (_error) {
    return buildFallback(normalized);
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

  await chrome.storage.local.remove([CONTINUATION_KEY]).catch(() => {});
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
