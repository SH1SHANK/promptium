/**
 * Command Palette System for Promptium
 *
 * Provides:
 * - Command registration and management
 * - Search/filtering of commands
 * - Keyboard navigation
 * - Action execution with context
 */

export interface Command {
  id: string;
  title: string;
  description?: string;
  category: 'search' | 'action' | 'navigation' | 'settings';
  shortcuts?: string[];
  icon?: string;
  execute: (context?: any) => void | Promise<void>;
}

class CommandPalette {
  private commands: Map<string, Command> = new Map();
  private listeners: Set<(commands: Command[]) => void> = new Set();

  /**
   * Register a new command
   */
  registerCommand(command: Command): void {
    this.commands.set(command.id, command);
    this.notifyListeners();
  }

  /**
   * Register multiple commands at once
   */
  registerCommands(commands: Command[]): void {
    commands.forEach((cmd) => this.commands.set(cmd.id, cmd));
    this.notifyListeners();
  }

  /**
   * Get a command by ID
   */
  getCommand(id: string): Command | undefined {
    return this.commands.get(id);
  }

  /**
   * Get all commands
   */
  getAllCommands(): Command[] {
    return Array.from(this.commands.values());
  }

  /**
   * Search commands by title or description
   */
  searchCommands(query: string): Command[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    return Array.from(this.commands.values()).filter((cmd) => {
      const titleMatch = cmd.title.toLowerCase().includes(q);
      const descMatch = cmd.description?.toLowerCase().includes(q) || false;
      const categoryMatch = cmd.category.toLowerCase().includes(q);
      return titleMatch || descMatch || categoryMatch;
    });
  }

  /**
   * Get commands by category
   */
  getCommandsByCategory(category: string): Command[] {
    return Array.from(this.commands.values())
      .filter((cmd) => cmd.category === category)
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  /**
   * Execute a command
   */
  async executeCommand(id: string, context?: any): Promise<boolean> {
    const command = this.commands.get(id);
    if (!command) return false;

    try {
      await command.execute(context);
      return true;
    } catch (error) {
      console.error(`[Promptium][CommandPalette] Failed to execute command ${id}:`, error);
      return false;
    }
  }

  /**
   * Subscribe to command list changes
   */
  onCommandsChanged(callback: (commands: Command[]) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify listeners of changes
   */
  private notifyListeners(): void {
    const commands = Array.from(this.commands.values());
    this.listeners.forEach((listener) => listener(commands));
  }
}

// Export singleton instance
export const commandPalette = new CommandPalette();

if (typeof window !== 'undefined') {
  (window as any).commandPalette = commandPalette;
  (window as any).createBuiltinCommands = createBuiltinCommands;
}

/**
 * Built-in command registry
 * These are the standard commands available in Promptium
 */
export const createBuiltinCommands = (): Command[] => {
  const builtinCommands: Command[] = [];

  // Search Commands
  builtinCommands.push({
    id: 'search-prompt',
    title: 'Search Prompts',
    description: 'Search your prompt library',
    category: 'search',
    shortcuts: ['/'],
    icon: '🔍',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:focus-search'));
    },
  });

  builtinCommands.push({
    id: 'search-template',
    title: 'Search Templates',
    description: 'Find templates by name or tag',
    category: 'search',
    icon: '📋',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:search-templates'));
    },
  });

  builtinCommands.push({
    id: 'search-bookmark',
    title: 'Search Bookmarks',
    description: 'Find bookmarks by title or URL',
    category: 'search',
    icon: '🔖',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:search-bookmarks'));
    },
  });

  // Action Commands
  builtinCommands.push({
    id: 'create-prompt',
    title: 'Create Prompt',
    description: 'Create a new prompt',
    category: 'action',
    shortcuts: ['Cmd+N', 'Ctrl+N'],
    icon: '✍️',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:create-prompt'));
    },
  });

  builtinCommands.push({
    id: 'edit-prompt',
    title: 'Edit Prompt',
    description: 'Edit the current prompt',
    category: 'action',
    icon: '✏️',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:edit-prompt'));
    },
  });

  builtinCommands.push({
    id: 'delete-prompt',
    title: 'Delete Prompt',
    description: 'Delete the current prompt',
    category: 'action',
    icon: '🗑️',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:delete-prompt'));
    },
  });

  builtinCommands.push({
    id: 'duplicate-prompt',
    title: 'Duplicate Prompt',
    description: 'Duplicate the current prompt',
    category: 'action',
    icon: '👯',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:duplicate-prompt'));
    },
  });

  builtinCommands.push({
    id: 'favorite-prompt',
    title: 'Favorite Prompt',
    description: 'Toggle favorite status',
    category: 'action',
    icon: '⭐',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:favorite-prompt'));
    },
  });

  builtinCommands.push({
    id: 'create-template',
    title: 'Create Template',
    description: 'Create a new template',
    category: 'action',
    icon: '🎨',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:create-template'));
    },
  });

  builtinCommands.push({
    id: 'apply-template',
    title: 'Apply Template',
    description: 'Apply a template to the current prompt',
    category: 'action',
    icon: '🪄',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:apply-template'));
    },
  });

  builtinCommands.push({
    id: 'refine-prompt',
    title: 'Refine Prompt',
    description: 'Use AI to improve the current prompt',
    category: 'action',
    icon: '✨',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:refine-prompt'));
    },
  });

  builtinCommands.push({
    id: 'continue-chatgpt',
    title: 'Continue in ChatGPT',
    description: 'Continue conversation in ChatGPT',
    category: 'action',
    icon: '🤖',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:continue-chatgpt'));
    },
  });

  builtinCommands.push({
    id: 'continue-gemini',
    title: 'Continue in Gemini',
    description: 'Continue conversation in Gemini',
    category: 'action',
    icon: '♊',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:continue-gemini'));
    },
  });

  builtinCommands.push({
    id: 'continue-claude',
    title: 'Continue in Claude',
    description: 'Continue conversation in Claude',
    category: 'action',
    icon: '🧠',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:continue-claude'));
    },
  });

  builtinCommands.push({
    id: 'continue-perplexity',
    title: 'Continue in Perplexity',
    description: 'Continue conversation in Perplexity',
    category: 'action',
    icon: '🌐',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:continue-perplexity'));
    },
  });

  builtinCommands.push({
    id: 'continue-copilot',
    title: 'Continue in Copilot',
    description: 'Continue conversation in Copilot',
    category: 'action',
    icon: '🚀',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:continue-copilot'));
    },
  });

  builtinCommands.push({
    id: 'continue-conversation',
    title: 'Continue Conversation',
    description: 'Continue a previous conversation',
    category: 'action',
    shortcuts: ['Cmd+Shift+C', 'Ctrl+Shift+C'],
    icon: '💬',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:continue-conversation'));
    },
  });

  builtinCommands.push({
    id: 'export-pdf',
    title: 'Export PDF',
    description: 'Export current content as PDF',
    category: 'action',
    icon: '📄',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:export-pdf'));
    },
  });

  builtinCommands.push({
    id: 'export-markdown',
    title: 'Export Markdown',
    description: 'Export current content as Markdown',
    category: 'action',
    icon: 'md',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:export-markdown'));
    },
  });

  builtinCommands.push({
    id: 'export-json',
    title: 'Export JSON',
    description: 'Export current content as JSON',
    category: 'action',
    icon: 'json',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:export-json'));
    },
  });

  builtinCommands.push({
    id: 'export-content',
    title: 'Export Content',
    description: 'Export prompts or conversations',
    category: 'action',
    shortcuts: ['Cmd+E', 'Ctrl+E'],
    icon: '📤',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:export-content'));
    },
  });

  // Navigation Commands
  builtinCommands.push({
    id: 'go-library',
    title: 'Go To Library',
    description: 'View prompt library',
    category: 'navigation',
    icon: '📚',
    execute: () => {
      window.location.hash = '#library';
    },
  });

  builtinCommands.push({
    id: 'go-templates',
    title: 'Go To Templates',
    description: 'View templates',
    category: 'navigation',
    icon: '📋',
    execute: () => {
      window.location.hash = '#templates';
    },
  });

  builtinCommands.push({
    id: 'go-favorites',
    title: 'Go To Favorites',
    description: 'View favorite prompts',
    category: 'navigation',
    icon: '⭐',
    execute: () => {
      window.location.hash = '#favorites';
    },
  });

  builtinCommands.push({
    id: 'go-bookmarks',
    title: 'Go To Bookmarks',
    description: 'View bookmarks',
    category: 'navigation',
    icon: '🔖',
    execute: () => {
      window.location.hash = '#bookmarks';
    },
  });

  builtinCommands.push({
    id: 'go-settings',
    title: 'Go To Settings',
    description: 'Open settings',
    category: 'navigation',
    shortcuts: ['Cmd+,', 'Ctrl+,'],
    icon: '⚙️',
    execute: () => {
      window.location.hash = '#settings';
    },
  });

  // Settings Commands
  builtinCommands.push({
    id: 'toggle-theme',
    title: 'Toggle Theme',
    description: 'Switch between light and dark theme',
    category: 'settings',
    shortcuts: ['Cmd+Shift+T', 'Ctrl+Shift+T'],
    icon: '🌓',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:toggle-theme'));
    },
  });

  builtinCommands.push({
    id: 'open-help',
    title: 'Open Help',
    description: 'View keyboard shortcuts and help',
    category: 'settings',
    shortcuts: ['?'],
    icon: '❓',
    execute: () => {
      window.dispatchEvent(new CustomEvent('promptium:open-help'));
    },
  });

  return builtinCommands;
};
