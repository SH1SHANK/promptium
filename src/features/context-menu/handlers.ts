/**
 * File: features/context-menu/handlers.ts
 * Purpose: Routes native browser context menu clicks to their respective logic handlers.
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
import {
  saveClippingAction,
  openPromptiumAction,
  saveToVaultAction,
  copyAsPromptAction,
  launchRefinementAction,
  continueChatAction,
} from './logic';

export async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<void> {
  switch (info.menuItemId) {
    case SAVE_CLIPPING:
      return saveClippingAction(info, tab);
    case OPEN_PROMPTIUM:
      return openPromptiumAction();
    case FIX_PROMPT:
      return launchRefinementAction('fix', info, tab);
    case UPGRADE_PROMPT:
      return launchRefinementAction('upgrade', info, tab);
    case REWRITE_PROMPT:
      return launchRefinementAction('rewrite', info, tab);
    case SAVE_TO_VAULT:
      return saveToVaultAction(info, tab);
    case COPY_AS_PROMPT:
      return copyAsPromptAction(info, tab);
    case CONTINUE_CHAT:
      return continueChatAction(info, tab);
    default:
      console.warn(
        `[Promptium][ContextMenuHandlers] Unhandled context menu action: ${info.menuItemId}`
      );
  }
}
