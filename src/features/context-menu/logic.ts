/**
 * File: features/context-menu/logic.ts
 * Purpose: Implements the implementation logic for all context menu actions.
 */

import { getAdapters } from '../../platforms';
import { floatingWindowService } from '../../services/floating-window-service';
import { SelectionPayload, PromptSaveMetadata } from './types';
import { sendRuntimeMessage, sendTabMessage } from '../../types/messages';

// Storage keys
const IMPROVE_PAYLOAD_KEY = 'promptiumImprovePayload';
const CONTINUATION_KEY = 'pendingContinuation';
const PENDING_PANEL_ACTION_KEY = 'promptiumPendingPanelAction';
const PROMPTS_KEY = 'prompts';

function derivePromptTitle(text: string): string {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  if (!compact) return 'Untitled Prompt';
  const first = compact.split(/[.!?]/)[0]?.trim() || compact;
  return first.slice(0, 80) || 'Untitled Prompt';
}

export function detectPlatformFromUrl(url: string): string | null {
  const normalizedUrl = String(url || '').toLowerCase();
  const adapter = getAdapters().find((a) => a.hosts.some((host) => normalizedUrl.includes(host)));
  return adapter ? adapter.id : null;
}

export function normalizeSelectionText(text: string): string {
  return String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') // Strip control characters
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, 50000); // 50,000 char cap
}

async function getSelectionFromTab(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<SelectionPayload> {
  const fallbackText = String(info.selectionText || '').trim();
  const url = String(tab?.url || info.pageUrl || '');
  const platform = detectPlatformFromUrl(url);
  const fallbackTitle = String(tab?.title || '');

  if (tab?.id) {
    try {
      const response = await sendTabMessage(tab.id, 'GET_SELECTION');
      if (response && typeof response === 'object' && typeof response.text === 'string') {
        return {
          text: String(response.text).trim() || fallbackText,
          url: String(response.url || url),
          platform: response.platform || platform,
          sourceTitle: response.sourceTitle || fallbackTitle,
        };
      }
    } catch (_err) {
      // Content script might not be injected or matched, fall back gracefully
    }
  }

  return { text: fallbackText, url, platform, sourceTitle: fallbackTitle };
}

async function showToastInTab(tabId: number | undefined, text: string, toastType: 'success' | 'error' | 'info' = 'info') {
  if (!tabId) return;
  try {
    await sendTabMessage(tabId, 'SHOW_TOAST', {
      text,
      toastType,
    });
  } catch (_err) {
    // If content script fails, we can't show a toast on page, which is acceptable on unsupported pages
  }
}

export async function openPromptiumAction(): Promise<void> {
  await floatingWindowService.open('context-menu');
}

export async function saveSelectionAction(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
  const selection = await getSelectionFromTab(info, tab);
  const normalizedText = normalizeSelectionText(selection.text);

  if (!normalizedText) {
    if (tab?.id) {
      await showToastInTab(tab.id, 'No text selected.', 'error');
    }
    return;
  }

  try {
    const title = derivePromptTitle(normalizedText);
    const newPrompt = {
      id: crypto.randomUUID(),
      title,
      text: normalizedText, // compatibility field for prompt-store
      content: normalizedText, // metadata selection field
      sourcePlatform: selection.platform,
      sourceUrl: selection.url,
      sourceTitle: selection.sourceTitle || '',
      sourceType: 'selection' as const,
      tags: [] as string[],
      isTemplate: false,
      isFavorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const snapshot = await chrome.storage.local.get([PROMPTS_KEY]);
    const prompts = Array.isArray(snapshot[PROMPTS_KEY]) ? snapshot[PROMPTS_KEY] : [];
    await chrome.storage.local.set({ [PROMPTS_KEY]: [newPrompt, ...prompts] });

    if (tab?.id) {
      await showToastInTab(tab.id, 'Prompt saved to library.', 'success');
    }
  } catch (error: any) {
    console.error('[Promptium][ContextMenuLogic] Failed to save selection.', error);
    if (tab?.id) {
      await showToastInTab(tab.id, 'Failed to save prompt.', 'error');
    }
  }
}

export async function copyAsPromptAction(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
  const selection = await getSelectionFromTab(info, tab);
  const normalizedText = normalizeSelectionText(selection.text);

  if (!normalizedText) {
    if (tab?.id) {
      await showToastInTab(tab.id, 'No text selected.', 'error');
    }
    return;
  }

  if (tab?.id) {
    try {
      const response = await sendTabMessage(tab.id, 'COPY_TO_CLIPBOARD', {
        text: normalizedText,
      });
      if (response?.ok) {
        await showToastInTab(tab.id, 'Prompt copied to clipboard.', 'success');
      } else {
        throw new Error(response?.error || 'Copy message failed.');
      }
    } catch (error) {
      console.warn('[Promptium][ContextMenuLogic] Content copy failed, using fallback or info.', error);
      if (tab?.id) {
        await showToastInTab(tab.id, 'Clipboard copy failed.', 'error');
      }
    }
  }
}

export async function refineSelectionAction(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
  const selection = await getSelectionFromTab(info, tab);
  const normalizedText = normalizeSelectionText(selection.text);

  if (!normalizedText) {
    return;
  }

  await chrome.storage.local.set({
    [IMPROVE_PAYLOAD_KEY]: {
      text: normalizedText,
      tags: [],
      sourceTabId: tab?.id || null,
      createdAt: Date.now(),
    },
  });

  await openPromptiumAction();
}

export async function continueChatAction(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
  const selection = await getSelectionFromTab(info, tab);
  const normalizedText = normalizeSelectionText(selection.text);

  if (!normalizedText) {
    return;
  }

  // Set continuation storage
  await chrome.storage.local.set({
    [CONTINUATION_KEY]: {
      text: normalizedText,
      sourcePlatform: selection.platform || 'unknown',
      targetPlatform: selection.platform || 'unknown',
      createdAt: Date.now(),
    },
  });

  // Direct app shell to switch to 'continue' tab on open
  await chrome.storage.session.set({
    [PENDING_PANEL_ACTION_KEY]: { type: 'showContinuation' },
  });

  await openPromptiumAction();

  // If window is already open, notify it via message as well
  try {
    await sendRuntimeMessage('showContinuation');
  } catch (_err) {
    // Expected to fail if floating window is not yet active
  }
}
