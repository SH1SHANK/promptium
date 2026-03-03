# Promptium Features

## Prompt Library and Templates

- Save, edit, delete, and tag prompts from popup, sidepanel, or in-page actions
- Curated templates from `utils/templates.js`
- Variable templates with inline grammar:
  - Required: `{{name}}`
  - Optional: `{{name?}}`
- Template prompts show a `{{}}` badge and open a fill workflow before inject

## Prompt Injection

- One-click injection into supported LLM inputs
- Template-aware pre-inject form with:
  - Required-field enforcement
  - Optional-field passthrough
  - Live preview of resolved prompt text

## Cross-LLM Context Bridge

- Continue conversation context on a different LLM platform in one click
- Available in both Prompts and Export tabs
- Uses staged storage key `pendingBridge` with TTL validation
- Legacy key migration supported (`pendingContext` -> `pendingBridge`)
- Explicit expiry feedback on target page

## Bookmarks

- Bookmark assistant responses with hover icon toggle (`☆`/`⭐`)
- Keyboard shortcut: `Alt+Shift+B` toggles latest assistant response bookmark
- Persistence keyed by sanitized conversation URL (`origin + pathname`)
- Safety validation uses both `messageIndex` and `messageHash`
- Bookmarked entries are highlighted and exported with `⭐`

## Semantic Search

- Transformers.js embedding-based local semantic search
- Keyword fallback for graceful degradation
- Relevance merges semantic and keyword results in prompt list

## Prompt Improvement

- Gemini-powered prompt improvement with style modes
- Side-by-side review flow before accepting/injecting/saving
- Graceful fallback states when AI is unavailable

## Export Engine

Supported formats:

- Markdown (`.md`)
- Text (`.txt`)
- JSON (`.json`)
- PDF (`.pdf`)
- Notion Markdown (`.md`)
- Obsidian Markdown (`.md`)

Export capabilities:

- Structured or combined content mode
- Include/exclude date and platform
- Font and theme controls
- Clipboard copy
- Format-aware preview renderer
- Deterministic bookmark marker propagation (including PDF text path)

## Smart Filename Generation

Filename generation order:

1. First user message in selected export payload
2. First user message in fallback/full payload
3. `platform-yyyy-mm-dd`

Manual filename input in Export tab has highest priority.

## UX and Reliability

- Modular sidepanel architecture for maintainability
- Hash-routed sidepanel sections
- Actionable empty/error states
- Non-breaking degradation on unsupported pages
- No new dependencies required for these features
