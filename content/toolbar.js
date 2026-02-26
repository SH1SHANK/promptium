/**
 * File: content/toolbar.js
 * Purpose: Injects and manages the PromptNest floating action button, save modal, and quick actions.
 * Communicates with: utils/platform.js, utils/storage.js, content/scraper.js, content/export-dialog.js, content/injector.js.
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
        <span>Tags (comma separated)</span>
        <input id="pn-save-tags" type="text" placeholder="research, coding" />
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
  const tagsInput = modal.querySelector('#pn-save-tags');
  pendingPromptText = String(currentText || '').trim();

  if (titleInput) {
    titleInput.value = '';
  }

  if (tagsInput) {
    tagsInput.value = '';
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
  const tagsInput = modal.querySelector('#pn-save-tags');
  const title = String(titleInput?.value || '').trim();
  const tagsValue = String(tagsInput?.value || '').trim();
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

  cancelButton?.addEventListener('click', () => {
    void closeSaveModal();
  });

  confirmButton?.addEventListener('click', () => {
    void confirmSavePrompt();
  });

  backdrop?.addEventListener('click', () => {
    void closeSaveModal();
  });

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

/** Opens the unified export dialog after collecting current chat messages. */
const onExportClick = async (platform) => {
  const messages = await window.Scraper.scrape(platform);

  if (!messages.length) {
    await showNotification('No chat messages found to export.');
    return;
  }

  if (!window.ExportDialog || typeof window.ExportDialog.open !== 'function') {
    await showNotification('Export dialog is unavailable on this page.');
    return;
  }

  await window.ExportDialog.open({
    platform,
    title: document.title || 'Untitled chat',
    messages,
    showNotification
  });
};

/** Handles library action by guiding users to the popup entrypoint. */
const onLibraryClick = async () => {
  await showNotification('Open PromptNest popup to browse your prompt library (Alt+Shift+P).');
};

/** Routes FAB action clicks to prompt save, export dialog, or library guidance. */
const handleFabAction = async (platform, action) => {
  if (action === 'save-prompt') {
    await onSavePromptClick(platform);
    return;
  }

  if (action === 'export') {
    await onExportClick(platform);
    return;
  }

  if (action === 'library') {
    await onLibraryClick();
  }
};

/** Builds the floating action button root markup for PromptNest actions. */
const createToolbar = async () => {
  const root = document.createElement('div');
  root.id = 'pn-fab-root';
  root.innerHTML = `
    <div id="pn-fab-menu" class="pn-fab-menu hidden">
      <button class="pn-fab-action" data-action="save-prompt" type="button">
        <span class="pn-fab-icon">💾</span>
        <span class="pn-fab-label">Save Prompt</span>
      </button>
      <button class="pn-fab-action" data-action="export" type="button">
        <span class="pn-fab-icon">↑</span>
        <span class="pn-fab-label">Export Chat</span>
      </button>
      <button class="pn-fab-action" data-action="library" type="button">
        <span class="pn-fab-icon">⌘</span>
        <span class="pn-fab-label">Prompt Library</span>
      </button>
    </div>
    <button id="pn-fab-trigger" type="button" aria-label="Toggle PromptNest actions">
      <span class="pn-fab-logo">PN</span>
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
      event.stopPropagation();
      void (async () => {
        await toggleFabMenu(false);
        await handleFabAction(platform, String(actionButton.dataset.action || ''));
      })();
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
