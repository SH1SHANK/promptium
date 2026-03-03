(() => {
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

const SETTINGS_KEY = 'promptiumSettings';

const slugify = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const matchWildcard = (pattern, value) => {
  const source = String(pattern || '').trim();
  const input = String(value || '').trim();
  if (!source || !input) return false;

  const escaped = source
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const re = new RegExp(`^${escaped}$`, 'i');
  return re.test(input);
};

const getSettingsSnapshot = async () => {
  try {
    const snapshot = await chrome.storage.local.get([SETTINGS_KEY]);
    return snapshot?.[SETTINGS_KEY] && typeof snapshot[SETTINGS_KEY] === 'object'
      ? snapshot[SETTINGS_KEY]
      : {};
  } catch (_error) {
    return {};
  }
};

const getCustomPlatformEntries = async () => {
  const settings = await getSettingsSnapshot();
  const custom = Array.isArray(settings?.customPlatforms) ? settings.customPlatforms : [];
  return custom
    .map((entry, index) => {
      const keyBase = slugify(entry?.name || `custom-${index + 1}`) || `custom-${index + 1}`;
      return {
        key: `custom:${keyBase}`,
        name: String(entry?.name || `Custom ${index + 1}`),
        urlPattern: String(entry?.urlPattern || '').trim(),
        selectors: {
          userMsg: String(entry?.userMsg || '').trim(),
          botMsg: String(entry?.botMsg || '').trim(),
          input: String(entry?.input || '').trim(),
          inputParent: String(entry?.inputParent || 'form, body').trim()
        }
      };
    })
    .filter((entry) => entry.urlPattern && entry.selectors.userMsg && entry.selectors.botMsg && entry.selectors.input);
};

const isEnabled = async (platform) => {
  const key = String(platform || '').trim().toLowerCase();
  if (!key) return false;
  const settings = await getSettingsSnapshot();
  const enabledPlatforms = settings?.enabledPlatforms && typeof settings.enabledPlatforms === 'object'
    ? settings.enabledPlatforms
    : {};

  if (Object.prototype.hasOwnProperty.call(enabledPlatforms, key)) {
    return Boolean(enabledPlatforms[key]);
  }
  return true;
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
  const href = String(window.location.href || '');

  if (host.includes('chatgpt.com')) {
    return (await isEnabled('chatgpt')) ? 'chatgpt' : null;
  }

  if (host.includes('claude.ai')) {
    return (await isEnabled('claude')) ? 'claude' : null;
  }

  if (host.includes('gemini.google.com')) {
    return (await isEnabled('gemini')) ? 'gemini' : null;
  }

  if (host.includes('perplexity.ai')) {
    return (await isEnabled('perplexity')) ? 'perplexity' : null;
  }

  if (host.includes('copilot.microsoft.com')) {
    return (await isEnabled('copilot')) ? 'copilot' : null;
  }

  const customEntries = await getCustomPlatformEntries();
  for (const entry of customEntries) {
    if (!matchWildcard(entry.urlPattern, href)) continue;
    if (!(await isEnabled(entry.key))) continue;
    return entry.key;
  }

  return null;
};

/** Returns selector config for a supplied or detected platform. */
const getSelectors = async (platform = null) => {
  const resolvedPlatform = platform || (await detect());

  if (!resolvedPlatform) {
    return null;
  }

  if (resolvedPlatform.startsWith('custom:')) {
    const customEntries = await getCustomPlatformEntries();
    const match = customEntries.find((entry) => entry.key === resolvedPlatform);
    if (!match) return null;
    return (await hasRequiredSelectors(match.selectors)) ? match.selectors : null;
  }

  if (!SELECTORS[resolvedPlatform]) {
    return null;
  }

  const config = SELECTORS[resolvedPlatform];
  return (await hasRequiredSelectors(config)) ? config : null;
};

const Platform = {
  SELECTORS,
  detect,
  getSelectors,
  isEnabled,
  getCustomPlatformEntries
};

if (typeof window !== 'undefined') {
  Object.assign(window, Platform);
  window.Platform = Platform;
}

})();
