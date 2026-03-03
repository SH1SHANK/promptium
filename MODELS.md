# AI Models and Intelligence Layer

Promptium uses local-first heuristics plus selective model/API usage.

## Local Retrieval (Transformers.js)

Used for:

- semantic prompt search
- meaning-based ranking

Behavior:

- runs locally in extension context
- falls back to keyword search if unavailable

## Gemini API

Used for:

- prompt improvement flow

Execution path:

- UI -> `utils/ai-bridge.js` -> service worker -> Gemini API -> UI diff review

## Deterministic Logic (no model required)

- template parsing/filling (`[label]`, `[label?]`)
- legacy placeholder normalization
- bridge prompt packing and truncation
- smart filename generation
- bookmark hash validation
- Notion/Obsidian formatting

## Preview Rendering

`utils/export-preview-renderer.js` handles markdown/code preview rendering in a CSP-safe path and is reused across markdown/notion/obsidian previews.

## Degradation Principles

When AI/model paths are unavailable:

- semantic search falls back to keyword matching
- improvement flows surface explicit error states
- template, bridge, bookmark, and export workflows continue
