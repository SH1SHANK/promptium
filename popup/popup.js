/**
 * File: popup/popup.js
 * Purpose: Controls popup tabs, renders prompts/history, and handles add/delete/inject actions.
 * Communicates with: utils/storage.js, content/content.js via runtime messaging.
 */

/** Returns popup element references used across handlers. */
const getElements = async () => ({
  tabButtons: Array.from(document.querySelectorAll('.pn-tab')),
  panels: Array.from(document.querySelectorAll('.pn-panel')),
  promptsList: document.getElementById('pn-prompts-list'),
  historyList: document.getElementById('pn-history-list'),
  modal: document.getElementById('pn-modal'),
  openModalButton: document.getElementById('pn-open-modal'),
  closeModalOverlay: document.getElementById('pn-modal-close'),
  cancelModalButton: document.getElementById('pn-cancel-modal'),
  savePromptButton: document.getElementById('pn-save-prompt'),
  promptTitleInput: document.getElementById('pn-prompt-title'),
  promptBodyInput: document.getElementById('pn-prompt-body')
});

/** Toggles active tab and panel state in popup UI. */
const switchTab = async (tabName) => {
  const elements = await getElements();

  elements.tabButtons.forEach((button) => {
    button.classList.toggle('pn-tab--active', button.dataset.tab === tabName);
  });

  elements.panels.forEach((panel) => {
    panel.classList.toggle('pn-panel--active', panel.dataset.panel === tabName);
  });
};

/** Sends text injection request to the active tab content script. */
const injectPromptToActiveTab = async (text) => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  if (!activeTab?.id) {
    return false;
  }

  await chrome.tabs.sendMessage(activeTab.id, {
    type: 'pn.injectPrompt',
    payload: { text }
  });

  return true;
};

/** Deletes a prompt entry and rerenders prompts list. */
const onDeletePrompt = async (promptId) => {
  await window.PromptNestStorage.deletePrompt(promptId);
  await renderPrompts();
};

/** Injects a prompt entry into the active page input. */
const onInjectPrompt = async (promptText) => {
  await injectPromptToActiveTab(promptText);
};

/** Deletes a history entry and rerenders history list. */
const onDeleteHistory = async (historyId) => {
  await window.PromptNestStorage.deleteChatHistory(historyId);
  await renderHistory();
};

/** Renders saved prompts with inject and delete controls. */
const renderPrompts = async () => {
  const elements = await getElements();
  const prompts = await window.PromptNestStorage.listPrompts();
  elements.promptsList.innerHTML = '';

  if (prompts.length === 0) {
    elements.promptsList.innerHTML = '<li class="pn-empty">No prompts saved yet.</li>';
    return;
  }

  prompts.forEach((prompt) => {
    const item = document.createElement('li');
    item.className = 'pn-item';
    item.innerHTML = `
      <div class="pn-item__content">
        <h3 class="pn-item__title">${prompt.title}</h3>
        <p class="pn-item__body">${prompt.body}</p>
      </div>
      <div class="pn-item__actions">
        <button class="pn-btn" data-action="inject">Inject</button>
        <button class="pn-btn pn-btn--danger" data-action="delete">Delete</button>
      </div>
    `;

    const injectButton = item.querySelector('[data-action="inject"]');
    const deleteButton = item.querySelector('[data-action="delete"]');

    if (injectButton) {
      injectButton.addEventListener('click', () => {
        void onInjectPrompt(prompt.body);
      });
    }

    if (deleteButton) {
      deleteButton.addEventListener('click', () => {
        void onDeletePrompt(prompt.id);
      });
    }

    elements.promptsList.appendChild(item);
  });
};

/** Renders chat history records with delete controls. */
const renderHistory = async () => {
  const elements = await getElements();
  const history = await window.PromptNestStorage.listChatHistory();
  elements.historyList.innerHTML = '';

  if (history.length === 0) {
    elements.historyList.innerHTML = '<li class="pn-empty">No history captured yet.</li>';
    return;
  }

  history.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'pn-item';
    item.innerHTML = `
      <div class="pn-item__content">
        <h3 class="pn-item__title">${entry.title}</h3>
        <p class="pn-item__meta">${entry.platform} · ${new Date(entry.createdAt).toLocaleString()}</p>
      </div>
      <div class="pn-item__actions">
        <button class="pn-btn pn-btn--danger" data-action="delete">Delete</button>
      </div>
    `;

    const deleteButton = item.querySelector('[data-action="delete"]');

    if (deleteButton) {
      deleteButton.addEventListener('click', () => {
        void onDeleteHistory(entry.id);
      });
    }

    elements.historyList.appendChild(item);
  });
};

/** Opens the add-prompt modal and resets input fields. */
const openModal = async () => {
  const elements = await getElements();
  elements.promptTitleInput.value = '';
  elements.promptBodyInput.value = '';
  elements.modal.classList.add('pn-modal--open');
  elements.modal.setAttribute('aria-hidden', 'false');
};

/** Closes the add-prompt modal. */
const closeModal = async () => {
  const elements = await getElements();
  elements.modal.classList.remove('pn-modal--open');
  elements.modal.setAttribute('aria-hidden', 'true');
};

/** Saves a new prompt from modal inputs and refreshes list state. */
const savePrompt = async () => {
  const elements = await getElements();
  const title = elements.promptTitleInput.value.trim();
  const body = elements.promptBodyInput.value.trim();

  if (!body) {
    return;
  }

  await window.PromptNestStorage.createPrompt({
    title: title || 'Untitled prompt',
    body,
    tags: []
  });

  await closeModal();
  await renderPrompts();
  await switchTab('prompts');
};

/** Wires popup tabs, modal controls, and action buttons. */
const bindEvents = async () => {
  const elements = await getElements();

  elements.tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      void switchTab(button.dataset.tab);
    });
  });

  elements.openModalButton.addEventListener('click', () => {
    void openModal();
  });

  elements.closeModalOverlay.addEventListener('click', () => {
    void closeModal();
  });

  elements.cancelModalButton.addEventListener('click', () => {
    void closeModal();
  });

  elements.savePromptButton.addEventListener('click', () => {
    void savePrompt();
  });
};

/** Boots popup rendering and event listeners. */
const initPopup = async () => {
  await bindEvents();
  await renderPrompts();
  await renderHistory();
  await switchTab('prompts');
};

/** Runs popup initialization after DOM content is loaded. */
const onDomReady = async () => {
  await initPopup();
};

document.addEventListener('DOMContentLoaded', onDomReady);
