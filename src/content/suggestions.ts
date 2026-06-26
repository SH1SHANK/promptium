/**
 * File: content/suggestions.js
 * Purpose: Smart prompt suggestions dropdown that appears above the LLM input
 *          field when the user is typing. Searches the prompt library for
 *          semantically relevant matches and injects on click.
 *
 * Communicates with: utils/storage.js (window.Store), service_worker.js (chrome.runtime.sendMessage for semantic search)
 */

import { getCurrentAdapter } from '../platforms';

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

  let dropdownNode: any = null;
  let inputEl: any = null;
  let debounceTimer: any = null;
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
    if (host) host.replaceChildren();
    dropdownNode = null;
    lastQuery = '';
  };

  const positionDropdown = (dropdown: any, inputRect: any) => {
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

  const showDropdown = (prompts: any, inputRect: any) => {
    if (!prompts.length) {
      hideDropdown();
      return;
    }

    const host = getOrCreateHost();
    host.replaceChildren();

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
    dismiss.textContent = '✕';
    dismiss.addEventListener('click', () => {
      dismissed = true;
      hideDropdown();
    });
    header.appendChild(dismiss);
    dropdown.appendChild(header);

    prompts.forEach((p: any) => {
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

  const injectSuggestion = (text: any) => {
    if (!inputEl) return;
    const el = inputEl;
    if (el.value === undefined) {
      el.textContent = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    el.focus();
  };

  const tokenize = (text: any) =>
    String(text || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word: any) => word.length > 2 && !STOP_WORDS.has(word));

  const calculateScore = (queryWords: any, prompt: any) => {
    if (!queryWords.length) return 0;
    const promptWords = tokenize(
      `${prompt.title || ''} ${String(prompt.text || '').slice(0, 300)}`
    );
    if (!promptWords.length) return 0;

    const querySet = new Set(promptWords);
    let matched = 0;

    for (const qw of queryWords) {
      if (querySet.has(qw)) {
        matched++;
      } else if (promptWords.some((pw: any) => pw.startsWith(qw) || qw.startsWith(pw))) {
        matched += 0.6;
      }
    }

    return matched / queryWords.length;
  };

  const findSuggestions = async (query: any) => {
    if (!window.Store?.getPrompts) return [];
    const all = await window.Store.getPrompts().catch(() => []);
    if (!all.length) return [];

    const queryWords = tokenize(query.slice(-QUERY_MAX_CHARS).trim());
    if (!queryWords.length) return [];

    return all
      .map((p: any) => ({ prompt: p, score: calculateScore(queryWords, p) }))
      .filter((entry: any) => entry.score >= MIN_SCORE)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, MAX_SUGGESTIONS)
      .map((entry: any) => entry.prompt);
  };

  const handleInput = (event: any) => {
    if (!isEnabled || dismissed) return;
    const target = event.target;
    const val = (
      target.value === undefined ? target.textContent || target.innerText || '' : target.value
    ).trim();
    if (!val || val.length < 8) {
      hideDropdown();
      return;
    }

    if (val !== lastQuery) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        lastQuery = val;
        const rect = target.getBoundingClientRect();
        if (rect.width) {
          showDropdown(await findSuggestions(val), rect);
        }
      }, DEBOUNCE_MS);
    }
  };

  const handleKeyDown = (event: any) => {
    if (event.key === 'Escape' && dropdownNode) {
      dismissed = true;
      hideDropdown();
    }
    if (event.key === 'Enter' && !event.shiftKey && dropdownNode) {
      hideDropdown();
      dismissed = false;
    }
  };

  const handleBlur = (event: any) => {
    // Small delay to allow click handlers on dropdown to trigger first
    setTimeout(() => {
      if (!dropdownNode) return;
      const focused = document.activeElement;
      if (focused && focused.closest('#pn-suggestion-host')) return;
      if (focused === inputEl) return;
      hideDropdown();
    }, 150);
  };

  const bindToInput = (el: any) => {
    if (!el || el === inputEl) return;
    if (inputEl) unbindFromInput(inputEl);
    inputEl = el;
    dismissed = false;
    el.addEventListener('input', handleInput);
    el.addEventListener('keydown', handleKeyDown);
    el.addEventListener('blur', handleBlur);
  };

  const unbindFromInput = (el: any) => {
    if (!el) return;
    el.removeEventListener('input', handleInput);
    el.removeEventListener('keydown', handleKeyDown);
    el.removeEventListener('blur', handleBlur);
  };

  const findInputField = async () => {
    const adapter = getCurrentAdapter();
    if (!adapter) return null;
    return adapter.getComposerElement();
  };

  let observerTimer: any = null;

  const watchForInput = () => {
    const check = async () => {
      const el = await findInputField();
      if (el && el !== inputEl) {
        bindToInput(el);
        dismissed = false;
      }
    };
    void check();
    // Use a periodic check for SPA navigation
    if (observerTimer) clearInterval(observerTimer);
    observerTimer = setInterval(() => {
      void check();
    }, 2000);
  };

  /* ── Public API ──────────────────────────────────────────────────────────── */

  const init = (settings: any = {}) => {
    isEnabled = settings.smartSuggestions !== false;
    if (!isEnabled) return;
    injectStyles();
    watchForInput();

    // Dismiss when clicking outside
    document.addEventListener('click', (e: any) => {
      if (!dropdownNode) return;
      if (e.target.closest('#pn-suggestion-host')) return;
      if (e.target === inputEl) return;
      dismissed = false;
      hideDropdown();
    });
  };

  const setEnabled = (enabled: any) => {
    isEnabled = Boolean(enabled);
    if (!isEnabled) {
      hideDropdown();
      if (debounceTimer) clearTimeout(debounceTimer);
    }
  };

  (window as any).PromptSuggestions = { init, setEnabled, hideDropdown };
})();
