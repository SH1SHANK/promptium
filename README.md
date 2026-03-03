# Promptium

Promptium is a Manifest V3 Chrome extension for prompt management and conversation workflows across modern LLM web apps.

It provides a reusable prompt library, template variables, cross-LLM context bridging, semantic search, prompt improvement, conversation bookmarks, and rich export formats from one workspace.

## Table of Contents

- [Overview](#overview)
- [Supported Platforms](#supported-platforms)
- [What You Can Do](#what-you-can-do)
- [Onboarding Flow](#onboarding-flow)
- [Install and Setup](#install-and-setup)
- [Usage Guide](#usage-guide)
- [Storage and Privacy](#storage-and-privacy)
- [Development Notes](#development-notes)
- [Troubleshooting](#troubleshooting)
- [Project Docs](#project-docs)

## Overview

Promptium ships with three surfaces:

- Popup: quick prompt/history access
- Side panel: full workspace (`prompts`, `history`, `export`, `tags`, `settings`)
- Content tools on supported pages: toolbar/FAB actions, selection controls, injection hooks, bookmark controls

Key goals:

- Keep core workflows local-first
- Preserve compatibility across supported LLM pages
- Degrade safely on unsupported pages without runtime breakage

## Supported Platforms

- ChatGPT (`chatgpt.com`)
- Claude (`claude.ai`)
- Gemini (`gemini.google.com`)
- Perplexity (`www.perplexity.ai`)
- Copilot (`copilot.microsoft.com`)

## What You Can Do

### Prompt templates with variables

- Use `{{name}}` for required variables
- Use `{{name?}}` for optional variables
- Prompts with variables show a `{{}}` badge in the library
- Inject opens a fill form with live preview before final injection

### Cross-LLM context bridge

- Continue conversation context on a different platform in one click
- Available from Prompts and Export tabs
- Uses `pendingBridge` staging in storage with TTL protection
- Migrates legacy `pendingContext` to `pendingBridge` automatically
- Shows explicit expiry feedback: `Bridge expired. Open source tab and try again.`

### Conversation bookmarks

- Bookmark assistant responses with click-to-toggle star
- Keyboard shortcut: `Alt+Shift+B` bookmarks/unbookmarks the latest assistant response
- Bookmark identity validated by URL key + index + preview hash to prevent false matches
- Bookmarked content is marked with `⭐` in preview and exports

### Smart export naming

Filename source priority:

1. First user message in selected export payload
2. First user message in fallback/full payload
3. `platform-yyyy-mm-dd`

Manual filename input (Export tab) always overrides generated names.

### Export formats

- Markdown (`.md`)
- Text (`.txt`)
- JSON (`.json`)
- PDF (`.pdf`)
- Notion Markdown (`.md`)
- Obsidian Markdown (`.md`, with YAML frontmatter and callouts)

Export controls include:

- Structured vs combined content mode
- Include/exclude date and platform labels
- Font family, size, and background theme
- Copy-to-clipboard flow and format-aware preview

### Semantic search and improvement

- Local embeddings via Transformers.js for semantic retrieval
- Gemini-backed prompt improvement with style presets
- Falls back to deterministic keyword behavior when AI features are unavailable

## Onboarding Flow

Promptium onboarding highlights:

- Prompt library and template workflow
- Semantic search and prompt improvement
- Export + bookmark workflow
- Cross-LLM continuation concept
- Local-first data model

Onboarding completion flag:

- `onboardingComplete` in `chrome.storage.local`

## Install and Setup

### 1. Clone and install

```bash
git clone <https://github.com/sh1shank/promptium>
cd Promptium
pnpm install
```

### 2. Build sidepanel styles

```bash
pnpm build:sidepanel-css
```

Watch mode during development:

```bash
pnpm watch:sidepanel-css
```

### 3. Load unpacked extension

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the `Promptium` project folder

## Usage Guide

### Prompt injection

1. Open a supported LLM tab
2. Open side panel `Prompts`
3. Click `Use Prompt`
4. If variables exist, fill required fields and inject

### Bridge flow

1. On a supported conversation page, open side panel
2. Use `Continue on` button strip in Prompts or Export tab
3. Select target platform
4. Promptium stages context and opens target tab
5. Target page hydrates staged bridge and injects context

### Bookmark flow

1. Hover assistant response to reveal bookmark icon
2. Click `☆` to bookmark (`⭐`)
3. Or press `Alt+Shift+B` to toggle latest assistant response
4. Export to see bookmarked markers

### Export flow

1. Select messages on source page
2. Open Export tab and verify preview
3. Pick format and options
4. Export or copy

## Storage and Privacy

Persistent (`chrome.storage.local`):

- `prompts`
- `chatHistory`
- `promptiumSettings`
- `promptiumGeminiKey`
- `promptiumImprovePayload`
- `bookmarks`
- `pendingBridge`

Session (`chrome.storage.session`):

- `promptiumSidePanelPayload`

Privacy notes:

- Prompt and history data remains local to extension storage
- Semantic embeddings are generated locally
- Gemini API is used only for improvement/generative flows
- Bridge context is short-lived and TTL-expired

## Development Notes

### Main entry files

- `manifest.json`
- `background/service_worker.js`
- `content/content.js`
- `popup/popup.html`
- `sidepanel/sidepanel.html`

### Sidepanel modules

- `sidepanel/app-shell-init.js`
- `sidepanel/prompts-ui.js`
- `sidepanel/template-fill.js`
- `sidepanel/export-payload-ui.js`
- `sidepanel/export-actions-ui.js`
- `sidepanel/history-ui.js`
- `sidepanel/tags-ui.js`
- `sidepanel/settings-ai-ui.js`
- `sidepanel/improve-ui.js`
- `sidepanel/prompt-form.js`
- `sidepanel/state.js`

### Shared utility modules

- `utils/bridge.js`
- `utils/smart-name.js`
- `utils/exporter.js`
- `utils/export-preview-renderer.js`
- `utils/session-storage.js`
- `utils/storage.js`
- `utils/platform.js`
- `utils/ai-bridge.js`
- `utils/templates.js`

## Troubleshooting

### No bridge injection on target

- Check toast for expiry feedback
- Re-run bridge from source tab if expired
- Ensure target platform matches selected destination

### Export has no messages

- Re-select messages on source page
- Re-open Export tab and load latest selection

### Prompt improvement fails

- Verify Gemini key in Settings
- Check network status
- Retry from side panel

### Template inject blocked

- Fill all required `{{name}}` fields
- Optional `{{name?}}` can remain empty

## Project Docs

- [FEATURES.md](FEATURES.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [MODELS.md](MODELS.md)
