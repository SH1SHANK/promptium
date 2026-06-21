# Phase 3: Floating Window Implementation Checklist

## ✅ Complete - Core Infrastructure

### Window Management System

- [x] `src/utils/window-manager.ts` - Robust window lifecycle
  - Single window instance enforcement
  - Automatic restoration on browser restart
  - Optimal window placement
  - Listener-based cleanup
- [x] Integrated into `src/entrypoints/background.ts`
  - Extension icon click → `windowManager.openWindow()`
  - Command handler → `windowManager.openWindow()`
  - Context menu save → `windowManager.openWindow()`
  - Startup → `windowManager.initialize()`

### Command Palette System

- [x] `src/utils/command-palette.ts` - Command registry
  - Register and search commands
  - Execute commands with context
  - Built-in commands included:
    - Search: prompts, templates, bookmarks
    - Actions: create, refine, continue, export
    - Navigation: library, templates, favorites, bookmarks, settings
    - Settings: toggle theme, help
- [x] `src/sidepanel/command-palette-ui.ts` - UI Component
  - Real-time search/filter
  - Keyboard navigation (↑↓)
  - Keyboard shortcuts display
  - Category grouping
  - Dark theme support
- [x] `src/sidepanel/command-palette.css` - Styling

### Keyboard Shortcuts System

- [x] `src/utils/keyboard-shortcuts.ts` - Global shortcuts
  - `/` - Focus search
  - `Cmd/Ctrl+K` - Command palette
  - `Cmd/Ctrl+Enter` - Insert selected
  - `Escape` - Close dialog
  - `↑/↓` - Navigate lists
  - `Cmd/Ctrl+N` - Create prompt
  - `Cmd/Ctrl+Shift+C` - Continue conversation
  - `Cmd/Ctrl+E` - Export
  - `Cmd/Ctrl+,` - Settings
  - `Cmd/Ctrl+Shift+T` - Toggle theme
  - `?` - Help
  - Built-in support for both Mac and non-Mac modifiers

### Recents & Favorites System

- [x] `src/utils/recents-favorites.ts` - Local tracking
  - Record usage (lastUsed, usageCount)
  - Toggle favorites
  - Get recents, most used, favorites
  - Usage statistics
  - All local storage, no cloud

### Search Ranking System

- [x] `src/utils/search-ranker.ts` - Intelligent ranking
  - Title match (40 points) - exact > starts-with > contains
  - Tag match (20 points)
  - Category match (10 points)
  - Description match (15 points)
  - Usage frequency (10 points) - logarithmic
  - Favorite status (5 points) - bonus
  - Recent usage (3 points) - time decay
  - Pre-filter optimization
  - Fuzzy matching for typo tolerance

### Home Screen Component

- [x] `src/sidepanel/home-screen-ui.ts` - Home screen UI
  - Greeting and quick search
  - Quick action buttons
  - Favorites section
  - Recently used section
  - Most used section
  - Keyboard shortcuts tips
  - Responsive grid layout
- [x] `src/sidepanel/home-screen.css` - Styling
  - Modern card-based design
  - Dark theme support
  - Mobile responsive
  - Smooth animations

### Documentation

- [x] `PHASE_3_IMPLEMENTATION.md` - Developer guide
  - Architecture overview
  - Module documentation
  - Usage examples
  - Integration flows
  - Storage structure
  - Browser compatibility

## 📋 Integration Steps

### Step 1: Import Utilities in App Init

```typescript
// src/entrypoints/app/index.ts
import { windowManager } from '../../utils/window-manager';
import { commandPalette, createBuiltinCommands } from '../../utils/command-palette';
import { keyboardManager, createBuiltinShortcuts } from '../../utils/keyboard-shortcuts';
import { recentsAndFavorites } from '../../utils/recents-favorites';
import { searchRanker } from '../../utils/search-ranker';
```

### Step 2: Initialize on Page Load

```typescript
// In app initialization
async function initializePromptium() {
  // Initialize keyboard manager
  keyboardManager.initialize();
  keyboardManager.registerShortcuts(createBuiltinShortcuts());

  // Register built-in commands
  commandPalette.registerCommands(createBuiltinCommands());

  // Initialize UI components
  const commandPaletteUI = new CommandPaletteUI();
  commandPaletteUI.initialize();

  const homeScreenUI = new HomeScreenUI();
  homeScreenUI.initialize();

  // Update home screen when recents/favorites change
  window.addEventListener('promptium:item-used', async () => {
    await homeScreenUI.refresh();
  });
}
```

### Step 3: Add HTML Elements to App

```html
<!-- In src/entrypoints/app/index.html -->
<div id="pn-home-screen"></div>
<div id="pn-command-palette"></div>
```

### Step 4: Import CSS Files

```typescript
// In src/entrypoints/app/index.ts
import '../../sidepanel/command-palette.css';
import '../../sidepanel/home-screen.css';
```

### Step 5: Track Item Usage

```typescript
// When user selects/uses a prompt
async function usePrompt(promptId: string, title: string) {
  await recentsAndFavorites.recordUsage(promptId, 'prompt', title);
  window.dispatchEvent(new CustomEvent('promptium:item-used'));
}

// When user toggles favorite
async function toggleFavorite(promptId: string) {
  const isFav = await recentsAndFavorites.toggleFavorite(promptId, 'prompt', title);
  window.dispatchEvent(new CustomEvent('promptium:favorites-changed'));
}
```

### Step 6: Handle Custom Events

```typescript
// Listen for prompt search
window.addEventListener('promptium:focus-search', () => {
  // Focus search input and select all
  const searchInput = document.querySelector('input[type="search"]');
  if (searchInput) {
    searchInput.focus();
    (searchInput as HTMLInputElement).select();
  }
});

// Listen for create prompt
window.addEventListener('promptium:create-prompt', () => {
  // Open create prompt modal
  showCreatePromptModal();
});

// Listen for item selection from home screen
window.addEventListener('promptium:select-item', (e: any) => {
  const itemId = e.detail?.id;
  // Show/select the item
  selectPrompt(itemId);
});
```

### Step 7: Implement Search Integration

```typescript
// When user searches
function performSearch(query: string) {
  const allPrompts = getPromptsFromStorage();
  const filtered = searchRanker.prefilterResults(allPrompts, query);
  const ranked = searchRanker.rankResults(filtered, query);

  // Display results with match reasons
  displaySearchResults(ranked);
}
```

## 🧪 Testing Checklist

### Window Management

- [ ] Click extension icon opens window
- [ ] Click again focuses existing window
- [ ] Window closes properly
- [ ] Window reopens after closing
- [ ] Window position is optimal
- [ ] Window survives browser restart

### Command Palette

- [ ] Opens with `Cmd/Ctrl+K`
- [ ] Search filters correctly
- [ ] Arrow keys navigate
- [ ] Enter selects command
- [ ] Escape closes palette
- [ ] Commands execute properly

### Keyboard Shortcuts

- [ ] `/` focuses search
- [ ] `Cmd/Ctrl+K` opens palette
- [ ] `Escape` closes dialogs
- [ ] Arrow keys work in lists
- [ ] `Cmd/Ctrl+N` creates prompt
- [ ] All shortcuts work in app

### Recents & Favorites

- [ ] Usage is recorded
- [ ] Favorites toggle works
- [ ] Recents display in home
- [ ] Most used displays correctly
- [ ] Data persists after restart

### Search Ranking

- [ ] Exact matches rank highest
- [ ] Favorite items ranked higher
- [ ] Recent items ranked higher
- [ ] Tag matches rank correctly
- [ ] Fuzzy matching works

### Home Screen

- [ ] Displays on first load
- [ ] Shows favorites section
- [ ] Shows recents section
- [ ] Shows most used section
- [ ] Quick actions work
- [ ] Responsive on mobile

### Dark Theme

- [ ] All components respect theme
- [ ] Palette displays correctly
- [ ] Home screen readable
- [ ] Shortcuts visible

## 🔧 Troubleshooting

### Window doesn't open

- Check manifest has `windows` permission
- Verify `chrome.windows` API is available
- Check console for errors
- Ensure `windowManager.initialize()` is called

### Command palette not appearing

- Verify `CommandPaletteUI` is initialized
- Check CSS imports
- Verify `Cmd/Ctrl+K` handler is registered
- Check console for JS errors

### Shortcuts not working

- Verify `keyboardManager.initialize()` is called
- Check shortcuts are registered
- Ensure handlers dispatch events correctly
- Test in non-input field context

### Recents not showing

- Check storage permission in manifest
- Verify `recordUsage()` is called
- Check `chrome.storage.local` data
- Ensure `recentsAndFavorites.getRecents()` is awaited

### Search not ranking correctly

- Check `searchRanker.prefilterResults()` works
- Verify scoring calculation
- Test with different query types
- Debug score values in console

## 📊 Performance Targets

- Window open time: < 500ms
- Command palette search: < 50ms
- Home screen load: < 200ms
- Search ranking: < 100ms (1000 items)
- Memory usage: < 5MB

## 🌍 Browser Compatibility

| Browser | Support | Notes                 |
| ------- | ------- | --------------------- |
| Chrome  | ✅ Full | All features          |
| Edge    | ✅ Full | All features          |
| Arc     | ✅ Full | All features          |
| Zen     | ✅ Full | All features          |
| Vivaldi | ✅ Full | All features          |
| Opera   | ✅ Full | All features          |
| Firefox | ❌ No   | No chrome.windows API |
| Safari  | ❌ No   | Limited extension API |

## 🚀 Future Enhancements

- [ ] Resizable window with persistence
- [ ] Custom keyboard shortcut editor
- [ ] Local analytics dashboard
- [ ] Plugin/extension system
- [ ] Collaborative features
- [ ] Mobile companion app
- [ ] API for third-party tools

## 📖 Quick Reference

### Custom Events

```typescript
// All custom events dispatched
'promptium:focus-search';
'promptium:command-palette';
'promptium:command-palette-opened';
'promptium:command-palette-closed';
'promptium:insert-selected';
'promptium:close-dialog';
'promptium:navigate-up';
'promptium:navigate-down';
'promptium:create-prompt';
'promptium:create-template';
'promptium:refine-prompt';
'promptium:continue-conversation';
'promptium:export';
'promptium:toggle-theme';
'promptium:help';
'promptium:item-used';
'promptium:select-item';
'promptium:action';
'promptium:favorites-changed';
```

### Storage Keys

```typescript
// Window state (session)
'promptiumWindowId';
'promptiumWindowTime';

// Usage data (local)
'promptiumRecents'; // Array of recent IDs
'promptiumFavorites'; // Array of favorite IDs
'promptiumUsage'; // Record<id, UsageRecord>
```

### CSS Variables

```css
/* Colors */
--pn-primary: #0066ff --pn-primary-light: #e8f1ff --pn-primary-dark: #0052cc
  --pn-accent-yellow: #ffc107 /* Backgrounds */ --pn-bg-primary: #ffffff --pn-bg-secondary: #fafafa
  --pn-bg-tertiary: #f0f0f0 --pn-bg-hover: #f0f0f0 /* Text */ --pn-text-primary: #1a1a1a
  --pn-text-secondary: #666666 --pn-text-tertiary: #999999 /* Borders */ --pn-border: #e5e5e5
  --pn-border-light: #d0d0d0;
```
