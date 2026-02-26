/**
 * File: content/content.js
 * Purpose: Boots PromptNest content features, handles runtime actions, and applies pending cross-LLM context injection.
 * Communicates with: utils/platform.js, utils/storage.js, utils/exporter.js, content/scraper.js, content/injector.js, content/toolbar.js.
 */

window.__PN = window.__PN || {};

if (!window.__PN.PENDING_CONTEXT_KEY) {
  window.__PN.PENDING_CONTEXT_KEY = 'pendingContext';
}
const PLATFORM_LABELS = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  copilot: 'Copilot'
};

/** Creates a chat payload object from scraped messages and page metadata. */
const createChatPayload = async (platform, messages) => ({
  title: document.title || 'Untitled chat',
  platform,
  tags: [],
  messages,
  url: window.location.href
});

/** Handles injectPrompt action messages from popup and returns operation status. */
const handleInjectPrompt = async (msg, platform, sendResponse) => {
  const success = await window.Injector.inject(String(msg?.text || ''), platform);
  sendResponse({ ok: success });
};

/** Handles exportChat action by scraping, storing history, and exporting chat data. */
const handleExportChat = async (msg, platform, sendResponse) => {
  const messages = await window.Scraper.scrape(platform);

  if (!messages.length) {
    sendResponse({ ok: false, error: 'No chat messages available to export.' });
    return;
  }

  const payload = await createChatPayload(platform, messages);
  const saved = await window.Store.saveChatToHistory(payload);

  if (!saved) {
    sendResponse({ ok: false, error: 'Failed to save chat history.' });
    return;
  }

  const result = await window.Exporter.exportChat(
    saved,
    String(msg?.format || 'md').toLowerCase(),
    msg?.prefs || {}
  );

  sendResponse(result);
};

/** Handles getPlatform action by returning the detected platform identifier. */
const handleGetPlatform = async (platform, sendResponse) => {
  sendResponse({ ok: true, platform });
};

/** Routes incoming runtime messages by action name and wraps execution errors. */
const onRuntimeMessage = (msg, _sender, sendResponse) => {
  void (async () => {
    let responded = false;
    /** Sends a response once to avoid message channel closure errors. */
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
      const platform = await window.Platform.detect();

      if (!platform) {
        respond({ ok: false, error: 'Unsupported platform.' });
        return;
      }

      if (msg?.action === 'injectPrompt') {
        await handleInjectPrompt(msg, platform, respond);
        return;
      }

      if (msg?.action === 'exportChat') {
        await handleExportChat(msg, platform, respond);
        return;
      }

      if (msg?.action === 'getPlatform') {
        await handleGetPlatform(platform, respond);
        return;
      }

      respond({ ok: false, error: `Unknown action: ${String(msg?.action || 'undefined')}` });
    } catch (error) {
      respond({ ok: false, error: error.message || 'Unexpected content script failure.' });
    } finally {
      if (!responded) {
        respond({ ok: false, error: 'No response generated for request.' });
      }
    }
  })();

  return true;
};

/** Reads pending cross-LLM context and injects it when current platform matches target. */
const hydratePendingContext = async (platform) => {
  try {
    const pendingKey = window.__PN.PENDING_CONTEXT_KEY;
    const state = await chrome.storage.local.get([pendingKey]);
    const pending = state?.[pendingKey];

    if (!pending || pending.targetPlatform !== platform || !pending.text) {
      return;
    }

    let success = false;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      success = await window.Injector.inject(String(pending.text), platform);

      if (success) {
        break;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 300);
      });
    }

    if (success) {
      await chrome.storage.local.remove(pendingKey);
      const label = PLATFORM_LABELS[platform] || platform;
      await window.Toolbar.showNotification(`Context injected into ${label}`);
    }
  } catch (error) {
    console.error('[PromptNest][Content] Failed pending context hydration.', error);
  }
};

/** Initializes content execution when the current page matches a supported platform. */
const init = async () => {
  const platform = await window.Platform.detect();

  if (!platform) {
    return;
  }

  await window.Toolbar.waitAndInject(platform);
  await hydratePendingContext(platform);
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
};

void init();
