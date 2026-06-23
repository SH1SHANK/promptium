/**
 * File: features/context-menu/handlers.ts
 * Purpose: Routes native browser context menu clicks to their respective logic handlers.
 */

import {
  OPEN_PROMPTIUM,
  SAVE_SELECTION,
  COPY_AS_PROMPT,
  REFINE_SELECTION,
  CONTINUE_CHAT,
} from './actions';
import {
  openPromptiumAction,
  saveSelectionAction,
  copyAsPromptAction,
  refineSelectionAction,
  continueChatAction,
} from './logic';

export async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<void> {
  switch (info.menuItemId) {
    case OPEN_PROMPTIUM:
      return openPromptiumAction();
    case SAVE_SELECTION:
      return saveSelectionAction(info, tab);
    case COPY_AS_PROMPT:
      return copyAsPromptAction(info, tab);
    case REFINE_SELECTION:
      return refineSelectionAction(info, tab);
    case CONTINUE_CHAT:
      return continueChatAction(info, tab);
    default:
      console.warn(`[Promptium][ContextMenuHandlers] Unhandled context menu action: ${info.menuItemId}`);
  }
}
