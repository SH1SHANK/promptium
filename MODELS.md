# AI Models and Intelligence Layer

Promptium uses a mixed strategy: local inference for retrieval and selective API usage for generation.

## 1. Local Semantic Retrieval (Transformers.js)

Used for:

- Prompt semantic search
- Meaning-based relevance ranking

Characteristics:

- Runs in extension context (local execution)
- Embeddings are cached for reuse
- Falls back to keyword search when model is unavailable

## 2. Gemini API (Generative Improvement)

Used for:

- Prompt improvement flows (style-aware rewriting)

Execution model:

- UI sends structured request through `utils/ai-bridge.js`
- Background service worker performs Gemini call
- Result returns to sidepanel improve UI for user approval

Notes:

- API key is user-provided and stored locally
- Network/API failures surface explicit UI errors

## 3. Non-Model Heuristics

Several v2 features intentionally use deterministic logic instead of external models:

- Template variable parsing and fill (`{{name}}`, `{{name?}}`)
- Cross-LLM bridge prompt packing and truncation
- Smart filename generation from conversation text
- Bookmark hash validation
- Notion/Obsidian formatting transforms

This keeps these flows fast, explainable, and dependency-free.

## 4. Preview Rendering Layer

Export preview uses markdown/code rendering helpers in `utils/export-preview-renderer.js`.

- CSP-safe markdown rendering
- Syntax highlighting for code blocks
- Shared renderer path for Notion/Obsidian preview parity

## 5. Graceful Degradation Principles

When AI/model paths are unavailable:

- Semantic search falls back to keyword filtering
- Improvement UI surfaces actionable errors and retry options
- Export, bridge, bookmark, and template-fill flows continue without model dependency
