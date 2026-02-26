# PromptNest

![Manifest V3](https://img.shields.io/badge/Manifest-V3-1f2937?style=flat-square)
![Multi-LLM](https://img.shields.io/badge/Multi--LLM-Supported-1f2937?style=flat-square)
![On-Device AI](https://img.shields.io/badge/On--Device-AI-1f2937?style=flat-square)
![No Backend](https://img.shields.io/badge/No-Backend-1f2937?style=flat-square)

PromptNest is a Chrome Extension for saving prompts, exporting chat sessions, and using local AI assistance directly inside your browser. It is built for developer-centric workflows across major LLM platforms with a popup-first control center and an in-page toolbar.

## Feature Phases

| Phase | Focus | Delivered |
| --- | --- | --- |
| Phase 1 | Foundation | MV3 scaffold, popup/content/background architecture, storage/export utilities |
| Phase 2 | Production core | Multi-platform scraping/injection, toolbar actions, robust popup flows |
| Phase 3 | On-device AI | Semantic prompt search, automatic tag suggestions, duplicate detection |

## Supported Platforms

| Platform | Status |
| --- | --- |
| ChatGPT (`chatgpt.com`) | Supported |
| Claude (`claude.ai`) | Supported |
| Gemini (`gemini.google.com`) | Supported |
| Perplexity (`www.perplexity.ai`) | Supported |
| Copilot (`copilot.microsoft.com`) | Supported |

## Load Unpacked in Chrome

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `/Users/shashank/Desktop/promptnest`.
5. Pin PromptNest for quick access.

## Screenshots

<!-- Add screenshots here -->

## Privacy

All AI inference runs locally in your browser. No data leaves your device.

## Known Limitations

- DOM selector structures can change frequently on Gemini and Copilot, which may require selector updates.
- `chrome.storage.local` has practical capacity limits (commonly around 5MB depending on payload shape), so very large histories or embeddings may need pruning.
- The Transformer model downloads on first use and can add startup latency before it is cached locally.

## Development Notes

- Popup AI features are isolated in `utils/ai.js`; content scripts and service worker do not import Transformers.js.
- Prompt embeddings are stored as JSON-serializable arrays in `chrome.storage.local`.
- If AI initialization fails, PromptNest degrades gracefully to non-AI behavior.
- Icons are generated via `scripts/generate-icons.js` into `icons/icon16.png`, `icons/icon48.png`, and `icons/icon128.png`.

## License

MIT
