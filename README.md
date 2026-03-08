# Promptium

A Chrome extension for prompt management, semantic search, template variables, AI-assisted optimization, cross-LLM continuation, and conversation export. Operates entirely locally with no server backend.

## Documentation

- [docs/README.md](./docs/README.md) - documentation index and folder map
- [docs/guides/SETUP.md](./docs/guides/SETUP.md) - detailed setup, loading, validation, and troubleshooting guide
- [docs/reference/LOCALMODELS.md](./docs/reference/LOCALMODELS.md) - local embedding models, semantic search runtime, and fallback behavior
- [docs/reference/AI_PROVIDERS.md](./docs/reference/AI_PROVIDERS.md) - provider configuration, supported models, key handling, and request routing
- [CONTRIBUTING.md](./CONTRIBUTING.md) - contribution workflow and validation expectations
- [SECURITY.md](./SECURITY.md) - vulnerability reporting and security boundaries
- [docs/project/CHANGELOG.md](./docs/project/CHANGELOG.md) - release and change history

## Overview

Promptium provides a unified interface for managing and deploying prompts across supported AI platforms (ChatGPT, Claude, Gemini, and 27 others). Features include a searchable prompt library, fill-in templates with optional variables, conversation bookmarks, multi-format export, and the ability to continue conversations across different LLM platforms.

All data is stored locally in the browser. API keys for AI providers are kept in session storage only and are never persisted to disk.

## Features

**Prompt Library** — Save and organize prompts with tags. Search by keyword or semantic meaning.

**Fill-In Templates** — Define prompts with `[variable]` for required fields and `[variable?]` for optional fields. When injected, templates open a form to fill in each variable.

**Ai-Assisted Features** — Polish prompts for clarity, auto-generate tags, improve prompts for quality, and summarize conversations.

**Conversation Bookmarks** — Mark important messages in a chat conversation. Per-conversation, persisted by URL with message validation.

**Chat Export** — Select and export messages to Markdown, Plain Text, JSON, PDF, PNG, JPEG, Notion, or Obsidian format. Export includes bookmarked messages and optional metadata.

**Cross-LLM Continuation** — Copy a conversation from one platform and continue it on another. Submits a summary to the target platform's chat input.

**Floating Action Button** — Quick access menu injected into supported LLM pages. Configurable position (bottom-left, bottom-right) and style (circle, pill, icon-only). Toggle individual actions on/off.

**Semantic Search** — Search the prompt library by meaning using local embedding model (Transformers.js).

## Supported Platforms

| Platform     | Site                                                      |
| ------------ | --------------------------------------------------------- |
| ChatGPT      | chatgpt.com                                               |
| Claude       | claude.ai                                                 |
| Gemini       | gemini.google.com                                         |
| Copilot      | copilot.microsoft.com                                     |
| Perplexity   | perplexity.ai                                             |
| DeepSeek     | deepseek.com                                              |
| Qwen         | qwen.ai, qwenlm.ai, tongyi.aliyun.com, qianwen.aliyun.com |
| Mistral      | chat.mistral.ai, lechat.mistral.ai                        |
| Kimi         | kimi.moonshot.cn, moonshot.cn, moonshot.ai                |
| Grok         | grok.com, x.com/i/grok, twitter.com/i/grok                |
| HuggingChat  | huggingchat.com, huggingface.co/chat                      |
| Poe          | poe.com                                                   |
| You.com      | you.com                                                   |
| Phind        | phind.com                                                 |
| Character.ai | character.ai                                              |
| Pi           | pi.ai                                                     |
| Meta.ai      | meta.ai                                                   |
| AWS Q        | chat.console.aws.amazon.com                               |
| Ernie        | yiyan.baidu.com, ernie.baidu.com                          |
| DouBao       | doubao.com                                                |
| Yi Chat      | 01.ai                                                     |
| Cohere       | cohere.com                                                |
| Groq         | chat.groq.com                                             |
| Fireworks    | fireworks.ai                                              |
| Together AI  | together.ai                                               |

Custom platforms can be added in Settings with URL patterns and CSS selectors.

## AI Providers

Promptium supports multiple API providers for prompt enhancement, tag generation, and continuation summarization.

| Provider             | Default Model                         | Key Required                   | Models Available                                                          |
| -------------------- | ------------------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| **Gemini** (default) | gemini-2.0-flash                      | Yes                            | gemini-2.0-flash, gemini-2.0-flash-lite, gemini-1.5-pro, gemini-1.5-flash |
| **OpenAI**           | gpt-4o-mini                           | Yes                            | gpt-4o-mini, gpt-4o, gpt-4-turbo                                          |
| **Anthropic**        | claude-haiku-4-5-20251001             | Yes                            | claude-haiku-4-5-20251001, claude-sonnet-4-6                              |
| **OpenRouter**       | meta-llama/llama-3.1-8b-instruct:free | Yes (optional for free models) | Llama 3.1 8B, Mistral 7B, Claude Haiku, Gemini Flash, GPT-4o mini         |

Providers are attempted in order: active provider first, then Gemini, OpenAI, Anthropic, OpenRouter. Falls back to next provider if API key is missing or request fails.

## Keyboard Shortcuts

| Shortcut           | Action                      | Context                 |
| ------------------ | --------------------------- | ----------------------- |
| `Alt+P`            | Open/close side panel       | Any page                |
| `Ctrl+K` / `Cmd+K` | Focus library search        | Side panel, Prompts tab |
| `Escape`           | Close modal or clear search | Side panel              |
| `Alt+Shift+B`      | Quick bookmark last message | Chat page               |

## Installation

### From Source

1. Clone the repository and install dependencies:

```bash
git clone https://github.com/sh1shank/promptium
cd promptium
pnpm install
```

1. Build Tailwind CSS:

```bash
pnpm build:sidepanel-css
```

1. Load in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked** and select the `promptium` directory
   - Pin the extension to the toolbar
   - Use `Alt+P` to open the side panel

## Configuration

Before using AI features, configure at least one API provider:

1. Open the side panel with `Alt+P`
2. Navigate to **Settings**
3. Select an AI provider (Gemini, OpenAI, Anthropic, or OpenRouter)
4. Paste your API key in the input field
5. Save

API keys are verified on save to confirm validity.

## Permissions

| Permission                                     | Reason                                                                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                      | Save and retrieve prompts, settings, chat history, and bookmarks in local storage. API keys stored in session storage only. |
| `activeTab`                                    | Detect which LLM platform is currently active to show platform-specific features.                                           |
| `scripting`                                    | Inject the floating action button and message selection controls into supported LLM pages.                                  |
| `downloads`                                    | Export conversations as downloadable files (PDF, images, etc).                                                              |
| `sidePanel`                                    | Open the side panel workspace via keyboard shortcut or extension icon.                                                      |
| `contextMenus`                                 | Right-click context menu for saving text and importing selections.                                                          |
| `offscreen`                                    | Offscreen documents for background processing of embeddings without blocking the UI.                                        |
| Host permissions (`*://*.chatgpt.com/*`, etc.) | Inject UI and read conversation content on supported LLM platforms to enable bookmarking, scraping, and injection.          |

## Storage

### chrome.storage.local

Persistent data stored in your browser profile. Survives browser restart.

**`prompts`** — Array of saved prompt objects. Each prompt has id (UUID), title, text, tags, isTemplate boolean, createdAt and updatedAt timestamps, and optional embedding vector.

**`chatHistory`** — Array of recent exported conversations, capped at 50 entries. Stored if `autoSaveHistory` is enabled in settings.

**`bookmarks`** — Object mapping conversation URLs to bookmark arrays. Each bookmark includes the message index, text preview, content hash, and timestamp.

**`promptiumSettings`** — User preferences object containing active provider, model choices, feature flags, FAB settings, visible tabs, card density, export defaults, and onboarding state.

**`promptiumEmbeddingMeta`** — Metadata for semantic search index, including active model ID, indexed prompt count, and last indexing timestamp.

**`promptiumEmbeddingReindexState`** — State tracking for embedding index rebuilds.

**`onboardingComplete`** — Boolean flag, `true` after user completes onboarding.

### chrome.storage.session

Cleared when the browser closes. Never synced across devices.

**`promptiumGeminiKey`** — Gemini API key.

**`promptiumOpenAIKey`** — OpenAI API key.

**`promptiumAnthropicKey`** — Anthropic API key.

**`promptiumOpenRouterKey`** — OpenRouter API key.

**`promptiumSidePanelPayload`** — Staged export data for transfer between content scripts and side panel.

**`promptiumImprovePayload`** — Staged prompt improvement data.

**`pendingSnippet`** — Text waiting to be saved as a new prompt.

### Transient (TTL-based)

**`promptiumEmbeddingReindexState`** — Cleared after embedding reindex completes.

## Development

### File Structure

```text
promptium/
  manifest.json              Extension configuration
  package.json               Dependencies

  background/
    service_worker.js        Initializes storage, handles side panel, routes AI requests

  content/
    content.js               Main content script entry, export selection UI
    toolbar.js               Floating action button and save modal
    bookmarks.js             Per-conversation bookmarks
    scraper.js               Message extraction from chat DOM
    fab.css                  FAB styling
    toolbar.css              Toolbar styling

  sidepanel/
    sidepanel.html           Side panel layout
    app-shell-init.js        Bootstrapping, tab routing, event listeners
    state.js                 Shared state and settings constants
    prompts-ui.js            Prompt library and search
    history-ui.js            Chat history display
    tags-ui.js               Tag management
    prompt-form.js           Prompt save and edit form
    template-fill.js         Template variable form
    improve-ui.js            Prompt improvement interface
    export-payload-ui.js     Export message selection
    export-actions-ui.js     Export execution and format handling
    continuation-ui.js       Cross-LLM continuation
    settings-ui.js           General settings
    settings-ai-ui.js        AI provider configuration
    settings-overhaul.css    Settings styling
    tailwind.css             (generated from Tailwind build)

  popup/
    popup.html               Popup interface (when extension icon clicked)
    popup.js                 Popup logic
    popup.css                Popup styling
    onboarding.js            Onboarding flow with animations

  utils/
    constants.js             Platform slugs, message types
    dom-helpers.js           DOM query utilities
    tags.js                  Tag parsing and management
    platform.js              Platform detection and CSS selectors
    storage.js               Prompt and history CRUD operations
    session-storage.js       Session-only data operations
    template-parser.js       Template variable parsing
    smart-name.js            Auto-generate export filenames
    exporter.js              Export formatters (MD, TXT, JSON, PDF, etc)
    ai.js                    Generic AI utilities
    ai-bridge.js             Bridge to AI service worker
    ai-router.js             Provider fallback routing
    provider-client.js       API calls to providers
    model-registry.js        Provider and model registry
    continuation.js          Conversation continuation logic
    bridge.js                Cross-platform context transfer
    pn-dialog.js             Dialog component utilities
    prompt-duplicate.js      Duplicate detection
    export-preview-renderer.js  Export preview rendering

  libs/
    jspdf.min.js             PDF export library
    transformers.min.js      Local embedding model (loaded on demand)

  models/
    (embedding model files, downloaded on first use)
```

### Building

Build Tailwind CSS for the side panel:

```bash
pnpm build:sidepanel-css
```

Watch for changes:

```bash
pnpm watch:sidepanel-css
```

### Debugging

1. Open `chrome://extensions/`
2. Find Promptium and click **Details**
3. Click **Inspect views: service_worker.html** to debug the service worker
4. Right-click anywhere on an LLM chat page and select **Inspect** to debug content scripts and side panel interactions

## License

MIT
