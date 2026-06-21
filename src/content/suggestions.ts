/**
 * File: content/suggestions.js
 * Purpose: Smart prompt suggestions dropdown that appears above the LLM input
 *          field when the user is typing. Searches the prompt library for
 *          semantically relevant matches and injects on click.
 *
 * Communicates with: utils/storage.js (window.Store), utils/platform.js (window.Platform),
 *                    service_worker.js (chrome.runtime.sendMessage for semantic search)
 */

(() => {
  const SUGGESTION_HOST_ID = 'pn-suggestion-host';
  const DEBOUNCE_MS = 700;
  const MAX_SUGGESTIONS = 4;
  const MIN_SCORE = 0.1;
  const QUERY_MAX_CHARS = 200;

  // Common English stop words to skip when scoring
  const STOP_WORDS = new Set([
    'a',
    'an',
    'the',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'from',
    'is',
    'was',
    'are',
    'were',
    'be',
    'been',
    'has',
    'have',
    'had',
    'do',
    'did',
    'does',
    'this',
    'that',
    'these',
    'those',
    'i',
    'you',
    'he',
    'she',
    'it',
    'we',
    'they',
    'me',
    'him',
    'her',
    'us',
    'them',
    'my',
    'your',
    'his',
    'its',
    'our',
    'not',
    'no',
    'so',
    'if',
    'as',
    'up',
    'out',
    "it's",
    'its',
    'what',
    'which',
    'who',
    'can',
    'will',
    'just',
    'more',
    'about',
    'how',
    'when',
    'where',
    'why',
    'all',
    'get',
  ]);

  let dropdownNode = null;
  let inputEl = null;
  let debounceTimer = null;
  let dismissed = false;
  let lastQuery = '';
  let isEnabled = true;

  /* ── Style injection ──────────────────────────────────────────────────────── */

  const SUGGESTION_CSS = `
    #pn-suggestion-host {
      position: fixed;
      z-index: 2147483640;
      pointer-events: none;
    }
    .pn-sug-dropdown {
      background: #12141b;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3);
      padding: 6px;
      width: 340px;
      max-width: calc(100vw - 32px);
      pointer-events: all;
      font-family: "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13px;
      color: #fafafa;
    }
    .pn-sug-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 6px 6px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.05em;
      color: #596178;
      text-transform: uppercase;
    }
    .pn-sug-dismiss {
      background: none;
      border: none;
      cursor: pointer;
      color: #596178;
      padding: 0 2px;
      font-size: 14px;
      line-height: 1;
      display: flex;
      align-items: center;
    }
    .pn-sug-dismiss:hover { color: #9ca3b5; }
    .pn-sug-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 10px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.12s;
      border: none;
      background: none;
      color: inherit;
      text-align: left;
      width: 100%;
    }
    .pn-sug-item:hover, .pn-sug-item:focus {
      background: rgba(255,255,255,0.05);
      outline: none;
    }
    .pn-sug-item:focus-visible {
      outline: 2px solid rgba(54,214,195,0.6);
      outline-offset: -2px;
    }
    .pn-sug-title {
      font-size: 13px;
      font-weight: 500;
      color: #fafafa;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pn-sug-preview {
      font-size: 11px;
      color: #596178;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `;

  const injectStyles = () => {
    if (document.getElementById('pn-sug-styles')) return;
    const style = document.createElement('style');
    style.id = 'pn-sug-styles';
    style.textContent = SUGGESTION_CSS;
    document.head.appendChild(style);
  };

  /* ── Dropdown DOM ──────────────────────────────────────────────────────────── */

  const getOrCreateHost = () => {
    let host = document.getElementById(SUGGESTION_HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = SUGGESTION_HOST_ID;
      document.body.appendChild(host);
    }
    return host;
  };

  const hideDropdown = () => {
    const host = document.getElementById(SUGGESTION_HOST_ID);
    if (host) host.innerHTML = '';
    dropdownNode = null;
    lastQuery = '';
  };

  const positionDropdown = (dropdown, inputRect) => {
    const pad = 8;
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    const dW = dropdown.offsetWidth;
    const dH = dropdown.offsetHeight;

    // Place above the input by default; fall back to below if no space
    let top = inputRect.top - dH - pad;
    if (top < pad) {
      top = inputRect.bottom + pad;
    }
    if (top + dH > vpH - pad) {
      top = vpH - dH - pad;
    }

    let left = inputRect.left;
    if (left + dW > vpW - pad) {
      left = vpW - dW - pad;
    }
    left = Math.max(pad, left);
    top = Math.max(pad, top);

    const host = document.getElementById(SUGGESTION_HOST_ID);
    if (host) {
      host.style.left = `${left}px`;
      host.style.top = `${top}px`;
    }
  };

  const showDropdown = (prompts, inputRect) => {
    if (!prompts.length) {
      hideDropdown();
      return;
    }

    const host = getOrCreateHost();
    host.innerHTML = '';

    const dropdown = document.createElement('div');
    dropdown.className = 'pn-sug-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('aria-label', 'Prompt suggestions');

    const header = document.createElement('div');
    header.className = 'pn-sug-header';
    header.textContent = 'Prompt suggestions';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'pn-sug-dismiss';
    dismiss.title = 'Dismiss (Esc)';
    dismiss.innerHTML = '✕';
    dismiss.addEventListener('click', () => {
      dismissed = true;
      hideDropdown();
    });
    header.appendChild(dismiss);
    dropdown.appendChild(header);

    prompts.forEach((p) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pn-sug-item';
      btn.setAttribute('role', 'option');

      const titleEl = document.createElement('div');
      titleEl.className = 'pn-sug-title';
      titleEl.textContent = p.title;

      const previewEl = document.createElement('div');
      previewEl.className = 'pn-sug-preview';
      previewEl.textContent = String(p.text || '').slice(0, 80);

      btn.appendChild(titleEl);
      if (previewEl.textContent) btn.appendChild(previewEl);

      btn.addEventListener('click', () => {
        injectSuggestion(p.text);
        dismissed = true;
        hideDropdown();
      });

      dropdown.appendChild(btn);
    });

    host.appendChild(dropdown);
    dropdownNode = dropdown;

    // Position after appending so we can read offsetWidth/Height
    positionDropdown(dropdown, inputRect);
  };

  /* ── Prompt injection ──────────────────────────────────────────────────────── */

  const injectSuggestion = (text) => {
    if (!inputEl) return;
    const el = inputEl;
    // Support both textarea and contenteditable
    if (typeof el.value !== 'undefined') {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      el.textContent = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.focus();
  };

  /* ── Keyword scoring ──────────────────────────────────────────────────────── */

  const tokenize = (text) =>
    String(text || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const scorePrompt = (queryWords, prompt) => {
    if (!queryWords.length) return 0;
    const haystack = tokenize(`${prompt.title || ''} ${(prompt.text || '').slice(0, 300)}`);
    if (!haystack.length) return 0;
    const haystackSet = new Set(haystack);
    let matches = 0;
    for (const word of queryWords) {
      if (haystackSet.has(word)) matches++;
      else {
        // Partial prefix match
        if (haystack.some((h) => h.startsWith(word) || word.startsWith(h))) {
          matches += 0.6;
        }
      }
    }
    return matches / queryWords.length;
  };

  const findSuggestions = async (query) => {
    if (!window.Store?.getPrompts) return [];
    const prompts = await window.Store.getPrompts().catch(() => []);
    if (!prompts.length) return [];

    const queryTrimmed = query.slice(-QUERY_MAX_CHARS).trim();
    const queryWords = tokenize(queryTrimmed);
    if (!queryWords.length) return [];

    const scored = prompts
      .map((p) => ({ p, score: scorePrompt(queryWords, p) }))
      .filter((x) => x.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SUGGESTIONS)
      .map((x) => x.p);

    return scored;
  };

  /* ── Input field observation ──────────────────────────────────────────────── */

  const handleInput = (event) => {
    if (!isEnabled || dismissed) return;
    const el = event.target;
    const text = typeof el.value !== 'undefined' ? el.value : el.textContent || el.innerText || '';
    const trimmed = text.trim();

    if (!trimmed || trimmed.length < 8) {
      hideDropdown();
      return;
    }
    if (trimmed === lastQuery) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      lastQuery = trimmed;
      const inputRect = el.getBoundingClientRect();
      if (!inputRect.width) return; // element not visible
      const suggestions = await findSuggestions(trimmed);
      showDropdown(suggestions, inputRect);
    }, DEBOUNCE_MS);
  };

  const handleKeydown = (event) => {
    if (event.key === 'Escape' && dropdownNode) {
      dismissed = true;
      hideDropdown();
    }
    // Dismiss when user presses Enter (submits message)
    if (event.key === 'Enter' && !event.shiftKey && dropdownNode) {
      hideDropdown();
      dismissed = false;
    }
  };

  const handleFocusOut = (event) => {
    // Hide if focus leaves the input and goes somewhere other than our dropdown
    setTimeout(() => {
      if (!dropdownNode) return;
      const active = document.activeElement;
      if (active && active.closest('#pn-suggestion-host')) return;
      if (active === inputEl) return;
      hideDropdown();
    }, 150);
  };

  const bindToInput = (el) => {
    if (!el || el === inputEl) return;
    if (inputEl) unbindFromInput(inputEl);
    inputEl = el;
    dismissed = false;
    el.addEventListener('input', handleInput);
    el.addEventListener('keydown', handleKeydown);
    el.addEventListener('blur', handleFocusOut);
  };

  const unbindFromInput = (el) => {
    if (!el) return;
    el.removeEventListener('input', handleInput);
    el.removeEventListener('keydown', handleKeydown);
    el.removeEventListener('blur', handleFocusOut);
  };

  /* ── Platform input finder ───────────────────────────────────────────────── */

  const findInputField = () => {
    if (!window.Platform) return null;
    const platform = window.Platform.detect();
    if (!platform) return null;
    const selectors = window.Platform.getSelectors(platform);
    const sel = selectors?.inputField || selectors?.inputField;
    if (!sel) return null;
    return document.querySelector(sel);
  };

  let observerTimer = null;

  const watchForInput = () => {
    const check = () => {
      const el = findInputField();
      if (el && el !== inputEl) {
        bindToInput(el);
        dismissed = false;
      }
    };
    check();
    // Use a periodic check for SPA navigation
    if (observerTimer) clearInterval(observerTimer);
    observerTimer = setInterval(check, 2000);
  };

  /* ── Public API ──────────────────────────────────────────────────────────── */

  const init = (settings = {}) => {
    isEnabled = settings.smartSuggestions !== false;
    if (!isEnabled) return;
    injectStyles();
    watchForInput();

    // Dismiss when clicking outside
    document.addEventListener('click', (e) => {
      if (!dropdownNode) return;
      if (e.target.closest('#pn-suggestion-host')) return;
      if (e.target === inputEl) return;
      dismissed = false;
      hideDropdown();
    });
  };

  const setEnabled = (enabled) => {
    isEnabled = Boolean(enabled);
    if (!isEnabled) {
      hideDropdown();
      if (debounceTimer) clearTimeout(debounceTimer);
    }
  };

  window.PromptSuggestions = { init, setEnabled, hideDropdown };
})();
