# Permissions Explained

This document explains every permission Promptium requests and why it is needed.

Promptium does not collect, transmit, or sell user data. API keys are stored in session memory only and are never sent anywhere except to the respective AI provider's API endpoint under the user's control.

## Permissions

### storage

**Why:** Save your prompt library, settings, conversation bookmarks, and chat history locally on your device.

**What is stored:**

- Prompts with text, tags, and semantic embeddings
- Settings and preferences
- Bookmarks for conversations
- Chat export history
- Embedding model metadata

**What is NOT stored:**

- API keys (kept in session storage only)
- Conversation content beyond exported exports
- Browsing history or personal data from other websites

**Data location:** Only in your browser profile, not synced to cloud or other devices.

### activeTab

**Why:** Detect which AI platform (ChatGPT, Claude, Gemini, etc.) you are currently using.

**What it does:** When you navigate to a supported LLM website, Promptium checks the URL to determine which platform is active. This allows the extension to show platform-specific features and inject UI only where relevant.

**What it does NOT do:** Read the content of pages you visit outside of supported LLM platforms. The extension does not track your browsing history.

### scripting

**Why:** Inject the floating action button and message selection controls into supported LLM chat pages.

**What it does:** Adds UI elements (button, checkboxes, modals) directly into the page so you can save prompts, export chats, and bookmark messages without leaving the conversation.

**What it does NOT do:** Run arbitrary code or modify page functionality beyond UI injection. The extension runs in an isolated context.

### downloads

**Why:** Export conversations as files (PDF, images, documents) to your computer.

**What it does:** Enables the browser to download exported chats when you click **Export**.

**What it does NOT do:** Access files on your computer or upload anything anywhere.

### sidePanel

**Why:** Open the side panel workspace with `Alt+P` keyboard shortcut or extension icon.

**What it does:** Allows Promptium to show a persistent panel alongside the chat for managing prompts, settings, and exports.

**What it does NOT do:** Open without user action or interfere with other extensions.

### contextMenus

**Why:** Right-click context menu for saving text and starting improvements.

**What it does:** When you right-click on text in any chat, options appear to save selected text as a prompt or improve it.

**What it does NOT do:** Monitor your clicks or modifications to web pages.

### offscreen

**Why:** Background processing for semantic search embeddings without blocking the UI.

**What it does:** Loads and runs the local embedding model in an offscreen context so searching is instant.

**What it does NOT do:** Run code outside the extension context or access any user data beyond prompts.

## Host Permissions

Promptium requests access to specific domains where AI platforms operate. These are needed to inject UI and read messages.

### Supported Platforms

The extension injects UI and reads conversation content **only** on these platforms:

**Chat Interfaces:**

- ChatGPT (`chatgpt.com`)
- Claude (`claude.ai`)
- Gemini (`gemini.google.com`)
- Copilot (`copilot.microsoft.com`)
- Perplexity (`perplexity.ai`)
- DeepSeek (`deepseek.com`)
- Qwen (`qwen.ai`, `qwenlm.ai`, `tongyi.aliyun.com`, `qianwen.aliyun.com`)
- Mistral (`chat.mistral.ai`, `lechat.mistral.ai`)
- Kimi (`kimi.moonshot.cn`, `moonshot.cn`, `moonshot.ai`)
- Grok (`grok.com`, `x.com/i/grok`, `twitter.com/i/grok`)
- HuggingChat (`huggingchat.com`, `huggingface.co/chat`)
- Poe (`poe.com`)
- You.com (`you.com`)
- Phind (`phind.com`)
- Character.ai (`character.ai`)
- Pi.ai (`pi.ai`)
- Meta.ai (`meta.ai`)
- AWS Q (`chat.console.aws.amazon.com`)
- Ernie (`yiyan.baidu.com`, `ernie.baidu.com`)
- DouBao (`doubao.com`)
- Yi Chat (`01.ai`)
- Cohere (`cohere.com`)
- Groq (`chat.groq.com`)
- Fireworks (`fireworks.ai`)
- Together AI (`together.ai`)

**API Endpoints (for AI provider access):**

- Google Gemini API
- OpenAI API
- Anthropic API
- OpenRouter API

These endpoints are accessed **only** when you configure an API key in Settings and request an AI feature (Polish, Improve, etc). Your API key is never shared with Promptium's backend — it goes directly to the provider.

## What Promptium Does NOT Do

**✓ Does NOT read pages unrelated to supported AI platforms**
When you browse other websites, the extension is inactive. No UI is injected and no data is collected.

**✓ Does NOT transmit conversation content to any third-party server**
Conversations are stored only in your browser. They are sent to the AI provider **only** if you explicitly export or continue a conversation there.

**✓ Does NOT store API keys beyond your browser session**
API keys are cleared when you close the browser. They are never persisted to disk or sent anywhere except to the respective provider's API.

**✓ Does NOT run on any website other than the supported platforms listed above**
Host permissions are specific to known LLM chat interfaces.

**✓ Does NOT collect usage metrics or telemetry**
Zero tracking. No analytics. No cloud backend.

**✓ Does NOT require account creation or login**
Promptium works entirely locally without any registration.

## Security Summary

- **Encryption:** API keys are stored in `chrome.storage.session` (memory-only, cleared on browser close)
- **Isolation:** Content scripts run in isolated context, cannot access other page scripts
- **CSP:** Content Security Policy restricts all unsafe scripts and external resource loading
- **No telemetry:** All processing happens locally
- **No backend:** No server connection except for configured AI provider APIs under your control
