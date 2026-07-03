import { OpenSource } from '../shared/types/window-manager';
import { WindowStore } from '../shared/storage/window-store';
import { createLogger } from '../shared/utils/logger';

const logger = createLogger('FloatingWindow');

export class FloatingWindowService {
  async initialize(): Promise<void> {
    const state = await WindowStore.getState();
    if (state.windowId !== null) {
      try {
        const win = await chrome.windows.get(state.windowId);
        if (!win || win.id === undefined || win.type !== 'popup') {
          await WindowStore.clearWindowId();
        }
      } catch {
        await WindowStore.clearWindowId();
      }
    }
  }

  async open(_source: OpenSource, route = ''): Promise<void> {
    const state = await WindowStore.getState();
    const targetUrl = chrome.runtime.getURL(
      route ? `app.html#${String(route).replace(/^#/, '')}` : 'app.html'
    );

    if (state.windowId !== null) {
      try {
        const win = await chrome.windows.get(state.windowId);
        if (win && win.id !== undefined && win.type === 'popup') {
          await chrome.windows.update(win.id, { focused: true });
          if (route) {
            const tabs = await chrome.tabs.query({ windowId: win.id }).catch(() => []);
            const tab =
              tabs.find((item) =>
                String(item.url || '').startsWith(chrome.runtime.getURL('app.html'))
              ) || tabs[0];
            if (tab?.id)
              await chrome.tabs.update(tab.id, { active: true, url: targetUrl }).catch(() => {});
          }
          return;
        }
      } catch {
        // Window no longer exists, clear stale ID
        await WindowStore.clearWindowId();
      }
    }

    let left = state.bounds.left;
    let top = state.bounds.top;

    // Default left/top: position relative to last focused anchor
    if (left === 100 && top === 100) {
      const placement = await this.calculatePlacement(state.bounds.width);
      left = placement.left;
      top = placement.top;
    }

    try {
      const win = await chrome.windows.create({
        url: targetUrl,
        type: 'popup',
        left,
        top,
        width: state.bounds.width,
        height: state.bounds.height,
        focused: true,
      });

      if (win?.id) {
        await WindowStore.saveWindowId(win.id);
        if (
          win.left !== undefined &&
          win.top !== undefined &&
          win.width !== undefined &&
          win.height !== undefined
        ) {
          await WindowStore.saveBounds({
            left: win.left,
            top: win.top,
            width: win.width,
            height: win.height,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to create window.', error);
    }
  }

  async focus(): Promise<void> {
    const state = await WindowStore.getState();
    if (state.windowId !== null) {
      try {
        const win = await chrome.windows.get(state.windowId);
        if (win && win.id !== undefined && win.type === 'popup') {
          await chrome.windows.update(win.id, { focused: true });
        }
      } catch {
        await WindowStore.clearWindowId();
      }
    }
  }

  async close(): Promise<void> {
    const state = await WindowStore.getState();
    if (state.windowId !== null) {
      try {
        await chrome.windows.remove(state.windowId);
      } catch {
        // Ignore errors if already closed
      }
      await WindowStore.clearWindowId();
    }
  }

  async exists(): Promise<boolean> {
    const state = await WindowStore.getState();
    if (state.windowId === null) return false;
    try {
      const win = await chrome.windows.get(state.windowId);
      return win && win.id !== undefined && win.type === 'popup';
    } catch {
      await WindowStore.clearWindowId();
      return false;
    }
  }

  async debug(): Promise<any> {
    const state = await WindowStore.getState();
    const active = await this.exists();
    return {
      activeWindowId: state.windowId,
      exists: active,
      bounds: state.bounds,
      version: state.version,
    };
  }

  private async calculatePlacement(width: number): Promise<{ left: number; top: number }> {
    try {
      const focusedWindow = await chrome.windows.getLastFocused().catch(() => null);
      if (
        focusedWindow &&
        focusedWindow.left !== undefined &&
        focusedWindow.top !== undefined &&
        focusedWindow.width !== undefined
      ) {
        const left = Math.max(0, focusedWindow.left + focusedWindow.width - width - 24);
        const top = Math.max(0, focusedWindow.top + 56);
        return { left, top };
      }
    } catch {
      // Ignore
    }
    return { left: 100, top: 100 };
  }
}

export const floatingWindowService = new FloatingWindowService();

// Debounce timer for saving bounds changes to prevent writing excessively to storage
let boundsSaveTimer: any = null;

if (typeof chrome !== 'undefined' && chrome.windows) {
  chrome.windows.onRemoved.addListener((windowId) => {
    void (async () => {
      const state = await WindowStore.getState();
      if (state.windowId === windowId) {
        await WindowStore.clearWindowId();
      }
    })();
  });

  chrome.windows.onBoundsChanged.addListener((win) => {
    void (async () => {
      const state = await WindowStore.getState();
      if (win.id === state.windowId) {
        if (
          win.left !== undefined &&
          win.top !== undefined &&
          win.width !== undefined &&
          win.height !== undefined
        ) {
          if (boundsSaveTimer) {
            clearTimeout(boundsSaveTimer);
          }
          boundsSaveTimer = setTimeout(() => {
            void WindowStore.saveBounds({
              left: win.left!,
              top: win.top!,
              width: win.width!,
              height: win.height!,
            });
          }, 300);
        }
      }
    })();
  });
}
