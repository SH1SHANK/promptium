# Browser Validation — Phase S4.5

Perform this sweep before Phase S5 (Context Menu integration) begins.

This is the first release that has all four subsystems active simultaneously:

- Platform Adapter Registry
- Content Script (FAB Launcher)
- Background Service Worker (Floating Window Service)
- Floating Window (`app.html`)

A regression in any layer will silently break the others.

---

## Test Environment Setup

1. Run `pnpm build` to produce a fresh production bundle.
2. Load `dist/chrome-mv3/` as an **unpacked extension** in each browser.
3. Open a **private/incognito window** for each browser test to avoid cached state.
4. Disable any other Promptium installations before testing.

---

## Test Matrix

Mark each cell: `✅ Pass` · `❌ Fail` · `⚠️ Partial` · `—  Not Tested`

| # | Scenario | Chrome | Arc | Brave | Edge |
|---|---|:---:|:---:|:---:|:---:|
| 1 | Extension loads without console errors | | | | |
| 2 | FAB appears on `chatgpt.com` | | | | |
| 3 | FAB appears on `gemini.google.com` | | | | |
| 4 | FAB appears on `claude.ai` | | | | |
| 5 | FAB appears on `perplexity.ai` | | | | |
| 6 | FAB appears on `copilot.microsoft.com` | | | | |
| 7 | FAB is **absent** on `github.com` (unsupported site) | | | | |
| 8 | FAB is **absent** on `google.com` (unsupported site) | | | | |
| 9 | Clicking FAB opens Promptium window | | | | |
| 10 | Clicking FAB a second time **focuses** the existing window (no duplicate) | | | | |
| 11 | Extension toolbar icon opens Promptium window | | | | |
| 12 | `Alt+P` keyboard shortcut opens Promptium window | | | | |
| 13 | FAB survives SPA navigation (ChatGPT: start new chat) | | | | |
| 14 | No duplicate FABs after navigation | | | | |
| 15 | Background service worker restarts — FAB still works after `chrome://serviceworker-internals` stop | | | | |
| 16 | Promptium window persists bounds across open/close cycles | | | | |
| 17 | Right click with selection shows: Save Selection, Copy As Prompt, Refine Selection globally | | | | |
| 18 | Right click with selection shows Continue in Chat *only* on supported + healthy platforms | | | | |
| 19 | Copy As Prompt successfully copies selected text to clipboard on Arc and Brave | | | | |
| 20 | Save Selection successfully saves prompt with sourceTitle metadata | | | | |

---

## Known Platform-Specific Risks

| Browser | Known Issue |
|---|---|
| **Arc** | Chromium side panel API may behave differently; verify window type is `popup` not `panel`. |
| **Brave** | Shields may intercept `chrome.runtime.sendMessage` in some configurations. |
| **Edge** | WebExtensions API occasionally delays `chrome.windows.create` — verify focus behavior. |

---

## Failure Triage

If a test fails, check:

1. **FAB not visible** → `getCurrentAdapter()` returning null. Check hostname matching in adapter `detect()`.
2. **FAB visible but click does nothing** → `chrome.runtime.sendMessage` error. Check background script is alive.
3. **Window opens but is wrong size** → `window-store.ts` loaded stale bounds. Clear `chrome.storage.local` and retry.
4. **Duplicate FABs** → `bodyObserver` or navigation subscriber fired without checking `isFabMounted()`. Check `fab-manager.ts`.

---

## Sign-off

| Browser | Tested By | Date | Result |
|---|---|---|---|
| Chrome | | | |
| Arc | | | |
| Brave | | | |
| Edge | | | |
