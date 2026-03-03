(() => {
/**
 * File: sidepanel/prompt-form.js
 * Purpose: Add prompt modal lifecycle, mode switching, duplicate checks, and persistence.
 */

const { state } = window.SidepanelState;

const callbacks = {
  onPromptSaved: null,
  onOpenImprove: null
};

let activeMode = 'selector';

const modeViews = {
  selector: 'pn-add-mode-selector',
  plain: 'pn-add-plain-form',
  template: 'pn-add-template-form'
};

const normalizeTemplateText = (text) => {
  if (window.TemplateParser?.normalizeLegacy) {
    return window.TemplateParser.normalizeLegacy(text);
  }
  return String(text || '');
};

const clearChildren = (node) => {
  if (!node) return;
  node.replaceChildren();
};

const setMode = (mode) => {
  activeMode = mode;
  Object.entries(modeViews).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('pn-hidden', key !== mode);
  });

  if (mode === 'plain') {
    byId('prompt-title')?.focus();
  } else if (mode === 'template') {
    byId('pn-template-title')?.focus();
  }
};

const clearTagBadges = () => {
  const badgeWrap = document.getElementById('tag-badges-wrap');
  if (badgeWrap) {
    badgeWrap.querySelectorAll('.pn-tag-badge').forEach((badge) => badge.remove());
  }

  const tagInput = document.getElementById('prompt-tags-input');
  if (tagInput) tagInput.value = '';

  const tagsHidden = byId('prompt-tags');
  if (tagsHidden) tagsHidden.value = '';
};

const resetPlainForm = () => {
  const title = byId('prompt-title');
  const text = byId('prompt-text');

  if (title) title.value = '';
  if (text) text.value = '';

  clearTagBadges();

  const suggestionsEl = document.getElementById('pn-tag-suggestions');
  clearChildren(suggestionsEl);

  const dupWarnEl = document.getElementById('pn-duplicate-warning');
  if (dupWarnEl) {
    clearChildren(dupWarnEl);
    dupWarnEl.classList.add('pn-hidden');
  }

  byId('confirm-duplicate')?.classList.add('hidden');
};

const resetTemplateForm = () => {
  const title = byId('pn-template-title');
  const text = byId('pn-template-text');
  const tags = byId('pn-template-tags');
  const detected = byId('pn-detected-vars');

  if (title) title.value = '';
  if (text) text.value = '';
  if (tags) tags.value = '';
  if (detected) {
    clearChildren(detected);
    detected.style.display = 'none';
  }
};

const open = async () => {
  const modal = byId('add-modal');

  state.pendingDuplicatePayload = null;
  resetPlainForm();
  resetTemplateForm();

  modal?.classList.remove('pn-hidden');
  setMode('selector');
};

const openPlainPrefilled = async (text, sourceUrl = '') => {
  await open();
  setMode('plain');

  const textInput = byId('prompt-text');
  const titleInput = byId('prompt-title');
  if (textInput) {
    textInput.value = String(text || '').trim();
  }

  if (titleInput && !String(titleInput.value || '').trim()) {
    const seed = String(text || '').trim().split(/\s+/).slice(0, 6).join(' ');
    titleInput.value = seed ? `${seed.slice(0, 48)}` : 'Saved Snippet';
  }

  if (sourceUrl) {
    const tagsHidden = byId('prompt-tags');
    if (tagsHidden && !String(tagsHidden.value || '').trim()) {
      tagsHidden.value = '';
    }
  }
};

const close = async () => {
  const modal = byId('add-modal');
  state.pendingDuplicatePayload = null;
  byId('confirm-duplicate')?.classList.add('hidden');
  modal?.classList.add('pn-hidden');
  setMode('selector');
};

const prefillSuggestedTags = async () => {
  if (!state.settings.enableAI || !state.settings.autoSuggestTags || !state.aiReady) {
    return;
  }

  const textInput = byId('prompt-text');
  const tagsHidden = byId('prompt-tags');
  const suggestionsEl = document.getElementById('pn-tag-suggestions');

  if (!textInput || !tagsHidden) return;
  if (String(tagsHidden.value || '').trim()) return;

  const promptText = String(textInput.value || '').trim();
  if (!promptText) return;

  try {
    const response = await window.AIBridge.suggestTags(promptText);
    const tags = response?.tags ?? [];
    if (!tags.length || !suggestionsEl) return;

    clearChildren(suggestionsEl);
    const label = document.createElement('span');
    label.className = 'pn-tag-suggestions__label';
    label.textContent = 'Suggested';
    suggestionsEl.appendChild(label);

    for (const tag of tags) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pn-tag-chip--suggestion';
      chip.textContent = tag;
      chip.addEventListener('click', () => {
        addTagBadge(tag);
        chip.remove();
        if (!suggestionsEl.querySelector('.pn-tag-chip--suggestion')) {
          clearChildren(suggestionsEl);
        }
      });
      suggestionsEl.appendChild(chip);
    }
  } catch (_) {
    // non-fatal
  }
};

const persistPrompt = async (payload) => {
  const saved = await window.Store.savePrompt({
    ...payload,
    embedding: null
  });

  if (!saved) {
    const storageError = window.Store?.getLastError?.() || '';
    if (window.Store?.isQuotaError?.(storageError)) {
      await showToast('Storage quota exceeded. Delete older prompts or chat history, then try again.');
      if (window.AppShell?.switchTab) {
        await window.AppShell.switchTab('history');
      }
    } else {
      await showToast('Save failed.');
    }
    return false;
  }

  if (state.aiReady && saved.id) {
    void window.AIBridge.cacheAdd(saved);
  }

  await close();

  if (typeof callbacks.onPromptSaved === 'function') {
    await callbacks.onPromptSaved();
  }

  await showToast('Prompt saved to library.');
  return true;
};

const saveDuplicateAnyway = async () => {
  if (!state.pendingDuplicatePayload) {
    return;
  }

  await persistPrompt(state.pendingDuplicatePayload);
};

const savePlainFromModal = async () => {
  const titleInput = byId('prompt-title');
  const textInput = byId('prompt-text');
  const tagsHidden = byId('prompt-tags');

  if (!titleInput || !textInput || !tagsHidden) return;

  const titleValue = String(titleInput.value || '').trim();
  const textValue = normalizeTemplateText(textInput.value || '').trim();

  if (!titleValue || !textValue) {
    await showToast('Title and prompt text are required.');
    return;
  }

  const payload = {
    title: titleValue,
    text: textValue,
    tags: parseTags(tagsHidden.value || ''),
    category: null
  };

  if (state.aiReady && state.settings.enableAI && state.settings.duplicateCheck) {
    try {
      const response = await window.AIBridge.checkDuplicate(textValue);
      if (response?.match) {
        const dupWarn = document.getElementById('pn-duplicate-warning');
        if (dupWarn) {
          dupWarn.classList.remove('pn-hidden');
          clearChildren(dupWarn);

          const title = response?.match?.prompt?.title || 'Untitled';
          const warning = document.createElement('strong');
          warning.textContent = `Looks similar to: "${title}"`;

          const actions = document.createElement('div');
          actions.className = 'pn-duplicate-actions';

          const saveAnywayButton = document.createElement('button');
          saveAnywayButton.className = 'pn-btn-ignore';
          saveAnywayButton.type = 'button';
          saveAnywayButton.textContent = 'Save anyway';
          saveAnywayButton.addEventListener('click', () => {
            dupWarn.classList.add('pn-hidden');
            void persistPrompt(payload);
          });

          actions.appendChild(saveAnywayButton);
          dupWarn.appendChild(warning);
          dupWarn.appendChild(actions);
          return;
        }
      }
    } catch (_) {
      // Non-fatal.
    }
  }

  await persistPrompt(payload);
};

const saveTemplateFromModal = async () => {
  const titleInput = byId('pn-template-title');
  const textInput = byId('pn-template-text');
  const tagsInput = byId('pn-template-tags');

  if (!titleInput || !textInput || !tagsInput) return;

  const titleValue = String(titleInput.value || '').trim();
  const textValue = normalizeTemplateText(textInput.value || '').trim();

  if (!titleValue || !textValue) {
    await showToast('Title and template text are required.');
    return;
  }

  const payload = {
    title: titleValue,
    text: textValue,
    tags: parseTags(tagsInput.value || ''),
    category: null
  };

  await persistPrompt(payload);
};

const updateDetectedVars = () => {
  const textarea = document.getElementById('pn-template-text');
  const container = document.getElementById('pn-detected-vars');
  if (!textarea || !container || !window.TemplateParser?.parse) return;

  const vars = window.TemplateParser.parse(normalizeTemplateText(textarea.value));

  if (!vars.length) {
    clearChildren(container);
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  clearChildren(container);

  const heading = document.createElement('span');
  heading.className = 'pn-detected-label';
  heading.textContent = 'Blanks detected:';
  container.appendChild(heading);

  vars.forEach((variable) => {
    const chip = document.createElement('span');
    chip.className = `pn-detected-var ${variable.required ? 'required' : 'optional'}`;
    chip.textContent = window.TemplateParser.toDisplayLabel(variable);
    container.appendChild(chip);
  });
};

const bindVariableToolbar = () => {
  const toolbar = document.getElementById('pn-var-toolbar');
  const textarea = document.getElementById('pn-template-text');
  if (!toolbar || !textarea) return;

  toolbar.querySelectorAll('.pn-var-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const snippet = String(btn.dataset.snippet || '');
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

  textarea.addEventListener('input', updateDetectedVars);
};

const bindEvents = () => {
  byId('pn-mode-plain')?.addEventListener('click', () => setMode('plain'));
  byId('pn-mode-template')?.addEventListener('click', () => {
    setMode('template');
    updateDetectedVars();
  });

  byId('pn-mode-cancel')?.addEventListener('click', () => {
    void close();
  });

  byId('pn-plain-back')?.addEventListener('click', () => setMode('selector'));
  byId('pn-template-back')?.addEventListener('click', () => setMode('selector'));

  byId('save-new-prompt')?.addEventListener('click', () => {
    void savePlainFromModal();
  });

  byId('pn-template-save')?.addEventListener('click', () => {
    void saveTemplateFromModal();
  });

  byId('confirm-duplicate')?.addEventListener('click', () => {
    void saveDuplicateAnyway();
  });

  byId('cancel-modal')?.addEventListener('click', () => {
    void close();
  });

  byId('pn-template-cancel')?.addEventListener('click', () => {
    void close();
  });

  document.querySelector('[data-close-modal]')?.addEventListener('click', () => {
    void close();
  });

  byId('pn-improve-prompt-btn')?.addEventListener('click', async () => {
    if (state.settings?.polishWithGemini === false) {
      await showToast('Enable \"Polish button\" in Settings to use this.');
      return;
    }

    const textInput = byId('prompt-text');
    const tagsHidden = byId('prompt-tags');

    if (!textInput || !String(textInput.value || '').trim()) {
      await showToast('Enter a prompt to optimize.');
      return;
    }

    try {
      const tags = parseTags(tagsHidden?.value || '');
      if (typeof callbacks.onOpenImprove === 'function') {
        await callbacks.onOpenImprove(null, textInput.value, tags, { context: 'add_modal' });
      }
    } catch (_) {
      await showToast('Could not open optimizer.');
    }
  });

  byId('prompt-text')?.addEventListener('blur', () => {
    void prefillSuggestedTags();
  });

  const tagBadgeInput = document.getElementById('prompt-tags-input');
  if (tagBadgeInput) {
    tagBadgeInput.addEventListener('keydown', (event) => {
      const val = String(tagBadgeInput.value || '').trim();
      if ((event.key === ' ' || event.key === 'Enter' || event.key === ',') && val) {
        event.preventDefault();
        addTagBadge(val);
        tagBadgeInput.value = '';
      }
      if (event.key === 'Backspace' && !tagBadgeInput.value) {
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
    badgeWrap.addEventListener('click', (event) => {
      if (event.target === badgeWrap) tagBadgeInput.focus();
    });
  }

  bindVariableToolbar();
};

const setCallbacks = (nextCallbacks = {}) => {
  callbacks.onPromptSaved = nextCallbacks.onPromptSaved || null;
  callbacks.onOpenImprove = nextCallbacks.onOpenImprove || null;
};

window.PromptForm = {
  open,
  openPlainPrefilled,
  close,
  saveFromModal: savePlainFromModal,
  saveDuplicateAnyway,
  prefillSuggestedTags,
  bindEvents,
  setCallbacks,
  setMode,
  updateDetectedVars
};
})();
