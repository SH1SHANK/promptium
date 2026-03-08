# Storage Schema

## chrome.storage.local

Persistent data stored in the browser profile. Not synced across devices. Survives browser restart.

### promptiumSettings

**Type:** Object

**Description:** All user preferences and configuration. Initialized from `DEFAULT_SETTINGS` in `sidepanel/state.js`.

**Schema:**

```
{
  activeProvider: string,
    (gemini | openai | anthropic | openrouter)
    Default: "gemini"

  providerModels: {
    gemini: string,        Default: "gemini-2.0-flash"
    openai: string,        Default: "gpt-4o-mini"
    anthropic: string,     Default: "claude-haiku-4-5-20251001"
    openrouter: string,    Default: "meta-llama/llama-3.1-8b-instruct:free"
  }

  embeddingModelId: string,
    ID of embedding model for semantic search. Downloaded on first use.
    Default: "all-minilm-l6-v2"
    Options: "all-minilm-l6-v2", "all-mpnet-base-v2", "bge-small-en-v1.5", "gte-small"

  featureFlags: {
    polish: boolean,         Enable prompt Polish feature. Default: true
    autoTags: boolean,       Enable auto-tag suggestion. Default: true
    improvePrompt: boolean,  Enable prompt Improve feature. Default: true
    continueSummary: boolean, Enable conversation summary for Continue. Default: true
  }

  fabPosition: string,
    FAB position on chat page. Default: "bottom-right"
    Options: "bottom-left", "bottom-right"

  fabStyle: string,
    FAB display style. Default: "circle"
    Options: "circle", "pill", "icon-only"

  chatHighlightStyle: string,
    Reserved for future use. Current default: "solid"

  fabButtons: {
    savePrompt: boolean,     Show Save Prompt action. Default: true
    exportChat: boolean,     Show Export Chat action. Default: true
    continueChat: boolean,   Show Continue Chat action. Default: true
    library: boolean,        Show Library action. Default: true
  }

  visibleTabs: {
    prompts: boolean,        Show Prompts tab. Default: true (always visible)
    export: boolean,         Show Export tab. Default: true
    history: boolean,        Show History tab. Default: true
    tags: boolean,           Show Tags tab. Default: true
  }

  cardDensity: string,
    Prompt card display density. Default: "comfortable"
    Options: "comfortable", "compact"

  defaultExportFormat: string,
    Default export format. Default: "markdown"
    Options: "markdown", "json", "txt", "pdf", "notion", "obsidian", "png", "jpeg"

  autoSaveHistory: boolean,
    Automatically save exported conversations to history. Default: true

  settingsMigratedV2: boolean,
    Internal flag for settings migration. Default: false

  onboardingComplete: boolean,
    Tracks if user completed onboarding. Default: false
}
```

### prompts

**Type:** Array<Prompt>

**Description:** User's saved prompt library.

**Prompt Schema:**

```
{
  id: string,              UUID v4, unique identifier
  title: string,           Max 80 characters
  text: string,            Prompt body
  tags: string[],          User-assigned tags, each max 30 chars
  isTemplate: boolean,     True if text contains [variables]
  category: string | null,  (reserved, unused in v0.1.0)
  embedding: number[] | null,
    Semantic search embedding vector. Null if not yet indexed.
    Dimensions depend on selected embedding model (384 or 768).
  clarityScore: number | null,
    Clarity assessment 0-100. Null if not assessed.
  clarityExplanation: string,
    Human-readable clarity feedback. Empty string if none.
  createdAt: string,       ISO 8601 timestamp
  updatedAt: string (if modified),  ISO 8601 timestamp
  aiMeta: {
    paraphrase: string | null,  Original paraphrase from AI enhancement
    title: string | null,       AI-suggested title
    clarity: string | null,     AI clarity analysis
  }
}
```

### chatHistory

**Type:** Array<ChatHistoryEntry>

**Description:** Recently exported conversations, capped at 50 entries. Only populated if `autoSaveHistory` is enabled.

**ChatHistoryEntry Schema:**

```
{
  id: string,              UUID v4
  title: string,           Conversation title
  platform: string,        LLM platform name (chatgpt, claude, gemini, etc)
  createdAt: string,       ISO 8601 timestamp of export
  url: string | null,      Source conversation URL if available
  messages: Array<{
    role: string,          "user" or "assistant"
    text: string,          Message text, max 30000 chars
    timestamp: string | undefined,  Message timestamp if available
  }>
  messageCount: number,    Total messages before truncation
}
```

### bookmarks

**Type:** Object<string, BookmarkArray>

**Description:** Per-conversation bookmarks, keyed by conversation URL.

**Schema:**

```
{
  [url]: [
    {
      id: string,              UUID v4
      messageIndex: number,    Position in conversation
      messagePreview: string,  First 140 characters of message
      messageHash: string,     DJB2 hash of message content
      role: string,            "assistant" (only assistant messages bookmarked)
      note: string,            User note (currently stored but unused in UI)
      createdAt: number,       Unix timestamp (milliseconds)
    }
  ]
}
```

### promptiumEmbeddingMeta

**Type:** Object

**Description:** Metadata for semantic search indexing.

**Schema:**

```
{
  activeModelId: string,       Current embedding model. Default: "all-minilm-l6-v2"
  indexedPromptCount: number,  Prompts with embeddings computed
  lastIndexedAt: number,       Unix timestamp of last index operation
}
```

### promptiumEmbeddingReindexState

**Type:** Object

**Description:** State tracking for embedding index rebuilds. Temporary, cleared after reindex completes.

**Schema:**

```
{
  inProgress: boolean,         Reindex operation active
  totalPrompts: number,        Total prompts to index
  indexedCount: number,        Prompts indexed so far
  startedAt: number,           Unix timestamp of reindex start
  targetModelId: string,       Model being indexed
}
```

### onboardingComplete

**Type:** boolean

**Description:** Whether user has completed the onboarding tutorial.

Default: `false`

Set to `true` after user dismisses or completes all onboarding cards.

## chrome.storage.session

Cleared when the browser closes. Never synced. API keys stored here to prevent persistence.

### promptiumGeminiKey

**Type:** string

**Description:** Gemini API key (session-only).

Set by `Settings → AI Providers`. Verified on first use. Never written to `chrome.storage.local`.

### promptiumOpenAIKey

**Type:** string

**Description:** OpenAI API key (session-only).

Set by `Settings → AI Providers`. Verified on first use. Never written to `chrome.storage.local`.

### promptiumAnthropicKey

**Type:** string

**Description:** Anthropic API key (session-only).

Set by `Settings → AI Providers`. Verified on first use. Never written to `chrome.storage.local`.

### promptiumOpenRouterKey

**Type:** string

**Description:** OpenRouter API key (session-only).

Set by `Settings → AI Providers`. Verified on first use. Never written to `chrome.storage.local`.

### promptiumSidePanelPayload

**Type:** Object

**Description:** Staged export data for transfer between content script and side panel.

**Schema:**

```
{
  messages: Array<{
    role: string,       "user" or "assistant"
    text: string,       Message content
    thinking: string,   Extended thinking/reasoning content if available
    html: string,       Raw HTML from page
    index: number,      Message position
    bookmarkMeta: {
      isBookmarked: boolean
    }
  }>,
  platform: string,     Detected LLM platform
  title: string,        Conversation title if available
  createdAt: string,    ISO 8601 timestamp
}
```

Updated by content scripts (`SET_SIDEPANEL_PAYLOAD` action) and read by side panel (`Export` tab).

### promptiumImprovePayload

**Type:** Object

**Description:** Staged prompt improvement data passed from FAB or context menu to side panel.

**Schema:**

```
{
  text: string,         Text to improve
  tags: string[],       Associated tags if from library
  sourceTabId: number,  Tab ID for injecting result back
}
```

Consumed by `ImproveUI`, then deleted after handling.

### pendingSnippet

**Type:** Object

**Description:** Text waiting to be saved as a new prompt. Set by content script, consumed by side panel.

**Schema:**

```
{
  text: string,         Text to save
  sourceUrl: string,    URL where text was selected from
}
```

Consumed by side panel (`consumePendingSnippet`), then deleted.

## Data Size Limits

- Individual prompt text: 100,000 chars (enforced by form)
- Prompt title: 80 chars
- Tag length: 30 chars each
- Chat history: 50 entries max
- Message text in history: 30,000 chars
- Embedding vector: 384-768 floats depending on model

## Backup and Export

**Settings can be exported and imported:**

1. Settings → Data Management → Export Backup — Downloads `promptium-backup-{date}.json`
2. Settings → Data Management → Import Backup — Restores from JSON file

Backup includes:

- All settings
- All prompts and embeddings
- All bookmarks
- Chat history

Does **not** include:

- API keys (session-only, never backed up)

## Migration

**v2 Settings Migration:**

`settingsMigratedV2` flag tracks whether settings have been migrated from v1 format (if applicable). Used for backwards compatibility.
