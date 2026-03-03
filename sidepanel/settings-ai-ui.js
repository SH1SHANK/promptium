(() => {
/**
 * File: sidepanel/settings-ai-ui.js
 * Purpose: Settings panel state management and AI runtime synchronization.
 */

const { KEYS, DEFAULT_SETTINGS, state, UI_FEEDBACK_MS } = window.SidepanelState;

const callbacks = {
  onApplyExportDefaults: null,
  onRenderExportPreview: null,
  onLoadSmartSuggestions: null
};

let aiStatusHandler = null;

const setAiDisabledBadge = async () => {
  const statusNode = byId('ai-status');
  const progressTrack = byId('ai-progress-track');
  const progressText = byId('ai-progress-text');

  if (statusNode) {
    statusNode.classList.remove('pn-ai-status--loading', 'pn-ai-status--ready');
    statusNode.classList.add('pn-ai-status--unavailable');
    statusNode.innerHTML = '<span class="pn-ai-dot"></span><span class="pn-ai-status__text">AI Disabled</span>';
  }

  if (progressTrack) {
    progressTrack.classList.add('hidden');
  }

  if (progressTrack instanceof HTMLProgressElement) {
    progressTrack.value = 0;
  }

  if (progressText) {
    progressText.textContent = 'Disabled';
  }

  const modelPill = document.getElementById('pn-model-pill');
  if (modelPill) modelPill.classList.remove('pn-sv-model-pill--ready');
};

const normalizeSettings = (raw) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const exportFormat = String(source.defaultExportFormat || DEFAULT_SETTINGS.defaultExportFormat);
  return {
    enableAI: Boolean(source.enableAI),
    semanticSearch: Boolean(source.semanticSearch),
    autoSuggestTags: Boolean(source.autoSuggestTags),
    duplicateCheck: Boolean(source.duplicateCheck),
    defaultExportFormat: exportFormat === 'pdf' ? 'pdf' : 'markdown',
    defaultIncludeDate: Boolean(source.defaultIncludeDate),
    defaultIncludePlatform: Boolean(source.defaultIncludePlatform),
    userContext: String(source.userContext || '').trim()
  };
};

const load = async () => {
  try {
    const snapshot = await chrome.storage.local.get([KEYS.SETTINGS_KEY, 'userContext']);
    const saved = snapshot?.[KEYS.SETTINGS_KEY] || {};
    const merged = { ...DEFAULT_SETTINGS, ...(saved || {}) };
    const legacyContext = String(snapshot?.userContext || '').trim();
    if (!merged.userContext && legacyContext) merged.userContext = legacyContext;
    state.settings = normalizeSettings(merged);
  } catch (_) {
    state.settings = { ...DEFAULT_SETTINGS };
  }
};

const save = async () => {
  await chrome.storage.local.set({
    [KEYS.SETTINGS_KEY]: state.settings,
    userContext: String(state.settings.userContext || '').trim()
  });
};

const getControls = () => ({
  enableAI: byId('setting-enable-ai'),
  semanticSearch: byId('setting-semantic-search'),
  autoSuggestTags: byId('setting-auto-suggest'),
  duplicateCheck: byId('setting-duplicate-check'),
  defaultExportFormat: byId('setting-export-format'),
  defaultIncludeDate: byId('setting-export-date'),
  defaultIncludePlatform: byId('setting-export-platform'),
  userContext: byId('setting-user-context')
});

const readControlsSnapshot = () => {
  const controls = getControls();
  return normalizeSettings({
    enableAI: controls.enableAI?.checked,
    semanticSearch: controls.semanticSearch?.checked,
    autoSuggestTags: controls.autoSuggestTags?.checked,
    duplicateCheck: controls.duplicateCheck?.checked,
    defaultExportFormat: controls.defaultExportFormat?.value,
    defaultIncludeDate: controls.defaultIncludeDate?.checked,
    defaultIncludePlatform: controls.defaultIncludePlatform?.checked,
    userContext: controls.userContext?.value
  });
};

const areSettingsEqual = (left, right) => {
  const a = normalizeSettings(left);
  const b = normalizeSettings(right);
  return (
    a.enableAI === b.enableAI &&
    a.semanticSearch === b.semanticSearch &&
    a.autoSuggestTags === b.autoSuggestTags &&
    a.duplicateCheck === b.duplicateCheck &&
    a.defaultExportFormat === b.defaultExportFormat &&
    a.defaultIncludeDate === b.defaultIncludeDate &&
    a.defaultIncludePlatform === b.defaultIncludePlatform &&
    a.userContext === b.userContext
  );
};

const renderControls = (settingsInput = state.settings) => {
  const settings = normalizeSettings(settingsInput);
  const controls = getControls();

  if (controls.enableAI) controls.enableAI.checked = Boolean(settings.enableAI);
  if (controls.semanticSearch) controls.semanticSearch.checked = Boolean(settings.semanticSearch);
  if (controls.autoSuggestTags) controls.autoSuggestTags.checked = Boolean(settings.autoSuggestTags);
  if (controls.duplicateCheck) controls.duplicateCheck.checked = Boolean(settings.duplicateCheck);
  if (controls.defaultExportFormat) controls.defaultExportFormat.value = String(settings.defaultExportFormat || 'markdown');
  if (controls.defaultIncludeDate) controls.defaultIncludeDate.checked = Boolean(settings.defaultIncludeDate);
  if (controls.defaultIncludePlatform) controls.defaultIncludePlatform.checked = Boolean(settings.defaultIncludePlatform);
  if (controls.userContext) controls.userContext.value = String(settings.userContext || '');
};

const readControls = () => {
  state.settings = readControlsSnapshot();
};

const setSettingsStatus = (message, tone = '') => {
  const node = byId('settings-status');

  if (!node) {
    return;
  }

  const normalizedTone = String(tone || '').toLowerCase();
  node.textContent = String(message || '').trim();
  node.classList.remove('pn-status-error', 'pn-status-ok', 'pn-status-info');

  if (normalizedTone === 'error') node.classList.add('pn-status-error');
  if (normalizedTone === 'ok') node.classList.add('pn-status-ok');
  if (normalizedTone === 'info') node.classList.add('pn-status-info');
};

const syncSaveState = async () => {
  const saveButton = byId('save-settings-btn');
  const statusNode = byId('settings-status');
  if (!saveButton) return;
  const draftSettings = readControlsSnapshot();
  const promptiumGeminiKey = await window.SessionStorage.getStoredGeminiKey();
  const currentKey = String(byId('setting-gemini-key')?.value || '').trim();
  const storedKey = String(promptiumGeminiKey || '').trim();

  const hasChanges = !areSettingsEqual(draftSettings, state.settings) || currentKey !== storedKey;
  saveButton.disabled = !hasChanges;
  if (hasChanges) {
    setSettingsStatus('Unsaved changes. Save to apply.', 'info');
    return;
  }
  if (statusNode?.classList.contains('pn-status-info')) {
    setSettingsStatus('');
  }
};

const resetDraft = async () => {
  renderControls(DEFAULT_SETTINGS);
  const draftSettings = readControlsSnapshot();
  const promptiumGeminiKey = await window.SessionStorage.getStoredGeminiKey();
  const currentKey = String(byId('setting-gemini-key')?.value || '').trim();
  const storedKey = String(promptiumGeminiKey || '').trim();

  const hasChanges = !areSettingsEqual(draftSettings, state.settings) || currentKey !== storedKey;
  await syncSaveState();
  if (hasChanges) {
    setSettingsStatus('Defaults loaded. Save settings to apply.', 'info');
    return;
  }
  setSettingsStatus('Settings already match defaults.', 'ok');
};

const syncAiState = async () => {
  if (!state.settings.enableAI) {
    await setAiDisabledBadge();
    state.aiReady = false;
    return false;
  }

  const aiBar = document.getElementById('pn-ai-bar');
  const retryButton = document.getElementById('pn-ai-retry-btn');
  if (aiBar) {
    aiBar.classList.remove('pn-ai-bar--hidden', 'pn-ai-bar--ready');
    aiBar.classList.add('pn-ai-bar--loading');
  }
  retryButton?.classList.add('pn-hidden');

  if (aiStatusHandler) {
    chrome.runtime.onMessage.removeListener(aiStatusHandler);
  }

  aiStatusHandler = (msg) => {
    if (msg?.type === 'AI_DOWNLOAD_PROGRESS') {
      const progressText = document.getElementById('ai-progress-text');
      if (progressText) progressText.textContent = `Downloading... ${msg.progress}%`;
      return;
    }

    if (msg?.type === 'AI_STATUS') {
      if (msg.status === 'loading') {
        const progressText = document.getElementById('ai-progress-text');
        if (progressText && !progressText.textContent.startsWith('Downloading')) {
          progressText.textContent = 'Initializing...';
        }
        retryButton?.classList.add('pn-hidden');
      }

      if (msg.status === 'ready') {
        state.aiReady = true;
        if (aiBar) {
          aiBar.classList.remove('pn-ai-bar--loading');
          aiBar.classList.add('pn-ai-bar--ready');
        }
        const searchInput = document.getElementById('prompt-search');
        if (searchInput) searchInput.placeholder = 'Semantic search...';

        const progressText = document.getElementById('ai-progress-text');
        if (progressText) progressText.textContent = '✦ Ready';

        const modelPill = document.getElementById('pn-model-pill');
        if (modelPill) modelPill.classList.add('pn-sv-model-pill--ready');
        retryButton?.classList.add('pn-hidden');

        const spark = document.getElementById('pn-search-spark');
        if (spark) spark.classList.remove('pn-hidden');

        const statusNode = document.getElementById('ai-status');
        if (statusNode) {
          statusNode.classList.remove('pn-ai-status--loading', 'pn-ai-status--unavailable');
          statusNode.classList.add('pn-ai-status--ready');
          statusNode.innerHTML = '<span class="pn-ai-dot"></span><span class="pn-ai-status__text">Smart</span>';
        }

        if (typeof callbacks.onLoadSmartSuggestions === 'function') {
          void callbacks.onLoadSmartSuggestions();
        }
      }

      if (msg.status === 'failed') {
        state.aiReady = false;
        if (aiBar) {
          aiBar.classList.remove('pn-ai-bar--loading');
          aiBar.classList.add('pn-ai-bar--hidden');
        }
        const progressText = document.getElementById('ai-progress-text');
        if (progressText) {
          progressText.textContent = msg.error ? `Unavailable - ${msg.error}` : 'Unavailable — using keywords';
        }

        const modelPill = document.getElementById('pn-model-pill');
        if (modelPill) modelPill.classList.remove('pn-sv-model-pill--ready');
        retryButton?.classList.remove('pn-hidden');
      }
    }
  };

  chrome.runtime.onMessage.addListener(aiStatusHandler);

  const result = await window.AIBridge.init();
  const ready = result?.status === 'ready';

  if (ready) {
    state.aiReady = true;
    aiStatusHandler({ type: 'AI_STATUS', status: 'ready' });
  }

  return ready;
};

const saveFromPanel = async () => {
  readControls();
  await save();

  if (typeof callbacks.onApplyExportDefaults === 'function') {
    callbacks.onApplyExportDefaults(state.settings);
  }
  if (typeof callbacks.onRenderExportPreview === 'function') {
    await callbacks.onRenderExportPreview();
  }

  if (state.settings.enableAI) {
    await syncAiState();
  } else {
    await setAiDisabledBadge();
  }

  const geminiKeyInput = document.getElementById('setting-gemini-key');
  if (geminiKeyInput) {
    await window.SessionStorage.setStoredGeminiKey(geminiKeyInput.value);
  }

  setSettingsStatus('Settings saved.', 'ok');
  await syncSaveState();
};

const bindEvents = () => {
  document.getElementById('toggle-key-vis')?.addEventListener('click', () => {
    const keyInput = document.getElementById('setting-gemini-key');
    if (keyInput) {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    }
  });

  document.getElementById('check-api-key')?.addEventListener('click', async () => {
    const btn = document.getElementById('check-api-key');
    const keyInput = document.getElementById('setting-gemini-key');
    const key = keyInput?.value?.trim();
    if (!key || !btn) {
      if (btn) {
        btn.textContent = 'No key';
        btn.classList.add('pn-status-error');
        setTimeout(() => {
          btn.textContent = 'Check';
          btn.classList.remove('pn-status-error', 'pn-status-ok');
        }, UI_FEEDBACK_MS.API_CHECK_RESET_SHORT);
      }
      return;
    }

    btn.textContent = '...';
    btn.classList.remove('pn-status-error', 'pn-status-ok');
    try {
      const res = await chrome.runtime.sendMessage({ action: 'VALIDATE_GEMINI_KEY', key });
      if (res?.ok) {
        btn.textContent = '✓ Valid';
        btn.classList.add('pn-status-ok');
      } else {
        btn.textContent = '✗ Invalid';
        btn.classList.add('pn-status-error');
      }
    } catch {
      btn.textContent = '✗ Error';
      btn.classList.add('pn-status-error');
    }
    setTimeout(() => {
      btn.textContent = 'Check';
      btn.classList.remove('pn-status-error', 'pn-status-ok');
    }, UI_FEEDBACK_MS.API_CHECK_RESET_LONG);
  });

  byId('pn-ai-retry-btn')?.addEventListener('click', () => {
    void syncAiState();
  });

  byId('save-settings-btn')?.addEventListener('click', () => {
    void saveFromPanel();
  });

  byId('reset-settings-btn')?.addEventListener('click', () => {
    void resetDraft();
  });

  const settingsControlIds = [
    'setting-enable-ai',
    'setting-semantic-search',
    'setting-auto-suggest',
    'setting-duplicate-check',
    'setting-export-format',
    'setting-export-date',
    'setting-export-platform',
    'setting-user-context',
    'setting-gemini-key'
  ];

  for (const controlId of settingsControlIds) {
    const control = document.getElementById(controlId);
    if (!control) continue;
    control.addEventListener('change', () => {
      void syncSaveState();
    });
    if (controlId === 'setting-user-context') {
      control.addEventListener('input', () => {
        void syncSaveState();
      });
    }
  }
};

const setCallbacks = (nextCallbacks = {}) => {
  callbacks.onApplyExportDefaults = nextCallbacks.onApplyExportDefaults || null;
  callbacks.onRenderExportPreview = nextCallbacks.onRenderExportPreview || null;
  callbacks.onLoadSmartSuggestions = nextCallbacks.onLoadSmartSuggestions || null;
};

window.SettingsAI = {
  load,
  renderControls,
  syncSaveState,
  resetDraft,
  saveFromPanel,
  syncAiState,
  setAiDisabledBadge,
  setSettingsStatus,
  bindEvents,
  setCallbacks
};
})();
