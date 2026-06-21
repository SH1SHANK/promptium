(() => {
  /**
   * File: utils/platform.js
   * Purpose: Defines platform-specific selectors and detection logic for supported LLM websites.
   */

  const SELECTORS = {
    chatgpt: {
      userMsg: '[data-message-author-role="user"], .text-message[data-message-author-role="user"]',
      botMsg:
        '[data-message-author-role="assistant"], .text-message[data-message-author-role="assistant"]',
      input:
        '#prompt-textarea, div[contenteditable="true"][data-id], div[contenteditable="true"].ProseMirror',
      inputParent: 'div.relative.flex, form',
    },
    claude: {
      userMsg: '[data-testid="user-message"], .human-turn, [data-is-human="true"]',
      botMsg: '[data-testid="assistant-message"], .assistant-turn, [data-is-assistant="true"]',
      input: 'div[contenteditable="true"]',
      inputParent: 'form, div:has(> div[contenteditable="true"])',
    },
    gemini: {
      userMsg: '.user-query-bubble-with-background, [data-turn-role="user"]',
      botMsg: '.model-response-text, [data-turn-role="model"]',
      input: 'div[contenteditable="true"].ql-editor, rich-textarea div[contenteditable="true"]',
      inputParent: 'div.input-area-container, form',
    },
    perplexity: {
      userMsg:
        '[data-message-author-role="user"], div[data-testid*="user"], div.break-words.font-display',
      botMsg:
        '[data-message-author-role="assistant"], div.prose.dark\\:prose-invert, div[data-testid*="assistant"], div.mb-md .prose',
      input: '#ask-input, textarea[placeholder], div[contenteditable="true"][role="textbox"]',
      inputParent: 'form, div.grow, div:has(> #ask-input)',
    },
    copilot: {
      userMsg: '[data-content="user-message"]',
      botMsg: '[data-content="ai-message"]',
      input: 'textarea#userInput, div[contenteditable="true"]',
      inputParent: 'form, div.input-container',
    },
  };

  /** Returns true when a selector config contains all required shape keys. */
  const hasRequiredSelectors = async (config) => {
    if (!config) {
      return false;
    }

    const requiredKeys = ['userMsg', 'botMsg', 'input', 'inputParent'];
    return requiredKeys.every(
      (key) => typeof config[key] === 'string' && config[key].trim().length > 0
    );
  };

  /** Detects the current platform from hostname and path, returning null when unsupported. */
  const detectProvider = async () => {
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

  const detect = detectProvider;

  /** Returns selector config for a supplied or detected platform. */
  const getSelectors = async (platform = null) => {
    const resolvedPlatform = platform || (await detect());

    if (!resolvedPlatform) {
      return null;
    }

    if (!SELECTORS[resolvedPlatform]) {
      return null;
    }

    const config = SELECTORS[resolvedPlatform];
    return (await hasRequiredSelectors(config)) ? config : null;
  };

  const Platform = {
    SELECTORS,
    detectProvider,
    detect,
    getSelectors,
  };

  if (typeof window !== 'undefined') {
    Object.assign(window, Platform);
    window.Platform = Platform;
  }
})();
