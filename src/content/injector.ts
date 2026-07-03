import { getCurrentAdapter, getAdapters } from '../platform';

(() => {
  /**
   * File: content/injector.js
   * Purpose: Legacy wrapper for injecting prompt text into LLM composers using PlatformAdapter architecture.
   */

  const inject = async (text: any, platformId: any = null) => {
    try {
      let adapter = getCurrentAdapter();
      if (platformId) {
        const found = getAdapters().find((a) => a.id === String(platformId).toLowerCase());
        if (found) {
          adapter = found;
        }
      }

      if (!adapter) {
        console.warn('[Promptium][Injector] No adapter found for platform:', platformId);
        return false;
      }

      await adapter.injectPrompt(String(text || ''));
      return true;
    } catch (error) {
      console.error('[Promptium][Injector] Failed to inject prompt.', error);
      return false;
    }
  };

  const Injector = {
    inject,
  };

  if (typeof window !== 'undefined') {
    window.Injector = Injector;
  }
})();
