(() => {
  /**
   * File: utils/constants.js
   * Purpose: Shared constants used across multiple extension contexts.
   */

  if (typeof chrome !== 'undefined' && chrome?.storage && !chrome.storage.session) {
    (chrome.storage as any).session = chrome.storage.local;
  }

  const PLATFORM_LABELS = {
    chatgpt: 'ChatGPT',
    claude: 'Claude',
    gemini: 'Gemini',
    perplexity: 'Perplexity',
    copilot: 'Copilot',
  };

  const SUPPORTED_URLS = [
    'https://chatgpt.com/',
    'https://claude.ai/',
    'https://gemini.google.com/',
    'https://www.perplexity.ai/',
    'https://copilot.microsoft.com/',
  ];

  if (typeof window !== 'undefined') {
    chrome.storage?.local
      ?.get?.(['promptiumSettings'])
      .then((snapshot) => {
        const customLabels = snapshot?.promptiumSettings?.platformLabels;
        if (customLabels && typeof customLabels === 'object') {
          Object.entries(customLabels).forEach(([key, value]) => {
            const normalizedKey = String(key || '')
              .trim()
              .toLowerCase();
            const normalizedLabel = String(value || '').trim();
            if (!normalizedKey || !normalizedLabel) return;
            PLATFORM_LABELS[normalizedKey] = normalizedLabel;
          });
        }
      })
      .catch(() => {});

    window.PLATFORM_LABELS = PLATFORM_LABELS;
    window.SUPPORTED_URLS = SUPPORTED_URLS;
  }
})();
