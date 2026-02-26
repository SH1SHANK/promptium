/**
 * File: utils/platform.js
 * Purpose: Defines platform selector mappings and detection helpers for supported LLM sites.
 * Communicates with: content/content.js, content/scraper.js, content/injector.js, content/toolbar.js.
 */

const SELECTORS = {
  chatgpt: {
    messageItems: '[data-message-author-role]',
    userMessage: '[data-message-author-role="user"]',
    assistantMessage: '[data-message-author-role="assistant"]',
    input: 'textarea[placeholder*="Message"]',
    submit: 'button[data-testid="send-button"]',
    toolbarAnchor: 'main'
  },
  claude: {
    messageItems: '[data-testid="conversation-turn"]',
    userMessage: '[data-testid="user-message"]',
    assistantMessage: '[data-testid="assistant-message"]',
    input: 'div[contenteditable="true"]',
    submit: 'button[aria-label*="Send"]',
    toolbarAnchor: 'main'
  }
};

/** Detects the active supported platform from the current hostname. */
const detect = async () => {
  const hostname = window.location.hostname;

  if (hostname.includes('chatgpt.com')) {
    return 'chatgpt';
  }

  if (hostname.includes('claude.ai')) {
    return 'claude';
  }

  return null;
};

/** Returns selectors for a supported platform or null when unsupported. */
const getSelectors = async (platform = null) => {
  const resolvedPlatform = platform || (await detect());
  return resolvedPlatform ? SELECTORS[resolvedPlatform] || null : null;
};

const Platform = {
  SELECTORS,
  detect,
  getSelectors
};

if (typeof window !== 'undefined') {
  window.PromptNestPlatform = Platform;
}
