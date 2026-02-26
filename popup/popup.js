/**
 * File: popup/popup.js
 * Purpose: Implements popup tabs, semantic prompt search, auto-tagging, duplicate checks, and export actions.
 * Communicates with: utils/platform.js, utils/storage.js, utils/exporter.js, utils/ai.js, content/content.js.
 */

let pendingDuplicatePayload = null;
let popupBootstrapped = false;

/** Returns a required popup DOM node by id. */
const byId = async (id) => document.getElementById(id);

/** Converts a comma-separated tag string into a normalized string array. */
const parseTags = async (raw) => String(raw || '').split(',').map((item) => item.trim()).filter(Boolean);

/** Creates and displays a short-lived popup toast notification. */
const showToast = async (message) => {
  const toast = document.createElement('div');
  toast.className = 'pn-toast';
  toast.textContent = String(message || '').trim();
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2500);
};

/** Returns true when a URL belongs to one of PromptNest's supported LLM platforms. */
const isSupportedTabUrl = async (url) => {
  const value = String(url || '').toLowerCase();
  return [
    'https://chatgpt.com/',
    'https://claude.ai/',
    'https://gemini.google.com/',
    'https://www.perplexity.ai/',
    'https://copilot.microsoft.com/'
  ].some((prefix) => value.startsWith(prefix));
};

/** Returns active tab metadata with support status and id fields. */
const getActiveTabContext = async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0] || null;

  return {
    tabId: tab?.id || null,
    url: tab?.url || '',
    supported: await isSupportedTabUrl(tab?.url || '')
  };
};

/** Sends an action message to the active tab content script. */
const sendToActiveTab = async (payload) => {
  const context = await getActiveTabContext();

  if (!context.tabId) {
    return { ok: false, error: 'No active tab found.' };
  }

  try {
    return await chrome.tabs.sendMessage(context.tabId, payload);
  } catch (error) {
    return { ok: false, error: error.message || 'Unable to reach content script.' };
  }
};

/** Builds a reusable tag pill element for prompt and history cards. */
const createTagPill = async (tag) => {
  const pill = document.createElement('span');
  pill.className = 'pn-tag-pill';
  pill.textContent = tag;
  return pill;
};

/** Creates a styled empty state block with inline SVG icon and copy. */
const createEmptyState = async (message) => {
  const state = document.createElement('div');
  state.className = 'pn-empty-state';
  state.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 6.5h16v11H4z"></path>
      <path d="M8 10h8"></path>
      <path d="M8 13h5"></path>
    </svg>
    <p>${message}</p>
  `;
  return state;
};

/** Hides duplicate confirmation controls and clears pending duplicate save state. */
const resetDuplicateState = async () => {
  pendingDuplicatePayload = null;
  const confirmButton = await byId('confirm-duplicate');
  confirmButton?.classList.add('hidden');
};

/** Moves the tab indicator under the currently active tab button. */
const updateTabIndicator = async () => {
  return;
};

/** Renders one prompt card with inject and delete actions. */
const createPromptCard = async (prompt, activeFilter, canInject) => {
  const card = document.createElement('article');
  card.className = 'pn-prompt-card';

  const title = document.createElement('h3');
  title.className = 'pn-card-title';
  title.textContent = prompt.title;

  const text = document.createElement('p');
  text.className = 'pn-card-text';
  text.textContent = prompt.text;

  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'pn-tag-wrap';

  for (const tag of prompt.tags || []) {
    tagsWrap.appendChild(await createTagPill(tag));
  }

  const actions = document.createElement('div');
  actions.className = 'pn-card-actions';

  const injectButton = document.createElement('button');
  injectButton.className = 'pn-btn pn-btn--ghost';
  injectButton.type = 'button';
  injectButton.textContent = 'Inject';

  if (!canInject) {
    injectButton.disabled = true;
    injectButton.title = 'Open on a supported LLM page';
  } else {
    injectButton.addEventListener('click', () => {
      void (async () => {
        const response = await sendToActiveTab({ action: 'injectPrompt', text: prompt.text });

        if (!response?.ok) {
          await showToast(response?.error || 'Inject failed.');
          return;
        }

        window.close();
      })();
    });
  }

  const deleteButton = document.createElement('button');
  deleteButton.className = 'pn-btn pn-btn-danger';
  deleteButton.type = 'button';
  deleteButton.textContent = 'Delete';

  deleteButton.addEventListener('click', () => {
    void (async () => {
      const deleted = await window.Store.deletePrompt(prompt.id);

      if (!deleted) {
        await showToast('Failed to delete prompt.');
        return;
      }

      await renderPrompts(activeFilter);
    })();
  });

  if (typeof prompt._semanticScore === 'number') {
    const relevance = document.createElement('p');
    relevance.className = 'pn-relevance';
    relevance.textContent = `Relevance: ${(prompt._semanticScore * 100).toFixed(0)}%`;
    card.appendChild(relevance);
  }

  actions.appendChild(injectButton);
  actions.appendChild(deleteButton);
  card.appendChild(title);
  card.appendChild(text);
  card.appendChild(tagsWrap);
  card.appendChild(actions);
  return card;
};

/** Renders one history card with delete and popup-only PDF export actions. */
const createHistoryCard = async (entry) => {
  const card = document.createElement('article');
  card.className = 'pn-history-card';

  const title = document.createElement('h3');
  title.className = 'pn-card-title';
  title.textContent = entry.title || 'Untitled chat';

  const meta = document.createElement('p');
  meta.className = 'pn-card-meta';
  meta.textContent = `${String(entry.platform || 'unknown').toUpperCase()} • ${new Date(entry.createdAt).toLocaleString()}`;

  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'pn-tag-wrap';

  for (const tag of entry.tags || []) {
    tagsWrap.appendChild(await createTagPill(tag));
  }

  const actions = document.createElement('div');
  actions.className = 'pn-card-actions';

  const pdfButton = document.createElement('button');
  pdfButton.className = 'pn-btn pn-btn--ghost';
  pdfButton.type = 'button';
  pdfButton.textContent = 'Export PDF';

  pdfButton.addEventListener('click', () => {
    void (async () => {
      const result = await window.Exporter.exportChat(entry, 'pdf');

      if (!result.ok) {
        await showToast(result.error || 'PDF export failed.');
      }
    })();
  });

  const deleteButton = document.createElement('button');
  deleteButton.className = 'pn-btn pn-btn-danger';
  deleteButton.type = 'button';
  deleteButton.textContent = 'Delete';

  deleteButton.addEventListener('click', () => {
    void (async () => {
      const deleted = await window.Store.deleteChatFromHistory(entry.id);

      if (!deleted) {
        await showToast('Failed to delete history item.');
        return;
      }

      await renderHistory();
    })();
  });

  actions.appendChild(pdfButton);
  actions.appendChild(deleteButton);
  card.appendChild(title);
  card.appendChild(meta);
  card.appendChild(tagsWrap);
  card.appendChild(actions);
  return card;
};

/** Shows one tab panel and marks the matching tab as active. */
const switchTab = async (tabName) => {
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const panes = Array.from(document.querySelectorAll('.tab-content'));

  tabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  panes.forEach((pane) => {
    pane.classList.toggle('active', pane.dataset.tab === tabName);
  });

  await updateTabIndicator();
};

/** Uses AI semantic ranking when possible and keyword filtering as fallback. */
const filterPrompts = async (filter, prompts) => {
  const normalizedFilter = String(filter || '').trim();

  if (!normalizedFilter) {
    return prompts;
  }

  return window.AI.semanticSearch(normalizedFilter, prompts);
};

/** Renders prompts list with semantic or keyword filtering based on AI availability. */
const renderPrompts = async (filter = '') => {
  const container = await byId('prompt-list');

  if (!container) {
    return;
  }

  const prompts = await window.Store.getPrompts();
  const filtered = await filterPrompts(filter, prompts);
  const tabContext = await getActiveTabContext();

  container.innerHTML = '';

  if (!prompts.length) {
    container.appendChild(
      await createEmptyState('No prompts saved yet. Use the toolbar on any LLM to save your first prompt.')
    );
    return;
  }

  if (!filtered.length) {
    container.appendChild(await createEmptyState('No prompts found for your current search.'));
    return;
  }

  for (const prompt of filtered) {
    container.appendChild(await createPromptCard(prompt, String(filter || '').trim().toLowerCase(), tabContext.supported));
  }
};

/** Renders chat history cards from newest to oldest entries. */
const renderHistory = async () => {
  const container = await byId('history-list');

  if (!container) {
    return;
  }

  const history = await window.Store.getChatHistory();
  const reversed = [...history].reverse();
  container.innerHTML = '';

  if (!reversed.length) {
    container.appendChild(
      await createEmptyState('No chat history yet. Export a chat from the toolbar to get started.')
    );
    return;
  }

  for (const entry of reversed) {
    container.appendChild(await createHistoryCard(entry));
  }
};

/** Calls AI tag suggestion and pre-fills the tags field when it is still empty. */
const prefillSuggestedTags = async () => {
  const textInput = await byId('prompt-text');
  const tagsInput = await byId('prompt-tags');

  if (!textInput || !tagsInput) {
    return;
  }

  if (String(tagsInput.value || '').trim()) {
    return;
  }

  const suggestions = await window.AI.suggestTags(String(textInput.value || '').trim());

  if (suggestions.length) {
    tagsInput.value = suggestions.join(', ');
  }
};

/** Opens the add prompt modal and clears all input fields. */
const openModal = async () => {
  const modal = await byId('add-modal');
  const title = await byId('prompt-title');
  const text = await byId('prompt-text');
  const tags = await byId('prompt-tags');

  if (title) {
    title.value = '';
  }

  if (text) {
    text.value = '';
  }

  if (tags) {
    tags.value = '';
  }

  await resetDuplicateState();
  modal?.classList.remove('pn-hidden');
};

/** Closes the add prompt modal and resets duplicate confirmation state. */
const closeModal = async () => {
  const modal = await byId('add-modal');
  modal?.classList.add('pn-hidden');
  await resetDuplicateState();
};

/** Saves a prompt payload with AI embedding support and refreshes list output. */
const persistPrompt = async (payload) => {
  const embeddingVector = await window.AI.embedText(payload.text);
  const saved = await window.Store.savePrompt({
    ...payload,
    embedding: embeddingVector ? Array.from(embeddingVector) : null
  });

  if (!saved) {
    await showToast('Failed to save prompt.');
    return false;
  }

  await closeModal();
  await renderPrompts(String((await byId('prompt-search'))?.value || ''));
  return true;
};

/** Handles duplicate confirmation path after user explicitly chooses to save anyway. */
const saveDuplicateAnyway = async () => {
  if (!pendingDuplicatePayload) {
    return;
  }

  await persistPrompt(pendingDuplicatePayload);
};

/** Saves a new prompt from modal fields with suggestions and duplicate checks. */
const savePromptFromModal = async () => {
  const titleInput = await byId('prompt-title');
  const textInput = await byId('prompt-text');
  const tagsInput = await byId('prompt-tags');

  if (!titleInput || !textInput || !tagsInput) {
    return;
  }

  const titleValue = String(titleInput.value || '').trim();
  const textValue = String(textInput.value || '').trim();

  if (!titleValue || !textValue) {
    await showToast('Title and prompt text are required.');
    return;
  }

  await prefillSuggestedTags();
  const tags = await parseTags(tagsInput.value || '');
  const payload = {
    title: titleValue,
    text: textValue,
    tags,
    category: null
  };

  const existingPrompts = await window.Store.getPrompts();
  const duplicate = await window.AI.isDuplicate(textValue, existingPrompts);

  if (duplicate.duplicate) {
    pendingDuplicatePayload = payload;
    const confirmButton = await byId('confirm-duplicate');

    if (confirmButton) {
      confirmButton.classList.remove('hidden');
    }

    await showToast(`Similar prompt already saved: ${duplicate.match?.title || 'Untitled'}. Save anyway?`);
    return;
  }

  await persistPrompt(payload);
};

/** Wires static popup event handlers for tabs, modal controls, and search field. */
const bindEvents = async () => {
  const addPromptButton = await byId('add-prompt-btn');
  const saveButton = await byId('save-new-prompt');
  const confirmDuplicateButton = await byId('confirm-duplicate');
  const cancelButton = await byId('cancel-modal');
  const searchInput = await byId('prompt-search');
  const promptText = await byId('prompt-text');
  const modalBackdrop = document.querySelector('[data-close-modal]');
  const tabs = Array.from(document.querySelectorAll('.tab'));

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      void switchTab(String(tab.dataset.tab || 'prompts'));
    });
  });

  addPromptButton?.addEventListener('click', () => {
    void openModal();
  });

  saveButton?.addEventListener('click', () => {
    void savePromptFromModal();
  });

  confirmDuplicateButton?.addEventListener('click', () => {
    void saveDuplicateAnyway();
  });

  cancelButton?.addEventListener('click', () => {
    void closeModal();
  });

  modalBackdrop?.addEventListener('click', () => {
    void closeModal();
  });

  promptText?.addEventListener('blur', () => {
    void prefillSuggestedTags();
  });

  searchInput?.addEventListener('input', (event) => {
    const target = event.target;
    void renderPrompts(String(target?.value || ''));
  });

  window.addEventListener('resize', () => {
    void updateTabIndicator();
  });
};

/** Boots the main popup UI once and optionally skips duplicate AI init after onboarding setup. */
const bootstrapMainUi = async ({ skipAiInit = false } = {}) => {
  if (popupBootstrapped) {
    return;
  }

  popupBootstrapped = true;

  if (!skipAiInit) {
    await window.AI.initModel();
  }

  await bindEvents();
  await switchTab('prompts');
  await renderPrompts();
  await renderHistory();

  const prompts = await window.Store.getPrompts();
  void window.AI.rehydratePromptEmbeddings(prompts);
  await updateTabIndicator();
};

/** Initializes popup with first-run onboarding gate and falls through to normal UI boot flow. */
const init = async () => {
  const data = await chrome.storage.local.get(['onboardingComplete']);

  if (!data?.onboardingComplete && window.Onboarding?.start) {
    await window.Onboarding.start({
      onComplete: async ({ aiInitialized = false } = {}) => {
        await bootstrapMainUi({ skipAiInit: aiInitialized });
      }
    });
    return;
  }

  await bootstrapMainUi();
};

/** Starts popup initialization when DOM content loading completes. */
const onDomLoaded = async () => {
  await init();
};

document.addEventListener('DOMContentLoaded', onDomLoaded);
