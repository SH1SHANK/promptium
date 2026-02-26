/**
 * File: content/scraper.js
 * Purpose: Scrapes visible conversation messages from supported LLM platform DOM structures.
 * Communicates with: content/toolbar.js, content/content.js, utils/platform.js, utils/storage.js.
 */

/** Converts a message element into normalized role/text fields. */
const parseMessageNode = async (node, selectors) => {
  const text = (node.innerText || node.textContent || '').trim();

  if (!text) {
    return null;
  }

  if (node.matches(selectors.userMessage) || node.querySelector(selectors.userMessage)) {
    return { role: 'user', text };
  }

  if (node.matches(selectors.assistantMessage) || node.querySelector(selectors.assistantMessage)) {
    return { role: 'assistant', text };
  }

  return { role: 'unknown', text };
};

/** Scrapes current page chat messages using active platform selectors. */
const scrape = async () => {
  const platform = await window.PromptNestPlatform.detect();
  const selectors = await window.PromptNestPlatform.getSelectors(platform);

  if (!platform || !selectors) {
    return {
      platform: 'unsupported',
      title: document.title,
      url: window.location.href,
      messages: []
    };
  }

  const nodes = Array.from(document.querySelectorAll(selectors.messageItems));
  const parsed = await Promise.all(nodes.map((node) => parseMessageNode(node, selectors)));
  const messages = parsed.filter(Boolean);

  return {
    platform,
    title: document.title,
    url: window.location.href,
    scrapedAt: new Date().toISOString(),
    messages
  };
};

const Scraper = {
  scrape
};

if (typeof window !== 'undefined') {
  window.PromptNestScraper = Scraper;
}
