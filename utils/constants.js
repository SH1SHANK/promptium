(() => {
/**
 * File: utils/constants.js
 * Purpose: Shared constants used across multiple extension contexts.
 */

if (typeof chrome !== 'undefined' && chrome?.storage && !chrome.storage.session) {
  chrome.storage.session = chrome.storage.local;
}

const PLATFORM_LABELS = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  copilot: 'Copilot',
  deepseek: 'DeepSeek',
  qwen: 'Qwen (Tongyi)',
  mistral: 'Mistral Chat',
  kimi: 'Kimi',
  moonshot: 'Moonshot',
  grok: 'Grok',
  huggingchat: 'HuggingChat',
  poe: 'Poe',
  you: 'You.com Chat',
  phind: 'Phind',
  characterai: 'Character.AI',
  pi: 'Pi',
  metaai: 'Meta AI',
  amazonq: 'Amazon Q',
  ernie: 'ERNIE Bot',
  doubao: 'Doubao',
  yichat: 'Yi Chat',
  coherecoral: 'Cohere Coral',
  groq: 'Groq Chat',
  fireworks: 'Fireworks AI Chat',
  together: 'Together.ai Playground'
};

const SUPPORTED_URLS = [
  'https://chatgpt.com/',
  'https://claude.ai/',
  'https://gemini.google.com/',
  'https://www.perplexity.ai/',
  'https://copilot.microsoft.com/',
  'https://deepseek.com/',
  'https://qwen.ai/',
  'https://chat.mistral.ai/',
  'https://kimi.moonshot.cn/',
  'https://grok.com/',
  'https://huggingface.co/chat',
  'https://poe.com/',
  'https://you.com/chat',
  'https://phind.com/',
  'https://character.ai/',
  'https://pi.ai/',
  'https://meta.ai/',
  'https://chat.console.aws.amazon.com/',
  'https://yiyan.baidu.com/',
  'https://doubao.com/',
  'https://01.ai/',
  'https://coral.cohere.com/',
  'https://chat.groq.com/',
  'https://fireworks.ai/',
  'https://together.ai/'
];

if (typeof window !== 'undefined') {
  chrome.storage?.local?.get?.(['promptiumSettings']).then((snapshot) => {
    const customLabels = snapshot?.promptiumSettings?.platformLabels;
    if (customLabels && typeof customLabels === 'object') {
      Object.entries(customLabels).forEach(([key, value]) => {
        const normalizedKey = String(key || '').trim().toLowerCase();
        const normalizedLabel = String(value || '').trim();
        if (!normalizedKey || !normalizedLabel) return;
        PLATFORM_LABELS[normalizedKey] = normalizedLabel;
      });
    }
  }).catch(() => {});

  window.PLATFORM_LABELS = PLATFORM_LABELS;
  window.SUPPORTED_URLS = SUPPORTED_URLS;
}

})();
