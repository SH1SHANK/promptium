/**
 * File: content/scraper.js
 * Purpose: Scrapes normalized user and assistant messages from supported LLM pages.
 * Communicates with: utils/platform.js, content/toolbar.js, content/content.js.
 */

/** Returns true when the platform is one of PromptNest's known integrations. */
const isKnownPlatform = async (platform) => Boolean(platform && window.Platform?.SELECTORS?.[platform]);

/** Safely resolves all nodes for a selector or returns an empty list when unavailable. */
const safeQueryAll = async (selector) => {
  if (!selector || typeof selector !== 'string') {
    return [];
  }

  try {
    return Array.from(document.querySelectorAll(selector));
  } catch (error) {
    console.warn('[PromptNest][Scraper] Invalid selector.', selector, error);
    return [];
  }
};

/** Returns a trimmed text value from a DOM node. */
const readNodeText = async (node) => String(node?.innerText || node?.textContent || '').trim();

/** Sorts DOM nodes by their physical position in document order. */
const sortNodesByDomOrder = async (nodes) => {
  const sorted = [...nodes];

  sorted.sort((left, right) => {
    if (left === right) {
      return 0;
    }

    const relation = left.compareDocumentPosition(right);

    if (relation & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }

    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }

    return 0;
  });

  return sorted;
};

/** Scrapes user and bot messages for a given platform and returns normalized message rows. */
const scrape = async (platform = null) => {
  try {
    const resolvedPlatform = platform || (await window.Platform.detect());
    const sel = await window.Platform.getSelectors(resolvedPlatform);

    if (!resolvedPlatform || !sel || !sel.userMsg || !sel.botMsg) {
      return [];
    }

    const userNodes = await safeQueryAll(sel.userMsg);
    const botNodes = await safeQueryAll(sel.botMsg);
    const mergedNodes = await sortNodesByDomOrder(Array.from(new Set([...userNodes, ...botNodes])));
    const messages = [];

    for (const node of mergedNodes) {
      if (!node || typeof node.matches !== 'function') {
        continue;
      }

      const text = await readNodeText(node);

      if (!text) {
        continue;
      }

      const role = node.matches(sel.userMsg) ? 'user' : 'assistant';
      messages.push({ role, text });
    }

    if ((await isKnownPlatform(resolvedPlatform)) && messages.length === 0) {
      console.warn('[PromptNest][Platform] No selectors matched for', resolvedPlatform);
    }

    return messages;
  } catch (error) {
    console.error('[PromptNest][Scraper] Failed to scrape messages.', error);
    return [];
  }
};

const Scraper = {
  scrape
};

if (typeof window !== 'undefined') {
  window.Scraper = Scraper;
}
