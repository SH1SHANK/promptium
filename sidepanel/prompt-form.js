(() => {
/**
 * File: sidepanel/prompt-form.js
 * Purpose: Add prompt modal lifecycle, tag badges, duplicate checks, and persistence.
 */

const { state } = window.SidepanelState;

const callbacks = {
  onPromptSaved: null,
  onOpenImprove: null
};

const open = async () => {
  const modal = byId('add-modal');
  const title = byId('prompt-title');
  const text = byId('prompt-text');
  const tags = byId('prompt-tags');
  const confirmDuplicate = byId('confirm-duplicate');

  state.pendingDuplicatePayload = null;

  if (title) title.value = '';
  if (text) text.value = '';
  if (tags) tags.value = '';

  const badgeWrap = document.getElementById('tag-badges-wrap');
  if (badgeWrap) {
    badgeWrap.querySelectorAll('.pn-tag-badge').forEach((badge) => badge.remove());
  }
  const tagInput = document.getElementById('prompt-tags-input');
  if (tagInput) tagInput.value = '';

  const suggestionsEl = document.getElementById('pn-tag-suggestions');
  if (suggestionsEl) suggestionsEl.innerHTML = '';
  const dupWarnEl = document.getElementById('pn-duplicate-warning');
  if (dupWarnEl) {
    dupWarnEl.innerHTML = '';
    dupWarnEl.classList.add('pn-hidden');
  }

  confirmDuplicate?.classList.add('hidden');
  modal?.classList.remove('pn-hidden');
  title?.focus();
};

const close = async () => {
  const modal = byId('add-modal');
  const confirmDuplicate = byId('confirm-duplicate');

  state.pendingDuplicatePayload = null;
  confirmDuplicate?.classList.add('hidden');
  modal?.classList.add('pn-hidden');
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

    suggestionsEl.innerHTML = '<span class="pn-tag-suggestions__label">Suggested</span>';
    for (const tag of tags) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pn-tag-chip--suggestion';
      chip.textContent = tag;
      chip.addEventListener('click', () => {
        addTagBadge(tag);
        chip.remove();
        if (!suggestionsEl.querySelector('.pn-tag-chip--suggestion')) {
          suggestionsEl.innerHTML = '';
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

const saveFromModal = async () => {
  const titleInput = byId('prompt-title');
  const textInput = byId('prompt-text');
  const tagsHidden = byId('prompt-tags');

  if (!titleInput || !textInput || !tagsHidden) return;

  const titleValue = String(titleInput.value || '').trim();
  const textValue = String(textInput.value || '').trim();

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
          dupWarn.innerHTML = `
            <strong>Looks similar to: "${escapeHtml(response.match.prompt?.title || 'Untitled')}"</strong>
            <div class="pn-duplicate-actions">
              <button class="pn-btn-ignore" id="pn-dup-save-anyway" type="button">Save anyway</button>
            </div>
          `;
          document.getElementById('pn-dup-save-anyway')?.addEventListener('click', () => {
            dupWarn.classList.add('pn-hidden');
            void persistPrompt(payload);
          });
          return;
        }
      }
    } catch (_) {
      // Non-fatal.
    }
  }

  await persistPrompt(payload);
};

const bindEvents = () => {
  byId('save-new-prompt')?.addEventListener('click', () => {
    void saveFromModal();
  });

  byId('confirm-duplicate')?.addEventListener('click', () => {
    void saveDuplicateAnyway();
  });

  byId('cancel-modal')?.addEventListener('click', () => {
    void close();
  });

  document.querySelector('[data-close-modal]')?.addEventListener('click', () => {
    void close();
  });

  byId('pn-improve-prompt-btn')?.addEventListener('click', async () => {
    const textInput = byId('prompt-text');
    const tagsHidden = byId('prompt-tags');

    if (!textInput || !textInput.value.trim()) {
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
};

const setCallbacks = (nextCallbacks = {}) => {
  callbacks.onPromptSaved = nextCallbacks.onPromptSaved || null;
  callbacks.onOpenImprove = nextCallbacks.onOpenImprove || null;
};

window.PromptForm = {
  open,
  close,
  saveFromModal,
  saveDuplicateAnyway,
  prefillSuggestedTags,
  bindEvents,
  setCallbacks
};
})();
