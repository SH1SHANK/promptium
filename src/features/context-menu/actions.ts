/**
 * File: features/context-menu/actions.ts
 * Purpose: Central definition of context menu action identifiers.
 */

export const SAVE_CLIPPING = 'pn-save-clipping';
export const OPEN_PROMPTIUM = 'pn-open-promptium';
export const FIX_PROMPT = 'pn-fix-prompt';
export const UPGRADE_PROMPT = 'pn-upgrade-prompt';
export const REWRITE_PROMPT = 'pn-rewrite-prompt';
export const SAVE_TO_VAULT = 'pn-save-to-vault';
export const COPY_AS_PROMPT = 'pn-copy-as-prompt';
export const CONTINUE_CHAT = 'pn-continue-chat';

// Backward-compatible aliases for older callers/tests.
export const SAVE_SELECTION = SAVE_CLIPPING;
export const REFINE_SELECTION = UPGRADE_PROMPT;
