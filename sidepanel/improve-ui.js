(() => {
/**
 * File: sidepanel/improve-ui.js
 * Purpose: Improve modal state machine and injection/save/undo workflows.
 */

const { state, UI_FEEDBACK_MS } = window.SidepanelState;

const callbacks = {
  onLibraryChanged: null,
  onPromptTextReplaced: null,
  onSwitchTab: null
};

const improveModalState = {
  promptId: null,
  originalText: '',
  improvedText: '',
  previousText: null,
  tags: [],
  isRunning: false,
  context: 'fab',
  sourceTabId: null
};

const normalizePayload = (value) => {
  if (value && typeof value === 'object') {
    return {
      text: String(value.text || '').trim(),
      tags: Array.isArray(value.tags) ? value.tags.map((tag) => String(tag || '').trim()).filter(Boolean) : [],
      sourceTabId: Number(value.sourceTabId || 0) || null
    };
  }
  return {
    text: String(value || '').trim(),
    tags: [],
    sourceTabId: null
  };
};

const getContext = (promptId, explicitContext = '') => {
  if (explicitContext) return String(explicitContext);
  if (promptId) return 'library_edit';
  const addModal = document.getElementById('add-modal');
  const isAddModalVisible = Boolean(addModal && !addModal.classList.contains('pn-hidden'));
  return isAddModalVisible ? 'add_modal' : 'fab';
};

const setActionLayout = async () => {
  const primaryBtn = document.getElementById('pn-improve-accept');
  const secondaryBtn = document.getElementById('pn-improve-accept-secondary');
  const saveOnlyBtn = document.getElementById('pn-improve-save-only');
  const context = improveModalState.context;

  if (!primaryBtn || !secondaryBtn || !saveOnlyBtn) return;

  secondaryBtn.classList.add('pn-hidden');
  saveOnlyBtn.classList.add('pn-hidden');

  if (context === 'library_edit') {
    primaryBtn.textContent = 'Save Update';
    return;
  }

  if (context === 'add_modal') {
    primaryBtn.textContent = 'Use Improved Text';
    return;
  }

  primaryBtn.textContent = 'Inject into Chat';
  secondaryBtn.textContent = 'Inject + Save';
  saveOnlyBtn.textContent = 'Save to Library';
  secondaryBtn.classList.remove('pn-hidden');
  saveOnlyBtn.classList.remove('pn-hidden');
};

const setButtonsDisabled = (disabled) => {
  [
    'pn-improve-accept',
    'pn-improve-accept-secondary',
    'pn-improve-save-only',
    'pn-improve-retry'
  ].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.disabled = Boolean(disabled);
  });
};

const sendImprovedPromptToTab = (tabId, text) => new Promise((resolve) => {
  chrome.tabs.sendMessage(
    tabId,
    { action: 'APPLY_IMPROVED_PROMPT', text },
    () => resolve(!chrome.runtime.lastError)
  );
});

const tryInjectImprovedPrompt = async (text, preferredTabId = null) => {
  const candidateTabs = [];

  if (preferredTabId) {
    candidateTabs.push({ id: preferredTabId, url: '' });
  }

  const [lastFocusedActive, currentActive] = await Promise.all([
    chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []),
    chrome.tabs.query({ active: true, currentWindow: true }).catch(() => [])
  ]);

  for (const tab of [...lastFocusedActive, ...currentActive]) {
    if (!tab?.id) continue;
    candidateTabs.push(tab);
  }

  const visited = new Set();
  for (const tab of candidateTabs) {
    if (!tab?.id || visited.has(tab.id)) continue;
    visited.add(tab.id);
    const tabUrl = String(tab.url || '').toLowerCase();
    if (tabUrl.startsWith('chrome-extension://')) continue;
    if (await sendImprovedPromptToTab(tab.id, text)) {
      return true;
    }
  }

  return false;
};

const buildFallbackPromptTitle = (text) => {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  if (!compact) return 'Improved Prompt';
  const firstSentence = compact.split(/[.!?]/)[0]?.trim() || compact;
  return firstSentence.slice(0, 64) || 'Improved Prompt';
};

const generatePromptTitle = async (text) => {
  try {
    const response = await window.AIBridge.generatePromptTitle(text);
    const generated = String(response?.title || response?.text || '').replace(/^["']+|["']+$/g, '').trim();
    if (generated) return generated.slice(0, 80);
  } catch (_) {
    // Fall through.
  }
  return buildFallbackPromptTitle(text);
};

const saveImprovedTextToLibrary = async (text, tags = []) => {
  const title = await generatePromptTitle(text);
  const saved = await window.Store.savePrompt({
    title,
    text,
    tags: Array.isArray(tags) ? tags : [],
    category: null,
    embedding: null
  });

  if (saved && state.aiReady && saved.id) {
    void window.AIBridge.cacheAdd(saved);
  }

  return saved;
};

const open = async (promptId, originalText, tags = [], options = {}) => {
  improveModalState.promptId = promptId;
  improveModalState.originalText = originalText;
  improveModalState.improvedText = '';
  improveModalState.tags = tags;
  improveModalState.isRunning = true;
  improveModalState.context = getContext(promptId, options?.context || '');
  improveModalState.sourceTabId = Number(options?.sourceTabId || 0) || null;

  const modal = document.getElementById('pn-improve-modal');
  const loading = document.getElementById('pn-improve-loading');
  const diff = document.getElementById('pn-improve-diff');
  const error = document.getElementById('pn-improve-error');
  const modalStyle = document.getElementById('pn-improve-modal-style');
  const addModalStyle = document.getElementById('pn-improve-style');

  if (!modal) return;

  if (improveModalState.context === 'add_modal' && modalStyle && addModalStyle) {
    modalStyle.value = addModalStyle.value || 'general';
  }

  await setActionLayout();

  modal.classList.remove('pn-hidden');
  loading?.classList.remove('pn-hidden');
  diff?.classList.add('pn-hidden');
  error?.classList.add('pn-hidden');
  setButtonsDisabled(true);

  const style = document.getElementById('pn-improve-modal-style')?.value || 'general';
  try {
    const response = await window.AIBridge.improvePrompt(originalText, tags, style);
    improveModalState.isRunning = false;

    if (response?.error) {
      showError(response.error);
    } else if (response?.text) {
      improveModalState.improvedText = response.text;
      showDiff();
    } else {
      showError('No optimized output. Try another style.');
    }
  } catch (err) {
    improveModalState.isRunning = false;
    showError(err?.message || 'Request failed. Check API key.');
  }
};

const showDiff = () => {
  const loading = document.getElementById('pn-improve-loading');
  const diff = document.getElementById('pn-improve-diff');
  const error = document.getElementById('pn-improve-error');
  const origEl = document.getElementById('pn-improve-original');
  const newEl = document.getElementById('pn-improve-improved');
  const origCount = document.getElementById('pn-improve-orig-count');
  const newCount = document.getElementById('pn-improve-new-count');

  loading?.classList.add('pn-hidden');
  error?.classList.add('pn-hidden');
  diff?.classList.remove('pn-hidden');
  setButtonsDisabled(false);

  if (origEl) origEl.textContent = improveModalState.originalText;
  if (newEl) newEl.textContent = improveModalState.improvedText;

  const origLen = improveModalState.originalText.length;
  const newLen = improveModalState.improvedText.length;
  const charDiff = newLen - origLen;
  const diffLabel = charDiff > 0 ? `+${charDiff}` : `${charDiff}`;

  if (origCount) origCount.textContent = `${origLen} chars`;
  if (newCount) {
    newCount.textContent = `${newLen} chars (${diffLabel})`;
    newCount.classList.toggle('pn-improve-count--positive', charDiff > 0);
    newCount.classList.toggle('pn-improve-count--negative', charDiff < 0);
  }
};

const showError = (message) => {
  const loading = document.getElementById('pn-improve-loading');
  const diff = document.getElementById('pn-improve-diff');
  const error = document.getElementById('pn-improve-error');
  const errorMsg = document.getElementById('pn-improve-error-msg');
  const normalized = String(message || '').trim();
  const isMissingApiKey = /api\s*key/i.test(normalized) && /settings|missing|not\s*found|not\s*configured/i.test(normalized);

  loading?.classList.add('pn-hidden');
  diff?.classList.add('pn-hidden');
  error?.classList.remove('pn-hidden');
  if (errorMsg) {
    errorMsg.textContent = isMissingApiKey ? 'Gemini API Key Not Configured' : normalized;
  }

  const existingAction = document.getElementById('pn-improve-go-settings');
  existingAction?.remove();

  if (isMissingApiKey && error) {
    const action = document.createElement('button');
    action.id = 'pn-improve-go-settings';
    action.type = 'button';
    action.className = 'pn-btn pn-btn--primary';
    action.textContent = 'Go to Settings';
    action.addEventListener('click', () => {
      close();
      if (typeof callbacks.onSwitchTab === 'function') {
        void callbacks.onSwitchTab('settings');
      }
    });
    error.appendChild(action);
  }
  setButtonsDisabled(false);
};

const close = () => {
  const modal = document.getElementById('pn-improve-modal');
  modal?.classList.add('pn-hidden');
  improveModalState.isRunning = false;
};

const accept = async (mode = 'primary') => {
  const {
    promptId,
    originalText,
    improvedText,
    context,
    tags,
    sourceTabId
  } = improveModalState;

  if (!improvedText) return;

  improveModalState.previousText = originalText;

  if (context === 'add_modal' && !promptId) {
    close();
    const textInput = document.getElementById('prompt-text');
    const addModal = document.getElementById('add-modal');
    const isAddModalVisible = Boolean(addModal && !addModal.classList.contains('pn-hidden'));
    if (textInput && isAddModalVisible) {
      textInput.value = improvedText;
      if (typeof callbacks.onPromptTextReplaced === 'function') {
        await callbacks.onPromptTextReplaced();
      }
      await showToast('Prompt optimized.');
    }
    return;
  }

  if (!promptId && context === 'fab') {
    close();
    const shouldInject = mode === 'primary' || mode === 'secondary';
    const shouldSave = mode === 'secondary' || mode === 'save';
    let injected = false;

    if (shouldInject) {
      injected = await tryInjectImprovedPrompt(improvedText, sourceTabId);
      if (!injected) {
        await showToast('Injection failed. Keep target tab open and retry.');
      }
    }

    if (shouldSave) {
      const saved = await saveImprovedTextToLibrary(improvedText, tags);
      if (!saved) {
        await showToast('Optimized prompt save failed.');
        return;
      }
      if (typeof callbacks.onLibraryChanged === 'function') {
        await callbacks.onLibraryChanged();
      }
    }

    if (mode === 'primary' && injected) {
      await showToast('Prompt injected.');
      return;
    }

    if (mode === 'secondary') {
      if (injected) {
        await showToast('Injected and saved to library.');
      } else {
        await showToast('Saved to library. Injection failed.');
      }
      return;
    }

    if (mode === 'save') {
      await showToast('Optimized prompt saved.');
    }
    return;
  }

  close();
  const updated = await window.Store.updatePrompt(promptId, { text: improvedText });

  if (updated) {
    if (typeof callbacks.onLibraryChanged === 'function') {
      await callbacks.onLibraryChanged();
    }

    const toast = document.createElement('div');
    toast.className = 'pn-toast pn-toast--undo';
    toast.innerHTML = 'Prompt optimized. <button class="pn-toast-undo-btn" type="button">Undo</button>';
    document.body.appendChild(toast);

    const undoBtn = toast.querySelector('.pn-toast-undo-btn');
    undoBtn?.addEventListener('click', async () => {
      await window.Store.updatePrompt(promptId, { text: originalText });
      if (typeof callbacks.onLibraryChanged === 'function') {
        await callbacks.onLibraryChanged();
      }
      toast.remove();
      showToast('Reverted to original prompt.');
    });

    setTimeout(() => toast.remove(), UI_FEEDBACK_MS.IMPROVE_UNDO);
  } else {
    showToast('Optimized prompt save failed.');
  }
};

const retry = async () => {
  const { promptId, originalText, tags, context, sourceTabId } = improveModalState;
  await open(promptId, originalText, tags, { context, sourceTabId });
};

const bindEvents = () => {
  document.getElementById('pn-improve-accept')?.addEventListener('click', () => {
    void accept('primary');
  });

  document.getElementById('pn-improve-accept-secondary')?.addEventListener('click', () => {
    void accept('secondary');
  });

  document.getElementById('pn-improve-save-only')?.addEventListener('click', () => {
    void accept('save');
  });

  document.getElementById('pn-improve-reject')?.addEventListener('click', close);

  document.getElementById('pn-improve-retry')?.addEventListener('click', () => {
    void retry();
  });

  document.querySelector('[data-close-improve]')?.addEventListener('click', close);

  document.getElementById('pn-improve-modal-style')?.addEventListener('change', (event) => {
    const addStyle = document.getElementById('pn-improve-style');
    if (addStyle) addStyle.value = String(event.target?.value || 'general');
  });
};

const setCallbacks = (nextCallbacks = {}) => {
  callbacks.onLibraryChanged = nextCallbacks.onLibraryChanged || null;
  callbacks.onPromptTextReplaced = nextCallbacks.onPromptTextReplaced || null;
  callbacks.onSwitchTab = nextCallbacks.onSwitchTab || null;
};

window.ImproveUI = {
  normalizePayload,
  open,
  close,
  retry,
  accept,
  bindEvents,
  setCallbacks
};
})();
