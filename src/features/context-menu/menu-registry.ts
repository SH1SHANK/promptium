/**
 * File: features/context-menu/menu-registry.ts
 * Purpose: Registers native browser context menus using the chrome.contextMenus API.
 */

import {
  SAVE_CLIPPING,
  OPEN_PROMPTIUM,
  FIX_PROMPT,
  UPGRADE_PROMPT,
  REWRITE_PROMPT,
  SAVE_TO_VAULT,
  COPY_AS_PROMPT,
  CONTINUE_CHAT,
} from './actions';
import { TERMINOLOGY } from '../../utils/terminology';

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

      chrome.contextMenus.create({
        parentId: PARENT_ID,
        id: SAVE_CLIPPING,
        title: TERMINOLOGY.SAVE_CLIPPING,
        contexts: ['selection'],
      });

      chrome.contextMenus.create({
        parentId: PARENT_ID,
        id: FIX_PROMPT,
        title: `${TERMINOLOGY.FIX} ${TERMINOLOGY.PROMPT}`,
        contexts: ['selection'],
      });

      chrome.contextMenus.create({
        parentId: PARENT_ID,
        id: UPGRADE_PROMPT,
        title: `${TERMINOLOGY.UPGRADE} ${TERMINOLOGY.PROMPT}`,
        contexts: ['selection'],
      });

      chrome.contextMenus.create({
        parentId: PARENT_ID,
        id: REWRITE_PROMPT,
        title: `${TERMINOLOGY.REWRITE} ${TERMINOLOGY.PROMPT}`,
        contexts: ['selection'],
      });

      chrome.contextMenus.create({
        parentId: PARENT_ID,
        id: SAVE_TO_VAULT,
        title: TERMINOLOGY.SAVE_TO_VAULT,
        contexts: ['selection'],
      });

      // Continue in Current Chat (only on supported platforms)
      chrome.contextMenus.create({
        parentId: PARENT_ID,
        id: CONTINUE_CHAT,
        title: TERMINOLOGY.CONTINUE,
        contexts: ['selection'],
        documentUrlPatterns: SUPPORTED_DOC_PATTERNS,
      });

      // Open Workspace (always available)
      chrome.contextMenus.create({
        parentId: PARENT_ID,
        id: OPEN_PROMPTIUM,
        title: 'Open Workspace',
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
          const response = await chrome.tabs
            .sendMessage(tabId, { action: 'CHECK_ADAPTER_HEALTH' })
            .catch(() => null);
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
