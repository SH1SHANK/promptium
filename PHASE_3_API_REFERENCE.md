# Phase 3 Modules API Reference

## Core Modules Quick Reference

### Window Manager (`window-manager.ts`)

```typescript
import { windowManager } from '@/utils/window-manager';

// Initialize (call on startup)
await windowManager.initialize();

// Open or focus window
const result = await windowManager.openWindow(route?: string);
// Returns: { success: boolean, windowId?: number, isNew?: boolean }

// Get window ID
const id = windowManager.getWindowId(); // number | null

// Check if open
const isOpen = await windowManager.isWindowOpen(); // boolean

// Update window (resize, position)
await windowManager.updateWindow({ width: 600, height: 900 });

// Close window
await windowManager.closeWindow(); // boolean

// Shutdown (cleanup listeners)
windowManager.shutdown();
```

---

### Command Palette (`command-palette.ts`)

```typescript
import { commandPalette, createBuiltinCommands } from '@/utils/command-palette';

// Register commands
commandPalette.registerCommand(command);
commandPalette.registerCommands(commands);

// Search commands
const results = commandPalette.searchCommands(query);
// Returns: Command[]

// Get commands
const all = commandPalette.getAllCommands(); // Command[]
const byCategory = commandPalette.getCommandsByCategory('action'); // Command[]
const single = commandPalette.getCommand('command-id'); // Command | undefined

// Execute command
const success = await commandPalette.executeCommand('command-id', context);
// Returns: boolean

// Listen for changes
const unsubscribe = commandPalette.onCommandsChanged((commands) => {
  console.log('Commands updated:', commands);
});
unsubscribe(); // Stop listening

// Built-in commands
const builtins = createBuiltinCommands(); // Command[]
```

**Command Interface:**

```typescript
interface Command {
  id: string;
  title: string;
  description?: string;
  category: 'search' | 'action' | 'navigation' | 'settings';
  shortcuts?: string[];
  icon?: string;
  execute: (context?: any) => void | Promise<void>;
}
```

---

### Keyboard Shortcuts (`keyboard-shortcuts.ts`)

```typescript
import { keyboardManager, createBuiltinShortcuts } from '@/utils/keyboard-shortcuts';

// Initialize (call on page load)
keyboardManager.initialize();

// Register shortcuts
keyboardManager.registerShortcut(shortcut);
keyboardManager.registerShortcuts(shortcuts);

// Check if exists
const has = keyboardManager.hasShortcut(['Cmd', 'K']); // boolean

// Get shortcut
const shortcut = keyboardManager.getShortcut(['Cmd', 'K']); // KeyboardShortcut | undefined

// Unregister
keyboardManager.unregisterShortcut(['Cmd', 'K']);

// Get all
const all = keyboardManager.getAllShortcuts(); // KeyboardShortcut[]

// Built-in shortcuts
const builtins = createBuiltinShortcuts(commandPalette); // KeyboardShortcut[]
```

**Shortcut Interface:**

```typescript
interface KeyboardShortcut {
  id: string;
  keys: string[]; // e.g., ["Cmd", "K"], ["Ctrl", "Shift", "C"]
  description: string;
  action: () => void | Promise<void>;
  isEditableFieldSafe?: boolean; // Allow in input/textarea
}
```

---

### Recents & Favorites (`recents-favorites.ts`)

```typescript
import { recentsAndFavorites } from '@/utils/recents-favorites';

// Record usage
await recentsAndFavorites.recordUsage(id, type, title);

// Toggle favorite
const isFavorite = await recentsAndFavorites.toggleFavorite(id, type, title);
// Returns: boolean

// Get recents
const recents = await recentsAndFavorites.getRecents(type?, limit?);
// type: 'prompt' | 'template' | 'bookmark' (optional)
// limit: number (default 10)
// Returns: UsageRecord[]

// Get most used
const mostUsed = await recentsAndFavorites.getMostUsed(type?, limit?);
// Returns: UsageRecord[]

// Get favorites
const favorites = await recentsAndFavorites.getFavorites(type?, limit?);
// Returns: UsageRecord[]

// Get stats
const stats = await recentsAndFavorites.getUsageStats(id);
// Returns: UsageRecord | null

// Check if favorite
const isFav = await recentsAndFavorites.isFavorite(id);
// Returns: boolean

// Clear all
await recentsAndFavorites.clearAllData();
```

**UsageRecord Interface:**

```typescript
interface UsageRecord {
  id: string;
  type: 'prompt' | 'template' | 'bookmark';
  title: string;
  lastUsed: number;
  usageCount: number;
  isFavorite: boolean;
}
```

---

### Search Ranker (`search-ranker.ts`)

```typescript
import { searchRanker } from '@/utils/search-ranker';

// Rank results
const ranked = searchRanker.rankResults(items, query);
// Returns: RankedResult[]

// Pre-filter (optimization)
const filtered = searchRanker.prefilterResults(items, query, threshold?);
// threshold: number (0-1, default 0.3)
// Returns: SearchableItem[]

// Fuzzy match (typo tolerance)
const hasMatch = searchRanker.fuzzyMatch('pottery', 'potry');
// Returns: boolean
```

**SearchableItem Interface:**

```typescript
interface SearchableItem {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  category?: string;
  usageCount?: number;
  lastUsed?: number;
  isFavorite?: boolean;
}

interface RankedResult {
  item: SearchableItem;
  score: number; // 0-100
  matchReason: string; // Human readable
}
```

---

### Command Palette UI (`command-palette-ui.ts`)

```typescript
import { CommandPaletteUI } from '@/sidepanel/command-palette-ui';

// Create and initialize
const ui = new CommandPaletteUI({
  onSelect: (commandId) => console.log('Selected:', commandId),
  onClose: () => console.log('Closed'),
  maxVisibleItems: 12,
});
ui.initialize();

// Control
ui.open();
ui.close();
ui.toggle();

// Check state
const isOpen = ui.getIsOpen(); // boolean

// Listen for events
window.addEventListener('promptium:command-palette-opened', () => {
  console.log('Palette opened');
});
window.addEventListener('promptium:command-palette-closed', () => {
  console.log('Palette closed');
});
```

---

### Home Screen UI (`home-screen-ui.ts`)

```typescript
import { HomeScreenUI } from '@/sidepanel/home-screen-ui';

// Create and initialize
const ui = new HomeScreenUI();
ui.initialize();

// Refresh
await ui.refresh();

// Listen for events
window.addEventListener('promptium:select-item', (e) => {
  const itemId = e.detail.id;
  console.log('Item selected:', itemId);
});

window.addEventListener('promptium:action', (e) => {
  const action = e.detail.action;
  // action: 'create-prompt' | 'view-templates' | 'view-library' | 'settings'
  console.log('Action:', action);
});
```

---

## Custom Events

### Dispatched by Keyboard Manager

```
promptium:focus-search
promptium:command-palette
promptium:insert-selected
promptium:close-dialog
promptium:navigate-up
promptium:navigate-down
promptium:create-prompt
promptium:create-template
promptium:refine-prompt
promptium:continue-conversation
promptium:export
promptium:toggle-theme
promptium:help
```

### Dispatched by UI Components

```
promptium:command-palette-opened
promptium:command-palette-closed
promptium:select-item (detail: { id: string })
promptium:action (detail: { action: string })
promptium:item-used
promptium:favorites-changed
```

### Custom Events You Should Dispatch

```
promptium:item-used          // When user interacts with item
promptium:favorites-changed  // When favorite status changes
promptium:search-query       // When search query changes
```

---

## CSS Classes & Variables

### Command Palette

```css
.pn-command-palette                    /* Main container */
.pn-command-palette-modal              /* Modal window */
.pn-command-palette-search             /* Search box */
.pn-command-palette-results            /* Results list */
.pn-command-palette-item               /* Item */
.pn-command-palette-item.selected      /* Selected item */
.pn-command-palette-category-header    /* Category */
.pn-command-palette-empty              /* No results */
```

### Home Screen

```css
#pn-home-screen                        /* Main container */
.pn-home-greeting                      /* Welcome section */
.pn-home-quick-search                  /* Search box */
.pn-home-quick-actions                 /* Quick buttons */
.pn-home-grid                          /* Main grid */
.pn-home-section                       /* Section card */
.pn-home-item                          /* Item */
.pn-home-item:hover                    /* Hovered item */
.pn-home-tips-section                  /* Tips section */
```

### Theme Variables

```css
--pn-primary              /* Primary color */
--pn-primary-light        /* Light variant */
--pn-primary-dark         /* Dark variant */
--pn-accent-yellow        /* Accent color */
--pn-bg-primary           /* Primary background */
--pn-bg-secondary         /* Secondary background */
--pn-bg-tertiary          /* Tertiary background */
--pn-bg-hover             /* Hover state */
--pn-text-primary         /* Primary text */
--pn-text-secondary       /* Secondary text */
--pn-text-tertiary        /* Tertiary text */
--pn-border               /* Border color */
--pn-border-light         /* Light border */
```

---

## Storage Keys

### Session Storage

```
promptiumWindowId         /* Window ID (number) */
promptiumWindowTime       /* Last focused time (number) */
```

### Local Storage

```
promptiumRecents          /* Array of recent IDs */
promptiumFavorites        /* Array of favorite IDs */
promptiumUsage            /* Record of usage stats */
```

---

## Common Patterns

### Initialize Everything

```typescript
// On app load
async function initializePromptium() {
  // Managers
  keyboardManager.initialize();
  await windowManager.initialize();

  // Commands
  commandPalette.registerCommands(createBuiltinCommands());
  keyboardManager.registerShortcuts(createBuiltinShortcuts());

  // UI
  const paletteUI = new CommandPaletteUI();
  paletteUI.initialize();

  const homeUI = new HomeScreenUI();
  homeUI.initialize();

  // Event listeners
  window.addEventListener('promptium:item-used', async () => {
    await homeUI.refresh();
  });
}
```

### Handle Item Selection

```typescript
async function selectItem(id, type, title) {
  // Record usage
  await recentsAndFavorites.recordUsage(id, type, title);

  // Refresh UI
  window.dispatchEvent(new CustomEvent('promptium:item-used'));

  // Show item
  displayItem(id);
}
```

### Implement Search

```typescript
async function search(query) {
  // Get items from storage
  const items = await getPrompts();

  // Rank them
  const ranked = searchRanker.rankResults(items, query);

  // Display
  displayResults(ranked);
}
```

### Toggle Favorite

```typescript
async function toggleFavorite(id, title) {
  const isFav = await recentsAndFavorites.toggleFavorite(id, 'prompt', title);

  // Update UI
  updateFavoriteIcon(id, isFav);

  // Refresh home screen
  window.dispatchEvent(new CustomEvent('promptium:favorites-changed'));
}
```

---

## Performance Tips

1. **Pre-filter before ranking** - Use `prefilterResults()` for large datasets
2. **Debounce search input** - Limit ranking frequency to 100-200ms
3. **Lazy load home screen** - Load favorites/recents on demand
4. **Cache command list** - Update only when commands change
5. **Throttle window updates** - Batch position/size changes

---

## Debugging

### Enable Debug Logs

```typescript
// Override console
(window as any).DEBUG_PROMPTIUM = true;

// Watch storage changes
chrome.storage.local.onChanged.addListener((changes) => {
  console.log('Storage changed:', changes);
});
```

### Inspect State

```typescript
// Check window manager
console.log('Window ID:', windowManager.getWindowId());
console.log('Is open:', await windowManager.isWindowOpen());

// Check recent items
const recents = await recentsAndFavorites.getRecents();
console.log('Recents:', recents);

// Check commands
const commands = commandPalette.getAllCommands();
console.log('Commands:', commands);
```

### Monitor Events

```typescript
document.addEventListener(
  'promptium:*',
  (e) => {
    console.log('Promptium event:', e.type, e.detail);
  },
  true
);
```

---

**API Reference v1.0**  
Last Updated: 2026-06-17
