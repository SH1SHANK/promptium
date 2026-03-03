(() => {
/**
 * File: content/toolbar.js
 * Purpose: Injects and manages the Promptium floating action button, save modal, and quick actions.
 * Communicates with: utils/platform.js, utils/storage.js, content/scraper.js, content/content.js, content/injector.js.
 */

let toolbarInjected = false;
let toolbarObserver = null;
let urlWatchInterval = null;
let lastUrl = window.location.href;
let pendingPromptText = '';
let reinjectDebounceTimer = null;
let isFabMenuOpen = false;
let fabGlobalListenersBound = false;
let activeFabRoot = null;
const IMPROVE_PAYLOAD_KEY = 'promptiumImprovePayload';
const NOTIFICATION_DURATION_MS = 2200;
const FAB_ACTION_STAGGER_MS = 36;
const FAB_CLOSE_BASE_MS = 170;
let fabMenuCloseTimer = null;

/** Returns the active input element for a platform based on selector config. */
const getInputElement = async (platform) => {
  const sel = await window.Platform.getSelectors(platform);

  if (!sel || !sel.input) {
    return null;
  }

  try {
    return document.querySelector(sel.input);
  } catch (_error) {
    return null;
  }
};

/** Creates a lightweight toast message for user-visible status feedback. */
const showNotification = async (message) => {
  const toast = document.createElement('div');
  toast.className = 'pn-toast';
  toast.textContent = String(message || '').trim();
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, NOTIFICATION_DURATION_MS);
};

/** Syncs badge tags to the hidden pn-save-tags-hidden input. */
const syncBadgesToHidden = () => {
  const wrap = document.getElementById('pn-tag-badges-wrap');
  const hidden = document.getElementById('pn-save-tags-hidden');
  if (!wrap || !hidden) return;

  const tags = Array.from(wrap.querySelectorAll('.pn-tag-badge'))
    .map((b) => b.dataset.tag)
    .filter(Boolean);
  hidden.value = tags.join(', ');
};

/** Adds a single tag badge to the badge container and syncs to hidden input. */
const addTagBadge = (tag) => {
  const normalized = String(tag || '').trim().toLowerCase();
  // Strip out spaces and commas for individual badges
  const cleanTag = normalized.replace(/[,\s]/g, '');
  if (!cleanTag) return;

  const wrap = document.getElementById('pn-tag-badges-wrap');
  const input = document.getElementById('pn-save-tags-input');
  if (!wrap) return;

  // Prevent duplicate badges
  const existing = Array.from(wrap.querySelectorAll('.pn-tag-badge')).map((b) => b.dataset.tag);
  if (existing.includes(cleanTag)) return;

  const badge = document.createElement('span');
  badge.className = 'pn-tag-badge';
  badge.dataset.tag = cleanTag;

  const label = document.createElement('span');
  label.textContent = cleanTag;
  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'pn-tag-badge__remove';
  removeButton.textContent = '×';
  badge.appendChild(label);
  badge.appendChild(removeButton);

  removeButton.addEventListener('click', () => {
    badge.remove();
    syncBadgesToHidden();
  });

  if (input) {
    wrap.insertBefore(badge, input);
  } else {
    wrap.appendChild(badge);
  }

  syncBadgesToHidden();
};

/** Creates the save prompt modal markup once and appends it to the page body. */
const ensureSaveModal = async () => {
  const existing = document.getElementById('pn-save-modal');

  if (existing) {
    return existing;
  }

  const modal = document.createElement('div');
  modal.id = 'pn-save-modal';
  modal.className = 'pn-save-modal pn-hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'pn-save-modal-title');
  modal.innerHTML = `
    <div class="pn-save-modal__backdrop" data-modal-close></div>
    <div class="pn-save-modal__panel">
      <h3 id="pn-save-modal-title" class="pn-save-modal__title">Save Prompt</h3>
      <label class="pn-save-modal__field">
        <span>Title</span>
        <input id="pn-save-title" type="text" placeholder="Prompt title" />
      </label>
      <label class="pn-save-modal__field">
        <span>Tags</span>
        <div class="pn-tag-badges" id="pn-tag-badges-wrap">
          <input id="pn-save-tags-input" class="pn-tag-badges__input" type="text" placeholder="Type a tag and press Space" />
        </div>
        <input id="pn-save-tags-hidden" type="hidden" />
      </label>
      <div class="pn-save-modal__actions">
        <button id="pn-save-cancel" class="pn-btn pn-btn--ghost" type="button">Cancel</button>
        <button id="pn-save-confirm" class="pn-btn pn-btn--primary" type="button">Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  return modal;
};

/** Shows the save prompt modal and seeds default field values. */
const openSaveModal = async (currentText) => {
  const modal = await ensureSaveModal();
  const titleInput = modal.querySelector('#pn-save-title');
  const tagsInput = modal.querySelector('#pn-save-tags-input');
  const tagsHidden = modal.querySelector('#pn-save-tags-hidden');
  const badgesWrap = modal.querySelector('#pn-tag-badges-wrap');
  
  pendingPromptText = String(currentText || '').trim();

  if (titleInput) {
    titleInput.value = '';
  }

  if (tagsInput) {
    tagsInput.value = '';
  }

  if (tagsHidden) {
    tagsHidden.value = '';
  }

  if (badgesWrap) {
    badgesWrap.querySelectorAll('.pn-tag-badge').forEach((b) => b.remove());
  }

  modal.classList.remove('pn-hidden');
};

/** Hides the save prompt modal and clears pending input text state. */
const closeSaveModal = async () => {
  const modal = await ensureSaveModal();
  modal.classList.add('pn-hidden');
  pendingPromptText = '';
};

/** Persists the pending prompt text using values collected from modal fields. */
const confirmSavePrompt = async () => {
  const modal = await ensureSaveModal();
  const titleInput = modal.querySelector('#pn-save-title');
  const tagsHidden = modal.querySelector('#pn-save-tags-hidden');
  
  const title = String(titleInput?.value || '').trim();
  const tagsValue = String(tagsHidden?.value || '').trim();
  const tags = tagsValue ? tagsValue.split(',').map((tag) => tag.trim()).filter(Boolean) : [];

  if (!pendingPromptText) {
    await showNotification('Cannot save an empty prompt.');
    await closeSaveModal();
    return;
  }

  if (!title) {
    await showNotification('Enter a prompt title.');
    return;
  }

  const saved = await window.Store.savePrompt({ title, text: pendingPromptText, tags });

  if (!saved) {
    const storageError = window.Store?.getLastError?.() || '';
    if (window.Store?.isQuotaError?.(storageError)) {
      await showNotification('Storage quota exceeded. Delete older prompts/history, then try again.');
    } else {
      await showNotification('Save failed. Retry.');
    }
    return;
  }

  await showNotification('Prompt saved to library.');
  await closeSaveModal();
};

/** Binds modal save and cancel actions once for the injected save modal. */
const bindSaveModalEvents = async () => {
  const modal = await ensureSaveModal();

  if (modal.dataset.bound === 'true') {
    return;
  }

  const cancelButton = modal.querySelector('#pn-save-cancel');
  const confirmButton = modal.querySelector('#pn-save-confirm');
  const backdrop = modal.querySelector('[data-modal-close]');
  const tagBadgeInput = modal.querySelector('#pn-save-tags-input');
  const badgeWrap = modal.querySelector('#pn-tag-badges-wrap');
  const titleInput = modal.querySelector('#pn-save-title');

  cancelButton?.addEventListener('click', () => {
    void closeSaveModal();
  });

  confirmButton?.addEventListener('click', () => {
    // Add any pending tag text before saving
    if (tagBadgeInput && tagBadgeInput.value.trim()) {
      addTagBadge(tagBadgeInput.value);
      tagBadgeInput.value = '';
    }
    void confirmSavePrompt();
  });

  backdrop?.addEventListener('click', () => {
    void closeSaveModal();
  });

  titleInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    confirmButton?.click();
  });

  modal.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    void closeSaveModal();
  });

  if (tagBadgeInput) {
    tagBadgeInput.addEventListener('keydown', (e) => {
      const val = String(tagBadgeInput.value || '').trim();
      if ((e.key === ' ' || e.key === 'Enter' || e.key === ',') && val) {
        e.preventDefault();
        addTagBadge(val);
        tagBadgeInput.value = '';
      }
      if (e.key === 'Backspace' && !tagBadgeInput.value) {
        const badges = modal.querySelectorAll('#pn-tag-badges-wrap .pn-tag-badge');
        const last = badges[badges.length - 1];
        if (last) last.remove();
        syncBadgesToHidden();
      }
    });

    tagBadgeInput.addEventListener('blur', () => {
      const val = String(tagBadgeInput.value || '').trim();
      if (val) {
        addTagBadge(val);
        tagBadgeInput.value = '';
      }
    });
  }

  if (badgeWrap && tagBadgeInput) {
    badgeWrap.addEventListener('click', (e) => {
      if (e.target === badgeWrap) tagBadgeInput.focus();
    });
  }

  modal.dataset.bound = 'true';
};

/** Opens or closes the floating action menu and updates staggered animation delays. */
const toggleFabMenu = async (nextOpen = !isFabMenuOpen) => {
  const root = document.getElementById('pn-fab-root');

  if (!root) {
    return;
  }

  const menu = root.querySelector('#pn-fab-menu');
  const trigger = root.querySelector('#pn-fab-trigger');
  const triggerText = root.querySelector('.pn-fab-trigger__text');

  if (!menu || !trigger) {
    return;
  }

  isFabMenuOpen = Boolean(nextOpen);
  trigger.setAttribute('aria-expanded', isFabMenuOpen ? 'true' : 'false');
  menu.setAttribute('aria-hidden', isFabMenuOpen ? 'false' : 'true');
  if (triggerText) {
    triggerText.textContent = isFabMenuOpen ? 'Close' : 'Promptium';
  }

  if (isFabMenuOpen) {
    const actions = Array.from(menu.querySelectorAll('.pn-fab-action'));
    if (fabMenuCloseTimer) {
      clearTimeout(fabMenuCloseTimer);
      fabMenuCloseTimer = null;
    }

    actions.forEach((node, index) => {
      node.style.animationDelay = `${index * FAB_ACTION_STAGGER_MS}ms`;
    });

    menu.classList.remove('hidden');
    menu.classList.remove('pn-fab-menu--closing');
    menu.classList.add('pn-fab-menu--open');
    trigger.classList.add('open');
    const firstAction = actions[0];
    if (firstAction) {
      requestAnimationFrame(() => firstAction.focus());
    }
    return;
  }

  const actions = Array.from(menu.querySelectorAll('.pn-fab-action'));
  const reversed = [...actions].reverse();
  reversed.forEach((node, index) => {
    node.style.animationDelay = `${index * FAB_ACTION_STAGGER_MS}ms`;
  });
  menu.classList.remove('pn-fab-menu--open');
  menu.classList.add('pn-fab-menu--closing');
  trigger.classList.remove('open');
  const totalCloseMs = FAB_CLOSE_BASE_MS + (actions.length * FAB_ACTION_STAGGER_MS);
  if (fabMenuCloseTimer) {
    clearTimeout(fabMenuCloseTimer);
  }
  fabMenuCloseTimer = setTimeout(() => {
    fabMenuCloseTimer = null;
    if (isFabMenuOpen) return;
    menu.classList.remove('pn-fab-menu--closing');
    menu.classList.add('hidden');
    actions.forEach((node) => {
      node.style.animationDelay = '0ms';
    });
  }, totalCloseMs);
};

/** Handles prompt save action by opening the modal seeded with current input text. */
const onSavePromptClick = async (platform) => {
  const input = await getInputElement(platform);

  if (!input) {
    await showNotification('No chat input detected.');
    return;
  }

  const text = String(input.value || input.textContent || '').trim();

  if (!text) {
    await showNotification('Cannot save an empty prompt.');
    return;
  }

  await bindSaveModalEvents();
  await openSaveModal(text);
};

/** Opens side panel export with selected messages, falling back to all scraped messages if none selected. */
const onExportClick = async (platform) => {
  try {
    let messages = [];

    // 1. Check if the user manually selected specific checkboxes
    if (typeof window.__PN?.SidePanelExport?.getSelectedMessages === 'function') {
      const selected = window.__PN.SidePanelExport.getSelectedMessages();
      if (Array.isArray(selected) && selected.length > 0) {
        messages = selected;
      }
    }

    // 2. If no explicit selection has been made, trigger the selection UI with all checked
    if (messages.length === 0) {
      if (typeof window.__PN?.SidePanelExport?.activateSelectionModeAll === 'function') {
        const activated = window.__PN.SidePanelExport.activateSelectionModeAll();
        if (activated) {
          // The user is now in selection mode; they must click Export Selected in the FAB.
          return;
        }
      }
      
      // Fallback: If activateSelectionModeAll failed or isn't there, scrape everything
      messages = await window.Scraper.scrape(platform);
    }

    if (!messages || messages.length === 0) {
      await showNotification('No messages found in this chat.');
      return;
    }

    // Stage payload in trusted service worker session storage to avoid local persistence.
    const payload = {
      title: document.title?.slice(0, 80) || 'Chat Export',
      platform: String(platform || 'unknown'),
      url: window.location.href,
      createdAt: new Date().toISOString(),
      messages
    };

    const persisted = await chrome.runtime.sendMessage({ action: 'SET_SIDEPANEL_PAYLOAD', payload }).catch(() => null);
    if (!persisted?.ok) {
      await showNotification('Export staging failed.');
      return;
    }

    // Ask background to open side panel and navigate to export view
    chrome.runtime.sendMessage({ action: 'openExport' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[Promptium] Could not open export panel:', chrome.runtime.lastError.message);
        showNotification('Could not open export panel. Open Promptium from the extension icon.').catch(console.error);
      }
    });
  } catch (error) {
    console.error('[Promptium] Export flow failed:', error);
    await showNotification('Export failed. Retry.');
  }
};

/** Opens the side panel via background service worker. */
const onLibraryClick = () => {
  chrome.runtime.sendMessage({ action: 'openSidePanel' }, () => {
    if (chrome.runtime.lastError) {
      showNotification('Open Promptium from the extension icon.').catch(console.error);
    }
  });
};

/** Triggers Gemini Flash Lite to improve the current active prompt in the chat box. */
const onImprovePromptClick = async (platform) => {
  const input = await getInputElement(platform);
  const text = String(input?.value || input?.textContent || '').trim();

  if (!text) {
    await showNotification('Enter a prompt in chat first.');
    return;
  }

  showNotification('Opening optimizer...').catch(console.error);

  try {
    await chrome.storage.local.set({
      [IMPROVE_PAYLOAD_KEY]: {
        text,
        platform: String(platform || ''),
        createdAt: new Date().toISOString()
      }
    });
    chrome.runtime.sendMessage({ action: 'openSidePanel' });
  } catch (error) {
    console.error('[Promptium] Improve trigger fail:', error);
    await showNotification('Could not open optimizer.');
  }
};

// Listen for the improved prompt coming back from the side panel
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'APPLY_IMPROVED_PROMPT' && msg.text) {
    void (async () => {
      const runtimePlatform = await window.Platform.detect();
      const targetPlatform = String(msg.platform || runtimePlatform || '').trim() || null;
      const injected = await window.Injector.inject(String(msg.text), targetPlatform);
      if (injected) {
        await showNotification('Optimized prompt applied.');
      } else {
        await showNotification('Could not apply optimized prompt.');
      }
    })();
  }
});

/** Routes FAB action clicks to prompt save, export dialog, library guidance, or improvement. */
const handleFabAction = (platform, action) => {
  if (action === 'save-prompt') {
    onSavePromptClick(platform).catch(console.error);
    return;
  }

  if (action === 'export') {
    onExportClick(platform).catch(console.error);
    return;
  }

  if (action === 'library') {
    onLibraryClick();
    return;
  }

  if (action === 'improve-prompt') {
    onImprovePromptClick(platform).catch(console.error);
  }
};

/** Builds the floating action button root markup for Promptium actions. */
const createToolbar = async () => {
  const root = document.createElement('div');
  root.id = 'pn-fab-root';
  root.innerHTML = `
    <div id="pn-fab-menu" class="pn-fab-menu hidden">
      <button class="pn-fab-action" data-action="save-prompt" type="button" aria-label="Save current Prompt">
        <span class="pn-fab-icon"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg></span>
        <span class="pn-fab-copy">
          <span class="pn-fab-label">Save Prompt</span>
          <span class="pn-fab-sub">Store current input</span>
        </span>
      </button>
      <button class="pn-fab-action" data-action="export" type="button" aria-label="Export Chat Thread">
        <span class="pn-fab-icon"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg></span>
        <span class="pn-fab-copy">
          <span class="pn-fab-label">Export Chat</span>
          <span class="pn-fab-sub">Select and export messages</span>
        </span>
      </button>
      <button class="pn-fab-action" data-action="improve-prompt" type="button" aria-label="Improve current Prompt">
        <span class="pn-fab-icon"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></span>
        <span class="pn-fab-copy">
          <span class="pn-fab-label">Improve Prompt</span>
          <span class="pn-fab-sub">Optimize before sending</span>
        </span>
      </button>
      <button class="pn-fab-action" data-action="library" type="button" aria-label="Open Prompt Library">
        <span class="pn-fab-icon"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg></span>
        <span class="pn-fab-copy">
          <span class="pn-fab-label">Library</span>
          <span class="pn-fab-sub">Open Promptium workspace</span>
        </span>
      </button>
    </div>
    <button id="pn-fab-trigger" type="button" aria-label="Promptium Actions" aria-haspopup="menu" aria-expanded="false">
      <span class="pn-fab-logo-wrap" aria-hidden="true">
        <svg class="pn-fab-logo" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </span>
      <span class="pn-fab-trigger__text">Promptium</span>
    </button>
  `;

  return root;
};

/** Wires FAB menu interactions, close-on-outside-click behavior, and menu actions. */
const attachHandlers = async (platform) => {
  const root = document.getElementById('pn-fab-root');

  if (!root || root.dataset.bound === 'true') {
    return;
  }

  const trigger = root.querySelector('#pn-fab-trigger');
  const actions = Array.from(root.querySelectorAll('.pn-fab-action'));
  const menu = root.querySelector('#pn-fab-menu');
  activeFabRoot = root;

  if (menu) {
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-hidden', 'true');
  }
  actions.forEach((actionButton) => actionButton.setAttribute('role', 'menuitem'));

  trigger?.addEventListener('click', (event) => {
    event.stopPropagation();
    void toggleFabMenu();
  });

  actions.forEach((actionButton) => {
    actionButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      const actionLabel = String(actionButton.dataset.action || '');

      // Side panel UI requires synchronous user gesture propagation. Do not use async/await here.
      toggleFabMenu(false).catch(console.error);
      handleFabAction(platform, actionLabel);
    });
  });

  if (!fabGlobalListenersBound) {
    document.addEventListener('click', (event) => {
      if (!activeFabRoot || activeFabRoot.contains(event.target)) {
        return;
      }
      void toggleFabMenu(false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isFabMenuOpen) {
        void toggleFabMenu(false);
      }
    });

    window.addEventListener('scroll', () => {
      if (isFabMenuOpen) {
        void toggleFabMenu(false);
      }
    }, { passive: true });

    window.addEventListener('blur', () => {
      if (isFabMenuOpen) {
        void toggleFabMenu(false);
      }
    });

    fabGlobalListenersBound = true;
  }

  root.dataset.bound = 'true';
};

/** Injects the FAB root into document body when missing and binds event handlers once. */
const injectToolbar = async (platform) => {
  if (document.getElementById('pn-fab-root')) {
    toolbarInjected = true;
    return true;
  }

  if (!document.body) {
    return false;
  }

  const root = await createToolbar();
  document.body.appendChild(root);
  toolbarInjected = true;
  await attachHandlers(platform);
  return true;
};

/** Schedules a debounced FAB reinjection to avoid duplicate SPA navigation work. */
const scheduleReinject = async (platform) => {
  if (reinjectDebounceTimer) {
    clearTimeout(reinjectDebounceTimer);
  }

  reinjectDebounceTimer = setTimeout(() => {
    reinjectDebounceTimer = null;
    void injectToolbar(platform);
  }, 300);
};

/** Ensures observers are registered and reinjects FAB on SPA navigation changes. */
const waitAndInject = async (platform) => {
  await bindSaveModalEvents();
  await injectToolbar(platform);

  if (!toolbarObserver) {
    toolbarObserver = new MutationObserver(() => {
      if (!document.getElementById('pn-fab-root')) {
        toolbarInjected = false;
      }

      if (!toolbarInjected) {
        void scheduleReinject(platform);
      }
    });

    toolbarObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (!urlWatchInterval) {
    urlWatchInterval = setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        toolbarInjected = false;
        void scheduleReinject(platform);
      }
    }, 1000);
  }
};

const Toolbar = {
  createToolbar,
  attachHandlers,
  injectToolbar,
  waitAndInject,
  showNotification
};

if (typeof window !== 'undefined') {
  window.Toolbar = Toolbar;
}

})();
