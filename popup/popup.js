/**
 * File: popup/popup.js
 * Purpose: Implements popup tabs, semantic prompt search, auto-tagging, duplicate checks, and export actions.
 * Communicates with: utils/platform.js, utils/storage.js, utils/exporter.js, utils/ai.js, content/content.js.
 */

let pendingDuplicatePayload = null;
let popupBootstrapped = false;
let _searchTimer = null;
const TEXT_CLAMP_LENGTH = 180;
const SEARCH_DEBOUNCE_MS = 150;
const VAR_DETECT_DEBOUNCE_MS = 150;
const ADD_MODE_SELECTOR = 'selector';
const ADD_MODE_PLAIN = 'plain';
const ADD_MODE_TEMPLATE = 'template';
let _varDetectTimer = null;

const normalizePromptText = (text) => {
  if (window.TemplateParser?.normalizeLegacy) {
    return window.TemplateParser.normalizeLegacy(text);
  }
  return String(text || '');
};

const getTemplateVariables = (text) => {
  if (!window.TemplateParser?.parse) return [];
  return window.TemplateParser.parse(normalizePromptText(text));
};

const hasTemplateVariables = (text) => {
  if (!window.TemplateParser?.hasVariables) return false;
  return window.TemplateParser.hasVariables(normalizePromptText(text));
};

const formatSaveBackendFeedback = (savedPrompt) => {
  const backend = String(savedPrompt?._aiMeta?.paraphrase || '').trim().toLowerCase();
  if (backend === 'local') return 'Saved and optimized locally.';
  if (backend === 'gemini') return 'Saved and optimized with Gemini.';
  return 'Prompt saved.';
};

/** Returns true for editable form fields where global shortcuts should not hijack focus. */
const isEditableField = (node) => {
  if (!(node instanceof HTMLElement)) {
    return false;
  }

  if (node.isContentEditable || node instanceof HTMLTextAreaElement) {
    return true;
  }

  if (!(node instanceof HTMLInputElement)) {
    return false;
  }

  const type = String(node.type || 'text').toLowerCase();
  return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
};

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

const setAddMode = (mode) => {
  const selector = document.getElementById('pn-add-mode-selector');
  const plain = document.getElementById('pn-add-plain-form');
  const template = document.getElementById('pn-add-template-form');
  selector?.classList.toggle('pn-hidden', mode !== ADD_MODE_SELECTOR);
  plain?.classList.toggle('pn-hidden', mode !== ADD_MODE_PLAIN);
  template?.classList.toggle('pn-hidden', mode !== ADD_MODE_TEMPLATE);

  if (mode === ADD_MODE_PLAIN) {
    document.getElementById('prompt-title')?.focus();
  } else if (mode === ADD_MODE_TEMPLATE) {
    document.getElementById('pn-template-title')?.focus();
  }
};

const updateDetectedVars = () => {
  const textarea = document.getElementById('pn-template-text');
  const container = document.getElementById('pn-detected-vars');
  if (!textarea || !container || !window.TemplateParser?.parse) return;

  const vars = window.TemplateParser.parse(normalizePromptText(textarea.value));
  if (!vars.length) {
    container.replaceChildren();
    container.classList.remove('pn-detected-vars--active');
    return;
  }

  container.classList.add('pn-detected-vars--active');
  container.replaceChildren();

  const label = document.createElement('span');
  label.className = 'pn-detected-label';
  label.textContent = 'Blanks detected:';
  container.appendChild(label);

  vars.forEach((variable) => {
    const chip = document.createElement('span');
    chip.className = `pn-detected-var ${variable.required ? 'required' : 'optional'}`;
    chip.textContent = window.TemplateParser.toDisplayLabel(variable);
    container.appendChild(chip);
  });
};

const updateDetectedVarsDebounced = () => {
  clearTimeout(_varDetectTimer);
  _varDetectTimer = setTimeout(() => {
    _varDetectTimer = null;
    updateDetectedVars();
  }, VAR_DETECT_DEBOUNCE_MS);
};

const bindVariableToolbar = () => {
  const toolbar = document.getElementById('pn-var-toolbar');
  const textarea = document.getElementById('pn-template-text');
  if (!toolbar || !textarea) return;

  toolbar.querySelectorAll('.pn-var-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const snippet = String(button.dataset.snippet || '');
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = textarea.value.slice(0, start);
      const after = textarea.value.slice(end);
      textarea.value = `${before}${snippet}${after}`;
      const cursorStart = start + 1;
      const cursorEnd = start + 6;
      textarea.setSelectionRange(cursorStart, cursorEnd);
      textarea.focus();
      updateDetectedVars();
    });
  });

  textarea.addEventListener('input', updateDetectedVarsDebounced);
};

const setPromptListVisibility = (visible) => {
  document.getElementById('prompt-list')?.classList.toggle('pn-hidden', !visible);
  document.getElementById('pn-popup-template-fill-panel')?.classList.toggle('pn-hidden', visible);
};

const showTemplateFillForm = async (prompt, onInject) => {
  const panel = document.getElementById('pn-popup-template-fill-panel');
  if (!panel || !window.TemplateParser?.parse || !window.TemplateParser?.fill) {
    await onInject(normalizePromptText(prompt.text), false);
    return;
  }

  const vars = window.TemplateParser.parse(normalizePromptText(prompt.text));
  if (!vars.length) {
    await onInject(normalizePromptText(prompt.text), false);
    return;
  }

  panel.innerHTML = `
    <div class="pn-fill-header">
      <button class="pn-back-btn" id="pn-popup-fill-back" type="button">← Back</button>
      <span class="pn-fill-title">${escapeHtml(prompt.title)}</span>
      <span class="pn-fill-subtitle">Fill required blanks to continue.</span>
    </div>
    <div class="pn-fill-preview-wrap">
      <span class="pn-fill-preview-label">Preview</span>
      <div class="pn-fill-preview" id="pn-popup-fill-preview">${escapeHtml(normalizePromptText(prompt.text).slice(0, 300))}</div>
    </div>
    <div class="pn-fill-fields">
      ${vars.map((v, index) => `
        <label class="pn-fill-field" for="pn-popup-fill-${index}">
          <span class="pn-fill-label">${escapeHtml(window.TemplateParser.toDisplayLabel(v))}</span>
          <input
            id="pn-popup-fill-${index}"
            type="text"
            class="pn-fill-input"
            data-label="${escapeHtml(v.label.toLowerCase())}"
            data-required="${v.required ? 'true' : 'false'}"
            placeholder="${v.required ? 'Required' : 'Optional — leave blank to skip'}"
            autocomplete="off"
          />
        </label>
      `).join('')}
    </div>
    <p class="pn-fill-error" id="pn-popup-fill-error" role="alert" aria-live="polite"></p>
    <div class="pn-fill-actions">
      <button class="pn-fill-cancel" id="pn-popup-fill-cancel" type="button">Cancel</button>
      <button class="pn-fill-inject" id="pn-popup-fill-inject" type="button" disabled>Inject →</button>
    </div>
  `;

  const inputs = Array.from(panel.querySelectorAll('.pn-fill-input'));
  const preview = panel.querySelector('#pn-popup-fill-preview');
  const error = panel.querySelector('#pn-popup-fill-error');
  const injectButton = panel.querySelector('#pn-popup-fill-inject');

  const updateState = () => {
    const values = {};
    inputs.forEach((input) => {
      values[String(input.dataset.label || '').toLowerCase()] = String(input.value || '').trim();
    });

    const missingRequired = inputs
      .filter((input) => input.dataset.required === 'true')
      .some((input) => !String(input.value || '').trim());

    const display = normalizePromptText(prompt.text).replace(/\[([^\[\]]+?)\]/g, (match, inner, offset, full) => {
      if (full[offset - 1] === '[' || full[offset + match.length] === ']') return match;
      const token = String(inner || '').trim();
      const optional = token.endsWith('?');
      const label = optional ? token.slice(0, -1).trim() : token;
      const value = values[label.toLowerCase()];
      if (value) return `【${value}】`;
      if (optional) return '';
      return `[${label}]`;
    }).replace(/\s{2,}/g, ' ').trim();

    if (preview) {
      preview.textContent = display.length > 300 ? `${display.slice(0, 300)}…` : display;
    }

    if (injectButton) injectButton.disabled = missingRequired;
    if (error) error.textContent = missingRequired ? 'Fill all required blanks to continue.' : '';
  };

  setPromptListVisibility(false);
  updateState();
  inputs[0]?.focus();
  inputs.forEach((input) => input.addEventListener('input', updateState));

  const closeFill = () => {
    document.removeEventListener('keydown', onFillKeydown);
    panel.innerHTML = '';
    setPromptListVisibility(true);
  };

  const onFillKeydown = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closeFill();
  };
  document.addEventListener('keydown', onFillKeydown);

  panel.querySelector('#pn-popup-fill-back')?.addEventListener('click', closeFill);
  panel.querySelector('#pn-popup-fill-cancel')?.addEventListener('click', closeFill);
  panel.querySelector('#pn-popup-fill-inject')?.addEventListener('click', () => {
    const values = {};
    inputs.forEach((input) => {
      values[String(input.dataset.label || '').toLowerCase()] = String(input.value || '').trim();
    });
    const filled = window.TemplateParser.fill(normalizePromptText(prompt.text), values);
    closeFill();
    if (typeof onInject === 'function') {
      void onInject(filled, false);
    }
  });

  const lastInput = inputs[inputs.length - 1];
  lastInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || injectButton?.disabled) return;
    event.preventDefault();
    injectButton?.click();
  });
};

/** Hides duplicate confirmation controls and clears pending duplicate save state. */
const resetDuplicateState = async () => {
  pendingDuplicatePayload = null;
  const confirmButton = await byId('confirm-duplicate');
  confirmButton?.classList.add('hidden');
  const warning = document.getElementById('pn-duplicate-warning');
  if (warning) {
    warning.classList.add('pn-hidden');
    warning.replaceChildren();
  }
};

/** Moves the tab indicator under the currently active tab button. */
const updateTabIndicator = async () => {
  return;
};

const ensureCardMenuDismissHandlers = () => {
  if (window.__PN_POPUP_CARD_MENU_BOUND) return;

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    document.querySelectorAll('details.pn-card-menu[open]').forEach((menu) => {
      if (!target || !menu.contains(target)) {
        menu.open = false;
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('details.pn-card-menu[open]').forEach((menu) => {
      menu.open = false;
    });
  });

  window.__PN_POPUP_CARD_MENU_BOUND = true;
};

const createCardMenu = (items = []) => {
  ensureCardMenuDismissHandlers();
  const menu = document.createElement('details');
  menu.className = 'pn-card-menu';

  const summary = document.createElement('summary');
  summary.className = 'pn-card-menu__trigger';
  summary.title = 'Open additional actions';
  summary.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="6" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="12" cy="18" r="1.4"></circle></svg>More';
  menu.appendChild(summary);

  const list = document.createElement('div');
  list.className = 'pn-card-menu__list';

  items.forEach((item) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'pn-card-menu__item';
    if (item.tone === 'danger') row.classList.add('pn-card-menu__item--danger');
    row.textContent = String(item.label || 'Action');
    row.title = String(item.title || item.label || '').trim();
    row.disabled = Boolean(item.disabled);
    row.addEventListener('click', () => {
      menu.open = false;
      if (typeof item.onSelect === 'function') {
        void item.onSelect();
      }
    });
    list.appendChild(row);
  });

  menu.appendChild(list);
  return menu;
};

/** Renders one prompt card with one primary action and a compact overflow menu. */
const createPromptCard = async (prompt, activeFilter, canInject, options = {}) => {
  const normalizedText = normalizePromptText(prompt.text);
  const hasVars = hasTemplateVariables(normalizedText);
  const isCuratedTemplate = options.isCurated === true;
  const isTemplateCard = isCuratedTemplate || hasVars;
  const card = document.createElement('article');
  card.className = 'pn-prompt-card' + (isTemplateCard ? ' pn-prompt-card--template' : '');

  // Template badge
  if (isTemplateCard) {
    const badge = document.createElement('div');
    badge.className = 'pn-template-badge';
    badge.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    const badgeText = document.createElement('span');
    badgeText.textContent = `TEMPLATE${isCuratedTemplate && prompt.category ? ` • ${String(prompt.category)}` : ''}`;
    badge.appendChild(badgeText);
    card.appendChild(badge);
  }

  // Semantic relevance badge (if present)
  if (!isCuratedTemplate && typeof prompt._semanticScore === 'number') {
    const relevance = document.createElement('div');
    relevance.className = 'pn-relevance-badge';
    relevance.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>${(prompt._semanticScore * 100).toFixed(0)}%`;
    card.appendChild(relevance);
  }

  // Title
  const title = document.createElement('h3');
  title.className = 'pn-card-title';
  title.textContent = prompt.title;
  if (hasVars) {
    const varBadge = document.createElement('span');
    varBadge.className = 'pn-template-var-badge';
    varBadge.textContent = 'Fill-in';
    const count = getTemplateVariables(normalizedText).length;
    varBadge.title = `${count} fill-in blank${count === 1 ? '' : 's'}. Use [label] required and [label?] optional.`;
    title.appendChild(varBadge);
  }
  card.appendChild(title);

  // Meta info (character count, date)
  const meta = document.createElement('p');
  meta.className = 'pn-card-meta pn-card-meta--subtle';
  const charCount = (prompt.text || '').length;
  const createdLabel = prompt.createdAt ? formatRelativeTime(prompt.createdAt) : '';
  meta.textContent = isCuratedTemplate
    ? `${charCount} chars • ${prompt.category || 'General'}`
    : `${charCount} chars${createdLabel ? ` • ${createdLabel}` : ''}`;
  card.appendChild(meta);

  // Text with clamp
  const textWrap = document.createElement('div');
  textWrap.className = 'pn-card-text-wrap';
  const textEl = document.createElement('p');
  textEl.className = 'pn-card-text';
  const fullText = String(normalizedText || '');
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

  const clarityScore = Number(prompt?.clarityScore);
  const clarityExplanation = String(prompt?.clarityExplanation || '').trim();
  if (Number.isFinite(clarityScore) && clarityScore >= 0 && clarityScore <= 100) {
    const clarity = document.createElement('p');
    clarity.className = 'pn-card-clarity';
    clarity.textContent = `Clarity ${Math.round(clarityScore)}/100${clarityExplanation ? ` • ${clarityExplanation}` : ''}`;
    card.appendChild(clarity);
  }

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

  const injectNow = async (text, options = {}) => {
    const asIsMode = Boolean(options.asIsMode);
    const response = await sendToActiveTab({ action: 'injectPrompt', text });
    if (!response?.ok) {
      await showToast(response?.error || 'Inject failed.');
      return false;
    }
    if (asIsMode) {
      await showToast('Injected — fill in the [brackets] in the chat');
    }
    window.close();
    return true;
  };

  // Inject button
  const injectButton = document.createElement('button');
  injectButton.className = 'pn-btn pn-btn--primary pn-btn-icon-label';
  injectButton.classList.add('pn-card-actions__primary');
  injectButton.type = 'button';
  injectButton.innerHTML = `<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M15 3h6v6\"></path><path d=\"M10 14L21 3\"></path><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"></path></svg>Use →`;
  if (!canInject) {
    injectButton.disabled = true;
    injectButton.title = 'Open a supported LLM page first.';
  } else {
    injectButton.title = hasVars
      ? 'Inject as-is, remove optional placeholders, and keep required [brackets] visible in chat.'
      : 'Inject this prompt into the active chat input.';
    injectButton.addEventListener('click', () => {
      void (async () => {
        if (!hasVars) {
          await injectNow(normalizedText, { asIsMode: false });
          return;
        }
        const rawText = window.TemplateParser?.fill
          ? window.TemplateParser.fill(normalizedText, {})
          : normalizedText;
        await injectNow(rawText, { asIsMode: true });
      })();
    });
  }

  let quickInjectButton = null;
  if (hasVars) {
    quickInjectButton = document.createElement('button');
    quickInjectButton.className = 'pn-btn pn-btn--ghost pn-btn-icon-label';
    quickInjectButton.type = 'button';
    quickInjectButton.textContent = 'Fill in';
    quickInjectButton.title = 'Open fill form before injecting.';

    if (!canInject) {
      quickInjectButton.disabled = true;
    } else {
      quickInjectButton.addEventListener('click', () => {
        void (async () => {
          await showTemplateFillForm(
            { title: prompt.title, text: normalizedText },
            (filledText) => injectNow(filledText, { asIsMode: false })
          );
        })();
      });
    }
  }

  if (isCuratedTemplate) {
    const overflow = createCardMenu([
      {
        label: 'Save to Library',
        title: 'Save this curated template to your personal prompt library.',
        onSelect: async () => {
        const saved = await window.Store.savePrompt({
          title: prompt.title,
          text: normalizedText,
          tags: [...(prompt.tags || [])]
        });
        if (saved) {
          await showToast('Template saved to library.');
        } else {
          await showToast('Template save failed.');
        }
        }
      }
    ]);
    actions.appendChild(injectButton);
    if (quickInjectButton) actions.appendChild(quickInjectButton);
    actions.appendChild(overflow);
  } else {
    const overflow = createCardMenu([
      {
        label: 'Improve Prompt',
        title: 'Open this prompt in Side Panel improve mode.',
        onSelect: async () => {
          window.open(chrome.runtime.getURL('sidepanel/sidepanel.html'), '_blank');
        }
      },
      {
        label: 'Delete Prompt',
        title: 'Delete this prompt from your library.',
        tone: 'danger',
        onSelect: async () => {
          const deleted = await window.Store.deletePrompt(prompt.id);
          if (!deleted) {
            await showToast('Delete failed.');
            return;
          }
          await renderPrompts(activeFilter);
        }
      }
    ]);
    actions.appendChild(injectButton);
    if (quickInjectButton) actions.appendChild(quickInjectButton);
    actions.appendChild(overflow);
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

  const promptsRaw = await window.Store.getPrompts();
  const prompts = promptsRaw.map((prompt) => ({ ...prompt, text: normalizePromptText(prompt.text) }));
  const filtered = await filterPrompts(filter, prompts);
  const tabContext = await getActiveTabContext();
  const filterStr = String(filter || '').trim().toLowerCase();

  container.innerHTML = '';

  // -- User prompts --
  if (filtered.length) {
    for (const prompt of filtered) {
      container.appendChild(await createPromptCard(prompt, filterStr, tabContext.supported, { isCurated: false }));
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
      title: 'No prompts yet',
      message: 'Create your first prompt to start your library.',
      actionLabel: 'Add your first prompt',
      onAction: () => { void openModal(); }
    }));
  }

  // -- Templates section --
  if (window.PromptTemplates) {
    const templates = window.PromptTemplates
      .getTemplates(filterStr)
      .map((template) => ({ ...template, text: normalizePromptText(template.text) }));

    const savedSignatures = new Set(prompts.map((p) => `${String(p.title || '').trim()}|${String(p.text || '').trim()}`));
    const visibleTemplates = templates.filter((t) => !savedSignatures.has(`${String(t.title || '').trim()}|${String(t.text || '').trim()}`));

    if (visibleTemplates.length) {
      // Section header
      const section = document.createElement('div');
      section.className = 'pn-templates-section';

      const header = document.createElement('button');
      header.className = 'pn-templates-header';
      header.type = 'button';
      header.innerHTML = `<svg class="pn-templates-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>Templates <span class="pn-templates-count">${visibleTemplates.length}</span>`;

      const body = document.createElement('div');
      body.className = 'pn-templates-body';

      // Collapsed by default if user has their own prompts
      let expanded = !prompts.length;
      body.classList.toggle('pn-templates-body--collapsed', !expanded);
      if (expanded) header.classList.add('pn-templates-header--open');

      header.addEventListener('click', () => {
        expanded = !expanded;
        body.classList.toggle('pn-templates-body--collapsed', !expanded);
        header.classList.toggle('pn-templates-header--open', expanded);
      });

      section.appendChild(header);

      for (const tpl of visibleTemplates) {
        body.appendChild(await createPromptCard(tpl, filterStr, tabContext.supported, { isCurated: true }));
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
    container.appendChild(await createEmptyState({
      title: 'No exports yet',
      message: 'Export a chat to get started.',
      actionLabel: 'Open prompts',
      onAction: () => {
        const promptsTab = document.querySelector('.tab[data-tab="prompts"]');
        if (promptsTab instanceof HTMLElement) {
          promptsTab.click();
        }
      }
    }));
    return;
  }

  for (const entry of reversed) {
    container.appendChild(await createHistoryCard(entry));
  }
};

const hideModalError = async (id) => {
  const node = await byId(id);
  if (!node) return;
  node.textContent = '';
  node.classList.add('pn-hidden');
};

const showModalError = async (id, message) => {
  const node = await byId(id);
  if (!node) return;
  node.textContent = String(message || '').trim();
  node.classList.toggle('pn-hidden', !node.textContent);
};

const getLocalModelLabel = (modelId) => {
  const map = {
    smollm2_1_7b: 'SmolLM2',
    phi35_mini: 'Phi-3.5-mini',
    qwen3_0_6b: 'Qwen3'
  };
  return map[String(modelId || '').toLowerCase()] || 'Local AI';
};

const updateAddAiStatusStrip = async () => {
  const ids = ['pn-form-ai-status', 'pn-template-ai-status'];
  const settingsSnap = await chrome.storage.local.get(['promptiumSettings']).catch(() => ({}));
  const settings = settingsSnap?.promptiumSettings || {};
  const enableAI = settings?.enableAI !== false;
  const preferLocal = settings?.preferLocal === true;
  const localFeaturePolish = settings?.localFeatureFlags?.polish !== false;

  let text = '○ AI unavailable — enable in Settings';
  let unavailable = true;

  if (enableAI) {
    const localStatus = await window.AIBridge.getLocalModelStatus().catch(() => null);
    const localReady = String(localStatus?.status || '').toLowerCase() === 'ready';
    const localLoading = ['loading', 'downloading'].includes(String(localStatus?.status || '').toLowerCase());
    const geminiKey = String((await chrome.storage.session.get(['promptiumGeminiKey']).catch(() => ({})))?.promptiumGeminiKey || '').trim();
    if (preferLocal && localFeaturePolish && localLoading) {
      text = '⟳ AI loading...';
      unavailable = false;
    } else if (localReady && localFeaturePolish) {
      text = `✦ ${getLocalModelLabel(localStatus?.modelId || settings?.localModelId)} ready`;
      unavailable = false;
    } else if (geminiKey) {
      text = '✦ AI via Gemini';
      unavailable = false;
    } else if (localLoading) {
      text = '⟳ AI loading...';
      unavailable = false;
    }
  }

  ids.forEach((id) => {
    const node = document.getElementById(id);
    if (!node) return;
    node.textContent = text;
    node.classList.toggle('pn-clickable', unavailable);
    node.title = unavailable ? 'Open side panel Settings → AI Models' : '';
  });

  const canPolish = !unavailable;
  ['pn-polish-btn', 'pn-template-polish-btn'].forEach((id) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.disabled = !canPolish;
    button.title = canPolish ? '' : 'Enable AI in Settings';
  });
};

const syncPolishVisibility = () => {
  const plainText = String(document.getElementById('prompt-text')?.value || '').trim();
  const templateText = String(document.getElementById('pn-template-text')?.value || '').trim();
  document.getElementById('pn-polish-wrap')?.classList.toggle('pn-hidden', !plainText);
  document.getElementById('pn-template-polish-wrap')?.classList.toggle('pn-hidden', !templateText);
};

let plainPolishUndo = '';
let templatePolishUndo = '';
let plainUndoTimer = null;
let templateUndoTimer = null;

const runModalPolish = async (isTemplate = false) => {
  const textId = isTemplate ? 'pn-template-text' : 'prompt-text';
  const errorId = isTemplate ? 'pn-template-polish-error' : 'pn-polish-error';
  const undoId = isTemplate ? 'pn-template-polish-undo' : 'pn-polish-undo';
  const warningId = 'pn-template-polish-warning';
  const buttonId = isTemplate ? 'pn-template-polish-btn' : 'pn-polish-btn';
  const textarea = document.getElementById(textId);
  const button = document.getElementById(buttonId);
  if (!textarea || !button) return;

  const original = String(textarea.value || '').trim();
  if (!original) return;

  const beforeVars = isTemplate && window.TemplateParser?.parse
    ? window.TemplateParser.parse(normalizePromptText(original)).map((item) => `${item.label}:${item.required ? 'r' : 'o'}`).join('|')
    : '';

  await hideModalError(errorId);
  button.disabled = true;
  button.textContent = '⟳ Polishing...';
  try {
    const response = await window.AIBridge.paraphrasePrompt(original);
    const polished = String(response?.text || '').trim();
    if (!response?.ok || !polished) throw new Error('Polish failed');

    textarea.value = polished;
    syncPolishVisibility();

    if (isTemplate) {
      templatePolishUndo = original;
      if (templateUndoTimer) clearTimeout(templateUndoTimer);
      templateUndoTimer = setTimeout(() => document.getElementById(undoId)?.classList.add('pn-hidden'), 8000);
      const afterVars = window.TemplateParser?.parse
        ? window.TemplateParser.parse(normalizePromptText(polished)).map((item) => `${item.label}:${item.required ? 'r' : 'o'}`).join('|')
        : '';
      if (beforeVars !== afterVars) {
        await showModalError(warningId, 'AI may have altered your blanks — review before saving.');
      } else {
        await hideModalError(warningId);
      }
      updateDetectedVars();
    } else {
      plainPolishUndo = original;
      if (plainUndoTimer) clearTimeout(plainUndoTimer);
      plainUndoTimer = setTimeout(() => document.getElementById(undoId)?.classList.add('pn-hidden'), 8000);
    }

    document.getElementById(undoId)?.classList.remove('pn-hidden');
  } catch (_error) {
    await showModalError(errorId, 'Polish failed — try again');
    setTimeout(() => { void hideModalError(errorId); }, 4000);
  } finally {
    button.disabled = false;
    button.textContent = '✦ Polish';
  }
};

const maybeAutoSuggestTags = async (text, existingTags) => {
  if (existingTags.length) return existingTags;
  try {
    const result = await window.AIBridge.suggestTags(text);
    const tags = Array.isArray(result?.tags)
      ? result.tags.map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 3)
      : [];
    if (!tags.length) return existingTags;
    setPlainTags(tags);
    const info = document.getElementById('pn-tag-suggestions');
    if (info) info.textContent = 'AI suggested these tags — keep or edit';
    return tags;
  } catch (_error) {
    return existingTags;
  }
};

const setPlainTags = (tags = []) => {
  const hidden = document.getElementById('prompt-tags');
  if (!hidden) return;
  document.querySelectorAll('#tag-badges-wrap .pn-tag-badge').forEach((badge) => badge.remove());
  tags.forEach((tag) => addTagBadge(tag));
  syncBadgesToHidden();
};

const showPopupDuplicateWarning = (payload, match) => {
  const warning = document.getElementById('pn-duplicate-warning');
  if (!warning) return;

  warning.replaceChildren();
  warning.classList.remove('pn-hidden');

  const title = document.createElement('strong');
  title.textContent = `This looks similar to \"${String(match?.title || 'Untitled')}\"`;
  warning.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'pn-duplicate-actions';

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'pn-btn-ignore';
  saveButton.textContent = 'Save anyway';
  saveButton.addEventListener('click', () => {
    warning.classList.add('pn-hidden');
    warning.replaceChildren();
    pendingDuplicatePayload = payload;
    void saveDuplicateAnyway();
  });

  const viewButton = document.createElement('button');
  viewButton.type = 'button';
  viewButton.className = 'pn-btn-view';
  viewButton.textContent = 'View existing';
  viewButton.addEventListener('click', () => {
    warning.classList.add('pn-hidden');
    warning.replaceChildren();
    void closeModal();
    if (match?.title) {
      const search = document.getElementById('prompt-search');
      if (search) search.value = String(match.title);
      void renderPrompts(String(match.title || ''));
    }
  });

  actions.appendChild(saveButton);
  actions.appendChild(viewButton);
  warning.appendChild(actions);
};

/** Opens the add prompt modal and clears all input fields. */
const openModal = async () => {
  const modal = await byId('add-modal');
  const title = await byId('prompt-title');
  const text = await byId('prompt-text');
  const tags = await byId('prompt-tags');
  const tagsInput = await byId('prompt-tags-input');
  const badgeWrap = document.getElementById('tag-badges-wrap');
  const templateTitle = await byId('pn-template-title');
  const templateText = await byId('pn-template-text');
  const templateTags = await byId('pn-template-tags');
  const detectedVars = await byId('pn-detected-vars');

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

  if (templateTitle) templateTitle.value = '';
  if (templateText) templateText.value = '';
  if (templateTags) templateTags.value = '';
  if (detectedVars) {
    detectedVars.replaceChildren();
    detectedVars.classList.remove('pn-detected-vars--active');
  }

  await hideModalError('pn-error-title');
  await hideModalError('pn-error-text');
  await hideModalError('pn-template-error-title');
  await hideModalError('pn-template-error-text');
  await hideModalError('pn-polish-error');
  await hideModalError('pn-template-polish-error');
  await hideModalError('pn-template-polish-warning');
  document.getElementById('pn-polish-undo')?.classList.add('pn-hidden');
  document.getElementById('pn-template-polish-undo')?.classList.add('pn-hidden');
  document.getElementById('pn-tag-suggestions')?.replaceChildren();
  document.getElementById('pn-duplicate-warning')?.classList.add('pn-hidden');
  const dup = document.getElementById('pn-duplicate-warning');
  if (dup) dup.replaceChildren();

  await resetDuplicateState();
  setAddMode(ADD_MODE_SELECTOR);
  setPromptListVisibility(true);
  syncPolishVisibility();
  await updateAddAiStatusStrip();
  modal?.classList.remove('pn-hidden');
};

/** Closes the add prompt modal and resets duplicate confirmation state. */
const closeModal = async () => {
  const modal = await byId('add-modal');
  modal?.classList.add('pn-hidden');
  setAddMode(ADD_MODE_SELECTOR);
  setPromptListVisibility(true);
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
  await showToast('Prompt saved');
  return true;
};

/** Handles duplicate confirmation path after user explicitly chooses to save anyway. */
const saveDuplicateAnyway = async () => {
  if (!pendingDuplicatePayload) {
    return;
  }

  const payload = pendingDuplicatePayload;
  pendingDuplicatePayload = null;
  await persistPrompt(payload);
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
  const textValue = normalizePromptText(textInput.value || '').trim();
  await hideModalError('pn-error-title');
  await hideModalError('pn-error-text');

  let valid = true;
  if (!titleValue) {
    await showModalError('pn-error-title', 'Title is required.');
    valid = false;
  }
  if (!textValue) {
    await showModalError('pn-error-text', 'Prompt text is required.');
    valid = false;
  }
  if (!valid) return;

  if (tagBadgeInput && tagBadgeInput.value.trim()) {
    addTagBadge(tagBadgeInput.value);
    tagBadgeInput.value = '';
  }

  syncBadgesToHidden();
  const userTags = await parseTags(tagsInput.value || '');
  const existingPrompts = await window.Store.getPrompts();
  const duplicate = window.PromptDuplicate?.findDuplicate
    ? window.PromptDuplicate.findDuplicate({ title: titleValue, text: textValue }, existingPrompts, 0.85)
    : window.AI.isDuplicate({ title: titleValue, text: textValue }, existingPrompts);

  if (duplicate?.duplicate && duplicate?.match) {
    showPopupDuplicateWarning({
      title: titleValue,
      text: textValue,
      tags: userTags,
      category: null
    }, duplicate.match);
    return;
  }

  const tags = await maybeAutoSuggestTags(textValue, userTags);
  const payload = {
    title: titleValue,
    text: textValue,
    tags,
    category: null
  };

  await persistPrompt(payload);
};

/** Saves a template prompt from template-mode modal fields. */
const saveTemplateFromModal = async () => {
  const titleInput = await byId('pn-template-title');
  const textInput = await byId('pn-template-text');
  const tagsInput = await byId('pn-template-tags');

  if (!titleInput || !textInput || !tagsInput) {
    return;
  }

  const titleValue = String(titleInput.value || '').trim();
  const textValue = normalizePromptText(textInput.value || '').trim();
  await hideModalError('pn-template-error-title');
  await hideModalError('pn-template-error-text');

  let valid = true;
  if (!titleValue) {
    await showModalError('pn-template-error-title', 'Title is required.');
    valid = false;
  }
  if (!textValue) {
    await showModalError('pn-template-error-text', 'Template text is required.');
    valid = false;
  }
  if (!valid) return;

  const userTags = parseTags(tagsInput.value || '');
  const duplicate = window.PromptDuplicate?.findDuplicate
    ? window.PromptDuplicate.findDuplicate({ title: titleValue, text: textValue }, await window.Store.getPrompts(), 0.85)
    : window.AI.isDuplicate({ title: titleValue, text: textValue }, await window.Store.getPrompts());
  if (duplicate?.duplicate && duplicate?.match) {
    showPopupDuplicateWarning({
      title: titleValue,
      text: textValue,
      tags: userTags,
      category: null
    }, duplicate.match);
    return;
  }

  const tags = await maybeAutoSuggestTags(textValue, userTags);

  const payload = {
    title: titleValue,
    text: textValue,
    tags,
    category: null
  };

  await persistPrompt(payload);
};

/** Wires static popup event handlers for tabs, modal controls, and search field. */
const bindEvents = async () => {
  const addPromptButton = await byId('add-prompt-btn');
  const saveButton = await byId('save-new-prompt');
  const saveTemplateButton = await byId('pn-template-save');
  const confirmDuplicateButton = await byId('confirm-duplicate');
  const cancelButton = await byId('cancel-modal');
  const templateCancelButton = await byId('pn-template-cancel');
  const modeCancelButton = await byId('pn-mode-cancel');
  const modePlainButton = await byId('pn-mode-plain');
  const modeTemplateButton = await byId('pn-mode-template');
  const plainBackButton = await byId('pn-plain-back');
  const templateBackButton = await byId('pn-template-back');
  const searchInput = await byId('prompt-search');
  const clearButton = await byId('pn-search-clear');
  const promptText = await byId('prompt-text');
  const templateText = await byId('pn-template-text');
  const plainPolishButton = await byId('pn-polish-btn');
  const templatePolishButton = await byId('pn-template-polish-btn');
  const modalBackdrop = document.querySelector('[data-close-modal]');
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const clearSearch = () => {
    if (!searchInput) return;
    if (!String(searchInput.value || '').trim()) return;
    searchInput.value = '';
    clearButton?.classList.add('pn-hidden');
    void renderPrompts('');
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      void switchTab(String(tab.dataset.tab || 'prompts'));
    });
  });

  addPromptButton?.addEventListener('click', () => {
    void openModal();
  });

  modePlainButton?.addEventListener('click', () => {
    setAddMode(ADD_MODE_PLAIN);
    void updateAddAiStatusStrip();
  });
  modeTemplateButton?.addEventListener('click', () => {
    setAddMode(ADD_MODE_TEMPLATE);
    updateDetectedVars();
    void updateAddAiStatusStrip();
  });
  plainBackButton?.addEventListener('click', () => setAddMode(ADD_MODE_SELECTOR));
  templateBackButton?.addEventListener('click', () => setAddMode(ADD_MODE_SELECTOR));

  saveButton?.addEventListener('click', () => {
    void savePromptFromModal();
  });

  saveTemplateButton?.addEventListener('click', () => {
    void saveTemplateFromModal();
  });

  confirmDuplicateButton?.addEventListener('click', () => {
    void saveDuplicateAnyway();
  });

  cancelButton?.addEventListener('click', () => {
    void closeModal();
  });

  templateCancelButton?.addEventListener('click', () => {
    void closeModal();
  });

  modeCancelButton?.addEventListener('click', () => {
    void closeModal();
  });

  modalBackdrop?.addEventListener('click', () => {
    void closeModal();
  });

  promptText?.addEventListener('input', () => {
    syncPolishVisibility();
    void hideModalError('pn-error-text');
    document.getElementById('pn-duplicate-warning')?.classList.add('pn-hidden');
  });

  templateText?.addEventListener('input', () => {
    updateDetectedVarsDebounced();
    syncPolishVisibility();
    void hideModalError('pn-template-error-text');
    document.getElementById('pn-duplicate-warning')?.classList.add('pn-hidden');
  });

  document.getElementById('prompt-title')?.addEventListener('input', () => {
    void hideModalError('pn-error-title');
    document.getElementById('pn-duplicate-warning')?.classList.add('pn-hidden');
  });
  document.getElementById('pn-template-title')?.addEventListener('input', () => {
    void hideModalError('pn-template-error-title');
    document.getElementById('pn-duplicate-warning')?.classList.add('pn-hidden');
  });

  plainPolishButton?.addEventListener('click', () => {
    void runModalPolish(false);
  });
  templatePolishButton?.addEventListener('click', () => {
    void runModalPolish(true);
  });

  document.getElementById('pn-polish-undo')?.addEventListener('click', () => {
    const textarea = document.getElementById('prompt-text');
    if (!textarea || !plainPolishUndo) return;
    textarea.value = plainPolishUndo;
    document.getElementById('pn-polish-undo')?.classList.add('pn-hidden');
  });
  document.getElementById('pn-template-polish-undo')?.addEventListener('click', () => {
    const textarea = document.getElementById('pn-template-text');
    if (!textarea || !templatePolishUndo) return;
    textarea.value = templatePolishUndo;
    updateDetectedVars();
    document.getElementById('pn-template-polish-undo')?.classList.add('pn-hidden');
    void hideModalError('pn-template-polish-warning');
  });

  const openSettingsFromPopup = async () => {
    const sidepanelUrl = chrome.runtime.getURL('sidepanel/sidepanel.html#settings');
    await chrome.tabs.create({ url: sidepanelUrl });
    window.close();
  };
  document.getElementById('pn-form-ai-status')?.addEventListener('click', () => {
    if (document.getElementById('pn-form-ai-status')?.classList.contains('pn-clickable')) {
      void openSettingsFromPopup();
    }
  });
  document.getElementById('pn-template-ai-status')?.addEventListener('click', () => {
    if (document.getElementById('pn-template-ai-status')?.classList.contains('pn-clickable')) {
      void openSettingsFromPopup();
    }
  });

  searchInput?.addEventListener('input', (event) => {
    const target = event.target;
    clearButton?.classList.toggle('pn-hidden', !String(target?.value || '').trim());
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      void renderPrompts(String(target?.value || ''));
    }, SEARCH_DEBOUNCE_MS);
  });
  clearButton?.addEventListener('click', () => {
    clearSearch();
    searchInput?.focus();
  });
  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && String(searchInput.value || '').trim()) {
      event.preventDefault();
      clearSearch();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const fillPanel = document.getElementById('pn-popup-template-fill-panel');
      if (fillPanel && !fillPanel.classList.contains('pn-hidden')) {
        event.preventDefault();
        document.getElementById('pn-popup-fill-back')?.click();
        return;
      }

      const addModal = document.getElementById('add-modal');
      if (addModal && !addModal.classList.contains('pn-hidden')) {
        event.preventDefault();
        void closeModal();
        return;
      }
    }

    const isFocusShortcut = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
    if (!isFocusShortcut || !searchInput) return;
    const active = document.activeElement;
    if (isEditableField(active) && active !== searchInput) {
      return;
    }
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
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

  bindVariableToolbar();
  chrome.runtime.onMessage.addListener((message) => {
    const type = String(message?.type || '').trim();
    if (type === 'AI_LOCAL_MODEL_STATUS' || type === 'AI_LOCAL_STATUS_BROADCAST' || type === 'AI_LOCAL_MODEL_PROGRESS') {
      void updateAddAiStatusStrip();
    }
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
  await updateAddAiStatusStrip();
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
