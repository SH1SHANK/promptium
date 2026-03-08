# Local Models

This document explains Promptium's local embedding model pipeline, how semantic search works, what gets downloaded, and what happens when the browser cannot run the model path cleanly.

## What Local Models Are Used For

Promptium uses local embedding models for semantic search in the prompt library.

Semantic search is different from keyword search:

- keyword search matches literal text in titles, prompt content, or tags
- semantic search compares vector similarity so related prompts can match even when the exact words differ

This local model path is used for retrieval and ranking of prompts. It does not require an external API key.

## Runtime Architecture

Promptium runs as a Chrome Manifest V3 extension, so the local-model flow is split across extension contexts.

- the side panel triggers prompt search and settings changes
- the service worker manages embedding state, metadata, and reindex scheduling
- the offscreen document runs model initialization and embedding inference outside the service worker lifecycle

Relevant files:

- `background/service_worker.js`
- `offscreen/embedding.html`
- `offscreen/embedding.js`
- `utils/model-registry.js`
- `sidepanel/settings-ai-ui.js`

The offscreen document exists so embedding work does not depend on the short-lived service-worker runtime alone.

## Current Embedding Models

Promptium currently exposes these local embedding models:

| Model Label | Internal ID         | Transformers.js Model      | Approx Size | Dimensions | Notes                             |
| ----------- | ------------------- | -------------------------- | ----------- | ---------- | --------------------------------- |
| MiniLM-L6   | `all-minilm-l6-v2`  | `Xenova/all-MiniLM-L6-v2`  | 23MB        | 384        | Default fast, balanced option     |
| MPNet Base  | `all-mpnet-base-v2` | `Xenova/all-mpnet-base-v2` | 86MB        | 768        | Higher accuracy, heavier download |
| BGE Small   | `bge-small-en-v1.5` | `Xenova/bge-small-en-v1.5` | 33MB        | 384        | Strong retrieval focus            |
| GTE Small   | `gte-small`         | `Xenova/gte-small`         | 34MB        | 384        | Good technical prompt coverage    |

The default model is `all-minilm-l6-v2`.

## What Happens on First Use

On first semantic-search use, Promptium may need to initialize the embedding runtime and fetch model assets.

The high-level flow is:

1. the side panel requests semantic capability
2. the service worker ensures the offscreen embedding document exists
3. the offscreen runtime loads `transformers.min.js`
4. the selected embedding model is initialized
5. download progress is reported back to the extension
6. prompt text is converted into embeddings
7. similarity search can then run locally against stored prompt embeddings

The first run is slower because model assets may need to be downloaded and cached by the browser environment.

## Where the State Lives

Promptium stores local-model metadata in browser storage so the UI can track model state and reindex progress.

Important keys:

- `promptiumEmbeddingMeta`
- `promptiumEmbeddingReindexState`
- `promptiumSettings.embeddingModelId`

These record things such as:

- active embedding model ID
- downloaded model IDs
- search mode
- download or init status
- reindex progress
- any recorded embedding error state

For the full storage schema, see [STORAGE.md](./STORAGE.md).

## Search Modes

Promptium can operate in two search modes:

- `keyword`
- `semantic`

Keyword mode remains available even if semantic infrastructure is not ready.

Semantic mode becomes available when:

- a supported embedding model is selected
- the model runtime initializes successfully
- prompt embeddings are available or can be generated

## Privacy Boundary

The local embedding pipeline is designed to stay on-device.

- prompt text used for semantic search is processed inside the extension runtime
- semantic search does not require a cloud AI provider key
- no Promptium backend exists for this workflow

This is separate from AI-provider-backed features such as prompt improvement, title generation, or provider-routed summarization.

## Why an Offscreen Document Is Used

The service worker in a Manifest V3 extension can be suspended, which makes heavy model work unreliable if it runs only there.

Promptium uses an offscreen document because it allows:

- model loading outside the short-lived service worker context
- progress reporting during long downloads
- controlled cleanup after inactivity

The service worker keeps an idle-close timer and releases the offscreen document when embedding work is no longer active.

## Fallback Behavior

Promptium is designed to degrade safely when local-model inference is unavailable.

If any of these conditions occur:

- the offscreen API is unavailable
- model loading times out
- model initialization fails
- the browser environment does not support the required execution path cleanly

the extension should remain usable through keyword search.

That fallback is important because prompt retrieval should still work even when semantic search cannot be initialized.

## When Reindexing Happens

Reindexing is required when the active embedding model changes or when prompts need fresh embeddings.

Typical reindex triggers:

- user selects a different embedding model in settings
- prompts were added or changed and embeddings are missing
- prior embedding state is incomplete or stale

Reindex progress is tracked in `promptiumEmbeddingReindexState`.

## Performance Tradeoffs

The available embedding models trade off speed, size, and retrieval quality.

- MiniLM-L6: fastest setup and best default for most users
- MPNet Base: larger download, stronger representation quality, slower startup
- BGE Small: lighter than MPNet, retrieval-oriented
- GTE Small: compact option with good technical-language behavior

If a user wants the lightest first-run experience, the default MiniLM model is the safest choice.

## Troubleshooting

### Semantic Search Stays in Keyword Mode

Check whether:

- the model finished downloading
- the selected model exists in settings
- the extension was reloaded after major changes
- the offscreen document path is allowed and available

### First Search Is Slow

That is expected during initial model download and warm-up.

### Search Quality Feels Weak

Try a different embedding model in Settings. MPNet Base or BGE Small may produce better retrieval quality for some prompt libraries.

### Reindex Appears Stuck

Reload the extension and reopen the side panel. If the browser interrupted the offscreen runtime, the service worker may need a clean restart to rebuild the embedding session.

### Browser Session Changes Behavior

The embedding metadata is persisted, but the active in-memory model runtime is not permanent. A fresh browser or extension session may require the model runtime to initialize again even if assets are already cached.

## Related Documentation

- [../guides/SETUP.md](../guides/SETUP.md)
- [AI_PROVIDERS.md](./AI_PROVIDERS.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [PERMISSIONS.md](./PERMISSIONS.md)
- [STORAGE.md](./STORAGE.md)
