/**
 * File: content/toolbar.js
 * Purpose: Injects and manages the PromptNest floating action button, save modal, and quick actions.
 * Communicates with: utils/platform.js, utils/storage.js, content/scraper.js, content/content.js, content/injector.js.
 */

let toolbarInjected = false;
let toolbarObserver = null;
let urlWatchInterval = null;
let lastUrl = window.location.href;
let pendingPromptText = '';
let reinjectDebounceTimer = null;
let isFabMenuOpen = false;

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
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2500);
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
  badge.innerHTML = `${cleanTag}<button type="button" class="pn-tag-badge__remove">×</button>`;

  badge.querySelector('.pn-tag-badge__remove')?.addEventListener('click', () => {
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
  modal.innerHTML = `
    <div class="pn-save-modal__backdrop" data-modal-close></div>
    <div class="pn-save-modal__panel">
      <h3 class="pn-save-modal__title">Save Prompt</h3>
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
    await showNotification('Please provide a prompt title.');
    return;
  }

  const saved = await window.Store.savePrompt({ title, text: pendingPromptText, tags });

  if (!saved) {
    await showNotification('Failed to save prompt. Try again.');
    return;
  }

  await showNotification('Prompt saved.');
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

  if (!menu || !trigger) {
    return;
  }

  isFabMenuOpen = Boolean(nextOpen);

  if (isFabMenuOpen) {
    const actions = Array.from(menu.querySelectorAll('.pn-fab-action'));

    actions.forEach((node, index) => {
      node.style.animationDelay = `${index * 60}ms`;
    });

    menu.classList.remove('hidden');
    trigger.classList.add('open');
    return;
  }

  menu.classList.add('hidden');
  trigger.classList.remove('open');
};

/** Handles prompt save action by opening the modal seeded with current input text. */
const onSavePromptClick = async (platform) => {
  const input = await getInputElement(platform);

  if (!input) {
    await showNotification('No input box detected.');
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

    // 2. If no explicit selection, fallback to exporting the entire conversation
    if (messages.length === 0) {
      messages = await window.Scraper.scrape(platform);
    }

    if (!messages || messages.length === 0) {
      await showNotification('No messages found in this conversation.');
      return;
    }

    // Stage scraped payload in local storage for the side panel to read
    const payload = {
      title: document.title?.slice(0, 80) || 'Chat Export',
      platform: String(platform || 'unknown'),
      url: window.location.href,
      createdAt: new Date().toISOString(),
      messages
    };

    await chrome.storage.local.set({ pnSidePanelPayload: payload });

    // Ask background to open side panel and navigate to export view
    chrome.runtime.sendMessage({ action: 'openExport' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[PromptNest] Could not open export panel:', chrome.runtime.lastError.message);
        showNotification('Could not open export panel. Try clicking the extension icon.').catch(console.error);
      }
    });
  } catch (error) {
    console.error('[PromptNest] Export flow failed:', error);
    await showNotification('Export failed. Try again.');
  }
};

/** Opens the side panel via background service worker. */
const onLibraryClick = () => {
  chrome.runtime.sendMessage({ action: 'openSidePanel' }, () => {
    if (chrome.runtime.lastError) {
      showNotification('Open PromptNest from the extension icon.').catch(console.error);
    }
  });
};

/** Triggers Gemini Flash Lite to improve the current active prompt in the chat box. */
const onImprovePromptClick = async (platform) => {
  const input = await getInputElement(platform);
  const text = String(input?.value || input?.textContent || '').trim();

  if (!text) {
    await showNotification('Type a prompt in the chat box first.');
    return;
  }

  showNotification('Improving prompt...').catch(console.error);

  try {
    const response = await window.AIBridge?.improvePrompt(text, [], 'general');
    if (response?.text) {
      if (input.value !== undefined) {
        input.value = response.text;
      } else {
        input.textContent = response.text;
      }
      // Dispatch input event so the React/Vue frameworks notice the change
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await showNotification('Prompt improved ✨');
    } else {
      await showNotification('Could not improve prompt.');
    }
  } catch (error) {
    console.error('[PromptNest] Improve fail:', error);
    await showNotification('Failed to improve prompt.');
  }
};

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

/** Builds the floating action button root markup for PromptNest actions. */
const createToolbar = async () => {
  const root = document.createElement('div');
  root.id = 'pn-fab-root';
  root.innerHTML = `
    <div id="pn-fab-menu" class="pn-fab-menu hidden">
      <button class="pn-fab-action" data-action="improve-prompt" type="button" aria-label="Improve current Prompt">
        <span class="pn-fab-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v19"></path><path d="M5 10l7-7 7 7"></path></svg></span>
        <span class="pn-fab-label">Improve</span>
      </button>
      <button class="pn-fab-action" data-action="save-prompt" type="button" aria-label="Save current Prompt">
        <span class="pn-fab-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg></span>
        <span class="pn-fab-label">Save Prompt</span>
      </button>
      <button class="pn-fab-action" data-action="export" type="button" aria-label="Export Chat Thread">
        <span class="pn-fab-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg></span>
        <span class="pn-fab-label">Export Chat</span>
      </button>
      <button class="pn-fab-action" data-action="library" type="button" aria-label="Open Prompt Library">
        <span class="pn-fab-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg></span>
        <span class="pn-fab-label">Library</span>
      </button>
    </div>
    <button id="pn-fab-trigger" type="button" aria-label="PromptNest Actions">
      <svg class="pn-fab-logo" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
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

  document.addEventListener('click', (event) => {
    if (!root.contains(event.target)) {
      void toggleFabMenu(false);
    }
  });

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
