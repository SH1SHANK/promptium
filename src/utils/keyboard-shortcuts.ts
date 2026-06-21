/**
 * Keyboard Shortcuts System for Promptium
 *
 * Handles:
 * - Global keyboard shortcut registration
 * - Shortcut binding to commands
 * - Conflict detection
 * - Keyboard-first navigation
 */

export interface KeyboardShortcut {
  id: string;
  keys: string[]; // e.g., ["Cmd", "K"] or ["Ctrl", "Enter"]
  description: string;
  action: () => void | Promise<void>;
  isEditableFieldSafe?: boolean; // Allow in input/textarea
}

class KeyboardShortcutManager {
  private shortcuts: Map<string, KeyboardShortcut> = new Map();
  private isListening = false;
  private listeners: WeakMap<Element, Map<string, KeyboardShortcut>> = new WeakMap();

  /**
   * Initialize keyboard shortcut system
   */
  initialize(): void {
    if (this.isListening) return;

    document.addEventListener('keydown', this.handleKeyDown.bind(this), true);
    this.isListening = true;
  }

  /**
   * Register a keyboard shortcut
   */
  registerShortcut(shortcut: KeyboardShortcut): void {
    const key = this.serializeKeys(shortcut.keys);
    this.shortcuts.set(key, shortcut);
  }

  /**
   * Register multiple shortcuts
   */
  registerShortcuts(shortcuts: KeyboardShortcut[]): void {
    shortcuts.forEach((s) => this.registerShortcut(s));
  }

  /**
   * Unregister a shortcut
   */
  unregisterShortcut(keys: string[]): void {
    const key = this.serializeKeys(keys);
    this.shortcuts.delete(key);
  }

  /**
   * Get all registered shortcuts
   */
  getAllShortcuts(): KeyboardShortcut[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Get shortcut by keys
   */
  getShortcut(keys: string[]): KeyboardShortcut | undefined {
    const key = this.serializeKeys(keys);
    return this.shortcuts.get(key);
  }

  /**
   * Check if shortcut is already registered
   */
  hasShortcut(keys: string[]): boolean {
    const key = this.serializeKeys(keys);
    return this.shortcuts.has(key);
  }

  /**
   * Handle keyboard events
   */
  private async handleKeyDown(event: KeyboardEvent): Promise<void> {
    if (!this.shouldHandleEvent(event)) return;

    const keys = this.extractKeys(event);
    const shortcut = this.getShortcut(keys);

    if (!shortcut) return;

    // Check if we're in an editable field
    const target = event.target as HTMLElement;
    const isEditableField = this.isInEditableField(target);

    if (isEditableField && !shortcut.isEditableFieldSafe) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
      await shortcut.action();
    } catch (error) {
      console.error('[Promptium][Shortcuts] Failed to execute shortcut:', error);
    }
  }

  /**
   * Extract modifier keys from keyboard event
   */
  private extractKeys(event: KeyboardEvent): string[] {
    const keys: string[] = [];

    if (event.ctrlKey && !event.metaKey) keys.push('Ctrl');
    if (event.metaKey) keys.push('Cmd');
    if (event.altKey) keys.push('Alt');
    if (event.shiftKey) keys.push('Shift');

    // Get the key name
    const keyName = this.getKeyName(event.key);
    if (
      keyName &&
      keyName !== 'Control' &&
      keyName !== 'Meta' &&
      keyName !== 'Alt' &&
      keyName !== 'Shift'
    ) {
      keys.push(keyName);
    }

    return keys;
  }

  /**
   * Normalize key name
   */
  private getKeyName(key: string): string {
    const keyMap: Record<string, string> = {
      ' ': 'Space',
      Enter: 'Enter',
      Escape: 'Escape',
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      ArrowLeft: 'Left',
      ArrowRight: 'Right',
      '/': '/',
      '?': '?',
    };

    if (keyMap[key]) return keyMap[key];

    // Single character
    if (key.length === 1) {
      return key.toUpperCase();
    }

    return key;
  }

  /**
   * Check if we should handle this keyboard event
   */
  private shouldHandleEvent(event: KeyboardEvent): boolean {
    // Don't handle if modifiers are still being pressed
    if (event.repeat) return false;

    // Don't handle events that have been handled
    if ((event as any).handledByShortcuts) return false;

    return true;
  }

  /**
   * Determine if element is editable
   */
  private isInEditableField(element: HTMLElement): boolean {
    if (!element) return false;

    const tagName = element.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea') {
      return true;
    }

    if (element.contentEditable === 'true') {
      return true;
    }

    // Check parent elements
    let parent = element.parentElement;
    while (parent) {
      if (parent.contentEditable === 'true') {
        return true;
      }
      parent = parent.parentElement;
    }

    return false;
  }

  /**
   * Serialize keys to a consistent string format
   */
  private serializeKeys(keys: string[]): string {
    const normalized = keys.map((k) => k.toLowerCase().trim()).sort(); // Sort for consistent comparison
    return normalized.join('+');
  }
}

export const keyboardManager = new KeyboardShortcutManager();

/**
 * Create built-in keyboard shortcuts
 */
export const createBuiltinShortcuts = (commandPalette: any): KeyboardShortcut[] => {
  return [
    // Focus search
    {
      id: 'focus-search',
      keys: ['/'],
      description: 'Focus search bar',
      action: () => {
        window.dispatchEvent(new CustomEvent('promptium:focus-search'));
      },
      isEditableFieldSafe: false,
    },

    // Command palette
    {
      id: 'command-palette',
      keys: ['Cmd', 'K'],
      description: 'Open command palette',
      action: () => {
        window.dispatchEvent(new CustomEvent('promptium:command-palette'));
      },
      isEditableFieldSafe: false,
    },

    // Alternative command palette for non-Mac
    {
      id: 'command-palette-alt',
      keys: ['Ctrl', 'K'],
      description: 'Open command palette',
      action: () => {
        window.dispatchEvent(new CustomEvent('promptium:command-palette'));
      },
      isEditableFieldSafe: false,
    },

    // Insert/Execute selected prompt
    {
      id: 'insert-prompt',
      keys: ['Cmd', 'Enter'],
      description: 'Insert selected prompt',
      action: () => {
        window.dispatchEvent(new CustomEvent('promptium:insert-selected'));
      },
      isEditableFieldSafe: false,
    },

    // Alternative for non-Mac
    {
      id: 'insert-prompt-alt',
      keys: ['Ctrl', 'Enter'],
      description: 'Insert selected prompt',
      action: () => {
        window.dispatchEvent(new CustomEvent('promptium:insert-selected'));
      },
      isEditableFieldSafe: false,
    },

    // Close dialog/modal
    {
      id: 'close-dialog',
      keys: ['Escape'],
      description: 'Close dialog',
      action: () => {
        window.dispatchEvent(new CustomEvent('promptium:close-dialog'));
      },
      isEditableFieldSafe: true,
    },

    // Navigate up in lists
    {
      id: 'navigate-up',
      keys: ['Up'],
      description: 'Navigate up',
      action: () => {
        window.dispatchEvent(new CustomEvent('promptium:navigate-up'));
      },
      isEditableFieldSafe: false,
    },

    // Navigate down in lists
    {
      id: 'navigate-down',
      keys: ['Down'],
      description: 'Navigate down',
      action: () => {
        window.dispatchEvent(new CustomEvent('promptium:navigate-down'));
      },
      isEditableFieldSafe: false,
    },

    // Create new prompt
    {
      id: 'create-prompt',
      keys: ['Cmd', 'N'],
      description: 'Create new prompt',
      action: () => {
        window.dispatchEvent(new CustomEvent('promptium:create-prompt'));
      },
      isEditableFieldSafe: false,
    },

    // Create new prompt (non-Mac)
    {
      id: 'create-prompt-alt',
      keys: ['Ctrl', 'N'],
      description: 'Create new prompt',
      action: () => {
        window.dispatchEvent(new CustomEvent('promptium:create-prompt'));
      },
      isEditableFieldSafe: false,
    },

    // Continue conversation
    {
      id: 'continue-conversation',
      keys: ['Cmd', 'Shift', 'C'],
      description: 'Continue conversation',
      action: () => {
        window.dispatchEvent(new CustomEvent('promptium:continue-conversation'));
      },
      isEditableFieldSafe: false,
    },

    // Continue conversation (non-Mac)
    {
      id: 'continue-conversation-alt',
      keys: ['Ctrl', 'Shift', 'C'],
      description: 'Continue conversation',
      action: () => {
        window.dispatchEvent(new CustomEvent('promptium:continue-conversation'));
      },
      isEditableFieldSafe: false,
    },

    // Export
    {
      id: 'export',
      keys: ['Cmd', 'E'],
      description: 'Export',
      action: () => {
        window.dispatchEvent(new CustomEvent('promptium:export'));
      },
      isEditableFieldSafe: false,
    },

    // Export (non-Mac)
    {
      id: 'export-alt',
      keys: ['Ctrl', 'E'],
      description: 'Export',
      action: () => {
        window.dispatchEvent(new CustomEvent('promptium:export'));
      },
      isEditableFieldSafe: false,
    },

    // Settings
    {
      id: 'settings',
      keys: ['Cmd', ','],
      description: 'Open settings',
      action: () => {
        window.location.hash = '#settings';
      },
      isEditableFieldSafe: false,
    },

    // Settings (non-Mac)
    {
      id: 'settings-alt',
      keys: ['Ctrl', ','],
      description: 'Open settings',
      action: () => {
        window.location.hash = '#settings';
      },
      isEditableFieldSafe: false,
    },

    // Toggle theme
    {
      id: 'toggle-theme',
      keys: ['Cmd', 'Shift', 'T'],
      description: 'Toggle theme',
      action: () => {
        window.dispatchEvent(new CustomEvent('promptium:toggle-theme'));
      },
      isEditableFieldSafe: false,
    },

    // Toggle theme (non-Mac)
    {
      id: 'toggle-theme-alt',
      keys: ['Ctrl', 'Shift', 'T'],
      description: 'Toggle theme',
      action: () => {
        window.dispatchEvent(new CustomEvent('promptium:toggle-theme'));
      },
      isEditableFieldSafe: false,
    },

    // Help
    {
      id: 'help',
      keys: ['?'],
      description: 'Show help',
      action: () => {
        window.dispatchEvent(new CustomEvent('promptium:help'));
      },
      isEditableFieldSafe: false,
    },
  ];
};
