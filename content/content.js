/**
 * File: content/content.js
 * Purpose: Bootstraps PromptNest content runtime and message listeners on supported sites.
 * Communicates with: utils/platform.js, content/toolbar.js, content/injector.js, background/service_worker.js.
 */

/** Handles inbound runtime messages from popup or background scripts. */
const handleRuntimeMessage = async (message, _sender, sendResponse) => {
  if (!message || !message.type) {
    sendResponse({ ok: false, error: 'Invalid message payload.' });
    return;
  }

  if (message.type === 'pn.injectPrompt') {
    const success = await window.PromptNestInjector.inject(message.payload?.text || '');
    sendResponse({ ok: success });
    return;
  }

  if (message.type === 'pn.scrapeChat') {
    const chat = await window.PromptNestScraper.scrape();
    sendResponse({ ok: true, data: chat });
    return;
  }

  sendResponse({ ok: false, error: `Unhandled message type: ${message.type}` });
};

/** Adapts chrome.runtime.onMessage to an async handler and keeps the channel open. */
const onRuntimeMessage = (message, sender, sendResponse) => {
  void handleRuntimeMessage(message, sender, sendResponse);
  return true;
};

/** Initializes PromptNest content features when a supported platform is detected. */
const initContent = async () => {
  const platform = await window.PromptNestPlatform.detect();

  if (!platform) {
    return;
  }

  await window.PromptNestToolbar.waitAndInject();
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
};

void initContent();
