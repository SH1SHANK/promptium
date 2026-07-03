/**
 * content/integration/messaging.ts
 * Routes chrome.runtime messages to the correct handler.
 * Owns: onRuntimeMessage, prompt injection, scraping bridging, platform detection.
 */
import { getCurrentAdapter } from '../../platform';
import { toast } from '../../shared/utils/toast';
import { exportSelectionState } from '../state';

export const createChatPayload = async (platform: any, messages: any) => ({
  title: document.title || 'Untitled chat',
  platform,
  tags: [],
  messages,
  url: window.location.href,
});

export const notify = async (message: any) => {
  const text = String(message || '').trim();
  if (!text) return;
  toast.info(text);
};

export const normalizeComposerText = (value: any) =>
  String(value || '').replace(/\r\n/g, '\n');

export const getComposerNode = async (_platform: any) => {
  const adapter = getCurrentAdapter();
  return adapter ? adapter.getComposerElement() : null;
};

export const readComposerText = async (platform: any) => {
  const composer = await getComposerNode(platform);
  if (!composer) return null;
  if (composer instanceof HTMLInputElement || composer instanceof HTMLTextAreaElement) {
    return String(composer.value || '');
  }
  return String(composer.textContent || '');
};

export const handleInjectPrompt = async (msg: any, platform: any, sendResponse: any) => {
  const nextText = String(msg?.text || '');
  const previousText = await readComposerText(platform);
  const success = await (window as any).Injector.inject(nextText, platform);
  if (success && previousText != null) {
    // stageInjectionUndo is called from the controller to avoid circular deps
    sendResponse({ ok: success, previousText, nextText, platform });
  } else {
    sendResponse({ ok: success });
  }
};

export const handleExportChat = async (msg: any, platform: any, sendResponse: any) => {
  const messages = await (window as any).Scraper.scrape(platform);
  if (!messages.length) {
    sendResponse({ ok: false, error: 'No chat messages available to export.' });
    return;
  }
  const payload = await createChatPayload(platform, messages);
  const result = await ((window as any).Exporter as any).exportChat(
    payload,
    String(msg?.format || 'md').toLowerCase(),
    msg?.prefs || {}
  );
  sendResponse(result);
};

export const handleGetPlatform = async (platform: any, sendResponse: any) => {
  sendResponse({ ok: true, platform });
};

export const handleScrapeForBridge = async (platform: any, sendResponse: any) => {
  const messages = await (window as any).Scraper.scrape(platform);
  sendResponse({ ok: true, platform, messages });
};

export const handleScrapeForContinuation = async (platform: any, sendResponse: any) => {
  const messages = await (window as any).Scraper.scrape(platform);
  sendResponse({ ok: true, platform, messages });
};
