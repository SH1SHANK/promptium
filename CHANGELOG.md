# Changelog

All notable changes to Promptium are documented here.

Format: [Keep a Changelog](https://keepachangelog.com)

## [0.1.0] — 2026-03-07

### Added

- Prompt library with semantic search powered by local Transformers.js embedding models
- Fill-in templates with `[variable]` and `[variable?]` syntax for reusable prompts
- AI provider support: Gemini (default), OpenAI, Anthropic, OpenRouter with automatic fallback chain
- Prompt optimization features: Polish, Auto-Tag Suggestion, Improve Prompt
- Chat export to multiple formats: Markdown, Plain Text, JSON, PDF, PNG/JPEG, Notion, Obsidian
- Conversation bookmarks with per-URL persistence and visual indicators
- Cross-LLM conversation continuation (Copy conversation to another platform)
- Floating Action Button (FAB) with configurable position and style
- Per-conversation message selection for export
- Chat history with auto-save option (capped at 50 entries)
- Semantic search across entire prompt library
- Tag filtering and management
- Settings panel with AI provider configuration
- Support for 25+ AI platforms (ChatGPT, Claude, Gemini, DeepSeek, Qwen, Mistral, Kimi, Grok, HuggingChat, Poe, You.com, Phind, Character.ai, Pi.ai, Meta.ai, AWS Q, Ernie, DouBao, Yi Chat, Cohere, Groq, Fireworks, Together AI, and more)
- Custom platform support with user-defined CSS selectors
- Onboarding flow with animated introduction
- Local-only operation with no backend or telemetry
- Session-only API key storage (never persisted)
- Extended thinking support (Claude, DeepSeek, ChatGPT o-series, Gemini)

### Version

**0.1.0** — March 7, 2026

### Notes

This is the initial release of Promptium. All core features for prompt management, semantic search, AI enhancement, export, and cross-platform continuation are operational.

API is considered stable for manifest and message formats but may change in future releases as the extension evolves.
