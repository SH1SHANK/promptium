(() => {
/**
 * File: sidepanel/prompts-ui.js
 * Purpose: Prompt list rendering, filtering, search controls, and smart suggestions.
 */

const { state, UI_FEEDBACK_MS } = window.SidepanelState;

const callbacks = {
  onOpenImprove: null,
  onPromptsMutated: null
};

const TEMPLATE_FILTER_DEFAULT = 'all';
let activeTemplateFilter = TEMPLATE_FILTER_DEFAULT;
let templateFiltersBound = false;
let curatedExpanded = false;

const normalizePromptText = (text) => {
  if (window.TemplateParser?.normalizeLegacy) {
    return window.TemplateParser.normalizeLegacy(text);
  }
  return String(text || '');
};

const getTemplateVars = (text) => {
  const normalized = normalizePromptText(text);
  if (window.TemplateParser?.parse) {
    return window.TemplateParser.parse(normalized);
  }
  return [];
};

const sidepanelKeywordFilter = async (query, prompts) => {
  const normalized = String(query || '').trim().toLowerCase();

  if (!normalized) {
    return prompts;
  }

  return prompts.filter((prompt) => {
    const titleMatch = String(prompt.title || '').toLowerCase().includes(normalized);
    const textMatch = normalizePromptText(prompt.text).toLowerCase().includes(normalized);
    const tagsMatch = (prompt.tags || []).join(' ').toLowerCase().includes(normalized);
    return titleMatch || textMatch || tagsMatch;
  });
};

const filterPrompts = async (filter, prompts) => {
  const normalized = String(filter || '').trim();

  if (!normalized) {
    state.semanticResults = null;
    return prompts;
  }

  const keywordResults = await sidepanelKeywordFilter(normalized, prompts);

  if (state.aiReady && state.settings.enableAI && state.settings.semanticSearch) {
    try {
      const response = await window.AIBridge.search(normalized);
      if (response?.results) {
        state.semanticResults = new Map(response.results.map((r) => [r.id, r]));

        const promptMap = new Map(prompts.map((p) => [p.id, p]));
        const seen = new Set();
        const merged = [];

        for (const result of response.results) {
          if (promptMap.has(result.id)) {
            merged.push(promptMap.get(result.id));
            seen.add(result.id);
          }
        }

        for (const prompt of keywordResults) {
          if (!seen.has(prompt.id)) {
            merged.push(prompt);
          }
        }

        return merged;
      }
    } catch (_) {
      // Fall through to keyword results.
    }
  }

  state.semanticResults = null;
  return keywordResults;
};

const buildInjectActions = async ({ actions, canInject, prompt, hasVars, doInject }) => {
  const useButton = document.createElement('button');
  useButton.className = 'pn-btn pn-btn--ghost';
  useButton.type = 'button';
  useButton.innerHTML = hasVars
    ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="pn-btn-icon" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M13 5l7 7-7 7"></path></svg>Use →'
    : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="pn-btn-icon" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3a4 4 0 0 0 4-4V4a2 2 0 0 1 4 0v5h3.6a2 2 0 0 1 1.93 2.5l-2 7a2 2 0 0 1-1.93 1.5H8"></path></svg>Use Prompt';

  if (!canInject) {
    useButton.disabled = true;
    useButton.title = 'Open a supported LLM tab to inject.';
  } else {
    useButton.addEventListener('click', () => {
      void (async () => {
        if (!hasVars) {
          await doInject(prompt.text, false);
          return;
        }

        if (!window.TemplateFill?.showFillForm) {
          await doInject(prompt.text, false);
          return;
        }

        window.TemplateFill.showFillForm(
          { title: prompt.title, text: prompt.text },
          (filledText) => {
            void doInject(filledText, false);
          },
          () => {}
        );
      })();
    });
  }

  actions.appendChild(useButton);

  if (!hasVars) {
    return;
  }

  const asIsButton = document.createElement('button');
  asIsButton.className = 'pn-btn pn-btn--ghost';
  asIsButton.type = 'button';
  asIsButton.textContent = 'Inject as-is';
  asIsButton.title = 'Inject now and fill [brackets] directly in chat.';

  if (!canInject) {
    asIsButton.disabled = true;
  } else {
    asIsButton.addEventListener('click', () => {
      void (async () => {
        const asIs = window.TemplateParser?.fill
          ? window.TemplateParser.fill(prompt.text, {})
          : prompt.text;
        await doInject(asIs, true);
      })();
    });
  }

  actions.appendChild(asIsButton);
};

const createPromptCard = async (rawPrompt, activeFilter, canInject, options = {}) => {
  const prompt = {
    ...rawPrompt,
    text: normalizePromptText(rawPrompt.text)
  };

  const card = document.createElement('article');
  card.className = 'pn-prompt-card';
  if (options.isCurated) {
    card.classList.add('pn-template-card');
    card.dataset.templateCategory = String(prompt.category || 'general');
  }

  const vars = getTemplateVars(prompt.text);
  const hasTemplateVars = vars.length > 0;

  const title = document.createElement('h3');
  title.className = 'pn-card-title';
  title.textContent = prompt.title;

  if (prompt.isTemplate) {
    const badge = document.createElement('span');
    badge.className = 'pn-template-badge';
    badge.textContent = 'TEMPLATE';
    title.appendChild(badge);
  }

  if (hasTemplateVars) {
    const varsBadge = document.createElement('span');
    varsBadge.className = 'pn-template-var-badge';
    varsBadge.textContent = 'Fill-in';
    varsBadge.title = `${vars.length} fill-in blank${vars.length === 1 ? '' : 's'}. Use [name] required, [name?] optional.`;
    title.appendChild(varsBadge);
  }

  const text = document.createElement('p');
  text.className = 'pn-card-text';
  text.textContent = prompt.text;

  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'pn-tag-wrap';

  for (const tag of prompt.tags || []) {
    const pill = createTagPill(tag);
    pill.classList.add('pn-tag-pill--clickable');
    pill.title = `Filter by #${tag}`;
    pill.addEventListener('click', () => {
      const search = document.getElementById('prompt-search');
      if (search) {
        search.value = tag;
      }
      void render(tag);
    });
    tagsWrap.appendChild(pill);
  }

  const actions = document.createElement('div');
  actions.className = 'pn-card-actions';

  const doInject = async (textToInject, asIsMode) => {
    const response = await sendToActiveTab({ action: 'injectPrompt', text: textToInject });

    if (!response?.ok) {
      await showToast(response?.error || 'Inject failed.');
      return;
    }

    if (asIsMode) {
      await showToast('Injected — fill in the [brackets] in the chat');
      return;
    }

    await showToast('Injected. Undo in chat.');
  };

  await buildInjectActions({
    actions,
    canInject,
    prompt,
    hasVars: hasTemplateVars,
    doInject
  });

  if (prompt.isTemplate) {
    const saveButton = document.createElement('button');
    saveButton.className = 'pn-btn pn-btn-primary';
    saveButton.type = 'button';
    saveButton.textContent = 'Save to My Prompts';
    saveButton.addEventListener('click', () => {
      void (async () => {
        const saved = await window.Store.savePrompt({
          title: prompt.title,
          text: prompt.text,
          tags: prompt.tags,
          category: prompt.category
        });
        if (saved) {
          await showToast('Template saved to library.');
        } else {
          await showToast('Template save failed.');
        }
      })();
    });
    actions.appendChild(saveButton);
  } else {
    const improveButton = document.createElement('button');
    improveButton.className = 'pn-btn pn-btn--ghost';
    improveButton.type = 'button';
    improveButton.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="pn-btn-icon pn-btn-icon--accent" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v19"></path><path d="M5 10l7-7 7 7"></path></svg>Improve';
    improveButton.title = 'Improve prompt with AI';
    improveButton.addEventListener('click', () => {
      if (typeof callbacks.onOpenImprove === 'function') {
        void callbacks.onOpenImprove(prompt.id, prompt.text, prompt.tags || []);
      }
    });

    const deleteButton = document.createElement('button');
    deleteButton.className = 'pn-btn pn-btn-danger';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Remove';

    deleteButton.addEventListener('click', () => {
      void (async () => {
        const deleted = await window.Store.deletePrompt(prompt.id);

        if (!deleted) {
          showToast('Delete failed.');
          return;
        }

        if (state.aiReady) {
          void window.AIBridge.cacheRemove(prompt.id);
        }

        await render(activeFilter);
        if (typeof callbacks.onPromptsMutated === 'function') {
          await callbacks.onPromptsMutated(activeFilter);
        }
      })();
    });

    actions.appendChild(improveButton);
    actions.appendChild(deleteButton);
  }

  if (typeof prompt._semanticScore === 'number') {
    const relevance = document.createElement('p');
    relevance.className = 'pn-relevance';
    relevance.textContent = `Relevance: ${(prompt._semanticScore * 100).toFixed(0)}%`;
    card.appendChild(relevance);
  }

  if (state.semanticResults?.get(prompt.id)?.semanticOnly) {
    const spark = document.createElement('span');
    spark.className = 'pn-spark';
    spark.title = 'Found by meaning';
    spark.textContent = '✦';
    title.appendChild(spark);
  }

  card.appendChild(title);
  card.appendChild(text);
  card.appendChild(tagsWrap);
  card.appendChild(actions);
  return card;
};

const updateTemplateFilterVisibility = (show) => {
  const filterBar = document.getElementById('pn-template-filters');
  if (!filterBar) return;
  filterBar.classList.toggle('pn-hidden', !show);
};

const setActiveFilter = (filter) => {
  const targetFilter = String(filter || TEMPLATE_FILTER_DEFAULT).trim() || TEMPLATE_FILTER_DEFAULT;
  activeTemplateFilter = targetFilter;

  document.querySelectorAll('.pn-filter-chip').forEach((chip) => {
    const active = chip.dataset.filter === targetFilter;
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  const cards = document.querySelectorAll('.pn-template-card[data-template-category]');
  let visibleCount = 0;

  cards.forEach((card) => {
    const match = targetFilter === TEMPLATE_FILTER_DEFAULT || card.dataset.templateCategory === targetFilter;
    card.style.display = match ? '' : 'none';
    if (match) visibleCount += 1;
  });

  const countEl = document.getElementById('pn-template-count');
  if (countEl) {
    countEl.textContent = targetFilter === TEMPLATE_FILTER_DEFAULT
      ? ''
      : `${visibleCount} template${visibleCount === 1 ? '' : 's'}`;
  }
};

const resetTemplateFilter = () => {
  activeTemplateFilter = TEMPLATE_FILTER_DEFAULT;
  setActiveFilter(TEMPLATE_FILTER_DEFAULT);
};

const bindTemplateFilters = () => {
  if (templateFiltersBound) return;
  templateFiltersBound = true;

  const filterBar = document.getElementById('pn-template-filters');
  if (!filterBar) return;

  filterBar.addEventListener('click', (event) => {
    const chip = event.target.closest('.pn-filter-chip');
    if (!chip) return;

    const filter = chip.dataset.filter;
    if (!filter) return;

    if (chip.classList.contains('active') && filter !== TEMPLATE_FILTER_DEFAULT) {
      setActiveFilter(TEMPLATE_FILTER_DEFAULT);
      return;
    }

    setActiveFilter(filter);
  });
};

const render = async (filter = '') => {
  const container = byId('prompt-list');

  if (!container) {
    return;
  }

  bindTemplateFilters();

  const promptsRaw = await window.Store.getPrompts();
  const prompts = promptsRaw.map((prompt) => ({
    ...prompt,
    text: normalizePromptText(prompt.text)
  }));

  const filtered = await filterPrompts(filter, prompts);
  const tabContext = await getActiveTabContext();
  let templates = window.PromptTemplates ? window.PromptTemplates.getTemplates(filter) : [];
  templates = templates.map((template) => ({
    ...template,
    text: normalizePromptText(template.text)
  }));

  const savedSignatures = new Set(prompts.map((p) => `${String(p.title || '').trim()}|${String(p.text || '').trim()}`));
  templates = templates.filter((t) => !savedSignatures.has(`${String(t.title || '').trim()}|${String(t.text || '').trim()}`));
  const hasUserPrompts = prompts.length > 0;

  container.innerHTML = '';
  await renderBridgeStrip();

  if (!hasUserPrompts) {
    container.appendChild(createEmptyState({
      title: 'No Prompts Available',
      message: templates.length
        ? 'Your prompt library is empty. Add your own prompts or start from curated templates.'
        : 'Start your library by creating your first prompt.',
      actionLabel: 'Add Prompt',
      onAction: () => {
        if (window.PromptForm?.open) {
          void window.PromptForm.open();
        }
      }
    }));
    if (!templates.length) {
      updateTemplateFilterVisibility(false);
      return;
    }
  }

  if (hasUserPrompts && !filtered.length && !templates.length) {
    container.appendChild(createEmptyState({
      title: 'No results found',
      message: 'Try a broader query or remove active filters.',
      actionLabel: 'Clear Filters',
      onAction: () => {
        const searchInput = document.getElementById('prompt-search');
        if (searchInput) {
          searchInput.value = '';
        }
        void render('');
      }
    }));
    updateTemplateFilterVisibility(false);
    return;
  }

  if (hasUserPrompts) {
    for (const prompt of filtered) {
      container.appendChild(await createPromptCard(prompt, String(filter || '').trim(), tabContext.supported));
    }
  }

  if (templates.length > 0) {
    const divider = document.createElement('div');
    divider.className = 'pn-template-divider';

    const header = document.createElement('button');
    header.className = 'pn-template-header';
    header.type = 'button';
    header.innerHTML = `
      <span>Curated Templates (${templates.length}) <span id="pn-template-count" class="pn-template-count"></span></span>
      <svg class="pn-template-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;

    const tempsContainer = document.createElement('div');
    tempsContainer.className = 'pn-template-grid';
    const isFiltered = String(filter || '').trim().length > 0;
    if (!isFiltered) {
      tempsContainer.dataset.collapsed = 'true';
      header.classList.add('collapsed');
      curatedExpanded = false;
    } else {
      curatedExpanded = true;
    }

    header.addEventListener('click', () => {
      const isCollapsed = tempsContainer.dataset.collapsed === 'true';
      tempsContainer.dataset.collapsed = isCollapsed ? 'false' : 'true';
      header.classList.toggle('collapsed', !isCollapsed);
      curatedExpanded = !isCollapsed;
      updateTemplateFilterVisibility(curatedExpanded && templates.length > 0);
      if (curatedExpanded) {
        setActiveFilter(activeTemplateFilter);
      }
    });

    divider.appendChild(header);
    divider.appendChild(tempsContainer);

    for (const tpl of templates) {
      tempsContainer.appendChild(await createPromptCard(tpl, String(filter || '').trim(), tabContext.supported, { isCurated: true }));
    }

    container.appendChild(divider);
    updateTemplateFilterVisibility(curatedExpanded);
    if (curatedExpanded) {
      setActiveFilter(activeTemplateFilter);
    }
  } else {
    updateTemplateFilterVisibility(false);
  }
};

const getSearchInput = () => document.getElementById('prompt-search');
const getSearchWrap = () => document.getElementById('search-wrap');

const getSearchValue = () => String(getSearchInput()?.value || '');

const clearSearch = () => {
  const searchInput = getSearchInput();
  const clearBtn = document.getElementById('pn-search-clear');
  if (!searchInput) return;
  if (!String(searchInput.value || '').trim()) return;
  searchInput.value = '';
  clearBtn?.classList.add('pn-hidden');
  void render('');
};

const bindSearchHandlers = () => {
  const searchInput = getSearchInput();
  const clearBtn = document.getElementById('pn-search-clear');

  searchInput?.addEventListener('input', (event) => {
    const target = event.target;
    if (clearBtn) {
      clearBtn.classList.toggle('pn-hidden', !target.value.trim());
    }
    clearTimeout(state._searchDebounce);
    state._searchDebounce = setTimeout(() => {
      void render(String(target?.value || ''));
    }, UI_FEEDBACK_MS.SEARCH_DEBOUNCE);
  });

  clearBtn?.addEventListener('click', () => {
    clearSearch();
    searchInput?.focus();
  });

  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && String(searchInput.value || '').trim()) {
      event.preventDefault();
      clearSearch();
    }
  });

  clearBtn?.classList.toggle('pn-hidden', !String(searchInput?.value || '').trim());
};

const loadSmartSuggestions = async () => {
  if (!state.aiReady) return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    let snippet = null;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONVERSATION_SNIPPET' });
      snippet = response?.text;
    } catch (_) {
      return;
    }

    if (!snippet || snippet.length < 30) return;

    const result = await window.AIBridge.getSmartSuggestions(snippet);
    if (!result?.ids?.length) return;

    const prompts = await window.Store.getPrompts();
    const promptMap = new Map(prompts.map((p) => [p.id, p]));

    const strip = document.getElementById('pn-smart-strip');
    const chips = document.getElementById('pn-smart-chips');
    if (!strip || !chips) return;

    chips.innerHTML = '';

    for (const id of result.ids) {
      const prompt = promptMap.get(id);
      if (!prompt) continue;

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pn-smart-chip';
      chip.textContent = prompt.title;
      chip.title = String(prompt.text || '').slice(0, 100);
      chip.addEventListener('click', () => {
        const search = document.getElementById('prompt-search');
        if (search) search.value = prompt.title;
        void render(prompt.title);
      });
      chips.appendChild(chip);
    }

    strip.classList.remove('pn-hidden');
  } catch (_) {
    // non-fatal
  }
};

const setBridgeStripHidden = (hidden) => {
  const strip = document.getElementById('pn-bridge-strip');
  if (!strip) return;
  strip.classList.toggle('pn-hidden', hidden);
};

const getCurrentPlatform = async (tabId) => {
  if (!tabId) return '';
  const response = await chrome.tabs.sendMessage(tabId, { action: 'getPlatform' }).catch(() => null);
  return String(response?.platform || '');
};

const bridgeFromPrompts = async (targetPlatform, label, sourcePlatform) => {
  const context = await getActiveTabContext();

  if (!context.supported || !context.tabId) {
    await showToast('Open a supported LLM tab to bridge.');
    return;
  }

  const response = await chrome.tabs.sendMessage(context.tabId, { action: 'scrapeForBridge' }).catch(() => null);
  if (!response?.messages?.length) {
    await showToast('No conversation found to bridge.');
    return;
  }

  const liveSource = await getCurrentPlatform(context.tabId);
  await window.Bridge.bridgeTo(response.messages, liveSource || sourcePlatform, targetPlatform);
  await showToast(`Opening ${label}...`);
};

const renderBridgeStrip = async () => {
  const strip = document.getElementById('pn-bridge-strip');
  const targetsNode = document.getElementById('pn-bridge-targets');

  if (!strip || !targetsNode || !window.Bridge?.LLM_URLS) {
    setBridgeStripHidden(true);
    return;
  }

  const context = await getActiveTabContext();
  if (!context.supported || !context.tabId) {
    setBridgeStripHidden(true);
    return;
  }

  const currentPlatform = await getCurrentPlatform(context.tabId);
  if (!currentPlatform) {
    setBridgeStripHidden(true);
    return;
  }

  const targets = Object.keys(window.Bridge.LLM_URLS)
    .filter((platform) => platform !== currentPlatform)
    .map((platform) => ({ key: platform, label: PLATFORM_LABELS?.[platform] || platform }));

  if (!targets.length) {
    setBridgeStripHidden(true);
    return;
  }

  targetsNode.innerHTML = '';
  targets.forEach((target) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pn-bridge-btn';
    button.textContent = target.label;
    button.addEventListener('click', () => {
      void (async () => {
        if (button.disabled) return;
        const original = button.textContent;
        button.disabled = true;
        button.textContent = 'Opening...';
        try {
          await bridgeFromPrompts(target.key, target.label, currentPlatform);
        } catch (error) {
          console.error('[Promptium] Bridge failed from prompts tab.', error);
          await showToast('Could not bridge conversation.');
        } finally {
          button.disabled = false;
          button.textContent = original;
        }
      })();
    });
    targetsNode.appendChild(button);
  });

  setBridgeStripHidden(false);
};

const setCallbacks = (nextCallbacks = {}) => {
  callbacks.onOpenImprove = nextCallbacks.onOpenImprove || null;
  callbacks.onPromptsMutated = nextCallbacks.onPromptsMutated || null;
};

const focusSearch = () => {
  const searchInput = getSearchInput();
  const searchWrap = getSearchWrap();
  if (!searchInput || !searchWrap || searchWrap.classList.contains('hidden')) return false;
  searchInput.focus();
  searchInput.select();
  return true;
};

window.PromptsUI = {
  render,
  bindSearchHandlers,
  getSearchValue,
  clearSearch,
  loadSmartSuggestions,
  renderBridgeStrip,
  setCallbacks,
  focusSearch,
  getSearchInput,
  getSearchWrap,
  bindTemplateFilters,
  setActiveFilter,
  resetTemplateFilter
};
})();
