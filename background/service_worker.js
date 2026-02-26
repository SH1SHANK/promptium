/**
 * File: background/service_worker.js
 * Purpose: Initializes extension defaults and handles lifecycle events for PromptNest.
 * Communicates with: utils/storage.js, popup/popup.js, content/content.js.
 */

const DEFAULT_STORAGE = {
  prompts: [],
  chatHistory: []
};

/** Ensures PromptNest base keys exist in chrome.storage.local at install time. */
const initializeDefaultStorage = async () => {
  const existing = await chrome.storage.local.get(DEFAULT_STORAGE);
  const prompts = Array.isArray(existing.prompts) ? existing.prompts : [];
  const chatHistory = Array.isArray(existing.chatHistory) ? existing.chatHistory : [];

  await chrome.storage.local.set({
    prompts,
    chatHistory
  });
};

/** Handles the extension installation lifecycle hook. */
const onInstalled = async () => {
  await initializeDefaultStorage();
};

/** Adapts the install event listener to the async installer routine. */
const onInstalledListener = () => {
  void onInstalled();
};

chrome.runtime.onInstalled.addListener(onInstalledListener);
