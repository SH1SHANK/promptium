(() => {
  /**
   * File: content/scraper.js
   * Purpose: Scrapes normalized user and assistant messages from supported LLM pages.
   * Communicates with: utils/platform.js, content/toolbar.js, content/content.js.
   */

  /** Returns true when the platform is one of Promptium's known integrations. */
  const isKnownPlatform = async (platform) =>
    Boolean(platform && window.Platform?.SELECTORS?.[platform]);

  /** Safely resolves all nodes for a selector or returns an empty list when unavailable. */
  const safeQueryAll = async (selector) => {
    if (!selector || typeof selector !== 'string') {
      return [];
    }

    try {
      return Array.from(document.querySelectorAll(selector));
    } catch (error) {
      console.warn('[Promptium][Scraper] Invalid selector.', selector, error);
      return [];
    }
  };

  /** Returns a trimmed text value from a DOM node. */
  const readNodeText = async (node) => String(node?.innerText || node?.textContent || '').trim();

  /** Decodes HTML entities securely using a disconnected textarea. */
  const decodeHtmlEntities = (str) => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = str;
    return textarea.value;
  };

  /** Platform-specific selectors for LLM thinking/reasoning containers. */
  const THINKING_SELECTORS = [
    'details.thinking', // Claude extended thinking
    'details:has(summary)', // Generic collapsible thinking blocks
    'div.think', // DeepSeek reasoning
    'div[class*="think"]', // DeepSeek variants
    '[data-thinking]', // Generic data attribute
    '.reasoning-content', // ChatGPT o-series reasoning
    '.thought-container', // Gemini thinking
    '[data-testid*="thinking"]', // Test-ID based
    '[data-testid*="reasoning"]', // Test-ID reasoning
  ];

  /**
   * For assistant messages, extracts thinking/reasoning text from known containers.
   * Mutates the provided text directly via string replacement instead of expensive DOM cloning.
   */
  const extractThinkingText = (node) => {
    if (!node) {
      return { thinking: '', text: '' };
    }

    const thinkingParts = [];
    const cache = new Set();

    for (let i = 0; i < THINKING_SELECTORS.length; i++) {
      const sel = THINKING_SELECTORS[i];
      try {
        const els = node.querySelectorAll(sel);
        for (let j = 0; j < els.length; j++) {
          const el = els[j];
          if (!cache.has(el)) {
            const content = (el.innerText || el.textContent || '').trim();
            if (content) {
              thinkingParts.push(content);
              cache.add(el);
            }
          }
        }
      } catch (_) {
        // Skip invalid selectors silently
      }
    }

    let text = (node.innerText || node.textContent || '').trim();

    // Strip out the thinking parts from the main text to simulate removal without DOM cloning
    for (let i = 0; i < thinkingParts.length; i++) {
      const part = thinkingParts[i];
      if (text.includes(part)) {
        text = text
          .replace(part, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }
    }

    return {
      thinking: thinkingParts.join('\n\n'),
      text: text,
    };
  };

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

      // Use zero-allocation DOM queries
      const userNodeList = document.querySelectorAll(sel.userMsg);
      const botNodeList = document.querySelectorAll(sel.botMsg);

      // Fast merge and deduplicate
      const mergedMap = new Map();
      for (let i = 0; i < userNodeList.length; i++) {
        mergedMap.set(userNodeList[i], 'user');
      }
      for (let i = 0; i < botNodeList.length; i++) {
        if (!mergedMap.has(botNodeList[i])) {
          mergedMap.set(botNodeList[i], 'assistant');
        }
      }

      // Extract unique nodes
      const mergedNodes = [];
      for (const node of mergedMap.keys()) {
        mergedNodes.push(node);
      }

      // High performance sort
      mergedNodes.sort((left, right) => {
        if (left === right) return 0;
        const relation = left.compareDocumentPosition(right);
        if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        return 0;
      });

      const messages = [];
      let order = 0;

      for (let i = 0; i < mergedNodes.length; i++) {
        const node = mergedNodes[i];
        const role = mergedMap.get(node);

        let text = '';
        let thinking = '';

        if (role === 'assistant') {
          const extracted = extractThinkingText(node);
          text = decodeHtmlEntities(extracted.text);
          thinking = decodeHtmlEntities(extracted.thinking);
        } else {
          text = decodeHtmlEntities((node.innerText || node.textContent || '').trim());
        }

        const html = (node.innerHTML || '').trim();

        if (!text) continue;

        messages.push({ role, text, thinking, html, index: order });
        order += 1;
      }

      if ((await isKnownPlatform(resolvedPlatform)) && messages.length === 0) {
        console.warn('[Promptium][Platform] No selectors matched for', resolvedPlatform);
      }

      return messages;
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
