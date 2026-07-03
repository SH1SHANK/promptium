if (typeof chrome !== 'undefined' && chrome?.storage && !chrome.storage.session) {
  (chrome.storage as any).session = chrome.storage.local;
}

export const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  copilot: 'Copilot',
};

export const SUPPORTED_URLS = [
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
      const customLabels = (snapshot?.promptiumSettings as any)?.platformLabels;
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

  (window as any).PLATFORM_LABELS = PLATFORM_LABELS;
  (window as any).SUPPORTED_URLS = SUPPORTED_URLS;
}
