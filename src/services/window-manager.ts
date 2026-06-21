/**
 * Window Manager for Promptium Floating Window
 *
 * Handles:
 * - Single window instance enforcement
 * - Window lifecycle (create, focus, update, close)
 * - Window state persistence
 * - Cross-browser compatibility (via chrome.windows API)
 * - Event handling and cleanup
 */

const WINDOW_CONFIG = {
  width: 500,
  height: 850,
  type: 'popup' as chrome.windows.CreateData['type'],
};

const WINDOW_OFFSETS = {
  right: 24,
  top: 56,
};

interface WindowState {
  windowId: number | null;
  isTracking: boolean;
  lastFocused: number;
}

class PromptiumWindowManager {
  private state: WindowState = {
    windowId: null,
    isTracking: false,
    lastFocused: Date.now(),
  };

  private windowCloseListener: ((windowId: number) => void) | null = null;
  private windowFocusListener: ((windowId: number) => void) | null = null;

  /**
   * Initialize the window manager
   * Restores any existing window from the previous session
   */
  async initialize(): Promise<void> {
    try {
      // Try to restore existing window from previous session
      const savedWindowId = await this.getSavedWindowId();
      if (savedWindowId) {
        try {
          const win = await chrome.windows.get(savedWindowId);
          if (win && win.id) {
            this.state.windowId = win.id;
            this.state.isTracking = true;
            this.setupWindowListeners();
            return;
          }
        } catch {
          // Window no longer exists, clear it
          await this.clearSavedWindowId();
        }
      }
    } catch (error) {
      console.warn('[Promptium][WindowManager] Initialization error:', error);
    }
  }

  /**
   * Open or focus the Promptium window
   * If window exists, focuses it. Otherwise creates new window.
   */
  async openWindow(
    route: string = ''
  ): Promise<{ success: boolean; windowId?: number; isNew?: boolean }> {
    try {
      // Try to focus existing window first
      if (this.state.windowId) {
        try {
          const win = await chrome.windows.get(this.state.windowId);
          if (win && win.id) {
            await chrome.windows.update(this.state.windowId, {
              focused: true,
              drawAttention: true,
            });

            // Update URL with route if provided
            if (route) {
              await this.updateWindowRoute(this.state.windowId, route);
            }

            this.state.lastFocused = Date.now();
            return { success: true, windowId: this.state.windowId, isNew: false };
          }
        } catch {
          // Window doesn't exist anymore
          this.state.windowId = null;
        }
      }

      // Create new window
      return await this.createNewWindow(route);
    } catch (error) {
      console.error('[Promptium][WindowManager] Failed to open window:', error);
      return { success: false };
    }
  }

  /**
   * Create a new Promptium window
   */
  private async createNewWindow(
    route: string = ''
  ): Promise<{ success: boolean; windowId?: number; isNew: boolean }> {
    try {
      const placement = await this.calculateWindowPlacement();
      const url = this.buildWindowUrl(route);

      const win = await chrome.windows.create({
        ...WINDOW_CONFIG,
        url,
        left: placement.left,
        top: placement.top,
        focused: true,
      });

      if (!win?.id) {
        return { success: false, isNew: false };
      }

      this.state.windowId = win.id;
      this.state.isTracking = true;
      this.state.lastFocused = Date.now();

      await this.saveWindowId(win.id);
      this.setupWindowListeners();

      return { success: true, windowId: win.id, isNew: true };
    } catch (error) {
      console.error('[Promptium][WindowManager] Failed to create window:', error);
      return { success: false, isNew: false };
    }
  }

  /**
   * Close the Promptium window
   */
  async closeWindow(): Promise<boolean> {
    try {
      if (!this.state.windowId) return false;

      await chrome.windows.remove(this.state.windowId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update window size and position
   */
  async updateWindow(updates: Partial<chrome.windows.UpdateInfo>): Promise<boolean> {
    try {
      if (!this.state.windowId) return false;

      await chrome.windows.update(this.state.windowId, updates);
      return true;
    } catch (error) {
      console.error('[Promptium][WindowManager] Failed to update window:', error);
      return false;
    }
  }

  /**
   * Get the current window ID
   */
  getWindowId(): number | null {
    return this.state.windowId;
  }

  /**
   * Check if window is currently open
   */
  async isWindowOpen(): Promise<boolean> {
    if (!this.state.windowId) return false;

    try {
      await chrome.windows.get(this.state.windowId);
      return true;
    } catch {
      this.state.windowId = null;
      return false;
    }
  }

  /**
   * Calculate optimal window placement based on screen dimensions
   */
  private async calculateWindowPlacement(): Promise<{ left: number; top: number }> {
    try {
      const screenWidth = globalThis?.screen?.width || 0;
      const screenHeight = globalThis?.screen?.height || 0;

      if (screenWidth && screenHeight) {
        return {
          left: Math.max(0, screenWidth - WINDOW_CONFIG.width - WINDOW_OFFSETS.right),
          top: Math.max(0, WINDOW_OFFSETS.top),
        };
      }

      // Fallback: use last focused window as anchor
      const focusedWindow = await chrome.windows.getLastFocused().catch(() => null);
      if (focusedWindow) {
        const anchorLeft = focusedWindow.left || 0;
        const anchorTop = focusedWindow.top || 0;
        const anchorWidth = focusedWindow.width || WINDOW_CONFIG.width;

        return {
          left: Math.max(0, anchorLeft + anchorWidth - WINDOW_CONFIG.width - WINDOW_OFFSETS.right),
          top: Math.max(0, anchorTop + WINDOW_OFFSETS.top),
        };
      }

      return { left: 0, top: 0 };
    } catch {
      return { left: 0, top: 0 };
    }
  }

  /**
   * Build window URL with optional route
   */
  private buildWindowUrl(route: string = ''): string {
    const base = chrome.runtime.getURL('app.html');
    if (!route) return base;

    const cleanRoute = String(route).replace(/^#/, '').trim();
    return `${base}#${cleanRoute}`;
  }

  /**
   * Update window URL/route
   */
  private async updateWindowRoute(windowId: number, route: string): Promise<void> {
    try {
      const window = await chrome.windows.get(windowId, { populate: true });
      if (!window.tabs?.length) return;

      const tab = window.tabs[0];
      if (tab.id) {
        await chrome.tabs.update(tab.id, {
          url: this.buildWindowUrl(route),
        });
      }
    } catch (error) {
      console.warn('[Promptium][WindowManager] Failed to update window route:', error);
    }
  }

  /**
   * Setup listeners for window lifecycle events
   */
  private setupWindowListeners(): void {
    if (this.state.isTracking) return;

    this.windowCloseListener = (windowId: number) => {
      if (windowId === this.state.windowId) {
        this.state.windowId = null;
        this.state.isTracking = false;
        void this.clearSavedWindowId();
      }
    };

    this.windowFocusListener = (windowId: number) => {
      if (windowId === this.state.windowId) {
        this.state.lastFocused = Date.now();
      }
    };

    chrome.windows.onRemoved.addListener(this.windowCloseListener);
    chrome.windows.onFocusChanged.addListener(this.windowFocusListener);
  }

  /**
   * Cleanup window listeners
   */
  private cleanupWindowListeners(): void {
    if (this.windowCloseListener) {
      chrome.windows.onRemoved.removeListener(this.windowCloseListener);
    }
    if (this.windowFocusListener) {
      chrome.windows.onFocusChanged.removeListener(this.windowFocusListener);
    }
    this.state.isTracking = false;
  }

  /**
   * Save window ID to persistent storage
   */
  private async saveWindowId(windowId: number): Promise<void> {
    try {
      await chrome.storage.session.set({
        promptiumWindowId: windowId,
        promptiumWindowTime: Date.now(),
      });
    } catch (error) {
      console.warn('[Promptium][WindowManager] Failed to save window ID:', error);
    }
  }

  /**
   * Retrieve saved window ID from storage
   */
  private async getSavedWindowId(): Promise<number | null> {
    try {
      const data = await chrome.storage.session.get(['promptiumWindowId']);
      return data?.promptiumWindowId || null;
    } catch {
      return null;
    }
  }

  /**
   * Clear saved window ID from storage
   */
  private async clearSavedWindowId(): Promise<void> {
    try {
      await chrome.storage.session.remove(['promptiumWindowId', 'promptiumWindowTime']);
    } catch (error) {
      console.warn('[Promptium][WindowManager] Failed to clear window ID:', error);
    }
  }

  /**
   * Shutdown the window manager
   */
  shutdown(): void {
    this.cleanupWindowListeners();
    this.state = {
      windowId: null,
      isTracking: false,
      lastFocused: Date.now(),
    };
  }
}

// Export singleton instance
export const windowManager = new PromptiumWindowManager();

// Export for testing
export { PromptiumWindowManager };
