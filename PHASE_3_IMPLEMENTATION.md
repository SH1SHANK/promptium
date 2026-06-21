# Phase 3: Floating Window Architecture - Implementation Guide

## Overview

Phase 3 transforms Promptium from a SidePanel-first extension into a dedicated floating window application. This document explains the architecture, modules, and usage patterns.

## Core Philosophy

- **Single Window Instance**: One Promptium window open at a time
- **Keyboard-First**: Power users can operate Promptium entirely via keyboard
- **Cross-Browser**: Works consistently across Chrome, Edge, Arc, Zen, Vivaldi, and other Chromium browsers
- **No SidePanel Dependency**: Completely independent of browser-specific APIs
- **Local-Only**: All features work locally without cloud sync or telemetry

## Architecture

### Window Management (`src/utils/window-manager.ts`)

Handles the floating window lifecycle:

```typescript
import { windowManager } from '@/utils/window-manager';

// Initialize (on extension startup)
await windowManager.initialize();

// Open or focus window
const result = await windowManager.openWindow((route = ''));
// Returns: { success: boolean, windowId?: number, isNew?: boolean }

// Get current window ID
const windowId = windowManager.getWindowId();

// Check if window is open
const isOpen = await windowManager.isWindowOpen();

// Update window (resize, reposition)
await windowManager.updateWindow({ width: 600, height: 900 });

// Close window
await windowManager.closeWindow();
```

**Features:**

- Automatic window restoration from previous session
- Optimal window placement based on screen dimensions
- Listener-based cleanup on window close
- Persistent state tracking

### Command Palette (`src/utils/command-palette.ts`)

Central command registry and execution system:

```typescript
import { commandPalette, createBuiltinCommands } from '@/utils/command-palette';

// Register built-in commands
commandPalette.registerCommands(createBuiltinCommands());

// Register custom command
commandPalette.registerCommand({
  id: 'custom-action',
  title: 'My Custom Action',
  description: 'Does something cool',
  category: 'action',
  shortcuts: ['Cmd+Shift+M'],
  icon: '🚀',
  execute: async (context) => {
    // Perform action
  },
});

// Search commands
const results = commandPalette.searchCommands('create');

// Get by category
const actions = commandPalette.getCommandsByCategory('action');

// Execute command
await commandPalette.executeCommand('create-prompt');

// Listen for changes
commandPalette.onCommandsChanged((commands) => {
  console.log('Commands updated:', commands);
});
```

**Built-in Commands:**

- **Search**: `search-prompt`, `search-template`, `search-bookmark`
- **Actions**: `create-prompt`, `create-template`, `refine-prompt`, `continue-conversation`, `export-content`
- **Navigation**: `go-library`, `go-templates`, `go-favorites`, `go-bookmarks`, `go-settings`
- **Settings**: `toggle-theme`, `open-help`

### Keyboard Shortcuts (`src/utils/keyboard-shortcuts.ts`)

Global keyboard shortcut management:

```typescript
import { keyboardManager, createBuiltinShortcuts } from '@/utils/keyboard-shortcuts';

// Initialize
keyboardManager.initialize();

// Register shortcuts
keyboardManager.registerShortcuts(createBuiltinShortcuts());

// Register custom shortcut
keyboardManager.registerShortcut({
  id: 'my-shortcut',
  keys: ['Cmd', 'Shift', 'G'],
  description: 'Do something',
  action: () => {
    // Execute
  },
  isEditableFieldSafe: false, // Don't trigger in input fields
});

// Check if exists
const hasIt = keyboardManager.hasShortcut(['Cmd', 'K']);
```

**Built-in Shortcuts:**

- `/` - Focus search
- `Cmd/Ctrl+K` - Command palette
- `Cmd/Ctrl+Enter` - Insert selected prompt
- `Escape` - Close dialog
- `↑/↓` - Navigate lists
- `Cmd/Ctrl+N` - Create prompt
- `Cmd/Ctrl+Shift+C` - Continue conversation
- `Cmd/Ctrl+E` - Export
- `Cmd/Ctrl+,` - Settings
- `Cmd/Ctrl+Shift+T` - Toggle theme
- `?` - Help

### Recents & Favorites (`src/utils/recents-favorites.ts`)

Local-only tracking of usage patterns:

```typescript
import { recentsAndFavorites } from '@/utils/recents-favorites';

// Record usage
await recentsAndFavorites.recordUsage('prompt-123', 'prompt', 'My Prompt');

// Toggle favorite
const isFav = await recentsAndFavorites.toggleFavorite('prompt-123', 'prompt');

// Get recents
const recents = await recentsAndFavorites.getRecents('prompt', 10);

// Get most used
const mostUsed = await recentsAndFavorites.getMostUsed('template', 5);

// Get favorites
const favorites = await recentsAndFavorites.getFavorites();

// Get usage stats
const stats = await recentsAndFavorites.getUsageStats('prompt-123');
// Returns: { id, type, title, lastUsed, usageCount, isFavorite }

// Check if favorite
const isFav = await recentsAndFavorites.isFavorite('prompt-123');

// Clear all data
await recentsAndFavorites.clearAllData();
```

**Storage:**

- **Local**: All data stored in `chrome.storage.local`
- **No Cloud**: No sync, no analytics, no telemetry
- **Persistent**: Survives browser restarts

### Smart Search Ranker (`src/utils/search-ranker.ts`)

Intelligent result ranking without AI embeddings:

```typescript
import { searchRanker } from '@/utils/search-ranker';

const items = [
  {
    id: '1',
    title: 'Write a poem',
    tags: ['creative', 'poetry'],
    category: 'writing',
    usageCount: 5,
    lastUsed: Date.now(),
    isFavorite: true,
  },
  // ... more items
];

// Rank results
const ranked = searchRanker.rankResults(items, 'poem');
// Returns sorted by relevance score (0-100)

// Pre-filter before ranking (performance optimization)
const filtered = searchRanker.prefilterResults(items, 'poem');

// Fuzzy match (tolerates typos)
const hasMatch = searchRanker.fuzzyMatch('poetry', 'potry');
```

**Ranking Factors:**

1. Title match (40 points) - exact > starts-with > contains
2. Tag match (20 points) - matching tags
3. Category match (10 points)
4. Description match (15 points)
5. Usage frequency (10 points) - logarithmic scale
6. Favorite status (5 points) - bonus
7. Recent usage (3 points) - time decay

## Integration Flow

### Extension Startup

```
chrome.runtime.onInstalled
  → windowManager.initialize()
  → registerContextMenus()

chrome.runtime.onStartup
  → windowManager.initialize()
  → registerContextMenus()
```

### User Click Extension Icon

```
chrome.action.onClicked
  → windowManager.openWindow()
    → Check existing window
    → If exists: focus + bring to front
    → If not: create new window at optimal position
```

### In-App Keyboard Shortcut

```
keyboardManager.handleKeyDown(event)
  → extractKeys(event)
  → getShortcut(keys)
  → executeCommand() or dispatchEvent()
```

### Command Execution

```
User presses Cmd+K
  → keyboardManager handles
  → Dispatches "promptium:command-palette" event
  → UI shows command palette
  → User selects command
  → commandPalette.executeCommand(id)
  → Command executes with context
```

### Search & Ranking

```
User types in search
  → searchRanker.prefilterResults(items, query)
  → searchRanker.rankResults(filtered, query)
  → Sort by score
  → Display results with match reasons
```

### Usage Tracking

```
User selects/uses a prompt
  → recentsAndFavorites.recordUsage(id, type, title)
  → Updates lastUsed and usageCount
  → Updates recents list
  → Re-ranks future searches
```

## Window Configuration

```typescript
// Current defaults in window-manager.ts
const WINDOW_CONFIG = {
  width: 500, // pixels
  height: 850, // pixels
  type: 'popup', // chrome.windows.CreateData type
};

const WINDOW_OFFSETS = {
  right: 24, // pixels from right edge
  top: 56, // pixels from top
};
```

To change window size, update these constants.

## Custom Events

Promptium uses custom DOM events for cross-component communication:

```typescript
// These are dispatched by keyboard shortcuts and commands:
window.dispatchEvent(new CustomEvent('promptium:focus-search'));
window.dispatchEvent(new CustomEvent('promptium:command-palette'));
window.dispatchEvent(new CustomEvent('promptium:insert-selected'));
window.dispatchEvent(new CustomEvent('promptium:close-dialog'));
window.dispatchEvent(new CustomEvent('promptium:navigate-up'));
window.dispatchEvent(new CustomEvent('promptium:navigate-down'));
window.dispatchEvent(new CustomEvent('promptium:create-prompt'));
window.dispatchEvent(new CustomEvent('promptium:continue-conversation'));
window.dispatchEvent(new CustomEvent('promptium:export'));
window.dispatchEvent(new CustomEvent('promptium:toggle-theme'));
window.dispatchEvent(new CustomEvent('promptium:help'));
```

Listen to these in your UI components:

```typescript
window.addEventListener('promptium:command-palette', () => {
  showCommandPalette();
});
```

## Storage Structure

### Window State (`chrome.storage.session`)

```json
{
  "promptiumWindowId": 123456,
  "promptiumWindowTime": 1234567890
}
```

### Usage Data (`chrome.storage.local`)

```json
{
  "promptiumRecents": ["id1", "id2", "id3"],
  "promptiumFavorites": ["id1", "id4"],
  "promptiumUsage": {
    "id1": {
      "id": "id1",
      "type": "prompt",
      "title": "My Prompt",
      "lastUsed": 1234567890,
      "usageCount": 5,
      "isFavorite": true
    }
  }
}
```

## Performance Considerations

1. **Window Creation**: Use `isNew` flag to track first-time creation
2. **Search**: Pre-filter before ranking to reduce computation
3. **Storage**: Use `prefilterResults()` before ranking
4. **Keyboard**: Event handlers use early returns to avoid processing
5. **Memory**: Window listeners are cleaned up on window close

## Browser Compatibility

Works with:

- ✅ Chrome/Chromium
- ✅ Edge
- ✅ Arc
- ✅ Zen
- ✅ Vivaldi
- ✅ Opera
- ✅ Other Chromium forks

**Not supported:**

- ❌ Firefox (no `chrome.windows` API)
- ❌ Safari (no full extension API)

## Testing Checklist

- [ ] Extension icon click opens window
- [ ] Second click focuses existing window
- [ ] Window closes and can be reopened
- [ ] Window restores on browser restart
- [ ] All keyboard shortcuts work
- [ ] Command palette opens and searches
- [ ] Recents are tracked and displayed
- [ ] Favorites toggle works
- [ ] Search ranking prioritizes matches
- [ ] No console errors

## Future Enhancements

- [ ] Window resizing persistence
- [ ] Position persistence across sessions
- [ ] Multi-window support (optional)
- [ ] Floating window always-on-top option
- [ ] Custom keyboard shortcuts UI
- [ ] Analytics (local only, no cloud)
- [ ] Performance metrics
