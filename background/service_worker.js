/**
 * File: background/service_worker.js
 * Purpose: Initializes storage, configures side panel behavior, and handles extension-level runtime actions.
 * Communicates with: utils/storage.js, popup/popup.js, content/content.js.
 */

const SIDE_PANEL_PATH = 'sidepanel/sidepanel.html';
const SIDEPANEL_SESSION_KEY = 'pnSidePanelPayload';
const ALLOWED_LLM_HOSTS = new Set([
  'chatgpt.com',
  'claude.ai',
  'gemini.google.com',
  'www.perplexity.ai',
  'copilot.microsoft.com'
]);

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

/** Enables side panel open-on-action behavior once during startup/install lifecycle. */
const configureSidePanelBehavior = async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error('[PromptNest][ServiceWorker] Failed to configure side panel behavior.', error);
  }
};

/** Ensures the side panel is enabled for the sender tab with the expected panel path. */
const enableSidePanelForTab = async (tabId) => {
  if (!Number.isInteger(tabId)) {
    return;
  }

  await chrome.sidePanel.setOptions({
    tabId,
    enabled: true,
    path: SIDE_PANEL_PATH
  });
};

/** Handles extension install lifecycle and applies initial storage and side panel setup. */
const onInstalled = async () => {
  try {
    await initializeStorageKeys();
    await configureSidePanelBehavior();
  } catch (error) {
    console.error('[PromptNest][ServiceWorker] Initialization failed.', error);
  }
};

/** Re-applies runtime side panel/storage session behavior after browser startup. */
const onStartup = async () => {
  await configureSidePanelBehavior();
};

/** Opens a new browser tab when content scripts request cross-LLM navigation. */
const handleOpenLlmTab = async (url) => {
  try {
    const parsed = new URL(String(url || ''));

    if (!['https:', 'http:'].includes(parsed.protocol)) {
      return { ok: false, error: 'Invalid tab URL.' };
    }

    if (!ALLOWED_LLM_HOSTS.has(parsed.hostname.toLowerCase())) {
      return { ok: false, error: 'Target host is not allowlisted.' };
    }

    await chrome.tabs.create({ url: parsed.toString() });
    return { ok: true };
  } catch (_error) {
    return { ok: false, error: 'Failed to open requested tab.' };
  }
};

/** Stores side panel payload in trusted service-worker context session storage. */
const handleSetSidePanelPayload = async (payload) => {
  const value = payload && typeof payload === 'object' ? payload : null;

  if (!value || !Array.isArray(value.messages)) {
    return { ok: false, error: 'Invalid side panel payload.' };
  }

  try {
    await chrome.storage.session.set({ [SIDEPANEL_SESSION_KEY]: value });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'Failed to persist side panel payload.' };
  }
};

/** Opens the side panel in the sender window and optionally persists payload. */
const handleOpenSidePanel = async (sender, payload = null) => {
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;

  if (!Number.isInteger(windowId)) {
    return { ok: false, error: 'Missing sender window context for side panel.' };
  }

  try {
    // Must run immediately in direct response to user gesture.
    await chrome.sidePanel.open({ windowId });

    // Persist payload after opening to avoid breaking user-gesture requirement.
    if (payload && typeof payload === 'object') {
      const persisted = await handleSetSidePanelPayload(payload);

      if (!persisted.ok) {
        return { ok: false, error: persisted.error || 'Side panel opened, but payload failed to persist.' };
      }
    }

    // Keep tab-scoped panel options in sync, but do not block successful open.
    void enableSidePanelForTab(tabId).catch((error) => {
      console.warn('[PromptNest][ServiceWorker] Failed to sync tab side panel options.', error);
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'Unable to open side panel.' };
  }
};

/** Routes runtime messages and keeps channel open for async response delivery. */
const onRuntimeMessage = (message, sender, sendResponse) => {
  void (async () => {
    let responded = false;

    const respond = (payload) => {
      if (responded) {
        return;
      }

      responded = true;

      try {
        sendResponse(payload);
      } catch (_error) {
        return;
      }
    };

    try {
      if (message?.action === 'openLlmTab') {
        respond(await handleOpenLlmTab(message.url));
        return;
      }

      if (message?.action === 'OPEN_SIDEPANEL') {
        respond(await handleOpenSidePanel(sender, message.payload || null));
        return;
      }

      if (message?.action === 'SET_SIDEPANEL_PAYLOAD') {
        respond(await handleSetSidePanelPayload(message.payload));
        return;
      }

      respond({ ok: false, error: `Unknown action: ${String(message?.action || 'undefined')}` });
    } catch (error) {
      respond({ ok: false, error: error?.message || 'Unexpected service worker failure.' });
    }
  })();

  return true;
};

void configureSidePanelBehavior();

chrome.runtime.onInstalled.addListener(() => {
  void onInstalled();
});

chrome.runtime.onStartup.addListener(() => {
  void onStartup();
});

chrome.runtime.onMessage.addListener(onRuntimeMessage);
