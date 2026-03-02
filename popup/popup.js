/**
 * File: popup/popup.js
 * Purpose: Implements popup tabs, semantic prompt search, auto-tagging, duplicate checks, and export actions.
 * Communicates with: utils/platform.js, utils/storage.js, utils/exporter.js, utils/ai.js, content/content.js.
 */

let pendingDuplicatePayload = null;
let popupBootstrapped = false;
let _searchTimer = null;
const TEXT_CLAMP_LENGTH = 180;
const COPY_FEEDBACK_RESET_MS = 1200;
const SEARCH_DEBOUNCE_MS = 150;

/** Formats a relative time string from an ISO date (e.g. '3 hours ago'). */
const formatRelativeTime = (isoDate) => {
  try {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(isoDate).toLocaleDateString();
  } catch { return ''; }
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

/** Renders one prompt card with inject, copy, and delete actions. */
const createPromptCard = async (prompt, activeFilter, canInject) => {
  const isTemplate = !!prompt.isTemplate;
  const card = document.createElement('article');
  card.className = 'pn-prompt-card' + (isTemplate ? ' pn-prompt-card--template' : '');

  // Template badge
  if (isTemplate) {
    const badge = document.createElement('div');
    badge.className = 'pn-template-badge';
    badge.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>TEMPLATE${prompt.category ? ' • ' + prompt.category : ''}`;
    card.appendChild(badge);
  }

  // Semantic relevance badge (if present)
  if (!isTemplate && typeof prompt._semanticScore === 'number') {
    const relevance = document.createElement('div');
    relevance.className = 'pn-relevance-badge';
    relevance.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>${(prompt._semanticScore * 100).toFixed(0)}%`;
    card.appendChild(relevance);
  }

  // Title
  const title = document.createElement('h3');
  title.className = 'pn-card-title';
  title.textContent = prompt.title;
  card.appendChild(title);

  // Meta info (character count, date)
  const meta = document.createElement('p');
  meta.className = 'pn-card-meta pn-card-meta--subtle';
  const charCount = (prompt.text || '').length;
  const createdLabel = prompt.createdAt ? formatRelativeTime(prompt.createdAt) : '';
  meta.textContent = isTemplate
    ? `${charCount} chars • ${prompt.category || 'General'}`
    : `${charCount} chars${createdLabel ? ` • ${createdLabel}` : ''}`;
  card.appendChild(meta);

  // Text with clamp
  const textWrap = document.createElement('div');
  textWrap.className = 'pn-card-text-wrap';
  const textEl = document.createElement('p');
  textEl.className = 'pn-card-text';
  const fullText = String(prompt.text || '');
  const isClamped = fullText.length > TEXT_CLAMP_LENGTH;
  textEl.textContent = isClamped ? fullText.slice(0, TEXT_CLAMP_LENGTH) + '…' : fullText;
  textWrap.appendChild(textEl);

  if (isClamped) {
    const toggle = document.createElement('button');
    toggle.className = 'pn-text-toggle';
    toggle.type = 'button';
    toggle.textContent = 'Show more';
    let expanded = false;
    toggle.addEventListener('click', () => {
      expanded = !expanded;
      textEl.textContent = expanded ? fullText : fullText.slice(0, TEXT_CLAMP_LENGTH) + '…';
      toggle.textContent = expanded ? 'Show less' : 'Show more';
    });
    textWrap.appendChild(toggle);
  }
  card.appendChild(textWrap);

  // Tags
  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'pn-tag-wrap';
  for (const tag of prompt.tags || []) {
    tagsWrap.appendChild(await createTagPill(tag));
  }
  if (prompt.tags?.length) card.appendChild(tagsWrap);

  // Actions row
  const actions = document.createElement('div');
  actions.className = 'pn-card-actions';

  // Inject button
  const injectButton = document.createElement('button');
  injectButton.className = 'pn-btn pn-btn--ghost pn-btn-icon-label';
  injectButton.type = 'button';
  injectButton.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M10 14L21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>Inject`;
  if (!canInject) {
    injectButton.disabled = true;
    injectButton.title = 'Open on a supported LLM page';
  } else {
    injectButton.title = 'Inject into active chat';
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

  // Copy button
  const copyButton = document.createElement('button');
  copyButton.className = 'pn-btn pn-btn--ghost pn-btn-icon-label';
  copyButton.type = 'button';
  copyButton.title = 'Copy to clipboard';
  copyButton.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" class="pn-btn-icon" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>Copy`;
  copyButton.addEventListener('click', () => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(prompt.text);
        copyButton.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" class="pn-btn-icon" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>Copied!`;
        copyButton.classList.add('pn-btn--copied');
        setTimeout(() => {
          copyButton.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" class="pn-btn-icon" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>Copy`;
          copyButton.classList.remove('pn-btn--copied');
        }, COPY_FEEDBACK_RESET_MS);
      } catch {
        await showToast('Copy failed.');
      }
    })();
  });

  if (isTemplate) {
    // Save to My Prompts button (templates only)
    const saveBtn = document.createElement('button');
    saveBtn.className = 'pn-btn pn-btn--primary pn-btn-icon-label pn-ml-auto';
    saveBtn.type = 'button';
    saveBtn.title = 'Save this template to your prompt library';
    saveBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" class="pn-btn-icon" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>Save to My Prompts`;
    saveBtn.addEventListener('click', () => {
      void (async () => {
        const saved = await window.Store.savePrompt({
          title: prompt.title,
          text: prompt.text,
          tags: [...(prompt.tags || [])]
        });
        if (saved) {
          saveBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" class="pn-btn-icon" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>Saved!`;
          saveBtn.disabled = true;
          await showToast('Template saved to library.');
        } else {
          await showToast('Template save failed.');
        }
      })();
    });
    actions.appendChild(injectButton);
    actions.appendChild(copyButton);
    actions.appendChild(saveBtn);
  } else {
    // Improve button (user prompts only)
    const improveButton = document.createElement('button');
    improveButton.className = 'pn-btn pn-btn--ghost pn-btn-icon-label';
    improveButton.type = 'button';
    improveButton.title = 'Improve prompt (Side Panel)';
    improveButton.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" class="pn-btn-icon" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#a49aff"><path d="M12 3v19"></path><path d="M5 10l7-7 7 7"></path></svg>Improve`;
    improveButton.addEventListener('click', () => {
      window.open(chrome.runtime.getURL('sidepanel/sidepanel.html'), '_blank');
    });

    // Delete button (user prompts only)
    const deleteButton = document.createElement('button');
    deleteButton.className = 'pn-btn pn-btn-danger pn-btn-icon-label pn-ml-auto';
    deleteButton.type = 'button';
    deleteButton.title = 'Delete prompt';
    deleteButton.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    deleteButton.addEventListener('click', () => {
      void (async () => {
        const deleted = await window.Store.deletePrompt(prompt.id);
        if (!deleted) {
          await showToast('Delete failed.');
          return;
        }
        await renderPrompts(activeFilter);
      })();
    });
    actions.appendChild(injectButton);
    actions.appendChild(copyButton);
    actions.appendChild(improveButton);
    actions.appendChild(deleteButton);
  }

  card.appendChild(actions);
  return card;
};

/** Renders one history card with improved layout and actions. */
const createHistoryCard = async (entry) => {
  const card = document.createElement('article');
  card.className = 'pn-history-card';

  const title = document.createElement('h3');
  title.className = 'pn-card-title';
  title.textContent = entry.title || 'Untitled chat';

  const meta = document.createElement('p');
  meta.className = 'pn-card-meta pn-card-meta--subtle';
  const platform = String(entry.platform || 'unknown').toUpperCase();
  const relTime = entry.createdAt ? formatRelativeTime(entry.createdAt) : '';
  const msgCount = entry.messages?.length || 0;
  meta.textContent = `${platform} • ${relTime}${msgCount ? ` • ${msgCount} msg${msgCount === 1 ? '' : 's'}` : ''}`;

  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'pn-tag-wrap';
  for (const tag of entry.tags || []) {
    tagsWrap.appendChild(await createTagPill(tag));
  }

  const actions = document.createElement('div');
  actions.className = 'pn-card-actions';

  const pdfButton = document.createElement('button');
  pdfButton.className = 'pn-btn pn-btn--ghost pn-btn-icon-label';
  pdfButton.type = 'button';
  pdfButton.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>Export`;
  pdfButton.addEventListener('click', () => {
    void (async () => {
      const result = await window.Exporter.exportChat(entry, 'pdf');
      if (!result.ok) {
        await showToast(result.error || 'PDF export failed.');
      }
    })();
  });

  const deleteButton = document.createElement('button');
  deleteButton.className = 'pn-btn pn-btn-danger pn-btn-icon-label pn-ml-auto';
  deleteButton.type = 'button';
  deleteButton.title = 'Delete history entry';
  deleteButton.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
  deleteButton.addEventListener('click', () => {
    void (async () => {
      const deleted = await window.Store.deleteChatFromHistory(entry.id);
      if (!deleted) {
        await showToast('Delete failed.');
        return;
      }
      await renderHistory();
    })();
  });

  actions.appendChild(pdfButton);
  actions.appendChild(deleteButton);
  card.appendChild(title);
  card.appendChild(meta);
  if (entry.tags?.length) card.appendChild(tagsWrap);
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
  const filterStr = String(filter || '').trim().toLowerCase();

  container.innerHTML = '';

  // -- User prompts --
  if (filtered.length) {
    for (const prompt of filtered) {
      container.appendChild(await createPromptCard(prompt, filterStr, tabContext.supported));
    }
  } else if (prompts.length && filterStr) {
    container.appendChild(createEmptyState({
      title: 'No results found',
      message: 'Try a broader query or clear active filters.',
      actionLabel: 'Clear Filters',
      onAction: () => {
        const searchInput = document.getElementById('prompt-search');
        if (searchInput) {
          searchInput.value = '';
        }
        void renderPrompts('');
      }
    }));
  } else if (!prompts.length) {
    container.appendChild(createEmptyState({
      title: 'No Prompts Available',
      message: 'Create your first prompt to start your library.',
      actionLabel: 'Add Prompt',
      onAction: () => { void openModal(); }
    }));
  }

  // -- Templates section --
  if (window.PromptTemplates) {
    const templates = window.PromptTemplates.getTemplates(filterStr);

    if (templates.length) {
      // Section header
      const section = document.createElement('div');
      section.className = 'pn-templates-section';

      const header = document.createElement('button');
      header.className = 'pn-templates-header';
      header.type = 'button';
      header.innerHTML = `<svg class="pn-templates-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>Templates <span class="pn-templates-count">${templates.length}</span>`;

      const body = document.createElement('div');
      body.className = 'pn-templates-body';

      // Collapsed by default if user has their own prompts
      let expanded = !prompts.length;
      body.style.display = expanded ? 'block' : 'none';
      if (expanded) header.classList.add('pn-templates-header--open');

      header.addEventListener('click', () => {
        expanded = !expanded;
        body.style.display = expanded ? 'block' : 'none';
        header.classList.toggle('pn-templates-header--open', expanded);
      });

      section.appendChild(header);

      for (const tpl of templates) {
        body.appendChild(await createPromptCard(tpl, filterStr, tabContext.supported));
      }

      section.appendChild(body);
      container.appendChild(section);
    }
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
  const tagsInput = await byId('prompt-tags-input');
  const badgeWrap = document.getElementById('tag-badges-wrap');

  if (title) {
    title.value = '';
  }

  if (text) {
    text.value = '';
  }

  if (tags) {
    tags.value = '';
  }

  if (tagsInput) {
    tagsInput.value = '';
  }

  if (badgeWrap) {
    badgeWrap.querySelectorAll('.pn-tag-badge').forEach((b) => b.remove());
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
    const storageError = window.Store?.getLastError?.() || '';
    if (window.Store?.isQuotaError?.(storageError)) {
      await showToast('Storage quota exceeded. Delete older prompts or history items, then retry.');
    } else {
      await showToast('Save failed.');
    }
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
  const tagBadgeInput = await byId('prompt-tags-input');

  if (!titleInput || !textInput || !tagsInput) {
    return;
  }

  const titleValue = String(titleInput.value || '').trim();
  const textValue = String(textInput.value || '').trim();

  if (!titleValue || !textValue) {
    await showToast('Title and prompt are required.');
    return;
  }

  if (tagBadgeInput && tagBadgeInput.value.trim()) {
    addTagBadge(tagBadgeInput.value);
    tagBadgeInput.value = '';
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

    await showToast(`Similar prompt found: ${duplicate.match?.title || 'Untitled'}. Save anyway?`);
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
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      void renderPrompts(String(target?.value || ''));
    }, SEARCH_DEBOUNCE_MS);
  });

  window.addEventListener('resize', () => {
    void updateTabIndicator();
  });

  const tagBadgeInput = await byId('prompt-tags-input');
  if (tagBadgeInput) {
    tagBadgeInput.addEventListener('keydown', (e) => {
      const val = String(tagBadgeInput.value || '').trim();
      if ((e.key === ' ' || e.key === 'Enter' || e.key === ',') && val) {
        e.preventDefault();
        addTagBadge(val);
        tagBadgeInput.value = '';
      }
      if (e.key === 'Backspace' && !tagBadgeInput.value) {
        const badges = document.querySelectorAll('#tag-badges-wrap .pn-tag-badge');
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

  const badgeWrap = document.getElementById('tag-badges-wrap');
  if (badgeWrap && tagBadgeInput) {
    badgeWrap.addEventListener('click', (e) => {
      if (e.target === badgeWrap) tagBadgeInput.focus();
    });
  }
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
