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

const PLATFORM_ORDER = Object.freeze([
  'chatgpt',
  'claude',
  'gemini',
  'perplexity',
  'copilot',
  'deepseek',
  'qwen',
  'mistral',
  'kimi',
  'moonshot',
  'grok',
  'huggingchat',
  'poe',
  'you',
  'phind',
  'characterai',
  'pi',
  'metaai',
  'amazonq',
  'ernie',
  'doubao',
  'yichat',
  'coherecoral',
  'groq',
  'fireworks',
  'together'
]);

const DEFAULT_PLATFORM_LABELS = Object.freeze({
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  copilot: 'Copilot',
  deepseek: 'DeepSeek',
  qwen: 'Qwen (Tongyi)',
  mistral: 'Mistral Chat',
  kimi: 'Kimi',
  moonshot: 'Moonshot',
  grok: 'Grok',
  huggingchat: 'HuggingChat',
  poe: 'Poe',
  you: 'You.com Chat',
  phind: 'Phind',
  characterai: 'Character.AI',
  pi: 'Pi',
  metaai: 'Meta AI',
  amazonq: 'Amazon Q',
  ernie: 'ERNIE Bot',
  doubao: 'Doubao',
  yichat: 'Yi Chat',
  coherecoral: 'Cohere Coral',
  groq: 'Groq Chat',
  fireworks: 'Fireworks AI Chat',
  together: 'Together.ai Playground'
});

const LOCAL_MODEL_META = Object.freeze({
  smollm2_1_7b: { label: 'SmolLM2-1.7B', sizeLabel: '400MB' },
  phi35_mini: { label: 'Phi-3.5-mini', sizeLabel: '1.5GB' },
  qwen3_0_6b: { label: 'Qwen3-0.6B', sizeLabel: '300MB' }
});

const DEFAULT_LOCAL_FEATURE_FLAGS = Object.freeze({
  polish: true,
  autoTags: true,
  improvePrompt: true,
  continueSummary: true,
  smartExportTitle: false
});

const localModelStatuses = {
  smollm2_1_7b: { status: 'not_downloaded', progress: 0, backend: 'webgpu', error: '', cpuMode: false },
  phi35_mini: { status: 'not_downloaded', progress: 0, backend: 'webgpu', error: '', cpuMode: false },
  qwen3_0_6b: { status: 'not_downloaded', progress: 0, backend: 'webgpu', error: '', cpuMode: false }
};

const providerUiState = {
  editingProviderId: 'gemini',
  providerKeys: {},
  providerValidation: {},
  embeddingStatus: null,
  embeddingConfirmModelId: ''
};

let MODEL_REGISTRY_RUNTIME = null;
let EMBEDDING_MODELS_RUNTIME = null;
const PROVIDER_VALIDATION_SESSION_KEY = 'promptiumProviderValidationState';

let aiStatusHandler = null;
let autoSaveTimer = null;
let statusResetTimer = null;
let autoSaveSourceId = '';
let inlineSavedResetTimer = null;

const loadModelRegistryRuntime = async () => {
  if (MODEL_REGISTRY_RUNTIME && EMBEDDING_MODELS_RUNTIME) {
    return { registry: MODEL_REGISTRY_RUNTIME, embeddings: EMBEDDING_MODELS_RUNTIME };
  }

  try {
    const mod = await import(chrome.runtime.getURL('utils/model-registry.js'));
    MODEL_REGISTRY_RUNTIME = mod.MODEL_REGISTRY || { providers: {} };
    EMBEDDING_MODELS_RUNTIME = Array.isArray(mod.EMBEDDING_MODELS) ? mod.EMBEDDING_MODELS : [];
  } catch (_error) {
    MODEL_REGISTRY_RUNTIME = {
      providers: {
        gemini: {
          id: 'gemini',
          label: 'Google Gemini',
          keyLabel: 'Gemini API Key',
          keyPlaceholder: 'AIza...',
          docsUrl: 'https://aistudio.google.com/apikey',
          models: [{ id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', default: true, speed: 'fast', note: 'Best balance' }]
        }
      }
    };
    EMBEDDING_MODELS_RUNTIME = [{ id: 'all-minilm-l6-v2', label: 'MiniLM-L6', size: '23MB', note: 'Default - fast, balanced', default: true }];
  }

  return { registry: MODEL_REGISTRY_RUNTIME, embeddings: EMBEDDING_MODELS_RUNTIME };
};

const persistProviderValidationState = async () => {
  await chrome.storage.session.set({
    [PROVIDER_VALIDATION_SESSION_KEY]: providerUiState.providerValidation
  }).catch(() => {});
};

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

const normalizePlatformKey = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const getKnownPlatforms = (settingsInput = state.settings) => {
  const settings = normalizeSettings(settingsInput);
  const keySet = new Set([
    ...PLATFORM_ORDER,
    ...Object.keys(settings.enabledPlatforms || {}),
    ...Object.keys(settings.platformLabels || {})
  ]);

  const keys = Array.from(keySet)
    .map((key) => normalizePlatformKey(key))
    .filter(Boolean);

  const sortedKeys = keys.sort((left, right) => {
    const leftIndex = PLATFORM_ORDER.indexOf(left);
    const rightIndex = PLATFORM_ORDER.indexOf(right);
    const leftRank = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const rightRank = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.localeCompare(right);
  });

  return sortedKeys.map((key) => ({
    key,
    label: String(settings.platformLabels?.[key] || DEFAULT_PLATFORM_LABELS[key] || key).trim() || key
  }));
};

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
  const platformLabels = source.platformLabels && typeof source.platformLabels === 'object'
    ? source.platformLabels
    : DEFAULT_SETTINGS.platformLabels;
  const fabActions = source.fabActions && typeof source.fabActions === 'object'
    ? source.fabActions
    : DEFAULT_SETTINGS.fabActions;
  const visibleTabs = source.visibleTabs && typeof source.visibleTabs === 'object'
    ? source.visibleTabs
    : DEFAULT_SETTINGS.visibleTabs;

  const platformKeys = new Set([
    ...PLATFORM_ORDER,
    ...Object.keys(enabledPlatforms || {}),
    ...Object.keys(platformLabels || {}),
    ...Object.keys(DEFAULT_PLATFORM_LABELS),
    ...Object.keys(DEFAULT_SETTINGS.enabledPlatforms || {})
  ]);

  const normalizedEnabledPlatforms = {};
  const normalizedPlatformLabels = {};
  platformKeys.forEach((key) => {
    const safeKey = String(key || '').trim().toLowerCase();
    if (!safeKey) return;

    normalizedEnabledPlatforms[safeKey] = enabledPlatforms?.[safeKey] !== false;
    const fallbackLabel = DEFAULT_PLATFORM_LABELS[safeKey] || safeKey;
    const rawLabel = String(platformLabels?.[safeKey] || '').trim();
    normalizedPlatformLabels[safeKey] = rawLabel || fallbackLabel;
  });

  const preferLocal = typeof source.preferLocal === 'boolean'
    ? source.preferLocal
    : String(source.aiBackend || 'gemini').toLowerCase() === 'local';
  const useLocalFallback = typeof source.useLocalFallback === 'boolean'
    ? source.useLocalFallback
    : source.aiAutoFallback !== false;
  const localModelIdRaw = String(source.localModelId || 'smollm2_1_7b').trim().toLowerCase();
  const localModelId = Object.prototype.hasOwnProperty.call(LOCAL_MODEL_META, localModelIdRaw)
    ? localModelIdRaw
    : 'smollm2_1_7b';
  const localFeatureFlagsSource = source.localFeatureFlags && typeof source.localFeatureFlags === 'object'
    ? source.localFeatureFlags
    : {};
  const localFeatureFlags = {
    polish: localFeatureFlagsSource.polish !== false,
    autoTags: localFeatureFlagsSource.autoTags !== false,
    improvePrompt: localFeatureFlagsSource.improvePrompt !== false,
    continueSummary: localFeatureFlagsSource.continueSummary !== false,
    smartExportTitle: localFeatureFlagsSource.smartExportTitle === true
  };
  const providerModelsSource = source.providerModels && typeof source.providerModels === 'object'
    ? source.providerModels
    : {};
  const providerModels = {
    gemini: String(providerModelsSource.gemini || DEFAULT_SETTINGS.providerModels.gemini).trim() || DEFAULT_SETTINGS.providerModels.gemini,
    openai: String(providerModelsSource.openai || DEFAULT_SETTINGS.providerModels.openai).trim() || DEFAULT_SETTINGS.providerModels.openai,
    anthropic: String(providerModelsSource.anthropic || DEFAULT_SETTINGS.providerModels.anthropic).trim() || DEFAULT_SETTINGS.providerModels.anthropic,
    openrouter: String(providerModelsSource.openrouter || DEFAULT_SETTINGS.providerModels.openrouter).trim() || DEFAULT_SETTINGS.providerModels.openrouter
  };
  const activeProviderRaw = String(source.activeProvider || DEFAULT_SETTINGS.activeProvider || 'gemini').trim().toLowerCase();
  const activeProvider = ['gemini', 'openai', 'anthropic', 'openrouter'].includes(activeProviderRaw)
    ? activeProviderRaw
    : 'gemini';
  const embeddingModelId = String(source.embeddingModelId || DEFAULT_SETTINGS.embeddingModelId || 'all-minilm-l6-v2').trim() || 'all-minilm-l6-v2';

  return {
    enableAI: Boolean(source.enableAI),
    activeProvider,
    providerModels,
    embeddingModelId,
    preferLocal,
    useLocalFallback,
    localModelId,
    legacyAutoRewriteOnSave: typeof source.legacyAutoRewriteOnSave === 'boolean' ? source.legacyAutoRewriteOnSave : false,
    settingsMigratedV2: source.settingsMigratedV2 === true,
    localFeatureFlags,
    geminiPrimary: typeof source.geminiPrimary === 'boolean' ? source.geminiPrimary : !preferLocal,
    aiBackend: preferLocal ? 'local' : 'gemini',
    aiAutoFallback: useLocalFallback,
    semanticSearch: Boolean(source.semanticSearch),
    autoSuggestTags: Boolean(source.autoSuggestTags),
    duplicateCheck: Boolean(source.duplicateCheck),
    polishWithGemini: source.polishWithGemini !== false,
    enabledPlatforms: normalizedEnabledPlatforms,
    platformLabels: normalizedPlatformLabels,
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

const migrateSettingsV2 = (rawSettings, { hasExistingSettings = false } = {}) => {
  const source = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  if (source.settingsMigratedV2 === true) {
    return normalizeSettings(source);
  }

  const legacyBackend = String(source.aiBackend || 'gemini').trim().toLowerCase();
  const preferLocal = typeof source.preferLocal === 'boolean'
    ? source.preferLocal
    : legacyBackend === 'local';
  const useLocalFallback = typeof source.useLocalFallback === 'boolean'
    ? source.useLocalFallback
    : source.aiAutoFallback !== false;
  const localModelId = Object.prototype.hasOwnProperty.call(LOCAL_MODEL_META, String(source.localModelId || '').toLowerCase())
    ? String(source.localModelId).toLowerCase()
    : 'smollm2_1_7b';
  const existingFlags = source.localFeatureFlags && typeof source.localFeatureFlags === 'object'
    ? source.localFeatureFlags
    : {};

  const localFeatureFlags = {
    polish: existingFlags.polish !== false,
    autoTags: existingFlags.autoTags !== false,
    improvePrompt: existingFlags.improvePrompt !== false,
    continueSummary: existingFlags.continueSummary !== false,
    smartExportTitle: existingFlags.smartExportTitle === true
  };

  const migrated = {
    ...source,
    preferLocal,
    useLocalFallback,
    localModelId,
    geminiPrimary: !preferLocal,
    localFeatureFlags,
    legacyAutoRewriteOnSave: typeof source.legacyAutoRewriteOnSave === 'boolean'
      ? source.legacyAutoRewriteOnSave
      : Boolean(hasExistingSettings),
    settingsMigratedV2: true
  };

  return normalizeSettings(migrated);
};

const load = async () => {
  try {
    const snapshot = await chrome.storage.local.get([KEYS.SETTINGS_KEY, 'userContext']);
    const saved = snapshot?.[KEYS.SETTINGS_KEY] || {};
    const merged = { ...cloneObject(DEFAULT_SETTINGS), ...(saved || {}) };
    const legacyContext = String(snapshot?.userContext || '').trim();
    if (!merged.userContext && legacyContext) merged.userContext = legacyContext;
    const hasExistingSettings = Boolean(saved && Object.keys(saved).length > 0);
    state.settings = migrateSettingsV2(merged, { hasExistingSettings });
    if (!saved?.settingsMigratedV2) {
      await chrome.storage.local.set({
        [KEYS.SETTINGS_KEY]: state.settings,
        userContext: String(state.settings.userContext || '').trim()
      });
    }
  } catch (_error) {
    state.settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      settingsMigratedV2: true,
      legacyAutoRewriteOnSave: false
    });
  }

  providerUiState.editingProviderId = String(state.settings?.activeProvider || 'gemini').trim().toLowerCase() || 'gemini';
  const validationSnapshot = await chrome.storage.session.get([PROVIDER_VALIDATION_SESSION_KEY]).catch(() => ({}));
  providerUiState.providerValidation = validationSnapshot?.[PROVIDER_VALIDATION_SESSION_KEY]
    && typeof validationSnapshot[PROVIDER_VALIDATION_SESSION_KEY] === 'object'
    ? validationSnapshot[PROVIDER_VALIDATION_SESSION_KEY]
    : {};
  await loadModelRegistryRuntime();
};

const save = async () => {
  await chrome.storage.local.set({
    [KEYS.SETTINGS_KEY]: state.settings,
    userContext: String(state.settings.userContext || '').trim()
  });
};

const getControls = () => ({
  enableAI: byId('setting-enable-ai'),
  aiBackend: byId('setting-ai-backend'),
  aiAutoFallback: byId('setting-ai-auto-fallback'),
  geminiPrimary: byId('setting-gemini-primary'),
  semanticSearch: byId('setting-semantic-search'),
  autoSuggestTags: byId('setting-auto-suggest'),
  duplicateCheck: byId('setting-duplicate-check'),
  polishWithGemini: byId('setting-polish-toggle'),
  localModelSmollm2: byId('setting-local-model-smollm2'),
  localModelPhi35: byId('setting-local-model-phi35'),
  localModelQwen3: byId('setting-local-model-qwen3'),
  localFallback: byId('setting-local-fallback'),
  preferLocal: byId('setting-prefer-local'),
  localPreferNote: byId('pn-local-prefer-note'),
  localFeaturePolish: byId('setting-local-feature-polish'),
  localFeatureAutoTags: byId('setting-local-feature-autotags'),
  localFeatureImprove: byId('setting-local-feature-improve'),
  localFeatureContinue: byId('setting-local-feature-continue'),
  localFeatureSmartExport: byId('setting-local-feature-smart-export'),
  modelStatusSmollm2: byId('pn-model-status-smollm2_1_7b'),
  modelStatusPhi35: byId('pn-model-status-phi35_mini'),
  modelStatusQwen3: byId('pn-model-status-qwen3_0_6b'),
  localModelActionBtn: byId('pn-local-model-action-btn'),
  localModelActionMeta: byId('pn-local-model-action-meta'),
  geminiPrimaryNote: byId('pn-gemini-primary-note'),
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
  customPlatforms: byId('pn-custom-platforms'),
  platformLabelKey: byId('setting-platform-label-key'),
  platformLabelValue: byId('setting-platform-label-value'),
  platformLabelError: byId('pn-platform-label-error'),
  localModelProgressWrap: byId('pn-local-model-progress-wrap'),
  localModelProgress: byId('pn-local-model-progress'),
  localModelProgressText: byId('pn-local-model-progress-text'),
  aiRoutingNote: byId('pn-ai-routing-note')
  ,
  providerTabs: byId('pn-provider-tabs'),
  providerKey: byId('pn-provider-key'),
  providerKeyToggle: byId('pn-provider-key-toggle'),
  providerTest: byId('pn-provider-test'),
  providerStatus: byId('pn-provider-status'),
  providerDocs: byId('pn-provider-docs'),
  providerSetPrimary: byId('pn-provider-set-primary'),
  providerModels: byId('pn-provider-models'),
  embeddingModels: byId('pn-embedding-models'),
  embeddingConfirm: byId('pn-embedding-confirm'),
  embeddingConfirmText: byId('pn-embedding-confirm-text'),
  embeddingConfirmYes: byId('pn-embedding-confirm-yes'),
  embeddingConfirmNo: byId('pn-embedding-confirm-no'),
  embeddingReindexWrap: byId('pn-embedding-reindex-wrap'),
  embeddingReindexProgress: byId('pn-embedding-reindex-progress'),
  embeddingReindexText: byId('pn-embedding-reindex-text'),
  searchSetupIndicator: byId('pn-search-setup-indicator'),
  searchModeBadge: byId('pn-search-mode-badge')
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

const clearInlineSavedBadge = () => {
  document.querySelectorAll('.pn-inline-saved-badge').forEach((node) => {
    node.classList.remove('is-visible');
  });
};

const showInlineSavedBadge = (controlId) => {
  const id = String(controlId || '').trim();
  if (!id) return;

  const control = byId(id);
  if (!control) return;

  const row = control.closest('.pn-sv-row');
  if (!row) return;

  const copy = row.querySelector('.pn-sv-row__copy');
  const label = row.querySelector('.pn-sv-row__label');
  const anchor = label || copy;
  if (!anchor) return;

  let badge = row.querySelector('.pn-inline-saved-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'pn-inline-saved-badge';
    badge.textContent = 'Saved';
    if (label?.parentElement) {
      label.insertAdjacentElement('afterend', badge);
    } else {
      anchor.appendChild(badge);
    }
  }

  clearInlineSavedBadge();
  badge.classList.add('is-visible');

  if (inlineSavedResetTimer) clearTimeout(inlineSavedResetTimer);
  inlineSavedResetTimer = setTimeout(() => {
    clearInlineSavedBadge();
    inlineSavedResetTimer = null;
  }, 2000);
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
  const normalizedSettings = normalizeSettings(state.settings);
  const enabled = normalizedSettings.enabledPlatforms || {};
  const knownPlatforms = getKnownPlatforms(normalizedSettings);

  knownPlatforms.forEach((platform) => {
    const row = document.createElement('div');
    row.className = 'pn-platform-row';
    row.innerHTML = `
      <div class="pn-platform-row__meta">
        <div class="pn-platform-row__head">
          <span class="pn-platform-key">${platform.key}</span>
        </div>
        <label class="pn-platform-label-wrap">
          <span class="pn-platform-label-caption">Display label</span>
          <input
            type="text"
            class="pn-platform-label-input"
            data-platform-label="${platform.key}"
            value="${escapeHtml(platform.label)}"
            placeholder="Label"
          />
        </label>
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

const renderSettingsTab = (targetId, titleText) => {
  const isRoot = !targetId;
  const rootMenu = byId('pn-settings-root-menu');
  const hero = byId('pn-settings-main-hero');
  const wrapper = byId('pn-settings-panes-wrapper');
  const titleEl = byId('pn-settings-pane-title');

  if (isRoot) {
    rootMenu?.classList.remove('pn-hidden');
    hero?.classList.remove('pn-hidden');
    wrapper?.classList.add('pn-hidden');
    return;
  }

  rootMenu?.classList.add('pn-hidden');
  hero?.classList.add('pn-hidden');
  wrapper?.classList.remove('pn-hidden');

  if (titleEl && titleText) {
    titleEl.textContent = titleText;
  }

  document.querySelectorAll('.pn-settings-pane').forEach((pane) => {
    pane.classList.toggle('pn-hidden', pane.dataset.settingsPane !== targetId);
  });
};

const renderControls = (settingsInput = state.settings) => {
  const wrapperVisible = !byId('pn-settings-panes-wrapper')?.classList.contains('pn-hidden');
  const activePane = document.querySelector('.pn-settings-pane:not(.pn-hidden)')?.dataset?.settingsPane || '';
  const currentTarget = wrapperVisible ? activePane : '';
  state.settings = normalizeSettings(settingsInput);
  const controls = getControls();
  const s = state.settings;

  if (controls.enableAI) controls.enableAI.checked = s.enableAI;
  if (controls.aiBackend) controls.aiBackend.value = s.preferLocal ? 'local' : 'gemini';
  if (controls.aiAutoFallback) controls.aiAutoFallback.checked = s.useLocalFallback;
  if (controls.geminiPrimary) controls.geminiPrimary.checked = s.geminiPrimary !== false;
  if (controls.semanticSearch) controls.semanticSearch.checked = s.semanticSearch;
  if (controls.autoSuggestTags) controls.autoSuggestTags.checked = s.autoSuggestTags;
  if (controls.duplicateCheck) controls.duplicateCheck.checked = s.duplicateCheck;
  if (controls.polishWithGemini) controls.polishWithGemini.checked = s.polishWithGemini;
  if (controls.localModelSmollm2) controls.localModelSmollm2.checked = s.localModelId === 'smollm2_1_7b';
  if (controls.localModelPhi35) controls.localModelPhi35.checked = s.localModelId === 'phi35_mini';
  if (controls.localModelQwen3) controls.localModelQwen3.checked = s.localModelId === 'qwen3_0_6b';
  if (controls.localFallback) controls.localFallback.checked = s.useLocalFallback;
  if (controls.preferLocal) controls.preferLocal.checked = s.preferLocal;
  if (controls.localFeaturePolish) controls.localFeaturePolish.checked = s.localFeatureFlags?.polish !== false;
  if (controls.localFeatureAutoTags) controls.localFeatureAutoTags.checked = s.localFeatureFlags?.autoTags !== false;
  if (controls.localFeatureImprove) controls.localFeatureImprove.checked = s.localFeatureFlags?.improvePrompt !== false;
  if (controls.localFeatureContinue) controls.localFeatureContinue.checked = s.localFeatureFlags?.continueSummary !== false;
  if (controls.localFeatureSmartExport) controls.localFeatureSmartExport.checked = s.localFeatureFlags?.smartExportTitle === true;
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
  renderSettingsTab(currentTarget);
  applyInterfaceSettings(s);
  renderLocalModelStatus();
  updateLocalModelProgressUI();
  void refreshAiRoutingNote();
  void renderProviderEditor();
  void renderEmbeddingRows();

  if (window.PLATFORM_LABELS && s.platformLabels) {
    Object.entries(s.platformLabels).forEach(([key, label]) => {
      const safeKey = normalizePlatformKey(key);
      const safeLabel = String(label || '').trim();
      if (!safeKey || !safeLabel) return;
      window.PLATFORM_LABELS[safeKey] = safeLabel;
    });
  }

  const versionLabel = byId('pn-version-label');
  if (versionLabel) {
    versionLabel.textContent = chrome.runtime.getManifest()?.version || '0.1.0';
  }
};

const readPlatformSettingsFromControls = (baselineSettings) => {
  const enabledPlatforms = { ...(baselineSettings.enabledPlatforms || {}) };
  const platformLabels = { ...(baselineSettings.platformLabels || {}) };

  const platformToggles = Array.from(document.querySelectorAll('[data-platform-toggle]'));
  platformToggles.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const platformKey = normalizePlatformKey(input.dataset.platformToggle || '');
    if (!platformKey) return;
    enabledPlatforms[platformKey] = Boolean(input.checked);
  });

  const platformLabelInputs = Array.from(document.querySelectorAll('[data-platform-label]'));
  platformLabelInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const platformKey = normalizePlatformKey(input.dataset.platformLabel || '');
    if (!platformKey) return;
    const fallbackLabel = DEFAULT_PLATFORM_LABELS[platformKey] || platformKey;
    const label = String(input.value || '').trim() || fallbackLabel;
    platformLabels[platformKey] = label;
  });

  return { enabledPlatforms, platformLabels };
};

const setPlatformLabelError = (message = '') => {
  const controls = getControls();
  if (!controls.platformLabelError) return;
  controls.platformLabelError.textContent = String(message || '').trim();
  controls.platformLabelError.classList.toggle('pn-hidden', !controls.platformLabelError.textContent);
};

const readControlsSnapshot = () => {
  const controls = getControls();
  const current = normalizeSettings(state.settings);
  const selectedModelId = controls.localModelPhi35?.checked
    ? 'phi35_mini'
    : controls.localModelQwen3?.checked
      ? 'qwen3_0_6b'
      : 'smollm2_1_7b';
  const geminiPrimary = controls.geminiPrimary?.checked !== false;
  const preferLocal = controls.preferLocal?.checked === true
    || !geminiPrimary
    || String(controls.aiBackend?.value || '').toLowerCase() === 'local';

  const next = normalizeSettings({
    ...current,
    enableAI: controls.enableAI?.checked,
    activeProvider: state.settings?.activeProvider || current.activeProvider,
    providerModels: { ...(state.settings?.providerModels || current.providerModels || {}) },
    embeddingModelId: state.settings?.embeddingModelId || current.embeddingModelId,
    geminiPrimary,
    preferLocal,
    useLocalFallback: controls.localFallback?.checked,
    aiBackend: preferLocal ? 'local' : 'gemini',
    aiAutoFallback: controls.localFallback?.checked,
    localModelId: selectedModelId,
    localFeatureFlags: {
      polish: controls.localFeaturePolish?.checked,
      autoTags: controls.localFeatureAutoTags?.checked,
      improvePrompt: controls.localFeatureImprove?.checked,
      continueSummary: controls.localFeatureContinue?.checked,
      smartExportTitle: controls.localFeatureSmartExport?.checked
    },
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

  const platformSettings = readPlatformSettingsFromControls(next);
  next.enabledPlatforms = platformSettings.enabledPlatforms;
  next.platformLabels = platformSettings.platformLabels;

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

  const platformSettings = readPlatformSettingsFromControls(next);
  next.enabledPlatforms = platformSettings.enabledPlatforms;
  next.platformLabels = platformSettings.platformLabels;

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
  const controls = getControls();

  if (statusNode) {
    statusNode.classList.remove('pn-ai-status--loading', 'pn-ai-status--ready');
    statusNode.classList.add('pn-ai-status--unavailable');
    statusNode.innerHTML = '<span class="pn-ai-dot"></span><span class="pn-ai-status__text">AI Disabled</span>';
  }

  if (progressTrack) progressTrack.classList.add('hidden');
  if (progressTrack instanceof HTMLProgressElement) progressTrack.value = 0;
  if (progressText) progressText.textContent = 'Disabled';

  if (controls.localModelProgressWrap) {
    controls.localModelProgressWrap.classList.add('pn-hidden');
  }
  if (controls.localModelProgress instanceof HTMLProgressElement) {
    controls.localModelProgress.value = 0;
  }
  if (controls.localModelProgressText) {
    controls.localModelProgressText.textContent = 'Local model inactive.';
  }
  void refreshAiRoutingNote();

  const modelPill = byId('pn-model-pill');
  if (modelPill) modelPill.classList.remove('pn-sv-model-pill--ready');
  providerUiState.embeddingStatus = {
    ...(providerUiState.embeddingStatus || {}),
    status: 'error',
    searchMode: 'keyword'
  };
  renderEmbeddingIndicator(providerUiState.embeddingStatus);
};

const updateLocalModelProgressUI = (payload = {}, backendOverride = '') => {
  const controls = getControls();
  const selectedBackend = String(backendOverride || state.settings?.aiBackend || 'gemini').toLowerCase();
  const isLocalMode = selectedBackend === 'local';

  if (controls.localModelProgressWrap) {
    controls.localModelProgressWrap.classList.toggle('pn-hidden', !isLocalMode);
  }
  if (!isLocalMode) {
    return;
  }

  const status = String(payload.status || '').trim().toLowerCase();
  const progressRaw = Number(payload.progress);
  const progress = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, Math.round(progressRaw))) : null;
  const error = String(payload.error || '').trim();

  if (controls.localModelProgress instanceof HTMLProgressElement && Number.isFinite(progress)) {
    controls.localModelProgress.value = progress;
  }

  if (!controls.localModelProgressText) {
    return;
  }

  if (status === 'loading') {
    const label = Number.isFinite(progress) ? `Downloading model... ${progress}%` : 'Preparing local model...';
    controls.localModelProgressText.textContent = label;
    return;
  }

  if (status === 'ready') {
    const backendEngine = String(payload.backend || '').trim().toLowerCase();
    controls.localModelProgressText.textContent = backendEngine === 'wasm'
      ? 'Local model ready (WASM fallback). Runs fully on-device.'
      : 'Local model ready (WebGPU). Runs fully on-device.';
    return;
  }

  if (status === 'failed' || status === 'error') {
    controls.localModelProgressText.textContent = error ? `Local model unavailable: ${error}` : 'Local model failed to initialize.';
    return;
  }

  controls.localModelProgressText.textContent = 'Local model not initialized yet.';
};

const getSelectedLocalModelId = () => {
  const controls = getControls();
  if (controls.localModelPhi35?.checked) return 'phi35_mini';
  if (controls.localModelQwen3?.checked) return 'qwen3_0_6b';
  return 'smollm2_1_7b';
};

const selectedModelStatus = () => {
  const selectedId = getSelectedLocalModelId();
  return {
    id: selectedId,
    status: localModelStatuses[selectedId] || { status: 'not_downloaded', progress: 0, backend: 'webgpu', error: '' }
  };
};

const formatModelStatusText = (entry = {}) => {
  const status = String(entry.status || '').trim().toLowerCase();
  const progress = Number(entry.progress || 0);
  if (status === 'downloading') return `Downloading ${progress}%`;
  if (status === 'cached') return 'Cached';
  if (status === 'ready') return entry.cpuMode ? 'Ready (CPU)' : 'Ready';
  if (status === 'loading') return 'Loading...';
  if (status === 'error') return 'Error';
  return 'Not downloaded';
};

const renderLocalModelStatus = () => {
  const controls = getControls();
  const pairs = [
    ['smollm2_1_7b', controls.modelStatusSmollm2],
    ['phi35_mini', controls.modelStatusPhi35],
    ['qwen3_0_6b', controls.modelStatusQwen3]
  ];

  pairs.forEach(([modelId, node]) => {
    if (!node) return;
    node.textContent = formatModelStatusText(localModelStatuses[modelId]);
  });

  const preferLocalEnabled = controls.preferLocal?.checked === true;
  controls.localPreferNote?.classList.toggle('pn-hidden', !preferLocalEnabled);

  const geminiPrimaryEnabled = controls.geminiPrimary?.checked !== false;
  const selected = selectedModelStatus();
  const localReady = ['cached', 'ready', 'loading'].includes(String(selected.status?.status || '').toLowerCase());
  const anyModelAvailable = Object.values(localModelStatuses).some((entry) => ['cached', 'ready', 'loading', 'downloading'].includes(String(entry?.status || '').toLowerCase()));
  if (controls.geminiPrimary) {
    controls.geminiPrimary.disabled = !anyModelAvailable;
    if (!anyModelAvailable) controls.geminiPrimary.checked = true;
  }
  controls.geminiPrimaryNote?.classList.toggle('pn-hidden', !(geminiPrimaryEnabled && localReady));

  if (controls.localModelActionBtn) {
    const status = String(selected.status?.status || 'not_downloaded').toLowerCase();
    const meta = LOCAL_MODEL_META[selected.id] || LOCAL_MODEL_META.smollm2_1_7b;
    controls.localModelActionBtn.classList.remove('pn-btn--primary', 'pn-btn--ghost', 'pn-btn-danger');
    if (status === 'downloading') {
      controls.localModelActionBtn.textContent = 'Cancel Download';
      controls.localModelActionBtn.classList.add('pn-btn--ghost');
    } else if (status === 'cached' || status === 'ready') {
      controls.localModelActionBtn.textContent = 'Clear cached model data';
      controls.localModelActionBtn.classList.add('pn-btn-danger');
    } else if (status === 'error') {
      controls.localModelActionBtn.textContent = 'Retry';
      controls.localModelActionBtn.classList.add('pn-btn--ghost');
    } else {
      controls.localModelActionBtn.textContent = `Download (${meta.sizeLabel})`;
      controls.localModelActionBtn.classList.add('pn-btn--primary');
    }

    if (controls.localModelActionMeta) {
      if (selected.status?.cpuMode) {
        controls.localModelActionMeta.textContent = 'Running on CPU — may be slower';
      } else if (status === 'ready') {
        controls.localModelActionMeta.textContent = `${meta.label} is ready.`;
      } else if (status === 'cached') {
        controls.localModelActionMeta.textContent = `${meta.label} is cached and will load on first use.`;
      } else if (status === 'error') {
        controls.localModelActionMeta.textContent = selected.status?.error || 'Model failed. Retry or clear cache.';
      } else {
        controls.localModelActionMeta.textContent = 'Download starts only when you click.';
      }
    }
  }
};

const getProviderEntries = async () => {
  const { registry } = await loadModelRegistryRuntime();
  return Object.values(registry?.providers || {});
};

const getEditingProvider = async () => {
  const providers = await getProviderEntries();
  const requested = String(providerUiState.editingProviderId || state.settings?.activeProvider || 'gemini').trim().toLowerCase();
  return providers.find((entry) => entry.id === requested) || providers[0] || null;
};

const ensureProviderKeyLoaded = async (providerId) => {
  const key = String(providerId || '').trim().toLowerCase();
  if (!key) return '';
  if (Object.prototype.hasOwnProperty.call(providerUiState.providerKeys, key)) {
    return String(providerUiState.providerKeys[key] || '').trim();
  }
  const value = window.SessionStorage?.getStoredProviderKey
    ? await window.SessionStorage.getStoredProviderKey(key).catch(() => '')
    : (key === 'gemini' ? await window.SessionStorage.getStoredGeminiKey().catch(() => '') : '');
  providerUiState.providerKeys[key] = String(value || '').trim();
  return providerUiState.providerKeys[key];
};

const renderProviderTabs = async () => {
  const controls = getControls();
  const providers = await getProviderEntries();
  if (!controls.providerTabs || !providers.length) return;
  controls.providerTabs.innerHTML = '';

  providers.forEach((provider) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pn-provider-tab';
    button.textContent = provider.label.replace('Google ', '').replace('Anthropic ', '');
    if (provider.id === providerUiState.editingProviderId) button.classList.add('is-editing');
    if (provider.id === state.settings.activeProvider) button.classList.add('is-primary');
    button.dataset.providerTab = provider.id;
    button.addEventListener('click', async () => {
      const previousProvider = String(providerUiState.editingProviderId || '').trim().toLowerCase();
      if (previousProvider) {
        providerUiState.providerKeys[previousProvider] = String(getControls().providerKey?.value || '').trim();
      }
      providerUiState.editingProviderId = provider.id;
      await renderProviderEditor();
    });
    controls.providerTabs.appendChild(button);
  });
};

const setProviderValidationStatus = (status = 'idle', detail = '') => {
  const controls = getControls();
  if (!controls.providerStatus) return;
  controls.providerStatus.classList.remove('pn-status-ok', 'pn-status-error', 'pn-status-info');
  const label = String(detail || '').trim();
  if (status === 'checking') {
    controls.providerStatus.textContent = 'Status: checking connection...';
    controls.providerStatus.classList.add('pn-status-info');
    return;
  }
  if (status === 'connected') {
    controls.providerStatus.textContent = 'Status: connected';
    controls.providerStatus.classList.add('pn-status-ok');
    return;
  }
  if (status === 'invalid') {
    controls.providerStatus.textContent = `Status: ${label || 'invalid key'}`;
    controls.providerStatus.classList.add('pn-status-error');
    return;
  }
  controls.providerStatus.textContent = 'Status: idle';
};

const renderProviderModels = async (provider) => {
  const controls = getControls();
  if (!controls.providerModels || !provider) return;
  controls.providerModels.innerHTML = '';

  const selectedModelId = String(state.settings?.providerModels?.[provider.id] || provider.models?.find((row) => row.default)?.id || '').trim();
  (provider.models || []).forEach((model) => {
    const row = document.createElement('label');
    row.className = 'pn-provider-model-row';
    row.innerHTML = `
      <div class="pn-provider-model-row__meta">
        <span class="pn-provider-model-row__title">${escapeHtml(model.label)}</span>
        <span class="pn-provider-model-row__note">${escapeHtml(model.note || '')}</span>
        <span class="pn-provider-model-row__speed">${escapeHtml(model.speed || '')}</span>
      </div>
    `;
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `pn-provider-model-${provider.id}`;
    radio.value = String(model.id || '');
    radio.checked = model.id === selectedModelId;
    radio.addEventListener('change', () => {
      void (async () => {
        state.settings.providerModels = {
          ...(state.settings.providerModels || {}),
          [provider.id]: String(model.id || '')
        };
        await save();
        flashAutoSaveStatus('Model updated.', 'ok');
        await syncSaveState();
      })();
    });
    row.appendChild(radio);
    controls.providerModels.appendChild(row);
  });
};

const renderProviderEditor = async () => {
  const controls = getControls();
  const provider = await getEditingProvider();
  if (!provider) return;
  providerUiState.editingProviderId = provider.id;

  await renderProviderTabs();
  await ensureProviderKeyLoaded(provider.id);
  if (controls.providerKey) {
    controls.providerKey.placeholder = String(provider.keyPlaceholder || '');
    controls.providerKey.value = String(providerUiState.providerKeys[provider.id] || '');
  }
  if (controls.providerDocs) {
    controls.providerDocs.href = String(provider.docsUrl || '#');
  }
  if (controls.providerSetPrimary) {
    controls.providerSetPrimary.textContent = provider.id === state.settings.activeProvider
      ? 'Primary provider'
      : 'Use this provider';
  }

  const status = providerUiState.providerValidation[provider.id];
  if (!status) {
    setProviderValidationStatus('idle');
  } else {
    setProviderValidationStatus(status.state, status.message);
  }

  await renderProviderModels(provider);
};

const renderEmbeddingIndicator = (embeddingStatus = null) => {
  const controls = getControls();
  if (!controls.searchSetupIndicator || !controls.searchModeBadge) return;
  const status = embeddingStatus && typeof embeddingStatus === 'object'
    ? embeddingStatus
    : providerUiState.embeddingStatus;
  const current = status || {};
  const isBusy = ['downloading', 'loading'].includes(String(current.status || '').toLowerCase())
    || Boolean(current?.reindex?.running);
  controls.searchSetupIndicator.classList.toggle('pn-hidden', !isBusy);

  const semanticReady = String(current.searchMode || '').toLowerCase() === 'semantic'
    && String(current.status || '').toLowerCase() === 'ready';
  controls.searchModeBadge.classList.toggle('pn-hidden', semanticReady);
};

const renderEmbeddingRows = async () => {
  const controls = getControls();
  if (!controls.embeddingModels) return;
  const { embeddings } = await loadModelRegistryRuntime();
  const status = providerUiState.embeddingStatus || await window.AIBridge.getEmbeddingStatus().catch(() => null) || {};
  providerUiState.embeddingStatus = status;
  const downloaded = new Set(Array.isArray(status.downloadedModelIds) ? status.downloadedModelIds : []);
  const activeModelId = String(status.activeModelId || state.settings.embeddingModelId || 'all-minilm-l6-v2');

  controls.embeddingModels.innerHTML = '';
  (embeddings || []).forEach((model) => {
    const row = document.createElement('div');
    row.className = 'pn-embedding-row';
    const downloadingModelId = String(status.modelId || '').trim();
    const isDownloadingThis = String(status.status || '').toLowerCase() === 'downloading' && downloadingModelId === model.id;
    const rowStatus = (() => {
      if (isDownloadingThis) return 'downloading';
      if (model.id === activeModelId && String(status.status || '').toLowerCase() === 'ready') return 'active';
      if (model.id === activeModelId && Boolean(status?.reindex?.running)) return 'switching';
      if (downloaded.has(model.id)) return 'downloaded';
      return 'download';
    })();

    const badgeText = rowStatus === 'active'
      ? 'Active'
      : rowStatus === 'switching'
        ? 'Switching...'
        : rowStatus === 'downloading'
          ? `Downloading ${Math.max(0, Math.min(100, Number(status.progress || 0)))}%`
        : rowStatus === 'downloaded'
          ? 'Ready'
          : 'Download';
    row.innerHTML = `
      <div class="pn-embedding-row__meta">
        <div class="pn-embedding-row__title">${escapeHtml(model.label)} <span class="pn-provider-model-row__speed">${escapeHtml(model.size || '')}</span></div>
        <div class="pn-embedding-row__note">${escapeHtml(model.note || '')}</div>
      </div>
      <button type="button" class="pn-embedding-badge ${rowStatus === 'active' ? 'is-active' : ''}" data-embedding-model="${escapeHtml(model.id)}">${escapeHtml(badgeText)}</button>
    `;
    controls.embeddingModels.appendChild(row);
  });

  if (controls.embeddingReindexWrap && controls.embeddingReindexProgress && controls.embeddingReindexText) {
    const reindex = status?.reindex || {};
    const running = Boolean(reindex.running);
    controls.embeddingReindexWrap.classList.toggle('pn-hidden', !running);
    controls.embeddingReindexProgress.value = Number(reindex.progress || 0);
    controls.embeddingReindexText.textContent = running
      ? `Re-indexing ${Number(reindex.done || 0)} / ${Number(reindex.total || 0)} prompts...`
      : 'Re-indexing complete.';
  }

  renderEmbeddingIndicator(status);
};

const refreshAiRoutingNote = async () => {
  const controls = getControls();
  if (!controls.aiRoutingNote) return;

  if (!state.settings?.enableAI) {
    controls.aiRoutingNote.textContent = 'AI features are disabled.';
    return;
  }

  const preferLocal = state.settings?.preferLocal === true;
  const autoFallback = state.settings?.useLocalFallback !== false;
  const activeProvider = String(state.settings?.activeProvider || 'gemini').trim().toLowerCase();
  const providerLabel = ({
    gemini: 'Gemini',
    openai: 'OpenAI',
    anthropic: 'Claude',
    openrouter: 'OpenRouter'
  })[activeProvider] || 'Cloud';
  const typedKey = String(getControls().providerKey?.value || '').trim();
  const storedKey = String(
    window.SessionStorage?.getStoredProviderKey
      ? await window.SessionStorage.getStoredProviderKey(activeProvider).catch(() => '')
      : await window.SessionStorage.getStoredGeminiKey().catch(() => '')
  ).trim();
  const hasProviderKey = Boolean(typedKey || storedKey);

  if (preferLocal) {
    controls.aiRoutingNote.textContent = 'Active backend: Local model first.';
    return;
  }

  if (hasProviderKey) {
    controls.aiRoutingNote.textContent = autoFallback
      ? `Active backend: ${providerLabel}. Auto-fallback to local model is enabled.`
      : `Active backend: ${providerLabel}.`;
    return;
  }

  controls.aiRoutingNote.textContent = autoFallback
    ? `${providerLabel} key not set. Promptium will auto-fallback to the local model.`
    : `${providerLabel} selected without API key. Add key or switch to Local Model.`;
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

  if (aiStatusHandler) chrome.runtime.onMessage.removeListener(aiStatusHandler);
  aiStatusHandler = (msg) => {
    if (msg?.type === 'AI_LOCAL_MODEL_PROGRESS' || msg?.type === 'AI_LOCAL_MODEL_STATUS' || msg?.type === 'AI_LOCAL_STATUS_BROADCAST') {
      const modelId = String(msg?.modelId || state.settings?.localModelId || 'smollm2_1_7b').toLowerCase();
      if (Object.prototype.hasOwnProperty.call(localModelStatuses, modelId)) {
        localModelStatuses[modelId] = {
          ...localModelStatuses[modelId],
          status: String(msg.status || localModelStatuses[modelId].status),
          progress: Number.isFinite(Number(msg.progress)) ? Math.max(0, Math.min(100, Math.round(Number(msg.progress)))) : localModelStatuses[modelId].progress,
          backend: String(msg.backend || localModelStatuses[modelId].backend),
          error: String(msg.error || '').trim(),
          cpuMode: Boolean(msg.cpuMode)
        };
      }
      updateLocalModelProgressUI(localModelStatuses[modelId] || {});
      renderLocalModelStatus();
      return;
    }

    if (msg?.type === 'AI_EMBEDDING_STATUS' || msg?.type === 'AI_EMBEDDING_PROGRESS') {
      providerUiState.embeddingStatus = {
        ...(providerUiState.embeddingStatus || {}),
        ...msg
      };
      void renderEmbeddingRows();
      return;
    }

    if (msg?.type === 'AI_EMBEDDING_REINDEX_PROGRESS') {
      providerUiState.embeddingStatus = {
        ...(providerUiState.embeddingStatus || {}),
        reindex: {
          ...(providerUiState.embeddingStatus?.reindex || {}),
          ...msg
        }
      };
      void renderEmbeddingRows();
      return;
    }

    if (msg?.type === 'AI_SEARCH_MODE') {
      providerUiState.embeddingStatus = {
        ...(providerUiState.embeddingStatus || {}),
        searchMode: String(msg.mode || 'keyword')
      };
      renderEmbeddingIndicator(providerUiState.embeddingStatus);
      const spark = byId('pn-search-spark');
      spark?.classList.toggle('pn-hidden', String(msg.mode || '').toLowerCase() !== 'semantic');
    }
  };
  chrome.runtime.onMessage.addListener(aiStatusHandler);

  const localStatus = await window.AIBridge.getLocalModelStatus();
  if (localStatus?.status) {
    const modelId = String(localStatus.modelId || state.settings.localModelId || 'smollm2_1_7b').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(localModelStatuses, modelId)) {
      localModelStatuses[modelId] = {
        ...localModelStatuses[modelId],
        ...localStatus,
        status: String(localStatus.status || localModelStatuses[modelId].status)
      };
    }
    updateLocalModelProgressUI(localModelStatuses[modelId] || localStatus);
  }

  const [embeddingStatus, reindexStatus] = await Promise.all([
    window.AIBridge.getEmbeddingStatus().catch(() => null),
    window.AIBridge.getEmbeddingReindexStatus().catch(() => null)
  ]);
  if (embeddingStatus && typeof embeddingStatus === 'object') {
    providerUiState.embeddingStatus = {
      ...embeddingStatus,
      reindex: reindexStatus && typeof reindexStatus === 'object'
        ? reindexStatus
        : embeddingStatus.reindex
    };
  }
  await renderEmbeddingRows();

  state.aiReady = true;
  if (aiBar) {
    aiBar.classList.remove('pn-ai-bar--loading');
    aiBar.classList.add('pn-ai-bar--ready');
  }
  const progressText = byId('ai-progress-text');
  if (progressText) progressText.textContent = '✦ Ready';
  byId('pn-model-pill')?.classList.add('pn-sv-model-pill--ready');
  const semanticReady = String(providerUiState.embeddingStatus?.searchMode || '').toLowerCase() === 'semantic'
    && String(providerUiState.embeddingStatus?.status || '').toLowerCase() === 'ready';
  byId('pn-search-spark')?.classList.toggle('pn-hidden', !semanticReady);
  retryButton?.classList.add('pn-hidden');

  const statusNode = byId('ai-status');
  if (statusNode) {
    statusNode.classList.remove('pn-ai-status--loading', 'pn-ai-status--unavailable');
    statusNode.classList.add('pn-ai-status--ready');
    statusNode.innerHTML = '<span class="pn-ai-dot"></span><span class="pn-ai-status__text">Smart Features Ready</span>';
  }
  if (typeof callbacks.onLoadSmartSuggestions === 'function') {
    void callbacks.onLoadSmartSuggestions();
  }

  void refreshAiRoutingNote();
  renderLocalModelStatus();

  return state.aiReady;
};

const syncSaveState = async () => {
  const saveButton = byId('save-settings-btn');
  if (!saveButton) return;

  const draft = readControlsSnapshot();
  const provider = await getEditingProvider();
  const providerId = String(provider?.id || 'gemini');
  const currentKey = String(getControls().providerKey?.value || providerUiState.providerKeys?.[providerId] || '').trim();
  const storedKey = String(
    window.SessionStorage?.getStoredProviderKey
      ? await window.SessionStorage.getStoredProviderKey(providerId).catch(() => '')
      : await window.SessionStorage.getStoredGeminiKey().catch(() => '')
  ).trim();

  const hasChanges = !areSettingsEqual(draft, state.settings) || currentKey !== storedKey;
  saveButton.disabled = !hasChanges;

  if (hasChanges) {
    setSettingsStatus('Unsaved AI/API changes. Save to apply.', 'info');
  } else if (byId('settings-status')?.classList.contains('pn-status-info')) {
    setSettingsStatus('');
  }
};

const persistRuntimeAfterSave = async () => {
  if (window.PLATFORM_LABELS && state.settings?.platformLabels) {
    Object.entries(state.settings.platformLabels).forEach(([key, label]) => {
      const safeKey = normalizePlatformKey(key);
      const safeLabel = String(label || '').trim();
      if (!safeKey || !safeLabel) return;
      window.PLATFORM_LABELS[safeKey] = safeLabel;
    });
  }

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
  if (autoSaveSourceId) showInlineSavedBadge(autoSaveSourceId);
  autoSaveSourceId = '';
};

const scheduleAutoSaveNonAi = (sourceId = '') => {
  autoSaveSourceId = String(sourceId || autoSaveSourceId || '').trim();
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    void autoSaveNonAi();
  }, 180);
};

const saveFromPanel = async () => {
  state.settings = readControlsSnapshot();
  await save();

  const editingProvider = await getEditingProvider();
  if (editingProvider) {
    const controls = getControls();
    providerUiState.providerKeys[editingProvider.id] = String(controls.providerKey?.value || '').trim();
  }

  if (window.SessionStorage?.setStoredProviderKey) {
    const entries = Object.entries(providerUiState.providerKeys || {});
    await Promise.all(entries.map(([providerId, key]) => window.SessionStorage.setStoredProviderKey(providerId, key)));
  } else {
    const geminiKey = String(providerUiState.providerKeys?.gemini || '').trim();
    await window.SessionStorage.setStoredGeminiKey(geminiKey);
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
  renderControls({
    ...DEFAULT_SETTINGS,
    settingsMigratedV2: true,
    legacyAutoRewriteOnSave: false
  });
  providerUiState.providerKeys = {};
  const keyInput = getControls().providerKey;
  if (keyInput) keyInput.value = '';
  setSettingsStatus('Defaults loaded. Save AI/API changes to apply.', 'info');
  await syncSaveState();
};

const setCustomLlmError = (msg) => {
  const errNode = byId('pn-custom-llm-error');
  if (!errNode) return;
  if (!msg) {
    errNode.classList.add('pn-hidden');
    errNode.textContent = '';
  } else {
    errNode.classList.remove('pn-hidden');
    errNode.textContent = msg;
  }
};

const guessSelectorsFromHtml = (html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let input = 'textarea';
  let userMsg = '[data-role="user"]';
  let botMsg = '[data-role="assistant"]';
  
  if (doc.querySelector('div[contenteditable="true"]') || doc.querySelector('div[contenteditable="plaintext-only"]')) {
    input = 'div[contenteditable], textarea';
  } else if (doc.querySelector('textarea')) {
    input = 'textarea';
  }
  
  const commonUserAttrs = ['[data-message-author="user"]', '[data-role="user"]', '[data-author="user"]', '.user-message'];
  const commonBotAttrs = ['[data-message-author="assistant"]', '[data-role="assistant"]', '[data-message-author="bot"]', '[data-author="bot"]', '.bot-message', '.assistant-message'];

  for (const sel of commonUserAttrs) {
    if (doc.querySelector(sel)) { userMsg = sel; break; }
  }
  for (const sel of commonBotAttrs) {
    if (doc.querySelector(sel)) { botMsg = sel; break; }
  }

  return { input, userMsg, botMsg };
};

const commitCustomPlatform = async (name, urlPattern, input, userMsg, botMsg) => {
  if (!name || !urlPattern || !input || !userMsg || !botMsg) {
    setCustomLlmError('Missing properties to register LLM.');
    return false;
  }
  state.settings.customPlatforms = [
    ...(state.settings.customPlatforms || []),
    { id: crypto.randomUUID(), name, urlPattern, input, userMsg, botMsg, inputParent: 'form, body' }
  ];
  renderCustomPlatforms();
  await autoSaveNonAi();
  
  if (byId('setting-custom-name')) byId('setting-custom-name').value = '';
  if (byId('setting-custom-url')) byId('setting-custom-url').value = '';
  if (byId('setting-custom-html')) byId('setting-custom-html').value = '';
  if (byId('setting-custom-input')) byId('setting-custom-input').value = '';
  if (byId('setting-custom-user')) byId('setting-custom-user').value = '';
  if (byId('setting-custom-bot')) byId('setting-custom-bot').value = '';
  setCustomLlmError('');
  
  flashAutoSaveStatus(`Added ${name}`, 'ok');
  return true;
};

const addCustomPlatformSmart = async () => {
  setCustomLlmError('');
  const name = String(byId('setting-custom-name')?.value || '').trim() || 'Custom LLM';
  const urlParams = String(byId('setting-custom-url')?.value || '').trim();
  
  if (!urlParams) {
    setCustomLlmError('Please enter a valid Chat URL first.');
    return;
  }
  
  let urlPattern = urlParams;
  try {
    const parsed = new URL(urlPattern);
    urlPattern = `${parsed.protocol}//${parsed.host}/*`;
  } catch(e) { }

  const btn = byId('pn-add-custom-platform-smart');
  if (!btn) return;
  const orgText = btn.textContent;
  btn.textContent = 'Detecting...';
  btn.disabled = true;

  try {
    const realRes = await fetch(urlParams);
    const html = await realRes.text();
    const guessed = guessSelectorsFromHtml(html);
    await commitCustomPlatform(name, urlPattern, guessed.input, guessed.userMsg, guessed.botMsg);
    if (byId('pn-custom-llm-advanced')) byId('pn-custom-llm-advanced').open = false;
  } catch (err) {
    setCustomLlmError('Auto-detect failed (likely blocked by CORS/Login). Please open Advanced to paste HTML or add manually.');
    if (byId('pn-custom-llm-advanced')) byId('pn-custom-llm-advanced').open = true;
    
    if (byId('setting-custom-url')) byId('setting-custom-url').value = urlPattern;
    if (byId('setting-custom-input')) byId('setting-custom-input').value = 'textarea, div[contenteditable]';
    if (byId('setting-custom-user')) byId('setting-custom-user').value = '[data-role="user"]';
    if (byId('setting-custom-bot')) byId('setting-custom-bot').value = '[data-role="assistant"]';
  } finally {
    btn.textContent = orgText;
    btn.disabled = false;
  }
};

const addCustomPlatformHtml = async () => {
  setCustomLlmError('');
  const name = String(byId('setting-custom-name')?.value || '').trim() || 'Custom LLM';
  const rawUrl = String(byId('setting-custom-url')?.value || '').trim() || 'https://example.com/*';
  const html = String(byId('setting-custom-html')?.value || '').trim();
  
  if (!html) {
    setCustomLlmError('Please paste the webpage HTML content.');
    return;
  }

  let urlPattern = rawUrl;
  try {
    const parsed = new URL(urlPattern);
    urlPattern = `${parsed.protocol}//${parsed.host}/*`;
  } catch(e) {}

  const guessed = guessSelectorsFromHtml(html);
  
  if (byId('setting-custom-input')) byId('setting-custom-input').value = guessed.input;
  if (byId('setting-custom-user')) byId('setting-custom-user').value = guessed.userMsg;
  if (byId('setting-custom-bot')) byId('setting-custom-bot').value = guessed.botMsg;

  await commitCustomPlatform(name, urlPattern, guessed.input, guessed.userMsg, guessed.botMsg);
  if (byId('pn-custom-llm-advanced')) byId('pn-custom-llm-advanced').open = false;
};

const addCustomPlatform = async () => {
  setCustomLlmError('');
  const name = String(byId('setting-custom-name')?.value || '').trim();
  const urlPattern = String(byId('setting-custom-url')?.value || '').trim();
  const input = String(byId('setting-custom-input')?.value || '').trim();
  const userMsg = String(byId('setting-custom-user')?.value || '').trim();
  const botMsg = String(byId('setting-custom-bot')?.value || '').trim();

  if (!name || !urlPattern || !input || !userMsg || !botMsg) {
    setCustomLlmError('Fill all manual LLM fields first.');
    return;
  }

  await commitCustomPlatform(name, urlPattern, input, userMsg, botMsg);
};

const addPlatformLabel = async () => {
  const controls = getControls();
  const rawKey = String(controls.platformLabelKey?.value || '');
  const label = String(controls.platformLabelValue?.value || '').trim();
  const key = normalizePlatformKey(rawKey);

  if (!key) {
    setPlatformLabelError('Enter a valid platform key (letters/numbers).');
    return;
  }

  if (!label) {
    setPlatformLabelError('Enter a display label.');
    return;
  }

  setPlatformLabelError('');
  const next = normalizeSettings(state.settings);
  next.platformLabels[key] = label;
  next.enabledPlatforms[key] = next.enabledPlatforms[key] !== false;
  state.settings = next;

  if (controls.platformLabelKey) controls.platformLabelKey.value = '';
  if (controls.platformLabelValue) controls.platformLabelValue.value = '';

  renderPlatformRows();
  await autoSaveNonAi();
  flashAutoSaveStatus(`Label saved for ${key}.`, 'ok');
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

  let timeoutId = null;
  let armed = false;

  const reset = () => {
    armed = false;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    trigger.classList.remove('pn-hidden');
    trigger.textContent = String(trigger.dataset.defaultLabel || trigger.textContent || 'Cancel').trim();
    confirm.classList.add('pn-hidden');
    confirm.disabled = false;
    confirm.textContent = 'Yes';
  };

  trigger.dataset.defaultLabel = String(trigger.textContent || '').trim();
  confirm.textContent = 'Yes';

  trigger.addEventListener('click', () => {
    if (armed) {
      reset();
      return;
    }

    armed = true;
    trigger.textContent = 'Cancel';
    confirm.classList.remove('pn-hidden');
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      reset();
    }, 5000);
  });

  confirm.addEventListener('click', () => {
    void (async () => {
      confirm.disabled = true;
      await action();
      reset();
    })();
  });
};

const runSelectedLocalModelAction = async () => {
  const controls = getControls();
  const selected = selectedModelStatus();
  const status = String(selected.status?.status || 'not_downloaded').toLowerCase();

  if (!controls.localModelActionBtn) return;

  controls.localModelActionBtn.disabled = true;
  const previousText = controls.localModelActionBtn.textContent;
  controls.localModelActionBtn.textContent = 'Working...';

  try {
    if (status === 'downloading') {
      await window.AIBridge.cancelLocalModelDownload(selected.id);
    } else if (status === 'cached' || status === 'ready') {
      const cleared = await window.AIBridge.clearLocalModelCache(selected.id);
      if (!cleared?.ok) {
        flashAutoSaveStatus(cleared?.error || 'Failed to clear cached model data.', 'error');
      }
    } else {
      await window.AIBridge.downloadLocalModel(selected.id);
    }
  } catch (_error) {
    flashAutoSaveStatus('Model action failed. Retry.', 'error');
  } finally {
    controls.localModelActionBtn.disabled = false;
    controls.localModelActionBtn.textContent = previousText;
    const refreshed = await window.AIBridge.getLocalModelStatus();
    if (refreshed?.modelId && Object.prototype.hasOwnProperty.call(localModelStatuses, refreshed.modelId)) {
      localModelStatuses[refreshed.modelId] = {
        ...localModelStatuses[refreshed.modelId],
        ...refreshed
      };
    }
    renderLocalModelStatus();
    void syncSaveState();
  }
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
  getControls().providerKeyToggle?.addEventListener('click', () => {
    const keyInput = getControls().providerKey;
    if (keyInput) keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
  });

  getControls().providerSetPrimary?.addEventListener('click', async () => {
    const provider = await getEditingProvider();
    if (!provider) return;
    state.settings.activeProvider = provider.id;
    await save();
    await renderProviderEditor();
    await refreshAiRoutingNote();
    flashAutoSaveStatus('Primary provider updated.', 'ok');
    await syncSaveState();
  });

  getControls().providerTest?.addEventListener('click', async () => {
    const btn = getControls().providerTest;
    const provider = await getEditingProvider();
    if (!btn) return;
    if (!provider) return;

    const key = String(getControls().providerKey?.value || '').trim();
    providerUiState.providerKeys[provider.id] = key;

    if (!key) {
      providerUiState.providerValidation[provider.id] = { state: 'invalid', message: 'missing key' };
      setProviderValidationStatus('invalid', 'missing key');
      await persistProviderValidationState();
      return;
    }

    setProviderValidationStatus('checking');
    btn.disabled = true;
    try {
      const selectedModel = String(state.settings?.providerModels?.[provider.id] || provider.models?.find((entry) => entry.default)?.id || '').trim();
      const res = await window.AIBridge.validateProviderKey(provider.id, key, selectedModel);
      if (res?.ok === true) {
        providerUiState.providerValidation[provider.id] = { state: 'connected', message: 'connected' };
        setProviderValidationStatus('connected');
      } else {
        const category = String(res?.category || '').trim().toLowerCase();
        const message = category === 'invalid_key'
          ? 'invalid key'
          : category === 'rate_limited'
            ? 'rate limited'
            : category === 'network_error'
              ? 'network error'
              : 'provider error';
        providerUiState.providerValidation[provider.id] = { state: 'invalid', message };
        setProviderValidationStatus('invalid', message);
      }
      await persistProviderValidationState();
    } catch (_error) {
      providerUiState.providerValidation[provider.id] = { state: 'invalid', message: 'network error' };
      setProviderValidationStatus('invalid', 'network error');
      await persistProviderValidationState();
    } finally {
      btn.disabled = false;
    }
  });

  byId('pn-ai-retry-btn')?.addEventListener('click', () => {
    void syncAiState();
  });

  byId('pn-local-model-action-btn')?.addEventListener('click', () => {
    void runSelectedLocalModelAction();
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

  byId('pn-add-platform-label')?.addEventListener('click', () => {
    void addPlatformLabel();
  });

  byId('setting-platform-label-key')?.addEventListener('input', () => {
    setPlatformLabelError('');
  });

  byId('setting-platform-label-value')?.addEventListener('input', () => {
    setPlatformLabelError('');
  });

  byId('pn-add-custom-platform-smart')?.addEventListener('click', () => {
    void addCustomPlatformSmart();
  });

  byId('pn-add-custom-platform-html')?.addEventListener('click', () => {
    void addCustomPlatformHtml();
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
    state.settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      settingsMigratedV2: true,
      legacyAutoRewriteOnSave: false
    });
    await save();
    if (window.SessionStorage?.setStoredProviderKey) {
      await Promise.all([
        window.SessionStorage.setStoredProviderKey('gemini', ''),
        window.SessionStorage.setStoredProviderKey('openai', ''),
        window.SessionStorage.setStoredProviderKey('anthropic', ''),
        window.SessionStorage.setStoredProviderKey('openrouter', '')
      ]);
    } else {
      await window.SessionStorage.setStoredGeminiKey('');
    }
    providerUiState.providerKeys = {};
    renderControls(state.settings);
    await persistRuntimeAfterSave();
    await syncAiState();
    flashAutoSaveStatus('Settings reset.', 'ok');
  });

  byId('pn-settings-root-menu')?.addEventListener('click', (event) => {
    const item = event.target.closest('.pn-settings-item');
    if (!item) return;
    const target = item.dataset.settingsTarget;
    const title = item.querySelector('.pn-settings-item-title')?.textContent || 'Settings';
    if (target) renderSettingsTab(target, title);
  });

  byId('pn-settings-back-btn')?.addEventListener('click', () => {
    renderSettingsTab('');
  });

  getControls().providerKey?.addEventListener('input', () => {
    const providerId = String(providerUiState.editingProviderId || 'gemini').trim().toLowerCase();
    providerUiState.providerKeys[providerId] = String(getControls().providerKey?.value || '').trim();
    void syncSaveState();
  });

  getControls().embeddingModels?.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('[data-embedding-model]');
    if (!button) return;
    const modelId = String(button.getAttribute('data-embedding-model') || '').trim();
    if (!modelId) return;
    const downloadingModelId = String(providerUiState.embeddingStatus?.modelId || '').trim();
    if (String(providerUiState.embeddingStatus?.status || '').toLowerCase() === 'downloading' && downloadingModelId === modelId) {
      return;
    }
    if (modelId === String(state.settings.embeddingModelId || '').trim()) return;
    providerUiState.embeddingConfirmModelId = modelId;
    const { embeddings } = await loadModelRegistryRuntime();
    const model = (embeddings || []).find((entry) => entry.id === modelId);
    const controls = getControls();
    if (controls.embeddingConfirm && controls.embeddingConfirmText) {
      controls.embeddingConfirmText.textContent = `Switch to ${model?.label || modelId}? (${model?.size || ''} download)`;
      controls.embeddingConfirm.classList.remove('pn-hidden');
    }
  });

  getControls().embeddingConfirmNo?.addEventListener('click', () => {
    providerUiState.embeddingConfirmModelId = '';
    getControls().embeddingConfirm?.classList.add('pn-hidden');
  });

  getControls().embeddingConfirmYes?.addEventListener('click', async () => {
    const targetModelId = String(providerUiState.embeddingConfirmModelId || '').trim();
    if (!targetModelId) return;
    getControls().embeddingConfirmYes.disabled = true;
    try {
      const switched = await window.AIBridge.switchEmbeddingModel(targetModelId);
      if (switched?.ok) {
        state.settings.embeddingModelId = targetModelId;
        await save();
        flashAutoSaveStatus('Search updated with new model.', 'ok');
      } else {
        flashAutoSaveStatus(switched?.error || 'Model switch failed.', 'error');
      }
      providerUiState.embeddingStatus = await window.AIBridge.getEmbeddingStatus().catch(() => providerUiState.embeddingStatus);
      await renderEmbeddingRows();
      await syncSaveState();
    } finally {
      getControls().embeddingConfirmYes.disabled = false;
      providerUiState.embeddingConfirmModelId = '';
      getControls().embeddingConfirm?.classList.add('pn-hidden');
    }
  });

  const aiControlIds = [
    'setting-enable-ai',
    'setting-ai-backend',
    'setting-ai-auto-fallback',
    'setting-gemini-primary',
    'setting-semantic-search',
    'setting-auto-suggest',
    'setting-duplicate-check',
    'setting-polish-toggle',
    'setting-local-model-smollm2',
    'setting-local-model-phi35',
    'setting-local-model-qwen3',
    'setting-local-fallback',
    'setting-prefer-local',
    'setting-local-feature-polish',
    'setting-local-feature-autotags',
    'setting-local-feature-improve',
    'setting-local-feature-continue',
    'setting-local-feature-smart-export',
    'setting-export-format',
    'setting-export-date',
    'setting-export-platform',
    'setting-user-context'
  ];

  aiControlIds.forEach((id) => {
    const node = byId(id);
    if (!node) return;
    const eventName = id === 'setting-user-context' ? 'input' : 'change';
    node.addEventListener(eventName, () => {
      if (id === 'setting-ai-backend') {
        const controls = getControls();
        updateLocalModelProgressUI({}, String(controls.aiBackend?.value || 'gemini'));
      }
      if (id === 'setting-local-model-smollm2' || id === 'setting-local-model-phi35' || id === 'setting-local-model-qwen3') {
        renderLocalModelStatus();
      }
      if (id === 'setting-gemini-primary') {
        const controls = getControls();
        if (controls.preferLocal) {
          controls.preferLocal.checked = !(controls.geminiPrimary?.checked);
        }
      }
      if (id === 'setting-prefer-local') {
        const controls = getControls();
        if (controls.geminiPrimary) {
          controls.geminiPrimary.checked = !(controls.preferLocal?.checked);
        }
      }
      renderLocalModelStatus();
      void refreshAiRoutingNote();
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
    node.addEventListener('change', () => scheduleAutoSaveNonAi(id));
    node.addEventListener('input', () => scheduleAutoSaveNonAi(id));
  });

  byId('setting-bookmark-shortcut')?.addEventListener('keydown', (event) => {
    event.preventDefault();
    const value = formatShortcutFromEvent(event);
    if (!value) return;
    event.currentTarget.value = value;
    scheduleAutoSaveNonAi('setting-bookmark-shortcut');
  });

  const onPlatformRowChange = (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target.dataset.platformToggle) {
      const checkedCount = Array.from(document.querySelectorAll('[data-platform-toggle]'))
        .filter((input) => input instanceof HTMLInputElement && input.checked)
        .length;
      byId('pn-platform-warning')?.classList.toggle('pn-hidden', checkedCount > 0);
      scheduleAutoSaveNonAi();
      return;
    }

    if (event.target.dataset.platformLabel) {
      scheduleAutoSaveNonAi();
    }
  };

  byId('pn-platform-list')?.addEventListener('change', onPlatformRowChange);
  byId('pn-platform-list')?.addEventListener('input', onPlatformRowChange);
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
