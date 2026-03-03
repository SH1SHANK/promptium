(() => {
/**
 * File: utils/session-storage.js
 * Purpose: Session/local storage helpers for sidepanel runtime handoff.
 */

const GEMINI_KEY = 'promptiumGeminiKey';

/** Reads Gemini key from session storage with one-time migration from local storage. */
const getStoredGeminiKey = async () => {
  const sessionSnapshot = await chrome.storage.session.get([GEMINI_KEY]);
  const sessionKey = String(sessionSnapshot?.[GEMINI_KEY] || '').trim();
  if (sessionKey) {
    return sessionKey;
  }

  const localSnapshot = await chrome.storage.local.get([GEMINI_KEY]);
  const localKey = String(localSnapshot?.[GEMINI_KEY] || '').trim();
  if (localKey) {
    await chrome.storage.session.set({ [GEMINI_KEY]: localKey });
    await chrome.storage.local.remove([GEMINI_KEY]).catch(() => {});
  }
  return localKey;
};

/** Stores Gemini key in session storage only and clears persistent legacy copy. */
const setStoredGeminiKey = async (rawKey) => {
  const key = String(rawKey || '').trim();
  if (key) {
    await chrome.storage.session.set({ [GEMINI_KEY]: key });
  } else {
    await chrome.storage.session.remove([GEMINI_KEY]).catch(() => {});
  }
  await chrome.storage.local.remove([GEMINI_KEY]).catch(() => {});
};

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
  getStoredGeminiKey,
  setStoredGeminiKey,
  cloneExportPayload,
  getActiveExportPayload
};

if (typeof window !== 'undefined') {
  window.SessionStorage = SessionStorage;
}
})();
