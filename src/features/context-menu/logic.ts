/**
 * File: features/context-menu/logic.ts
 * Purpose: Implements the implementation logic for all context menu actions.
 */

import { getAdapters } from '../../platforms';
import { floatingWindowService } from '../../services/floating-window-service';
import { SelectionPayload } from './types';
import { sendRuntimeMessage, sendTabMessage } from '../../types/messages';
import { initVaultStore, createItem } from '../vault/store';
import { classifyContent } from '../vault/importer/classifier';
import { VaultItemType } from '../vault/types';

// Storage keys
const CONTINUATION_KEY = 'pendingContinuation';
const PENDING_PANEL_ACTION_KEY = 'promptiumPendingPanelAction';

type SmartEntryMode = 'fix' | 'upgrade' | 'rewrite' | 'vault';

function derivePromptTitle(text: string): string {
  const compact = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
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

async function getSelectionFromTab(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<SelectionPayload> {
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

async function showToastInTab(
  tabId: number | undefined,
  text: string,
  toastType: 'success' | 'error' | 'info' = 'info'
) {
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

async function openSmartWorkflow(
  mode: SmartEntryMode,
  selection: SelectionPayload,
  tab?: chrome.tabs.Tab
): Promise<void> {
  const normalizedText = normalizeSelectionText(selection.text);
  if (!normalizedText) return;

  await chrome.storage.session.set({
    [PENDING_PANEL_ACTION_KEY]: {
      type: mode === 'vault' ? 'saveSelectionToVault' : 'smartRefinement',
      mode,
      content: normalizedText,
      source: 'context-menu',
      sourceTabId: tab?.id || null,
      sourceUrl: selection.url || tab?.url || '',
      sourceTitle: selection.sourceTitle || tab?.title || '',
      platform:
        selection.platform || detectPlatformFromUrl(selection.url || tab?.url || '') || null,
      createdAt: Date.now(),
    },
  });

  await floatingWindowService.open('context-menu', mode === 'vault' ? 'vault' : 'prompts');
}

export async function launchRefinementAction(
  mode: Exclude<SmartEntryMode, 'vault'>,
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<void> {
  const selection = await getSelectionFromTab(info, tab);
  const normalizedText = normalizeSelectionText(selection.text);

  if (!normalizedText) {
    if (tab?.id) {
      await showToastInTab(tab.id, 'No text selected.', 'error');
    }
    return;
  }

  await openSmartWorkflow(mode, { ...selection, text: normalizedText }, tab);
}

export async function saveClippingAction(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<void> {
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
      const res = await sendTabMessage(tab.id, 'SAVE_CLIPPING', { text: normalizedText });
      if (res && res.ok) {
        return;
      }
    } catch (_err) {
      // Content script not loaded, fall back
    }
  }

  try {
    const platform = detectPlatformFromUrl(selection.url || tab?.url || '') || 'web';
    const clipping = {
      id: crypto.randomUUID(),
      platform,
      conversationTitle: selection.sourceTitle || tab?.title || 'Conversation',
      selectedText: normalizedText,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revisionCount: 1,
    };
    const snap = (await chrome.storage.local.get(['clippings']).catch(() => ({}))) as any;
    const list = Array.isArray(snap.clippings) ? snap.clippings : [];
    list.push(clipping);
    await chrome.storage.local.set({ clippings: list });
    if (tab?.id) {
      await showToastInTab(tab.id, 'Clipping saved.', 'success');
    }
  } catch (error) {
    console.error('[ContextMenuLogic] Failed to save clipping fallback:', error);
  }
}

export async function saveToVaultAction(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<void> {
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
    const classification = classifyContent(title, normalizedText, selection.url || 'context-menu');
    await initVaultStore();
    await createItem({
      type: classification.type as VaultItemType,
      title,
      content: normalizedText,
      tags: [
        'selection',
        selection.platform ? String(selection.platform) : '',
        classification.type,
      ].filter(Boolean),
      enabled: true,
      pinned: false,
      ...(classification.type === 'instruction' ? { priority: 'medium' as const } : {}),
    });

    if (tab?.id) {
      await showToastInTab(tab.id, `Saved to Vault as ${classification.type}.`, 'success');
    }
  } catch (error: any) {
    console.error('[Promptium][ContextMenuLogic] Failed to save selection to Vault.', error);
    if (tab?.id) {
      await showToastInTab(tab.id, 'Failed to save to Vault.', 'error');
    }
  }
}

export async function copyAsPromptAction(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<void> {
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
      console.warn(
        '[Promptium][ContextMenuLogic] Content copy failed, using fallback or info.',
        error
      );
      if (tab?.id) {
        await showToastInTab(tab.id, 'Clipboard copy failed.', 'error');
      }
    }
  }
}

export const saveSelectionAction = saveToVaultAction;
export const refineSelectionAction = (
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<void> => launchRefinementAction('upgrade', info, tab);

export async function continueChatAction(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<void> {
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

export async function updateContextMenuTitles(isCode: boolean): Promise<void> {
  try {
    await chrome.contextMenus
      .update('pn-fix-prompt', { title: isCode ? 'Improve Code Prompt' : 'Fix Prompt' })
      .catch(() => {});
    await chrome.contextMenus
      .update('pn-upgrade-prompt', { title: isCode ? 'Generate Agent Prompt' : 'Upgrade Prompt' })
      .catch(() => {});
  } catch (error) {
    console.warn('[Promptium][ContextMenuLogic] Failed to update titles.', error);
  }
}
