# Feature Reference

## Prompt Library

### Saving Prompts

Save a prompt from the side panel or the floating action button.

**From side panel:**

1. Open side panel (`Alt+P`)
2. Click **Add Prompt**
3. Choose **Plain Prompt** or **Fill-in Template**
4. Fill title, text, and optional tags
5. Click **Save Prompt**

**From floating action button:**

1. Click the **save icon** on the FAB
2. Enter title and optional tags
3. Click **Save**

The prompt is immediately available in the library. Title is auto-generated from the first 50 characters of text if left blank.

### Prompt Templates

Templates contain placeholder variables that are filled in when injected into a chat.

**Variable Syntax:**

- `[variable]` — required field, must be filled before injection
- `[variable?]` — optional field, can be left blank during injection

Template example:

```
Explain [topic] to someone with a [audience?] background.
Review this [content_type] and focus on [aspect].
```

When a template is injected, a form opens with fields for each variable. Required variables are marked with an asterisk. Clicking **Inject** sends the prompt with variables replaced.

Templates are auto-detected and labeled. Edit a prompt to add or remove variables.

### Searching Prompts

**Keyword search:**
Search by title or tags in the side panel search box. Searches are case-insensitive and match any substring.

Format tags as part of your prompts: `#research`, `#writing`, `#coding`. Or add tags in the tag field when saving.

**Semantic search:**
Powered by local Transformers.js embedding model. Searches by meaning, not exact keywords.

First semantic search triggers download of the embedding model (~23MB for default MiniLM-L6, ~86MB for MPNet Base). Subsequent searches are instant.

Search quality depends on the embedding model. Select a different model in Settings → Search Model if results are not relevant.

### Tags

Tags are searchable labels for organizing prompts. Add tags when saving prompts or edit existing prompts to update tags.

**Tag suggestions:**
When saving a prompt with text-only content, AI can suggest tags based on prompt content. Requires AI provider configured. Accept or modify suggested tags before saving.

**Tag filtering:**
Click a tag in the Tags tab to filter the prompt library by that tag. Searches combine with keyword search results.

### Duplicate Detection

When saving a new prompt, the library checks for semantically similar existing prompts. Visual warning shows related prompts. Click **Save Anyway** to save duplicate, or **Cancel** to review.

### AI-Assisted Features

All features require an AI provider configured in Settings.

#### Polish

Refine a prompt for clarity and specificity. Click the ✦ **Polish** button when editing or creating a prompt.

Polish applies grammatical fixes, removes ambiguity, and improves prompt structure. Review the polished text before saving. Click **Undo polish** to revert.

Polishing happens silently in the background. Prompt text is sent to the configured AI provider.

#### Auto-Tag Suggestion

When creating a new plain prompt, auto-tag is offered if the AI provider is configured. Suggested tags are shown before saving. Accept, edit, or delete suggestions.

#### Improve Prompt

Optimize a saved prompt one-click. Click the ⬆ **Improve** button on a prompt card.

Improvement analyzes the prompt for quality, structure, and effectiveness. Improved text is shown in a side panel. Options:

- **Use Improved** — Replace the saved prompt with improved text
- **Inject Improved** — Send improved text directly to the chat input on the active LLM page
- **Close** — Dismiss without changes

## Chat Export

### Export Formats

Export selected chat messages to multiple formats.

**Markdown (`.md`)** — Formatted with role headers, code blocks, and emphasis.

**Plain Text (`.txt`)** — Simple line-by-line format, readable in any text editor.

**JSON (`.json`)** — Structured format with metadata, timestamps, and message indices.

**PDF (`.pdf`)** — Rendered document with styling. Configurable colors and fonts in export preview.

**PNG/JPEG (`.png`, `.jpg`)** — Canvas-rendered images. Configure background color, font, and size in export preview.

**Notion (`.md`)** — Notion-compatible Markdown. Imports directly into Notion workspace with proper formatting.

**Obsidian (`.md`)** — Obsidian-compatible Markdown with wikilinks and frontmatter.

### Message Selection

1. Click the **export icon** on the FAB or in the side panel
2. The side panel shows the **Export** tab
3. Click **Select Messages** to activate selection mode
4. In the chat, check the boxes next to messages to export (or select a range)
5. Checked messages appear in the preview
6. Configure export format and optional metadata
7. Click **Export** to download

Messages can be selected by:

- Individual checkbox per message
- Range selection (shift + checkbox)
- Quick select all user messages or all assistant messages

### Export Naming

Filenames are auto-generated using:

1. Conversation title if available in scraped metadata
2. First message text (first 50 chars) truncated to safe filename chars
3. Fallback: `[platform]_[date]_[time]`

Example: `Promptium Best Practices_2026-03-07_14-32.md`

Modify the filename in the export dialog before downloading if needed.

### Bookmarks in Export

Messages marked as bookmarks (⭐) are included in exports with a bookmark indicator. Configure indicator style in export preview (default: leading emoji).

## Conversation Bookmarks

### Creating Bookmarks

Click the **bookmark star** on any assistant message in a supported LLM chat. Star changes from ☆ (empty) to ⭐ (filled) to confirm.

Bookmarks are stored per conversation URL. If you return to the same conversation later, bookmarks persist.

Each bookmark records:

- Message text preview (140 characters)
- Message content hash to detect changes
- Bookmark creation timestamp
- Optional note (currently stored but not displayed in UI)

### Keyboard Shortcut

**`Alt+Shift+B`** — Bookmark the last assistant message in the conversation without clicking.

Shortcut works only on supported platforms and only if the last message is from the assistant.

### Viewing Bookmarks

Bookmarks are managed within the conversation itself. Bookmarked messages remain starred. Delete a bookmark by clicking the star again to toggle it off.

To export bookmarks, use **Chat Export** with bookmarks included.

## In-Page Controls

### Floating Action Button (FAB)

Injected into supported LLM chat pages. Provides quick access to Promptium features without opening the full side panel.

#### Actions

- **Save Prompt** — Quick save selected text or current conversation context
- **Export Chat** — Open chat export dialog
- **Continue Chat** — Copy conversation to another LLM platform
- **Open Library** — Open full side panel prompt library
- **Improve Prompt** — Optimize selected text using AI

Each action can be toggled on/off in Settings → FAB Settings.

#### Position and Style

Configure in Settings → FAB Settings:

**Position:**

- Bottom Right (default)
- Bottom Left

**Style:**

- Circle (default)
- Pill
- Icon-only

FAB state is synced real-time when settings change.

### Context Menu

Right-click on selected text in any chat or page to access:

- **Save to Promptium** — Save selected text as a new prompt
- **Improve with Promptium** — Open improvement UI for selected text (requires AI provider)

### Keyboard Shortcuts

| Shortcut           | Action                           |
| ------------------ | -------------------------------- |
| `Alt+P`            | Open/close side panel            |
| `Ctrl+K` / `Cmd+K` | Focus search in side panel       |
| `Escape`           | Close open modal or clear search |
| `Alt+Shift+B`      | Quick bookmark on current page   |

## AI Providers

### Configuration

AI features (Polish, Auto-Tag Suggestion, Improve, Summarize) require an API key from at least one provider.

1. Open side panel (`Alt+P`)
2. Go to **Settings** → **AI Providers**
3. Select a provider (Gemini, OpenAI, Anthropic, OpenRouter)
4. Paste API key
5. Click **Test** or just save — key is verified on first use
6. Set this as active provider or let Promptium fall back automatically

**Getting API keys:**

- Gemini: https://aistudio.google.com/apikey (free tier available)
- OpenAI: https://platform.openai.com/api-keys
- Anthropic: https://console.anthropic.com/settings/keys
- OpenRouter: https://openrouter.ai/keys

### Provider Fallback

If the active provider's API key is missing or invalid, Promptium automatically falls back to:

1. Gemini
2. OpenAI
3. Anthropic
4. OpenRouter

Set your preferred provider in Settings → AI Providers → Active Provider.

### Per-Feature Usage

**Polish:** Uses active provider.

**Auto-Tag Suggestion:** Uses active provider if enabled in feature flags.

**Improve Prompt:** Uses active provider.

**Semantic Search:** Uses local embedding model (Transformers.js). No API key required for search itself. Optional: use AI provider for search ranking refinement.

## Settings

### General

**Card Density:** Comfortable or compact display of prompt cards.

**Default Export Format:** Select default format for Chat Export (Markdown, JSON, PDF, etc).

**Auto-Save History:** If enabled, successfully exported conversations are saved to chat history automatically.

### AI Providers

Register and manage API keys for available providers. See _Configuration_ section above.

**Active Provider:** Primary provider for AI features. Fallback chain attempts others if this fails.

**Per-Provider Models:** Select which model to use for each provider. Default models are recommended.

### Search Model

Select embedding model for semantic search:

- **MiniLM-L6** (default, 23MB) — Fast, balanced relevance
- **MPNet Base** (86MB) — Highest accuracy, slower
- **BGE Small** (33MB) — Strong for retrieval
- **GTE Small** (34MB) — Best for technical prompts

Changing the model triggers re-indexing of all prompts. First semantic search with new model will download the model (~30 seconds on typical connection).

### Feature Flags

Enable/disable individual AI features:

- **Polish** — Prompt refinement
- **Auto-Tags** — Auto-tag suggestions when saving prompts
- **Improve Prompt** — One-click prompt optimization
- **Continue Summary** — Summarize conversations for continuation

### FAB Settings

**Position:** Bottom Left or Bottom Right.

**Style:** Circle, Pill, or Icon-only.

**Actions:** Toggle each FAB action on/off.

### Visible Tabs

Show/hide tabs in the side panel:

- **Prompts** — Prompt library (always enabled)
- **Export** — Chat export
- **History** — Exported chat history
- **Tags** — Tag management

### Data Management

**Clear All Data** — Delete all prompts, bookmarks, and chat history. Settings and API keys are preserved.

**Export Settings Backup** — Download all settings as JSON.

**Import Settings** — Restore settings from backup file.

## History

### What Is Recorded

Chat history stores recently exported conversations when **Auto-Save History** is enabled in Settings.

Each history entry contains:

- Chat title (auto-detected or user-provided)
- Platform name
- Message count
- Export timestamp
- URL of conversation if available
- Successfully exported, not streamed from the active tab

### Viewing and Managing History

1. Open side panel (`Alt+P`)
2. Go to **History** tab
3. Browse recent exports
4. Click an entry to open export details
5. Right-click to delete or download again

History is capped at 50 entries. Oldest entries are removed automatically.\n
