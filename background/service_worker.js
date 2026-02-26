/**
 * File: background/service_worker.js
 * Purpose: Initializes base storage keys and handles extension-level runtime actions.
 * Communicates with: utils/storage.js, popup/popup.js, content/content.js, content/export-dialog.js.
 */

/** Ensures prompts and chatHistory keys exist in storage without overwriting existing data. */
const initializeStorageKeys = async () => {
  const state = await chrome.storage.local.get(['prompts', 'chatHistory']);
  const updates = {};

  if (!Array.isArray(state.prompts)) {
    updates.prompts = [];
  }

  if (!Array.isArray(state.chatHistory)) {
    updates.chatHistory = [];
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
};

/** Handles extension install lifecycle and applies initial storage setup. */
const onInstalled = async () => {
  try {
    await initializeStorageKeys();
  } catch (error) {
    console.error('[PromptNest][ServiceWorker] Initialization failed.', error);
  }
};

/** Opens a new browser tab when content scripts request cross-LLM navigation. */
const handleOpenLlmTab = async (url) => {
  try {
    const parsed = new URL(String(url || ''));

    if (!['https:', 'http:'].includes(parsed.protocol)) {
      return { ok: false, error: 'Invalid tab URL.' };
    }

    await chrome.tabs.create({ url: parsed.toString() });
    return { ok: true };
  } catch (_error) {
    return { ok: false, error: 'Failed to open requested tab.' };
  }
};

/** Routes runtime messages and keeps channel open for async response delivery. */
const onRuntimeMessage = (message, _sender, sendResponse) => {
  void (async () => {
    if (message?.action === 'openLlmTab') {
      sendResponse(await handleOpenLlmTab(message.url));
      return;
    }

    sendResponse({ ok: false, error: `Unknown action: ${String(message?.action || 'undefined')}` });
  })();

  return true;
};

chrome.runtime.onInstalled.addListener(() => {
  void onInstalled();
});

chrome.runtime.onMessage.addListener(onRuntimeMessage);
