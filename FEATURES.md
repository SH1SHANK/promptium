# Promptium Features

## Prompt Templates

- Template variable grammar:
  - Required: `[label]`
  - Optional: `[label?]`
- Legacy curly placeholders are auto-normalized in render/save/inject flows
- Template cards show a `Fill-in` badge with variable count tooltip
- Template actions:
  - `Use →` opens fill form
  - `Inject as-is` injects immediately with optional blanks removed

## Prompt Creation UX

- Sidepanel and Popup both support a two-mode Add flow:
  - `Plain Prompt`
  - `Fill-in Template`
- Template mode includes:
  - bracket syntax hint
  - variable toolbar
  - live detected-variable strip

## Curated Templates

- 50+ curated templates in `utils/templates.js`
- Canonical categories only:
  - `writing`, `coding`, `study`, `research`, `creative`, `work`, `general`
- Sidepanel quick filter chips apply only to curated templates
- Curated cards keep `Save to My Prompts`

## Injection Flows

- Plain prompt: direct inject
- Template prompt:
  - `Use →` opens fill panel with required-field gating and live preview
  - `Inject as-is` keeps required placeholders and removes optional placeholders

## Bridge and Bookmarks

- Cross-LLM continuation with `pendingBridge`
- Bridge strips in Prompts and Export tabs
- Bookmark toggle via hover icon and `Alt+Shift+B`
- Bookmark export marker propagation (`⭐`) across text-like formats and PDF text path

## Export

Supported formats:

- Markdown (`.md`)
- Text (`.txt`)
- JSON (`.json`)
- PDF (`.pdf`)
- Notion Markdown (`.md`)
- Obsidian Markdown (`.md`)

Other export capabilities:

- Smart filename generation
- Structured vs combined content modes
- Copy-to-clipboard
- Preview rendering via shared preview renderer

## Reliability Rules

- No storage key removals; additive only
- Unsupported pages degrade safely
- No new npm dependencies
- No Google Fonts imports in content scripts
