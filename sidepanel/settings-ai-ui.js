(() => {
/**
 * File: sidepanel/settings-ai-ui.js
 * Purpose: Settings panel state management, tabs, autosave preferences, and AI runtime synchronization.
 */

const { KEYS, DEFAULT_SETTINGS, state, UI_FEEDBACK_MS } = window.SidepanelState;

const callbacks = {
  onApplyExportDefaults: null,
  onRenderExportPreview: null,
  onLoadSmartSuggestions: null
};

const KNOWN_PLATFORMS = [
  { key: 'chatgpt', label: 'ChatGPT' },
  { key: 'claude', label: 'Claude' },
  { key: 'gemini', label: 'Gemini' },
  { key: 'perplexity', label: 'Perplexity' },
  { key: 'copilot', label: 'Copilot' }
];

let aiStatusHandler = null;
let autoSaveTimer = null;
let statusResetTimer = null;

const EXPORT_FORMAT_ALIASES = Object.freeze({
  text: 'txt',
  jpg: 'jpeg',
  image: 'png'
});

const ALLOWED_EXPORT_FORMATS = new Set([
  'markdown',
  'txt',
  'json',
  'pdf',
  'png',
  'jpeg',
  'notion',
  'obsidian'
]);

const normalizeDefaultExportFormat = (value) => {
  const raw = String(value || '').toLowerCase().trim();
  const alias = EXPORT_FORMAT_ALIASES[raw] || raw;
  return ALLOWED_EXPORT_FORMATS.has(alias) ? alias : 'markdown';
};

const cloneObject = (value) => JSON.parse(JSON.stringify(value));

const normalizeCustomPlatforms = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => ({
      id: String(entry?.id || crypto.randomUUID()),
      name: String(entry?.name || '').trim(),
      urlPattern: String(entry?.urlPattern || '').trim(),
      input: String(entry?.input || '').trim(),
      userMsg: String(entry?.userMsg || '').trim(),
      botMsg: String(entry?.botMsg || '').trim(),
      inputParent: String(entry?.inputParent || 'form, body').trim()
    }))
    .filter((entry) => entry.name && entry.urlPattern && entry.input && entry.userMsg && entry.botMsg);
};

const normalizeSettings = (raw) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const enabledPlatforms = source.enabledPlatforms && typeof source.enabledPlatforms === 'object'
    ? source.enabledPlatforms
    : DEFAULT_SETTINGS.enabledPlatforms;
  const fabActions = source.fabActions && typeof source.fabActions === 'object'
    ? source.fabActions
    : DEFAULT_SETTINGS.fabActions;
  const visibleTabs = source.visibleTabs && typeof source.visibleTabs === 'object'
    ? source.visibleTabs
    : DEFAULT_SETTINGS.visibleTabs;

  return {
    enableAI: Boolean(source.enableAI),
    semanticSearch: Boolean(source.semanticSearch),
    autoSuggestTags: Boolean(source.autoSuggestTags),
    duplicateCheck: Boolean(source.duplicateCheck),
    polishWithGemini: source.polishWithGemini !== false,
    enabledPlatforms: {
      chatgpt: enabledPlatforms.chatgpt !== false,
      claude: enabledPlatforms.claude !== false,
      gemini: enabledPlatforms.gemini !== false,
      perplexity: enabledPlatforms.perplexity !== false,
      copilot: enabledPlatforms.copilot !== false
    },
    customPlatforms: normalizeCustomPlatforms(source.customPlatforms),
    fabPosition: source.fabPosition === 'left' ? 'left' : 'right',
    fabStyle: ['circle', 'pill', 'icon-only'].includes(String(source.fabStyle || '')) ? source.fabStyle : 'circle',
    fabActions: {
      savePrompt: fabActions.savePrompt !== false,
      exportChat: fabActions.exportChat !== false,
      continueChat: fabActions.continueChat !== false,
      promptLibrary: fabActions.promptLibrary !== false
    },
    visibleTabs: {
      prompts: visibleTabs.prompts !== false,
      export: visibleTabs.export !== false,
      history: visibleTabs.history !== false,
      tags: visibleTabs.tags !== false
    },
    promptCardDensity: String(source.promptCardDensity || DEFAULT_SETTINGS.promptCardDensity) === 'compact'
      ? 'compact'
      : 'comfortable',
    defaultExportFormat: normalizeDefaultExportFormat(source.defaultExportFormat || DEFAULT_SETTINGS.defaultExportFormat),
    defaultExportNaming: String(source.defaultExportNaming || DEFAULT_SETTINGS.defaultExportNaming) === 'manual' ? 'manual' : 'smart',
    autoSaveExportsToHistory: source.autoSaveExportsToHistory !== false,
    defaultIncludeDate: Boolean(source.defaultIncludeDate),
    defaultIncludePlatform: Boolean(source.defaultIncludePlatform),
    bookmarkShortcut: String(source.bookmarkShortcut || DEFAULT_SETTINGS.bookmarkShortcut || 'Alt+Shift+B').trim() || 'Alt+Shift+B',
    hoverPreviewEnabled: source.hoverPreviewEnabled !== false,
    hoverPreviewDelay: Math.min(800, Math.max(200, Number(source.hoverPreviewDelay) || 400)),
    continueDefaultMode: ['FULL_SUMMARY', 'KEY_POINTS', 'RECENT_ONLY'].includes(String(source.continueDefaultMode || ''))
      ? String(source.continueDefaultMode)
      : 'FULL_SUMMARY',
    userContext: String(source.userContext || '').trim()
  };
};

const load = async () => {
  try {
    const snapshot = await chrome.storage.local.get([KEYS.SETTINGS_KEY, 'userContext']);
    const saved = snapshot?.[KEYS.SETTINGS_KEY] || {};
    const merged = { ...cloneObject(DEFAULT_SETTINGS), ...(saved || {}) };
    const legacyContext = String(snapshot?.userContext || '').trim();
    if (!merged.userContext && legacyContext) merged.userContext = legacyContext;
    state.settings = normalizeSettings(merged);
  } catch (_error) {
    state.settings = normalizeSettings(DEFAULT_SETTINGS);
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
  polishWithGemini: byId('setting-polish-toggle'),
  defaultExportFormat: byId('setting-export-format'),
  defaultIncludeDate: byId('setting-export-date'),
  defaultIncludePlatform: byId('setting-export-platform'),
  userContext: byId('setting-user-context'),

  fabPosition: byId('setting-fab-position'),
  fabStyle: byId('setting-fab-style'),
  fabSave: byId('setting-fab-save'),
  fabExport: byId('setting-fab-export'),
  fabContinue: byId('setting-fab-continue'),
  fabLibrary: byId('setting-fab-library'),

  tabPrompts: byId('setting-tab-prompts'),
  tabExport: byId('setting-tab-export'),
  tabHistory: byId('setting-tab-history'),
  tabTags: byId('setting-tab-tags'),
  tabWarning: byId('pn-tab-warning'),

  density: byId('setting-density'),
  exportNaming: byId('setting-export-naming'),
  autoSaveHistory: byId('setting-auto-save-history'),
  bookmarkShortcut: byId('setting-bookmark-shortcut'),
  hoverPreview: byId('setting-hover-preview'),
  hoverDelay: byId('setting-hover-delay'),
  continueMode: byId('setting-continue-mode'),

  platformWarning: byId('pn-platform-warning'),
  platformList: byId('pn-platform-list'),
  customPlatforms: byId('pn-custom-platforms')
});

const setSettingsStatus = (message, tone = '') => {
  const node = byId('settings-status');
  if (!node) return;

  node.textContent = String(message || '').trim();
  node.classList.remove('pn-status-error', 'pn-status-ok', 'pn-status-info');

  const normalized = String(tone || '').toLowerCase();
  if (normalized === 'error') node.classList.add('pn-status-error');
  if (normalized === 'ok') node.classList.add('pn-status-ok');
  if (normalized === 'info') node.classList.add('pn-status-info');
};

const flashAutoSaveStatus = (message, tone = 'ok') => {
  setSettingsStatus(message, tone);
  if (statusResetTimer) clearTimeout(statusResetTimer);
  statusResetTimer = setTimeout(() => {
    setSettingsStatus('');
    statusResetTimer = null;
  }, 1800);
};

const applyInterfaceSettings = (settingsInput = state.settings) => {
  const settings = normalizeSettings(settingsInput);
  const body = document.body;
  body?.classList.toggle('pn-density-compact', settings.promptCardDensity === 'compact');

  const promptsTab = document.querySelector('.tab[data-tab="prompts"]');
  const tagsTab = document.querySelector('.tab[data-tab="tags"]');
  const historyBtn = byId('history-btn');

  if (promptsTab) promptsTab.classList.toggle('hidden', !settings.visibleTabs.prompts);
  if (tagsTab) tagsTab.classList.toggle('hidden', !settings.visibleTabs.tags);
  if (historyBtn) historyBtn.classList.toggle('hidden', !settings.visibleTabs.history || ['settings', 'export', 'history', 'continue'].includes(state.activeTab));
};

const renderPlatformRows = () => {
  const controls = getControls();
  if (!controls.platformList) return;

  controls.platformList.innerHTML = '';
  const enabled = state.settings.enabledPlatforms || {};

  KNOWN_PLATFORMS.forEach((platform) => {
    const row = document.createElement('div');
    row.className = 'pn-sv-row';
    row.innerHTML = `
      <div class="pn-sv-row__copy">
        <span class="pn-sv-row__label">${platform.label}</span>
      </div>
      <label class="pn-toggle pn-toggle--sm">
        <input type="checkbox" data-platform-toggle="${platform.key}" ${enabled[platform.key] !== false ? 'checked' : ''} />
        <span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span>
      </label>
    `;
    controls.platformList.appendChild(row);
  });

  const enabledCount = Object.values(enabled).filter(Boolean).length;
  controls.platformWarning?.classList.toggle('pn-hidden', enabledCount > 0);
};

const renderCustomPlatforms = () => {
  const container = byId('pn-custom-platforms');
  if (!container) return;

  const custom = Array.isArray(state.settings.customPlatforms) ? state.settings.customPlatforms : [];
  container.innerHTML = '';

  custom.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'pn-settings-row';
    row.innerHTML = `
      <div class="pn-settings-row__copy">
        <strong>${escapeHtml(entry.name)}</strong>
        <span>${escapeHtml(entry.urlPattern)}</span>
      </div>
      <button type="button" class="pn-btn pn-btn-danger" data-custom-delete="${entry.id}">Remove</button>
    `;
    container.appendChild(row);
  });

  if (!custom.length) {
    const empty = document.createElement('p');
    empty.className = 'pn-sv-api-hint';
    empty.textContent = 'No custom LLMs configured.';
    container.appendChild(empty);
  }
};

const renderSettingsTab = (tab) => {
  const normalized = String(tab || 'ai');
  document.querySelectorAll('.pn-settings-tab').forEach((node) => {
    const active = node.dataset.settingsTab === normalized;
    node.classList.toggle('active', active);
    node.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  document.querySelectorAll('.pn-settings-pane').forEach((pane) => {
    pane.classList.toggle('pn-hidden', pane.dataset.settingsPane !== normalized);
  });
};

const renderControls = (settingsInput = state.settings) => {
  const activeSettingsTab = document.querySelector('.pn-settings-tab.active')?.dataset?.settingsTab || 'ai';
  state.settings = normalizeSettings(settingsInput);
  const controls = getControls();
  const s = state.settings;

  if (controls.enableAI) controls.enableAI.checked = s.enableAI;
  if (controls.semanticSearch) controls.semanticSearch.checked = s.semanticSearch;
  if (controls.autoSuggestTags) controls.autoSuggestTags.checked = s.autoSuggestTags;
  if (controls.duplicateCheck) controls.duplicateCheck.checked = s.duplicateCheck;
  if (controls.polishWithGemini) controls.polishWithGemini.checked = s.polishWithGemini;
  if (controls.defaultExportFormat) controls.defaultExportFormat.value = s.defaultExportFormat;
  if (controls.defaultIncludeDate) controls.defaultIncludeDate.checked = s.defaultIncludeDate;
  if (controls.defaultIncludePlatform) controls.defaultIncludePlatform.checked = s.defaultIncludePlatform;
  if (controls.userContext) controls.userContext.value = s.userContext;

  if (controls.fabPosition) controls.fabPosition.value = s.fabPosition;
  if (controls.fabStyle) controls.fabStyle.value = s.fabStyle;
  if (controls.fabSave) controls.fabSave.checked = s.fabActions.savePrompt;
  if (controls.fabExport) controls.fabExport.checked = s.fabActions.exportChat;
  if (controls.fabContinue) controls.fabContinue.checked = s.fabActions.continueChat;
  if (controls.fabLibrary) controls.fabLibrary.checked = s.fabActions.promptLibrary;

  if (controls.tabPrompts) controls.tabPrompts.checked = s.visibleTabs.prompts;
  if (controls.tabExport) controls.tabExport.checked = s.visibleTabs.export;
  if (controls.tabHistory) controls.tabHistory.checked = s.visibleTabs.history;
  if (controls.tabTags) controls.tabTags.checked = s.visibleTabs.tags;

  if (controls.density) controls.density.value = s.promptCardDensity;
  if (controls.exportNaming) controls.exportNaming.value = s.defaultExportNaming;
  if (controls.autoSaveHistory) controls.autoSaveHistory.checked = s.autoSaveExportsToHistory;
  if (controls.bookmarkShortcut) controls.bookmarkShortcut.value = s.bookmarkShortcut;
  if (controls.hoverPreview) controls.hoverPreview.checked = s.hoverPreviewEnabled;
  if (controls.hoverDelay) controls.hoverDelay.value = String(s.hoverPreviewDelay);
  if (controls.continueMode) controls.continueMode.value = s.continueDefaultMode;

  const anyVisibleTabs = Object.values(s.visibleTabs).some(Boolean);
  controls.tabWarning?.classList.toggle('pn-hidden', anyVisibleTabs);

  renderPlatformRows();
  renderCustomPlatforms();
  renderSettingsTab(activeSettingsTab);
  applyInterfaceSettings(s);

  const versionLabel = byId('pn-version-label');
  if (versionLabel) {
    versionLabel.textContent = chrome.runtime.getManifest()?.version || '0.1.0';
  }
};

const readControlsSnapshot = () => {
  const controls = getControls();
  const current = normalizeSettings(state.settings);

  const next = normalizeSettings({
    ...current,
    enableAI: controls.enableAI?.checked,
    semanticSearch: controls.semanticSearch?.checked,
    autoSuggestTags: controls.autoSuggestTags?.checked,
    duplicateCheck: controls.duplicateCheck?.checked,
    polishWithGemini: controls.polishWithGemini?.checked,
    defaultExportFormat: controls.defaultExportFormat?.value,
    defaultIncludeDate: controls.defaultIncludeDate?.checked,
    defaultIncludePlatform: controls.defaultIncludePlatform?.checked,
    userContext: controls.userContext?.value,

    fabPosition: controls.fabPosition?.value,
    fabStyle: controls.fabStyle?.value,
    fabActions: {
      savePrompt: controls.fabSave?.checked,
      exportChat: controls.fabExport?.checked,
      continueChat: controls.fabContinue?.checked,
      promptLibrary: controls.fabLibrary?.checked
    },
    visibleTabs: {
      prompts: controls.tabPrompts?.checked,
      export: controls.tabExport?.checked,
      history: controls.tabHistory?.checked,
      tags: controls.tabTags?.checked
    },
    promptCardDensity: controls.density?.value,
    defaultExportNaming: controls.exportNaming?.value,
    autoSaveExportsToHistory: controls.autoSaveHistory?.checked,
    bookmarkShortcut: controls.bookmarkShortcut?.value,
    hoverPreviewEnabled: controls.hoverPreview?.checked,
    hoverPreviewDelay: controls.hoverDelay?.value,
    continueDefaultMode: controls.continueMode?.value,
    customPlatforms: current.customPlatforms
  });

  const platformToggles = Array.from(document.querySelectorAll('[data-platform-toggle]'));
  if (platformToggles.length) {
    const enabled = { ...next.enabledPlatforms };
    platformToggles.forEach((input) => {
      const platform = String(input.dataset.platformToggle || '');
      if (!platform) return;
      enabled[platform] = Boolean(input.checked);
    });
    next.enabledPlatforms = enabled;
  }

  if (!Object.values(next.visibleTabs).some(Boolean)) {
    next.visibleTabs.prompts = true;
  }

  return next;
};

const readNonAiSnapshot = () => {
  const controls = getControls();
  const current = normalizeSettings(state.settings);
  const next = normalizeSettings({
    ...current,
    fabPosition: controls.fabPosition?.value,
    fabStyle: controls.fabStyle?.value,
    fabActions: {
      savePrompt: controls.fabSave?.checked,
      exportChat: controls.fabExport?.checked,
      continueChat: controls.fabContinue?.checked,
      promptLibrary: controls.fabLibrary?.checked
    },
    visibleTabs: {
      prompts: controls.tabPrompts?.checked,
      export: controls.tabExport?.checked,
      history: controls.tabHistory?.checked,
      tags: controls.tabTags?.checked
    },
    promptCardDensity: controls.density?.value,
    defaultExportNaming: controls.exportNaming?.value,
    autoSaveExportsToHistory: controls.autoSaveHistory?.checked,
    bookmarkShortcut: controls.bookmarkShortcut?.value,
    hoverPreviewEnabled: controls.hoverPreview?.checked,
    hoverPreviewDelay: controls.hoverDelay?.value,
    continueDefaultMode: controls.continueMode?.value,
    customPlatforms: current.customPlatforms
  });

  const platformToggles = Array.from(document.querySelectorAll('[data-platform-toggle]'));
  if (platformToggles.length) {
    const enabled = { ...next.enabledPlatforms };
    platformToggles.forEach((input) => {
      const platform = String(input.dataset.platformToggle || '');
      if (!platform) return;
      enabled[platform] = Boolean(input.checked);
    });
    next.enabledPlatforms = enabled;
  }

  if (!Object.values(next.visibleTabs).some(Boolean)) {
    next.visibleTabs.prompts = true;
  }

  return next;
};

const areSettingsEqual = (left, right) => JSON.stringify(normalizeSettings(left)) === JSON.stringify(normalizeSettings(right));

const setAiDisabledBadge = async () => {
  const statusNode = byId('ai-status');
  const progressTrack = byId('ai-progress-track');
  const progressText = byId('ai-progress-text');

  if (statusNode) {
    statusNode.classList.remove('pn-ai-status--loading', 'pn-ai-status--ready');
    statusNode.classList.add('pn-ai-status--unavailable');
    statusNode.innerHTML = '<span class="pn-ai-dot"></span><span class="pn-ai-status__text">AI Disabled</span>';
  }

  if (progressTrack) progressTrack.classList.add('hidden');
  if (progressTrack instanceof HTMLProgressElement) progressTrack.value = 0;
  if (progressText) progressText.textContent = 'Disabled';

  const modelPill = byId('pn-model-pill');
  if (modelPill) modelPill.classList.remove('pn-sv-model-pill--ready');
};

const syncAiState = async () => {
  if (!state.settings.enableAI) {
    await setAiDisabledBadge();
    state.aiReady = false;
    return false;
  }

  const aiBar = byId('pn-ai-bar');
  const retryButton = byId('pn-ai-retry-btn');
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
      const progressText = byId('ai-progress-text');
      if (progressText) progressText.textContent = `Downloading... ${msg.progress}%`;
      return;
    }

    if (msg?.type === 'AI_STATUS') {
      if (msg.status === 'loading') {
        const progressText = byId('ai-progress-text');
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
        const progressText = byId('ai-progress-text');
        if (progressText) progressText.textContent = '✦ Ready';
        byId('pn-model-pill')?.classList.add('pn-sv-model-pill--ready');
        byId('pn-search-spark')?.classList.remove('pn-hidden');

        const statusNode = byId('ai-status');
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
        const progressText = byId('ai-progress-text');
        if (progressText) {
          progressText.textContent = msg.error ? `Unavailable - ${msg.error}` : 'Unavailable — using keywords';
        }
        byId('pn-model-pill')?.classList.remove('pn-sv-model-pill--ready');
        retryButton?.classList.remove('pn-hidden');
      }
    }
  };

  chrome.runtime.onMessage.addListener(aiStatusHandler);

  const result = await window.AIBridge.init();
  if (result?.status === 'ready') {
    state.aiReady = true;
    aiStatusHandler({ type: 'AI_STATUS', status: 'ready' });
  }
  return state.aiReady;
};

const syncSaveState = async () => {
  const saveButton = byId('save-settings-btn');
  if (!saveButton) return;

  const draft = readControlsSnapshot();
  const promptiumGeminiKey = await window.SessionStorage.getStoredGeminiKey();
  const currentKey = String(byId('setting-gemini-key')?.value || '').trim();
  const storedKey = String(promptiumGeminiKey || '').trim();

  const hasChanges = !areSettingsEqual(draft, state.settings) || currentKey !== storedKey;
  saveButton.disabled = !hasChanges;

  if (hasChanges) {
    setSettingsStatus('Unsaved AI/API changes. Save to apply.', 'info');
  } else if (byId('settings-status')?.classList.contains('pn-status-info')) {
    setSettingsStatus('');
  }
};

const persistRuntimeAfterSave = async () => {
  if (typeof callbacks.onApplyExportDefaults === 'function') {
    callbacks.onApplyExportDefaults(state.settings);
  }
  if (typeof callbacks.onRenderExportPreview === 'function') {
    await callbacks.onRenderExportPreview();
  }

  applyInterfaceSettings(state.settings);

  if (window.PromptsUI?.render) {
    await window.PromptsUI.render(window.PromptsUI.getSearchValue());
  }
};

const autoSaveNonAi = async () => {
  state.settings = readNonAiSnapshot();
  await save();
  renderControls(state.settings);
  await persistRuntimeAfterSave();
  flashAutoSaveStatus('Preferences saved.', 'ok');
};

const scheduleAutoSaveNonAi = () => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    void autoSaveNonAi();
  }, 180);
};

const saveFromPanel = async () => {
  state.settings = readControlsSnapshot();
  await save();

  const geminiKeyInput = byId('setting-gemini-key');
  if (geminiKeyInput) {
    await window.SessionStorage.setStoredGeminiKey(geminiKeyInput.value);
  }

  await persistRuntimeAfterSave();

  if (state.settings.enableAI) {
    await syncAiState();
  } else {
    await setAiDisabledBadge();
  }

  setSettingsStatus('Settings saved.', 'ok');
  await syncSaveState();
};

const resetDraft = async () => {
  renderControls(DEFAULT_SETTINGS);
  const keyInput = byId('setting-gemini-key');
  if (keyInput) keyInput.value = '';
  setSettingsStatus('Defaults loaded. Save AI/API changes to apply.', 'info');
  await syncSaveState();
};

const addCustomPlatform = async () => {
  const name = String(byId('setting-custom-name')?.value || '').trim();
  const urlPattern = String(byId('setting-custom-url')?.value || '').trim();
  const input = String(byId('setting-custom-input')?.value || '').trim();
  const userMsg = String(byId('setting-custom-user')?.value || '').trim();
  const botMsg = String(byId('setting-custom-bot')?.value || '').trim();

  if (!name || !urlPattern || !input || !userMsg || !botMsg) {
    flashAutoSaveStatus('Fill all custom LLM fields first.', 'error');
    return;
  }

  state.settings.customPlatforms = [
    ...(state.settings.customPlatforms || []),
    {
      id: crypto.randomUUID(),
      name,
      urlPattern,
      input,
      userMsg,
      botMsg,
      inputParent: 'form, body'
    }
  ];

  byId('setting-custom-name').value = '';
  byId('setting-custom-url').value = '';
  byId('setting-custom-input').value = '';
  byId('setting-custom-user').value = '';
  byId('setting-custom-bot').value = '';

  renderCustomPlatforms();
  await autoSaveNonAi();
};

const exportAllData = async () => {
  const snapshot = await chrome.storage.local.get(['prompts', 'chatHistory', 'bookmarks', KEYS.SETTINGS_KEY]);
  const payload = {
    prompts: Array.isArray(snapshot.prompts) ? snapshot.prompts : [],
    chatHistory: Array.isArray(snapshot.chatHistory) ? snapshot.chatHistory : [],
    bookmarks: snapshot.bookmarks && typeof snapshot.bookmarks === 'object' ? snapshot.bookmarks : {},
    settings: normalizeSettings(snapshot[KEYS.SETTINGS_KEY] || state.settings),
    exportedAt: new Date().toISOString(),
    version: chrome.runtime.getManifest()?.version || '0.1.0'
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `promptium_data_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  flashAutoSaveStatus('Data export complete.', 'ok');
};

const importAllData = async (file) => {
  if (!file) return;
  const text = await file.text();
  const parsed = JSON.parse(text);

  const updates = {};
  if (Array.isArray(parsed?.prompts)) updates.prompts = parsed.prompts;
  if (Array.isArray(parsed?.chatHistory)) updates.chatHistory = parsed.chatHistory;
  if (parsed?.bookmarks && typeof parsed.bookmarks === 'object') updates.bookmarks = parsed.bookmarks;
  if (parsed?.settings && typeof parsed.settings === 'object') {
    const normalized = normalizeSettings(parsed.settings);
    updates[KEYS.SETTINGS_KEY] = normalized;
    updates.userContext = String(normalized.userContext || '').trim();
    state.settings = normalized;
  }

  if (!Object.keys(updates).length) {
    flashAutoSaveStatus('Import file has no valid Promptium data.', 'error');
    return;
  }

  await chrome.storage.local.set(updates);
  renderControls(state.settings);
  await persistRuntimeAfterSave();
  await window.HistoryUI?.render?.();
  await window.TagsUI?.render?.();
  flashAutoSaveStatus('Data imported.', 'ok');
};

const bindInlineDanger = (triggerId, confirmId, action) => {
  const trigger = byId(triggerId);
  const confirm = byId(confirmId);
  if (!trigger || !confirm) return;

  trigger.addEventListener('click', () => {
    confirm.classList.remove('pn-hidden');
    trigger.classList.add('pn-hidden');
  });

  confirm.addEventListener('click', () => {
    void (async () => {
      await action();
      confirm.classList.add('pn-hidden');
      trigger.classList.remove('pn-hidden');
    })();
  });
};

const formatShortcutFromEvent = (event) => {
  const parts = [];
  if (event.altKey) parts.push('Alt');
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.metaKey) parts.push('Meta');
  if (event.shiftKey) parts.push('Shift');

  const key = String(event.key || '').trim();
  if (!key || ['alt', 'control', 'shift', 'meta'].includes(key.toLowerCase())) {
    return parts.join('+');
  }

  if (key.length === 1) {
    parts.push(key.toUpperCase());
  } else {
    parts.push(key.charAt(0).toUpperCase() + key.slice(1));
  }
  return parts.join('+');
};

const bindEvents = () => {
  byId('toggle-key-vis')?.addEventListener('click', () => {
    const keyInput = byId('setting-gemini-key');
    if (keyInput) keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
  });

  byId('check-api-key')?.addEventListener('click', async () => {
    const btn = byId('check-api-key');
    const key = String(byId('setting-gemini-key')?.value || '').trim();
    if (!btn) return;

    if (!key) {
      btn.textContent = 'No key';
      btn.classList.add('pn-status-error');
      setTimeout(() => {
        btn.textContent = 'Check';
        btn.classList.remove('pn-status-error', 'pn-status-ok');
      }, UI_FEEDBACK_MS.API_CHECK_RESET_SHORT);
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
    } catch (_error) {
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

  byId('pn-add-custom-platform')?.addEventListener('click', () => {
    void addCustomPlatform();
  });

  byId('pn-custom-platforms')?.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-custom-delete]');
    if (!trigger) return;
    const id = String(trigger.dataset.customDelete || '');
    if (!id) return;
    state.settings.customPlatforms = (state.settings.customPlatforms || []).filter((entry) => entry.id !== id);
    renderCustomPlatforms();
    void autoSaveNonAi();
  });

  byId('pn-export-all-data')?.addEventListener('click', () => {
    void exportAllData();
  });

  byId('pn-import-all-data')?.addEventListener('change', (event) => {
    const file = event.target?.files?.[0] || null;
    if (!file) return;
    void importAllData(file);
    event.target.value = '';
  });

  bindInlineDanger('pn-clear-prompts', 'pn-confirm-clear-prompts', async () => {
    await chrome.storage.local.set({ prompts: [] });
    await window.PromptsUI?.render?.(window.PromptsUI.getSearchValue());
    await window.TagsUI?.render?.();
    flashAutoSaveStatus('All prompts cleared.', 'ok');
  });

  bindInlineDanger('pn-clear-history', 'pn-confirm-clear-history', async () => {
    await chrome.storage.local.set({ chatHistory: [] });
    await window.HistoryUI?.render?.();
    flashAutoSaveStatus('History cleared.', 'ok');
  });

  bindInlineDanger('pn-reset-all-settings', 'pn-confirm-reset-settings', async () => {
    state.settings = normalizeSettings(DEFAULT_SETTINGS);
    await save();
    await window.SessionStorage.setStoredGeminiKey('');
    renderControls(state.settings);
    await persistRuntimeAfterSave();
    await syncAiState();
    flashAutoSaveStatus('Settings reset.', 'ok');
  });

  byId('pn-settings-tabs')?.addEventListener('click', (event) => {
    const tab = event.target.closest('.pn-settings-tab');
    if (!tab) return;
    renderSettingsTab(tab.dataset.settingsTab || 'ai');
  });

  const aiControlIds = [
    'setting-enable-ai',
    'setting-semantic-search',
    'setting-auto-suggest',
    'setting-duplicate-check',
    'setting-polish-toggle',
    'setting-export-format',
    'setting-export-date',
    'setting-export-platform',
    'setting-user-context',
    'setting-gemini-key'
  ];

  aiControlIds.forEach((id) => {
    const node = byId(id);
    if (!node) return;
    const eventName = id === 'setting-user-context' || id === 'setting-gemini-key' ? 'input' : 'change';
    node.addEventListener(eventName, () => {
      void syncSaveState();
    });
  });

  const autoSaveControlIds = [
    'setting-fab-position',
    'setting-fab-style',
    'setting-fab-save',
    'setting-fab-export',
    'setting-fab-continue',
    'setting-fab-library',
    'setting-tab-prompts',
    'setting-tab-export',
    'setting-tab-history',
    'setting-tab-tags',
    'setting-density',
    'setting-export-naming',
    'setting-auto-save-history',
    'setting-bookmark-shortcut',
    'setting-hover-preview',
    'setting-hover-delay',
    'setting-continue-mode'
  ];

  autoSaveControlIds.forEach((id) => {
    const node = byId(id);
    if (!node) return;
    node.addEventListener('change', scheduleAutoSaveNonAi);
    node.addEventListener('input', scheduleAutoSaveNonAi);
  });

  byId('setting-bookmark-shortcut')?.addEventListener('keydown', (event) => {
    event.preventDefault();
    const value = formatShortcutFromEvent(event);
    if (!value) return;
    event.currentTarget.value = value;
    scheduleAutoSaveNonAi();
  });

  byId('pn-platform-list')?.addEventListener('change', (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (!event.target.dataset.platformToggle) return;
    const checkedCount = Array.from(document.querySelectorAll('[data-platform-toggle]'))
      .filter((input) => input instanceof HTMLInputElement && input.checked)
      .length;
    byId('pn-platform-warning')?.classList.toggle('pn-hidden', checkedCount > 0);
    scheduleAutoSaveNonAi();
  });
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
  setCallbacks,
  applyInterfaceSettings,
  normalizeSettings
};
})();
