/**
 * File: types/domain/window.ts
 * Purpose: Centralized domain type for Promptium window management and state.
 */

export interface WindowBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type OpenSource = 'toolbar' | 'fab' | 'context-menu' | 'shortcut' | 'icon';

export interface PromptiumWindowState {
  version: number;
  windowId: number | null;
  bounds: WindowBounds;
}
