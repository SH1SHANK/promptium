import { getCurrentAdapter, getAdapters } from '../platforms';

(() => {
  /**
   * File: content/scraper.js
   * Purpose: Legacy wrapper scraping normalized user and assistant messages using PlatformAdapter architecture.
   */

  const scrape = async (platformId: any = null) => {
    try {
      let adapter = getCurrentAdapter();
      if (platformId) {
        const found = getAdapters().find((a) => a.id === String(platformId).toLowerCase());
        if (found) {
          adapter = found;
        }
      }

      if (!adapter) {
        console.warn('[Promptium][Scraper] No adapter found for platform:', platformId);
        return [];
      }

      const conversation = await adapter.getConversation();
      return conversation.messages.map((m, index) => ({
        role: m.role,
        text: m.content,
        thinking: m.thinking || '',
        html: m.html || '',
        index,
      }));
    } catch (error) {
      console.error('[Promptium][Scraper] Failed to scrape messages.', error);
      return [];
    }
  };

  const Scraper = {
    scrape,
  };

  if (typeof window !== 'undefined') {
    window.Scraper = Scraper;
  }
})();
