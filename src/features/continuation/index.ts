export * from './handoff-builder';
export * from './platform-injector';

import { injectContinuationContext } from './platform-injector';

export const ContinuationUI = {
  openFromActiveTab: async (): Promise<boolean> => {
    try {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = activeTabs[0];
      if (!activeTab || !activeTab.url) return false;

      // Extract current platform
      const url = activeTab.url.toLowerCase();
      let sourcePlatform = 'unknown';
      if (url.includes('chatgpt.com')) sourcePlatform = 'chatgpt';
      else if (url.includes('claude.ai')) sourcePlatform = 'claude';
      else if (url.includes('gemini.google.com')) sourcePlatform = 'gemini';
      else if (url.includes('perplexity.ai')) sourcePlatform = 'perplexity';
      else if (url.includes('copilot.microsoft.com')) sourcePlatform = 'copilot';

      if (sourcePlatform === 'unknown') return false;

      // Determine default target platform (e.g. ChatGPT -> Claude or Claude -> ChatGPT)
      const targetPlatform = sourcePlatform === 'chatgpt' ? 'claude' : 'chatgpt';

      return await injectContinuationContext(sourcePlatform, targetPlatform);
    } catch (_) {
      return false;
    }
  },
  bindEvents: () => {},
};

if (typeof window !== 'undefined') {
  (window as any).ContinuationUI = ContinuationUI;
}
