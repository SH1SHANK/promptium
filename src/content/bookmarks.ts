(() => {
  /**
   * File: content/bookmarks.js
   * Purpose: Per-conversation bookmark toggles with hash validation safety.
   */

  const STORAGE_KEY = 'bookmarks';
  const SETTINGS_KEY = 'promptiumSettings';
  const URL_WATCH_INTERVAL_MS = 900;

  let currentPlatform = null;
  let observer = null;
  let urlWatchTimer = null;
  let activeUrlKey = '';
  let currentBookmarks = [];
  let shortcutConfig = {
    alt: true,
    shift: true,
    ctrl: false,
    meta: false,
    key: 'b',
  };

  const sanitizeConversationUrl = (value = window.location.href) => {
    try {
      const parsed = new URL(String(value || '').trim());
      return `${parsed.origin}${parsed.pathname}`;
    } catch (_) {
      return '';
    }
  };

  const normalizeMessageText = (value) =>
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const computeMessageHash = (value) => {
    const source = normalizeMessageText(value);
    let hash = 5381;
    for (let index = 0; index < source.length; index += 1) {
      hash = ((hash << 5) + hash) ^ source.charCodeAt(index);
    }
    return `h${(hash >>> 0).toString(36)}`;
  };

  const readMessageText = (messageEl) => {
    if (!(messageEl instanceof HTMLElement)) return '';
    const clone = messageEl.cloneNode(true);
    clone.querySelectorAll('.pn-bookmark-icon').forEach((node) => node.remove());
    return String(clone.innerText || clone.textContent || '').trim();
  };

  const notify = async (message) => {
    const text = String(message || '').trim();
    if (!text) return;
    if (window.Toolbar?.showNotification) {
      await window.Toolbar.showNotification(text);
      return;
    }
    console.info('[Promptium][Bookmarks]', text);
  };

  const parseShortcutConfig = (raw) => {
    const value = String(raw || 'Alt+Shift+B').trim();
    const parts = value
      .split('+')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    const config = {
      alt: false,
      shift: false,
      ctrl: false,
      meta: false,
      key: '',
    };

    parts.forEach((part) => {
      if (part === 'alt' || part === 'option') config.alt = true;
      if (part === 'shift') config.shift = true;
      if (part === 'ctrl' || part === 'control') config.ctrl = true;
      if (part === 'cmd' || part === 'command' || part === 'meta') config.meta = true;
      if (
        !['alt', 'option', 'shift', 'ctrl', 'control', 'cmd', 'command', 'meta'].includes(part) &&
        !config.key
      ) {
        config.key = part;
      }
    });

    if (!config.key) config.key = 'b';
    return config;
  };

  const loadShortcutConfig = async () => {
    try {
      const snapshot = await chrome.storage.local.get([SETTINGS_KEY]);
      shortcutConfig = parseShortcutConfig(
        snapshot?.[SETTINGS_KEY]?.bookmarkShortcut || 'Alt+Shift+B'
      );
    } catch (_error) {
      shortcutConfig = parseShortcutConfig('Alt+Shift+B');
    }
  };

  const shortcutMatches = (event) => {
    const key = String(event.key || '').toLowerCase();
    return (
      event.altKey === shortcutConfig.alt &&
      event.shiftKey === shortcutConfig.shift &&
      event.ctrlKey === shortcutConfig.ctrl &&
      event.metaKey === shortcutConfig.meta &&
      key === shortcutConfig.key
    );
  };

  const sortNodesByDomOrder = (nodes) => {
    const sorted = [...nodes];
    sorted.sort((left, right) => {
      if (left === right) return 0;
      const relation = left.compareDocumentPosition(right);
      if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      return 0;
    });
    return sorted;
  };

  const getAssistantMessageMeta = async () => {
    const selectors = await window.Platform.getSelectors(currentPlatform);
    if (!selectors?.botMsg || !selectors?.userMsg) {
      return [];
    }

    try {
      const userNodes = Array.from(document.querySelectorAll(selectors.userMsg));
      const botNodes = Array.from(document.querySelectorAll(selectors.botMsg));
      const merged = sortNodesByDomOrder(Array.from(new Set([...userNodes, ...botNodes])));
      const conversationIndexByNode = new Map();

      merged.forEach((node, conversationIndex) => {
        conversationIndexByNode.set(node, conversationIndex);
      });

      return botNodes.map((node, assistantIndex) => ({
        node,
        conversationIndex: Number.isFinite(conversationIndexByNode.get(node))
          ? conversationIndexByNode.get(node)
          : assistantIndex,
      }));
    } catch (_) {
      return [];
    }
  };

  const getEntryForMessage = (messageIndex, messageHash) =>
    currentBookmarks.find(
      (entry) =>
        Number(entry?.messageIndex) === Number(messageIndex) &&
        String(entry?.messageHash || '') === String(messageHash || '')
    );

  const updateIconState = (messageEl, isBookmarked) => {
    const icon = messageEl?.querySelector(':scope > .pn-bookmark-icon');
    if (!icon) return;
    const newText = isBookmarked ? '⭐' : '☆';
    if (icon.textContent !== newText) {
      icon.textContent = newText;
    }
    icon.title = isBookmarked ? 'Bookmarked — click to remove' : 'Bookmark this response';

    if (isBookmarked && !icon.classList.contains('pn-bookmark-active'))
      icon.classList.add('pn-bookmark-active');
    if (!isBookmarked && icon.classList.contains('pn-bookmark-active'))
      icon.classList.remove('pn-bookmark-active');

    if (isBookmarked && !messageEl.classList.contains('pn-bookmarked'))
      messageEl.classList.add('pn-bookmarked');
    if (!isBookmarked && messageEl.classList.contains('pn-bookmarked'))
      messageEl.classList.remove('pn-bookmarked');
  };

  const loadBookmarks = async () => {
    activeUrlKey = sanitizeConversationUrl();
    if (!activeUrlKey) {
      currentBookmarks = [];
      return;
    }

    const snapshot = await chrome.storage.local.get([STORAGE_KEY]).catch(() => ({}));
    const all = snapshot?.[STORAGE_KEY] || {};
    const list = Array.isArray(all?.[activeUrlKey]) ? all[activeUrlKey] : [];
    currentBookmarks = list.filter((entry) => Number.isFinite(Number(entry?.messageIndex)));
  };

  const persistBookmarks = async () => {
    const urlKey = sanitizeConversationUrl();
    if (!urlKey) return;

    const snapshot = await chrome.storage.local.get([STORAGE_KEY]).catch(() => ({}));
    const all =
      snapshot?.[STORAGE_KEY] && typeof snapshot[STORAGE_KEY] === 'object'
        ? snapshot[STORAGE_KEY]
        : {};
    all[urlKey] = currentBookmarks;
    await chrome.storage.local.set({ [STORAGE_KEY]: all }).catch(() => {});
  };

  const buildBookmarkPayload = (messageIndex, messageEl) => {
    const text = readMessageText(messageEl);
    const preview = text.slice(0, 140);
    return {
      id: crypto.randomUUID(),
      messageIndex,
      messagePreview: preview,
      messageHash: computeMessageHash(preview),
      role: 'assistant',
      note: '',
      createdAt: Date.now(),
    };
  };

  const toggleBookmark = async (messageIndex, messageEl) => {
    const payload = buildBookmarkPayload(messageIndex, messageEl);
    const existingIndex = currentBookmarks.findIndex(
      (entry) =>
        Number(entry?.messageIndex) === payload.messageIndex &&
        String(entry?.messageHash || '') === payload.messageHash
    );

    if (existingIndex >= 0) {
      currentBookmarks.splice(existingIndex, 1);
      updateIconState(messageEl, false);
      await persistBookmarks();
      return false;
    }

    currentBookmarks = currentBookmarks.filter(
      (entry) => Number(entry?.messageIndex) !== payload.messageIndex
    );
    currentBookmarks.push(payload);
    updateIconState(messageEl, true);
    await persistBookmarks();
    return true;
  };

  const applyCurrentBookmarkState = (messageEl, messageIndex) => {
    const preview = readMessageText(messageEl).slice(0, 140);
    const hash = computeMessageHash(preview);
    const isBookmarked = Boolean(getEntryForMessage(messageIndex, hash));
    updateIconState(messageEl, isBookmarked);
  };

  const injectBookmarkIcons = async () => {
    const messages = await getAssistantMessageMeta();

    messages.forEach(({ node: messageEl, conversationIndex }) => {
      if (!(messageEl instanceof HTMLElement)) return;

      let icon = messageEl.querySelector(':scope > .pn-bookmark-icon');

      if (!icon) {
        icon = document.createElement('button');
        icon.className = 'pn-bookmark-icon';
        icon.type = 'button';
        icon.setAttribute('aria-label', 'Bookmark response');
        icon.textContent = '☆';
        icon.title = 'Bookmark this response';

        icon.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const messageIndex = Number(icon?.dataset?.messageIndex);
          void toggleBookmark(
            Number.isFinite(messageIndex) ? messageIndex : conversationIndex,
            messageEl
          );
        });

        if (window.getComputedStyle(messageEl).position === 'static') {
          messageEl.classList.add('pn-bookmark-host');
        }
        messageEl.appendChild(icon);
      }

      icon.dataset.messageIndex = String(conversationIndex);
      applyCurrentBookmarkState(messageEl, conversationIndex);
    });
  };

  const initShortcut = () => {
    document.addEventListener('keydown', (event) => {
      const target = event.target;
      const isEditable =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLInputElement &&
            !['button', 'checkbox', 'radio', 'submit', 'range', 'file'].includes(
              String(target.type || '').toLowerCase()
            )));

      if (isEditable) return;

      if (!shortcutMatches(event)) {
        return;
      }

      event.preventDefault();

      void (async () => {
        const messages = await getAssistantMessageMeta();
        if (!messages.length) return;
        const last = messages[messages.length - 1];
        const toggledOn = await toggleBookmark(last.conversationIndex, last.node);
        await notify(toggledOn ? '⭐ Response bookmarked' : 'Bookmark removed');
      })();
    });
  };

  let debounceTimer = null;

  const startWatchers = () => {
    if (!observer) {
      observer = new MutationObserver((mutations) => {
        // High-performance, zero-allocation check to prevent infinite loops
        let isPromptiumMutation = true;
        for (let i = 0; i < mutations.length; i++) {
          const m = mutations[i];
          let isLocalMutation = false;

          if (m.type === 'childList') {
            if (m.addedNodes.length > 0 || m.removedNodes.length > 0) {
              let allPn = true;
              for (let j = 0; j < m.addedNodes.length; j++) {
                const n = m.addedNodes[j];
                if (!(n instanceof HTMLElement)) {
                  allPn = false;
                  break;
                }
                const c = typeof n.className === 'string' ? n.className : '';
                const id = typeof n.id === 'string' ? n.id : '';
                if (c.indexOf('pn-') === -1 && id.indexOf('pn-') === -1) {
                  allPn = false;
                  break;
                }
              }
              if (allPn) {
                for (let j = 0; j < m.removedNodes.length; j++) {
                  const n = m.removedNodes[j];
                  if (!(n instanceof HTMLElement)) {
                    allPn = false;
                    break;
                  }
                  const c = typeof n.className === 'string' ? n.className : '';
                  const id = typeof n.id === 'string' ? n.id : '';
                  if (c.indexOf('pn-') === -1 && id.indexOf('pn-') === -1) {
                    allPn = false;
                    break;
                  }
                }
              }
              isLocalMutation = allPn;
            } else {
              isLocalMutation = true;
            }
          }

          if (!isLocalMutation && m.target instanceof HTMLElement) {
            const tc = typeof m.target.className === 'string' ? m.target.className : '';
            const tid = typeof m.target.id === 'string' ? m.target.id : '';
            if (tc.indexOf('pn-') !== -1 || tid.indexOf('pn-') !== -1) {
              isLocalMutation = true;
            }
          }

          if (!isLocalMutation) {
            isPromptiumMutation = false;
            break;
          }
        }

        if (isPromptiumMutation) return;

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void injectBookmarkIcons();
        }, 500);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    if (!urlWatchTimer) {
      urlWatchTimer = setInterval(() => {
        const next = sanitizeConversationUrl();
        if (next !== activeUrlKey) {
          void (async () => {
            await loadBookmarks();
            await injectBookmarkIcons();
          })();
        }
      }, URL_WATCH_INTERVAL_MS);
    }
  };

  const init = async (platform) => {
    currentPlatform = platform;
    await loadShortcutConfig();
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes[SETTINGS_KEY]) return;
      shortcutConfig = parseShortcutConfig(
        changes[SETTINGS_KEY].newValue?.bookmarkShortcut || 'Alt+Shift+B'
      );
    });
    await loadBookmarks();
    await injectBookmarkIcons();
    initShortcut();
    startWatchers();
  };

  const Bookmarks = {
    STORAGE_KEY,
    sanitizeConversationUrl,
    normalizeMessageText,
    computeMessageHash,
    loadBookmarks,
    init,
  };

  if (typeof window !== 'undefined') {
    window.Bookmarks = Bookmarks;
  }
})();
