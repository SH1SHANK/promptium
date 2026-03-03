# Promptium

Promptium is a Manifest V3 Chrome extension for prompt management and conversation workflows across modern LLM web apps.

It provides a reusable prompt library, fill-in templates, cross-LLM continuation, semantic search, bookmarks, and rich export formats from one workspace.

## Supported Platforms

- ChatGPT (`chatgpt.com`)
- Claude (`claude.ai`)
- Gemini (`gemini.google.com`)
- Perplexity (`www.perplexity.ai`)
- Copilot (`copilot.microsoft.com`)

## Core Features

### Template syntax (new)

- Required blank: `[label]`
- Optional blank: `[label?]`
- Legacy curly placeholders are auto-normalized in UI flows
- Template cards show a `Fill-in` badge and support:
  - `Use →` (opens fill form)
  - `Inject as-is` (keeps required blanks, removes optional blanks)

### Prompts UX overhaul

- Two-mode add flow in Sidepanel and Popup:
  - `Plain Prompt`
  - `Fill-in Template`
- Friendly variable toolbar inserts `[label]` / `[label?]`
- Live detected-blank strip while typing templates
- Curated quick category filter chips in Sidepanel Prompts tab

### Bridge, bookmarks, and export

- Cross-LLM `Continue on` from Prompts + Export tabs
- Conversation bookmarks with click and `Alt+Shift+B`
- Smart filename generation from conversation content
- Export formats: Markdown, TXT, JSON, PDF, Notion, Obsidian

## Install and Setup

```bash
git clone <https://github.com/sh1shank/promptium>
cd Promptium
pnpm install
pnpm build:sidepanel-css
```

Load unpacked extension in `chrome://extensions`.

## Usage

### Use a template

1. Open `Prompts`
2. Click `Use →` on a template
3. Fill required blanks
4. Inject

### Inject template as-is

1. Click `Inject as-is`
2. Prompt is injected immediately
3. Fill remaining `[brackets]` directly in chat

### Add a prompt

1. Click `Add Prompt`
2. Choose `Plain Prompt` or `Fill-in Template`
3. Save

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

Notes:

- Data remains local to extension storage
- Semantic retrieval runs locally
- AI improvement uses user-provided Gemini API key

## Development Notes

Key files:

- `manifest.json`
- `utils/template-parser.js`
- `utils/templates.js`
- `sidepanel/prompts-ui.js`
- `sidepanel/template-fill.js`
- `sidepanel/prompt-form.js`
- `popup/popup.js`

Validation checks:

```bash
node --check utils/template-parser.js
node --check sidepanel/template-fill.js
node --check sidepanel/prompts-ui.js
node --check sidepanel/prompt-form.js
node --check popup/popup.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"
```

## Project Docs

- [FEATURES.md](FEATURES.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [MODELS.md](MODELS.md)
