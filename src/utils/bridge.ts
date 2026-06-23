(() => {
  /**
   * File: utils/bridge.js
   * Purpose: Cross-LLM conversation bridge with legacy key migration and expiry handling.
   */

  const BRIDGE_KEY = 'pendingBridge';
  const LEGACY_CONTEXT_KEY = 'pendingContext';
  const BRIDGE_TTL_MS = 120000;
  const MAX_PROMPT_CHARS = 3000;
  const MAX_MESSAGES = 10;

  const LLM_URLS = Object.freeze({
    chatgpt: 'https://chatgpt.com/',
    claude: 'https://claude.ai/new',
    gemini: 'https://gemini.google.com/app',
    perplexity: 'https://www.perplexity.ai/',
    copilot: 'https://copilot.microsoft.com/',
  });

  const getPlatformLabel = (platform: any) => {
    const key = String(platform || '').toLowerCase();
    return window.PLATFORM_LABELS?.[key] || key || 'Unknown';
  };

  const normalizeRole = (role: any) => {
    const value = String(role || '')
      .trim()
      .toLowerCase();
    if (['you', 'user', 'human'].includes(value)) return 'Human';
    if (['assistant', 'model', 'bot', 'ai'].includes(value)) return 'Assistant';
    return value.includes('user') ? 'Human' : 'Assistant';
  };

  const cleanContinuationText = (text: any) => {
    let cleaned = String(text || '').trim();

    // 1. Remove leaked thinking blocks
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
    cleaned = cleaned.replace(/\[Thinking\][\s\S]*?\[\/Thinking\]/gi, '');

    // 2. Remove LaTeX display math (\\[ ... \\] and $$ ... $$)
    cleaned = cleaned.replace(/\\\[[\s\S]*?\\\]/g, '');
    cleaned = cleaned.replace(/\$\$[\s\S]*?\$\$/g, '');

    // 3. Remove LaTeX inline math (\\( ... \\) and $ ... $) - avoiding currency
    cleaned = cleaned.replace(/\\\([\s\S]*?\\\)/g, '');
    cleaned = cleaned.replace(/(^|\s)\$[^$\n]+\$(\s|$)/g, '$1$2');

    // 4. Remove basic HTML tags
    cleaned = cleaned.replace(/<\/?[a-z][\s\S]*?>/gi, '');

    // 5. Remove Markdown headers and horizontal rules
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
    cleaned = cleaned.replace(/^(---+|\*\*\*+|___+)\s*$/gm, '');

    // 6. Clean up excess whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/ {2,}/g, ' ');

    return cleaned.trim();
  };

  const normalizeMessages = (messages: any) => {
    if (!Array.isArray(messages)) return [];
    return messages
      .map((message) => ({
        role: normalizeRole(message?.role),
        text: cleanContinuationText(message?.text),
      }))
      .filter((message) => message.text.length > 0);
  };

  const buildContextPrompt = (messages: any, sourcePlatform: any) => {
    const normalized = normalizeMessages(messages).slice(-MAX_MESSAGES);
    const source = getPlatformLabel(sourcePlatform);

    const header = [
      `I was having a conversation on ${source}.`,
      'Please read the context below and continue from where we left off.',
      '',
      `--- Conversation from ${source} ---`,
      '',
    ].join('\n');

    const body = normalized.map((message) => `${message.role}: ${message.text}`).join('\n\n');

    const combined = `${header}${body}`.trim();
    const bounded =
      combined.length > MAX_PROMPT_CHARS
        ? `${combined.slice(0, MAX_PROMPT_CHARS - 38)}\n\n[...conversation trimmed...]`
        : combined;

    return `${bounded}\n\n--- Continue from here ---\n`;
  };

  const migrateLegacyPendingContext = async (currentPlatform: any = '') => {
    const snapshot = (await chrome.storage.local.get([BRIDGE_KEY, LEGACY_CONTEXT_KEY])) as Record<string, any>;
    const current = snapshot?.[BRIDGE_KEY];
    const legacy = snapshot?.[LEGACY_CONTEXT_KEY];

    if (!legacy) {
      return false;
    }

    if (current) {
      await chrome.storage.local.remove([LEGACY_CONTEXT_KEY]).catch(() => {});
      return false;
    }

    const fallbackTarget = String(currentPlatform || '')
      .trim()
      .toLowerCase();
    const migrated = {
      text: String(legacy?.text || ''),
      sourcePlatform: String(legacy?.sourcePlatform || 'unknown'),
      targetPlatform: String(legacy?.targetPlatform || fallbackTarget),
      createdAt: Number(legacy?.createdAt) || Date.now(),
    };

    if (!migrated.text || !migrated.targetPlatform) {
      await chrome.storage.local.remove([LEGACY_CONTEXT_KEY]).catch(() => {});
      return false;
    }

    await chrome.storage.local.set({ [BRIDGE_KEY]: migrated });
    await chrome.storage.local.remove([LEGACY_CONTEXT_KEY]).catch(() => {});
    return true;
  };

  const openTargetLlm = async (targetPlatform: string) => {
    const url = (LLM_URLS as Record<string, string>)[targetPlatform];
    if (!url) {
      throw new Error(`Unknown target platform: ${targetPlatform}`);
    }

    const response = await chrome.runtime
      .sendMessage({ action: 'openLlmTab', url })
      .catch(() => null);

    if (!response?.ok) {
      throw new Error(response?.error || 'Failed to open target platform.');
    }
  };

  const bridgeTo = async (messages: any, sourcePlatform: any, targetPlatform: any) => {
    const normalized = normalizeMessages(messages);

    if (!normalized.length) {
      throw new Error('No messages to bridge.');
    }

    const payload = {
      text: buildContextPrompt(normalized, sourcePlatform),
      sourcePlatform: String(sourcePlatform || 'unknown'),
      targetPlatform: String(targetPlatform || ''),
      createdAt: Date.now(),
    };

    if (!payload.targetPlatform) {
      throw new Error('Missing bridge target.');
    }

    await chrome.storage.local.set({ [BRIDGE_KEY]: payload });
    try {
      await openTargetLlm(payload.targetPlatform);
    } catch (error) {
      await chrome.storage.local.remove([BRIDGE_KEY]).catch(() => {});
      throw error;
    }
    return true;
  };

  const checkPendingBridge = async (currentPlatform: any) => {
    await migrateLegacyPendingContext(currentPlatform).catch(() => {});

    const snapshot = (await chrome.storage.local.get([BRIDGE_KEY]).catch(() => ({}))) as Record<string, any>;
    const pending = snapshot?.[BRIDGE_KEY];

    if (!pending) {
      return null;
    }

    if (!pending?.targetPlatform || !pending?.text) {
      await chrome.storage.local.remove([BRIDGE_KEY]).catch(() => {});
      return null;
    }

    const targetPlatform = String(pending?.targetPlatform || '');
    if (targetPlatform !== String(currentPlatform || '')) {
      return null;
    }

    const createdAt = Number(pending?.createdAt) || 0;
    if (!createdAt || Date.now() - createdAt > BRIDGE_TTL_MS) {
      await chrome.storage.local.remove([BRIDGE_KEY]).catch(() => {});
      return {
        kind: 'expired',
        sourcePlatform: String(pending?.sourcePlatform || 'unknown'),
      };
    }

    return {
      kind: 'ready',
      text: String(pending?.text || ''),
      sourcePlatform: String(pending?.sourcePlatform || 'unknown'),
      targetPlatform,
    };
  };

  const Bridge = {
    BRIDGE_KEY,
    LEGACY_CONTEXT_KEY,
    BRIDGE_TTL_MS,
    LLM_URLS,
    buildContextPrompt,
    migrateLegacyPendingContext,
    bridgeTo,
    checkPendingBridge,
  };

  if (typeof window !== 'undefined') {
    window.Bridge = Bridge;
  }
})();
