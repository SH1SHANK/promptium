/**
 * File: utils/platform.js
 * Purpose: Defines platform-specific selectors and detection logic for supported LLM websites.
 * Communicates with: content/content.js, content/scraper.js, content/injector.js, content/toolbar.js, popup/popup.js.
 */

const SELECTORS = {
  chatgpt: {
    userMsg: '[data-message-author-role="user"]',
    botMsg: '[data-message-author-role="assistant"]',
    input: '#prompt-textarea',
    inputParent: 'div.relative.flex, form'
  },
  claude: {
    userMsg: '[data-testid="user-message"], .human-turn, [data-is-human="true"]',
    botMsg: '[data-testid="assistant-message"], .assistant-turn, [data-is-assistant="true"]',
    input: 'div[contenteditable="true"]',
    inputParent: 'form, div:has(> div[contenteditable="true"])'
  },
  gemini: {
    userMsg: '.user-query-bubble-with-background, [data-turn-role="user"]',
    botMsg: '.model-response-text, [data-turn-role="model"]',
    input: 'div[contenteditable="true"].ql-editor, rich-textarea div[contenteditable="true"]',
    inputParent: 'div.input-area-container, form'
  },
  perplexity: {
    userMsg: '[data-message-author-role="user"], .break-words:not([class*="assistant"])',
    botMsg: '[data-message-author-role="assistant"]',
    input: 'textarea[placeholder]',
    inputParent: 'form, div.grow'
  },
  copilot: {
    userMsg: '[data-content="user-message"]',
    botMsg: '[data-content="ai-message"]',
    input: 'textarea#userInput, div[contenteditable="true"]',
    inputParent: 'form, div.input-container'
  }
};

/** Returns true when a selector config contains all required shape keys. */
const hasRequiredSelectors = async (config) => {
  if (!config) {
    return false;
  }

  const requiredKeys = ['userMsg', 'botMsg', 'input', 'inputParent'];
  return requiredKeys.every((key) => typeof config[key] === 'string' && config[key].trim().length > 0);
};

/** Detects the current platform from the page hostname. */
const detect = async () => {
  const host = window.location.hostname.toLowerCase();

  if (host.includes('chatgpt.com')) {
    return 'chatgpt';
  }

  if (host.includes('claude.ai')) {
    return 'claude';
  }

  if (host.includes('gemini.google.com')) {
    return 'gemini';
  }

  if (host.includes('perplexity.ai')) {
    return 'perplexity';
  }

  if (host.includes('copilot.microsoft.com')) {
    return 'copilot';
  }

  return null;
};

/** Returns selector config for a supplied or detected platform. */
const getSelectors = async (platform = null) => {
  const resolvedPlatform = platform || (await detect());

  if (!resolvedPlatform || !SELECTORS[resolvedPlatform]) {
    return null;
  }

  const config = SELECTORS[resolvedPlatform];
  return (await hasRequiredSelectors(config)) ? config : null;
};

const Platform = {
  SELECTORS,
  detect,
  getSelectors
};

if (typeof window !== 'undefined') {
  window.Platform = Platform;
}
