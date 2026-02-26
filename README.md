# PromptNest

PromptNest is a Manifest V3 Chrome extension scaffold for managing reusable prompts and exporting chat history from LLM platforms. The project is structured for clean separation between popup UI, content scripts, background orchestration, and shared utilities so you can build features quickly without restructuring later.

## Folder Structure

- `manifest.json`: Extension configuration, permissions, content scripts, and service worker registration
- `popup/`: Popup interface (Prompts + History tabs, add-prompt modal, UI logic)
- `content/`: In-page extension runtime (toolbar, scraping, injection, and entrypoint)
- `background/`: Service worker lifecycle and startup initialization
- `utils/`: Shared platform detection, storage CRUD, and export helpers
- `libs/`: Third-party browser-safe libraries (placeholder for `jspdf.min.js`)
- `icons/`: Extension icon assets

## Load Unpacked in Chrome

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the project root folder: `promptnest`.
5. Pin PromptNest from the extension menu for quick access.

## Development Notes

- This scaffold uses vanilla JavaScript with async/await and minimal global namespaces (`PromptNest*`) for predictable script ordering.
- Update selector placeholders in `utils/platform.js` and `content/scraper.js` as target sites evolve.
- Add `libs/jspdf.min.js` manually if you plan to implement full PDF export support.
- Add icons (`16/32/48/128`) in `icons/` and wire them into `manifest.json` when ready.
