import { PromptiumWindowState, WindowBounds } from '../types/window-manager';
import { createLogger } from '../utils/logger';

const logger = createLogger('WindowStore');

const STORAGE_KEY = 'promptiumWindowState';
const CURRENT_VERSION = 1;

const DEFAULT_BOUNDS: WindowBounds = {
  width: 480,
  height: 760,
  left: 100,
  top: 100,
};

export class WindowStore {
  static async getState(): Promise<PromptiumWindowState> {
    try {
      const data = await chrome.storage.local.get([STORAGE_KEY]);
      const state = data[STORAGE_KEY] as Partial<PromptiumWindowState> | undefined;

      if (state && typeof state === 'object' && state.version === CURRENT_VERSION) {
        return {
          version: CURRENT_VERSION,
          windowId: typeof state.windowId === 'number' ? state.windowId : null,
          bounds: {
            left: typeof state.bounds?.left === 'number' ? state.bounds.left : DEFAULT_BOUNDS.left,
            top: typeof state.bounds?.top === 'number' ? state.bounds.top : DEFAULT_BOUNDS.top,
            width:
              typeof state.bounds?.width === 'number' ? state.bounds.width : DEFAULT_BOUNDS.width,
            height:
              typeof state.bounds?.height === 'number'
                ? state.bounds.height
                : DEFAULT_BOUNDS.height,
          },
        };
      }
    } catch (e) {
      logger.warn('Failed to read state.', e);
    }

    return {
      version: CURRENT_VERSION,
      windowId: null,
      bounds: { ...DEFAULT_BOUNDS },
    };
  }

  static async saveState(state: PromptiumWindowState): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: state });
    } catch (e) {
      logger.warn('Failed to save state.', e);
    }
  }

  static async saveWindowId(windowId: number | null): Promise<void> {
    const state = await this.getState();
    state.windowId = windowId;
    await this.saveState(state);
  }

  static async saveBounds(bounds: WindowBounds): Promise<void> {
    const state = await this.getState();
    state.bounds = bounds;
    await this.saveState(state);
  }

  static async clearWindowId(): Promise<void> {
    await this.saveWindowId(null);
  }
}
