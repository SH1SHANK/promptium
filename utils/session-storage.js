(() => {
/**
 * File: utils/session-storage.js
 * Purpose: Session/local storage helpers for sidepanel runtime handoff.
 */

const PROVIDER_KEY_MAP = Object.freeze({
  gemini: 'promptiumGeminiKey',
  openai: 'promptiumOpenAIKey',
  anthropic: 'promptiumAnthropicKey',
  openrouter: 'promptiumOpenRouterKey'
});

const normalizeProviderId = (providerId = '') => String(providerId || '').trim().toLowerCase();

const getProviderStorageKey = (providerId = '') => {
  const key = PROVIDER_KEY_MAP[normalizeProviderId(providerId)];
  return String(key || '').trim();
};

const migrateLocalKeyToSession = async (storageKey) => {
  const localSnapshot = await chrome.storage.local.get([storageKey]);
  const localKey = String(localSnapshot?.[storageKey] || '').trim();
  if (localKey) {
    await chrome.storage.session.set({ [storageKey]: localKey });
    await chrome.storage.local.remove([storageKey]).catch(() => {});
  }
  return localKey;
};

const getStoredProviderKey = async (providerId = '') => {
  const storageKey = getProviderStorageKey(providerId);
  if (!storageKey) return '';

  const sessionSnapshot = await chrome.storage.session.get([storageKey]);
  const sessionKey = String(sessionSnapshot?.[storageKey] || '').trim();
  if (sessionKey) {
    return sessionKey;
  }

  return migrateLocalKeyToSession(storageKey);
};

const setStoredProviderKey = async (providerId = '', rawKey = '') => {
  const storageKey = getProviderStorageKey(providerId);
  if (!storageKey) return;

  const key = String(rawKey || '').trim();
  if (key) {
    await chrome.storage.session.set({ [storageKey]: key });
  } else {
    await chrome.storage.session.remove([storageKey]).catch(() => {});
  }
  await chrome.storage.local.remove([storageKey]).catch(() => {});
};

/** Reads Gemini key from session storage with one-time migration from local storage. */
const getStoredGeminiKey = async () => getStoredProviderKey('gemini');

/** Stores Gemini key in session storage only and clears persistent legacy copy. */
const setStoredGeminiKey = async (rawKey) => setStoredProviderKey('gemini', rawKey);

/** Clones export payload and normalizes message rows. */
const cloneExportPayload = (payload) => {
  if (!payload || !Array.isArray(payload.messages)) {
    return null;
  }
  return {
    ...payload,
    messages: payload.messages.map((message) => ({
      role: String(message?.role || 'assistant'),
      text: String(message?.text || ''),
      html: String(message?.html || '')
    }))
  };
};

/** Returns export snapshot when available, otherwise current payload. */
const getActiveExportPayload = (state) => state?.exportSnapshotPayload || state?.exportPayload;

const SessionStorage = {
  PROVIDER_KEY_MAP,
  getProviderStorageKey,
  getStoredProviderKey,
  setStoredProviderKey,
  getStoredGeminiKey,
  setStoredGeminiKey,
  cloneExportPayload,
  getActiveExportPayload
};

if (typeof window !== 'undefined') {
  window.SessionStorage = SessionStorage;
}
})();
