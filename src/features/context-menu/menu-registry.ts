/**
 * File: features/context-menu/menu-registry.ts
 * Purpose: Registers native browser context menus using the chrome.contextMenus API.
 */

import {
  OPEN_PROMPTIUM,
  SAVE_SELECTION,
  COPY_AS_PROMPT,
  REFINE_SELECTION,
  CONTINUE_CHAT,
} from './actions';

const PARENT_ID = 'pn-promptium-parent';

const SUPPORTED_DOC_PATTERNS = [
  '*://*.chatgpt.com/*',
  '*://*.claude.ai/*',
  '*://gemini.google.com/*',
  '*://*.perplexity.ai/*',
  '*://copilot.microsoft.com/*',
];

const debounceTimers = new Map<number, any>();
const healthCache = new Map<number, { healthy: boolean; timestamp: number }>();
const CACHE_TTL_MS = 30000; // 30 seconds

export const contextMenuRegistry = {
  async register(): Promise<void> {
    try {
      await chrome.contextMenus.removeAll();

      // Parent menu: Promptium
      chrome.contextMenus.create({
        id: PARENT_ID,
        title: 'Promptium',
        contexts: ['page', 'selection'],
      });

      // Save Selection as Prompt
      chrome.contextMenus.create({
        parentId: PARENT_ID,
        id: SAVE_SELECTION,
        title: 'Save Selection as Prompt',
        contexts: ['selection'],
      });

      // Copy As Prompt
      chrome.contextMenus.create({
        parentId: PARENT_ID,
        id: COPY_AS_PROMPT,
        title: 'Copy As Prompt',
        contexts: ['selection'],
      });

      // Refine Selection
      chrome.contextMenus.create({
        parentId: PARENT_ID,
        id: REFINE_SELECTION,
        title: 'Refine Selection',
        contexts: ['selection'],
      });

      // Continue in Current Chat (only on supported platforms)
      chrome.contextMenus.create({
        parentId: PARENT_ID,
        id: CONTINUE_CHAT,
        title: 'Continue in Current Chat',
        contexts: ['selection'],
        documentUrlPatterns: SUPPORTED_DOC_PATTERNS,
      });

      // Open Promptium (always available)
      chrome.contextMenus.create({
        parentId: PARENT_ID,
        id: OPEN_PROMPTIUM,
        title: 'Open Promptium',
        contexts: ['page', 'selection'],
      });
    } catch (error) {
      console.warn('[Promptium][ContextMenuRegistry] Failed to register context menus.', error);
    }
  },

  async updateContinueChatVisibility(tabId: number): Promise<void> {
    const existing = debounceTimers.get(tabId);
    if (existing) {
      clearTimeout(existing);
    }

    debounceTimers.set(
      tabId,
      setTimeout(async () => {
        debounceTimers.delete(tabId);

        const cached = healthCache.get(tabId);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
          try {
            await chrome.contextMenus.update(CONTINUE_CHAT, { visible: cached.healthy });
          } catch (_) {}
          return;
        }

        try {
          const response = await chrome.tabs.sendMessage(tabId, { action: 'CHECK_ADAPTER_HEALTH' }).catch(() => null);
          const isHealthy = Boolean(response?.ok && response?.healthy);

          healthCache.set(tabId, { healthy: isHealthy, timestamp: Date.now() });
          await chrome.contextMenus.update(CONTINUE_CHAT, { visible: isHealthy });
        } catch (_error) {
          try {
            await chrome.contextMenus.update(CONTINUE_CHAT, { visible: false });
          } catch (_) {}
        }
      }, 150)
    );
  },
};
