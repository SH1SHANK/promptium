# Security Best Practices Report

Date: 2026-03-02  
Scope: Promptium Chrome Extension (Manifest V3)

## Executive Summary
A targeted security audit was performed focusing on API key handling, outbound API calls, confidential/user-data handling, and DOM injection risks. The highest-impact issues were remediated in this pass: Gemini keys are no longer sent in URL query strings, key checks are now brokered through the service worker, export payloads are staged via session storage instead of local storage, and multiple unsafe `innerHTML` paths were hardened.

No active critical findings remain in the reviewed scope. Residual medium-risk items are primarily architectural/privacy tradeoffs (local plaintext persistence and broad host matching).

## Critical
No active critical findings identified after applied fixes.

## High

### SBP-001 (Resolved): API key exposure in URL query strings and direct UI fetch path
- Severity: High
- Status: Resolved
- Location (mitigation):
  - `background/service_worker.js:53` (header-based key usage)
  - `background/service_worker.js:88` (central Gemini call helper)
  - `sidepanel/sidepanel.js:3386` (key validation now routed through background action)
  - `background/service_worker.js:769` (new `VALIDATE_GEMINI_KEY` action)
- Impact statement: Query-string key transport can leak secrets through logs/proxies/history and increases accidental disclosure risk.
- Fix applied:
  - Replaced `?key=...` transport with `x-goog-api-key` header.
  - Added `safeFetch` defaults (`no-store`, `no-referrer`, timeout).
  - Moved key validation into trusted service worker route.

### SBP-002 (Resolved): Persistent plaintext key storage in `chrome.storage.local`
- Severity: High
- Status: Resolved (migrated strategy)
- Location (mitigation):
  - `sidepanel/sidepanel.js:24` (`getStoredGeminiKey` with legacy migration)
  - `sidepanel/sidepanel.js:41` (`setStoredGeminiKey` session-only storage)
  - `background/service_worker.js:69` (session-first read + legacy local cleanup)
- Impact statement: Persistent local secret storage increases theft window after compromise.
- Fix applied:
  - Gemini key moved to `chrome.storage.session` (session-scoped), with local legacy cleanup.

## Medium

### SBP-003: Sensitive user data remains plaintext at rest in local extension storage
- Severity: Medium
- Status: Open (architectural)
- Location:
  - `utils/storage.js:61` (`savePrompt` stores prompt text to `chrome.storage.local`)
  - `utils/storage.js:152` (`saveChatToHistory` stores history payloads)
  - `sidepanel/sidepanel.js:516` and `sidepanel/sidepanel.js:530` (settings/user context persisted)
- Impact: Local data (prompts, history, context) is recoverable from extension storage if endpoint is compromised.
- Recommendation:
  - Offer an optional “privacy mode” to disable persistence for history/context.
  - Add an explicit retention policy (e.g., auto-delete after N days).
  - Consider optional user-supplied passphrase encryption for high-sensitivity users.

### SBP-004: Broad wildcard host permissions increase blast radius
- Severity: Medium
- Status: Open
- Location:
  - `manifest.json:34` to `manifest.json:39`
- Impact: Any compromise in extension logic can affect a wider set of pages under wildcard domains.
- Recommendation:
  - Narrow host match patterns where possible.
  - Prefer explicit hosts/paths and move optional surfaces to runtime permission prompts where feasible.

## Low

### SBP-005 (Resolved): DOM injection surface in tag rendering
- Severity: Low
- Status: Resolved
- Location (mitigation):
  - `sidepanel/sidepanel.js:1355` (filter chip now uses `textContent` + appended node)
  - `content/toolbar.js:71` (tag badge now built via DOM APIs)
  - `utils/dom-helpers.js:30` (empty-state renderer now DOM-built, no interpolated HTML)
- Impact: User-controlled text rendered via `innerHTML` can create XSS opportunities.
- Fix applied: Replaced interpolated `innerHTML` with explicit DOM node construction in these paths.

### SBP-006: `wasm-unsafe-eval` present in extension CSP
- Severity: Low
- Status: Open (accepted tradeoff candidate)
- Location:
  - `manifest.json:42`
- Impact: Weakens CSP strictness relative to fully eval-free policy.
- Recommendation:
  - Keep only if required by runtime model stack.
  - Revisit if model runtime can be switched to an eval-free backend path.

## Additional Data-Minimization Improvements Applied
- Export payload staging moved to service-worker session storage:
  - `content/toolbar.js:358`
  - `background/service_worker.js:621`
- URL sanitization and message minimization for history persistence:
  - `utils/storage.js:23` (`sanitizeStoredUrl`)
  - `utils/storage.js:35` (`normalizeHistoryMessages`)
  - `utils/storage.js:160` / `utils/storage.js:162` (applied in history writes)
- LLM tab open guard tightened to HTTPS only:
  - `background/service_worker.js:606`

## Validation Performed
- Syntax checks passed:
  - `node --check background/service_worker.js`
  - `node --check sidepanel/sidepanel.js`
  - `node --check content/toolbar.js`
  - `node --check utils/storage.js`
  - `node --check utils/dom-helpers.js`
