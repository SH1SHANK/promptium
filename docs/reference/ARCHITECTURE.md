# Architecture

## Extension Contexts

Promptium is a Manifest V3 extension structured across multiple execution contexts.

### Service Worker

**File:** `background/service_worker.js`

**Role:** Extension initialization and global request router.

**Responsibilities:**

- Initialize storage layout on install/upgrade
- Configure side panel behavior and opening mechanism
- Route AI requests through provider fallback chain
- Manage embedding lifecycle (model loading, indexing, caching)
- Listen for content script messages and route to appropriate handler
- Maintain AI state (embedding cache, search mode)

**Constraints:**

- Cannot access page DOM
- No persistent global state (restarted frequently)
- State must be serialized to `chrome.storage` or passed via messages

### Side Panel

**Files:** `sidepanel/sidepanel.html`, `sidepanel/*.js`

**Role:** Primary UI workspace for prompt management and export.

**Responsibilities:**

- Render prompt library, search, tags
- Handle prompt CRUD operations
- Manage chat export workflow and message selection
- Display and manage conversation bookmarks
- Configure AI providers and settings
- Coordinate with service worker and content scripts via messages

**Constraints:**

- Limited to side panel viewport (typically 450px width)
- Runs in its own isolated context
- Cannot directly access page DOM

**State Management:**

- `sidepanel/state.js` provides shared constants and mutable state object
- Settings loaded from `chrome.storage.local` on init
- Real-time listeners for storage changes

### Content Scripts

**Purpose:** Inject UI and read conversation data from LLM chat pages.

**Files:**

- `content/content.js` — Export message selection UI
- `content/toolbar.js` — Floating action button and save modal
- `content/bookmarks.js` — Per-conversation bookmarks
- `content/scraper.js` — Message extraction
- `content/injector.js` — Prompt injection into chat input

**Responsibilities:**

- Detect supported LLM platform via URL and DOM
- Extract user and assistant messages from page DOM
- Inject prompts and templates into chat input
- Activate message selection UI for export
- Render floating action button with quick actions
- Manage per-conversation bookmarks
- Communicate with service worker and side panel

**Constraints:**

- Runs in page context but isolated from page scripts
- Cannot access `chrome` API directly on some operations
- Must communicate via `chrome.runtime.sendMessage`

**Platform Detection:**
Uses CSS selectors defined in `utils/platform.js`. Selectors are platform-specific fallbacks for:

- User message containers
- Assistant message containers
- Chat input field
- Input parent for focus management

Each platform has multiple selector options for resilience against page structure changes.

### Popup

**Files:** `popup/popup.html`, `popup/popup.js`, `popup/onboarding.js`

**Role:** Initial UI launched when extension icon is clicked.

**Responsibilities:**

- Display onboarding flow on first launch
- Quick access to side panel
- Show AI provider status

**Constraints:**

- Temporary UI, closed when user navigates away
- Cannot maintain state between sessions without storage

## File Structure

```
manifest.json                   Extension metadata, permissions, content scripts

background/
  service_worker.js             Service worker initialization and message routing

content/
  content.js                    Export selection UI and main content script
  toolbar.js                    FAB and save modal
  bookmarks.js                  Per-conversation bookmarks
  scraper.js                    Message extraction from DOM
  fab.css, toolbar.css          Content script styling

sidepanel/
  sidepanel.html                Side panel layout
  app-shell-init.js             Bootstrap, tab routing, event listeners
  state.js                      Shared constants and mutable state
  prompts-ui.js                 Prompt library, search, rendering
  history-ui.js                 Chat history display
  tags-ui.js                    Tag management UI
  prompt-form.js                Prompt creation/editing form
  template-fill.js              Template variable fill form
  improve-ui.js                 Prompt improvement interface
  export-payload-ui.js          Export message selection UI
  export-actions-ui.js          Export execution and format handling
  continuation-ui.js            Cross-LLM conversation continuation
  settings-ui.js                General settings
  settings-ai-ui.js             AI provider configuration
  settings-overhaul.css         Settings styling
  tailwind.css (generated)      Tailwind-compiled styles

popup/
  popup.html                    Popup layout
  popup.js                      Popup logic
  popup.css                     Popup styling
  onboarding.js                 Onboarding carousel with animations

utils/
  constants.js                  Platform slugs, message types
  dom-helpers.js                DOM query utilities (byId, q, qa)
  tags.js                       Tag parsing and management
  platform.js                   Platform detection and CSS selectors
  storage.js                    Prompt and history CRUD
  session-storage.js            Session-only data operations
  template-parser.js            Template variable parsing
  smart-name.js                 Auto-generate export filenames
  exporter.js                   Export formatters (Markdown, JSON, PDF, etc)
  ai.js                         Generic AI utilities
  ai-bridge.js                  Message bridge to AI service worker
  ai-router.js                  Provider fallback routing
  provider-client.js            API calls to providers
  model-registry.js             Provider and model registry
  continuation.js               Conversation continuation logic
  bridge.js                     Cross-platform context transfer
  pn-dialog.js                  Dialog component utilities
  prompt-duplicate.js           Duplicate detection
  export-preview-renderer.js    Export preview canvas rendering

libs/
  jspdf.min.js                  PDF export library

models/
  (Downloaded on demand)         Transformers.js embedding models
```

## Message Passing

Communication between contexts via `chrome.runtime.sendMessage`.

| Action                   | Source                 | Destination               | Payload                                    | Response                 |
| ------------------------ | ---------------------- | ------------------------- | ------------------------------------------ | ------------------------ |
| `openSidePanel`          | Content (FAB)          | Service Worker            | —                                          | `{ ok: boolean }`        |
| `openSidePanelAll`       | Content (selection UI) | Service Worker            | —                                          | `{ ok: boolean }`        |
| `SET_SIDEPANEL_PAYLOAD`  | Content (scraper)      | Service Worker            | `{ messages, platform, title, createdAt }` | `{ ok: boolean }`        |
| `APPLY_IMPROVED_PROMPT`  | Sidebar (improve UI)   | Content (toolbar)         | `{ text, sourceTabId }`                    | `{ ok: boolean }`        |
| `showExport`             | Service Worker         | Sidebar                   | —                                          | —                        |
| `showContinuation`       | Service Worker         | Sidebar                   | —                                          | —                        |
| `scrapeForBridge`        | Sidebar (continuation) | Content (scraper)         | —                                          | `{ messages, platform }` |
| `getPlatform`            | Sidebar (continuation) | Content (platform detect) | —                                          | `{ platform: string }`   |
| `AI_IMPROVE_PROMPT`      | Sidebar                | Service Worker            | `{ text, tags }`                           | `{ ok, result }`         |
| `AI_PREPARE_PROMPT_SAVE` | Utils (storage)        | Service Worker            | `{ title, text, tags }`                    | `{ ok, prompt }`         |

## AI Pipeline

Request flow from user action to provider response.

**Polish or Improve Request:**

1. User clicks Polish/Improve in side panel
2. Side panel sends `AI_IMPROVE_PROMPT` to service worker
3. Service worker:
   - Checks active provider for API key
   - If missing, attempts fallback chain (Gemini → OpenAI → Anthropic → OpenRouter)
   - Constructs prompt for AI provider
   - Calls `callProvider(providerId, model, systemPrompt, userMessage)`
4. Provider client sends HTTP request to provider's API
5. Response returned to side panel
6. Side panel renders result for user

**Provider Fallback Chain:**

```
activeProvider (if enabled and key exists)
  ↓ (fails or key missing)
Gemini
  ↓ (fails or key missing)
OpenAI
  ↓ (fails or key missing)
Anthropic
  ↓ (fails or key missing)
OpenRouter
  ↓ (fails)
"no_provider_available"
```

**Error Handling:**

- Network error → try next provider
- Invalid API key → try next provider
- Provider not configured → skip and try next
- All failed → show error to user

## Embedding Pipeline

Semantic search via local embedding model.

**Indexing:**

1. User navigates to Prompts tab or performs semantic search first time
2. Service worker loads embedding model (Transformers.js)
3. For each prompt without embedding:
   - Extract prompt title + text + tags
   - Generate embedding vector via model
   - Save in prompt `embedding` field
4. Model cached in memory for subsequent operations

**Search Query:**

1. User types in search box
2. Debounced (170ms) search handler fires
3. Search text converted to embedding vector via model
4. Cosine similarity computed between query vector and each prompt vector
5. Results ranked by similarity
6. Keyword search results merged and sorted

**Model Selection:**
User can switch embedding model in Settings. Triggers reindex:

1. Download new model (if not cached)
2. Clear all existing embeddings
3. Reindex all prompts with new model
4. Update `promptiumEmbeddingMeta.activeModelId`

**Performance:**

- Model loaded once per session
- Embeddings cached in memory during side panel use
- Vectors stored in `prompts[].embedding` persisted to storage

## Platform Support

### Selector Resolution Strategy

For each LLM platform, `utils/platform.js` defines CSS selectors for:

- User message containers
- Assistant message containers
- Chat input field
- Input parent (for focusing)

**Multiple selectors per type:** Separated by commas, `querySelector` picks first match. Examples:

```javascript
chatgpt: {
  input: '#prompt-textarea, div[contenteditable="true"][data-id], div[contenteditable="true"].ProseMirror';
}
```

Selector order reflects platform evolution (old selectors first, current selectors last).

### Platform Detection

On each content script page:

1. Get `window.location.hostname` and pathname
2. Match against known platforms in `SELECTORS`
3. Check custom platforms from `settings.customPlatforms`
4. Check if platform is enabled in `settings.enabledPlatforms`
5. Return detected platform key or `null`

### Injection Strategies

**Standard input:** Focus and simulate user paste → `input.value = text; input.dispatchEvent(...)`

**Content-editable:** Set `innerHTML` or text content, trigger change events

**Platform-specific:** Some platforms use custom React/Vue input handlers, require special mutation triggers

**Fallback:** If detection fails, no FAB/injection attempted, error logged silently

## State Management

### Persistent State (chrome.storage.local)

- Prompts and their embeddings
- Chat history
- User settings
- Bookmarks

Synced across all contexts via `chrome.storage.onChanged` listener.

**Storage listeners:**

```javascript
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.promptiumSettings) {
      // Re-render UI with new settings
    }
    if (changes.prompts) {
      // Refresh prompt list
    }
    if (changes.bookmarks) {
      // Refresh bookmarks UI
    }
  }
});
```

### Session State (chrome.storage.session)

API keys (never written to local storage). Lost on browser restart.

### Runtime Memory

Side panel and service worker maintain in-memory state:

- Current active tab
- Export payload staging
- AI model and embedding cache
- Search results

Not persisted. Lost on context unload.

## Security Considerations

**API Keys:**

- Stored in `chrome.storage.session` only
- Never logged or transmitted except to provider API
- Cleared on browser close

**User Data:**

- Prompts stored locally in `chrome.storage.local`
- No server backend or telemetry
- Each browser profile has its own isolated storage

**Content Security Policy:**

- Extension pages CSP: `script-src 'self' 'wasm-unsafe-eval'` (wasm for Transformers.js)
- No remote fonts or stylesheets loaded
- No inline scripts in HTML

**Permissions:**

- `activeTab` — used only to detect LLM platform, not to spy on arbitrary pages
- `scripting` — inject UI and dispatch events only on LLM pages
- Host permissions — specify exact domain patterns for supported platforms\n
