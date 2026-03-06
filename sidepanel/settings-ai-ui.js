(() => {
/**
 * File: sidepanel/settings-ai-ui.js
 * Purpose: Settings panel state, provider setup, embedding controls, and data tools.
 */

const { KEYS, DEFAULT_SETTINGS, state } = window.SidepanelState;

const callbacks = {
  onApplyExportDefaults: null,
  onRenderExportPreview: null,
  onLoadSmartSuggestions: null,
};

const PROVIDER_VALIDATION_SESSION_KEY = "promptiumProviderValidationState";
const PROVIDER_ORDER = ["gemini", "openai", "anthropic", "openrouter"];
const EXPORT_FORMATS = ["markdown", "txt", "pdf", "notion", "obsidian"];

const FALLBACK_PROVIDERS = {
  gemini: {
    id: "gemini",
    label: "Gemini",
    docsUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza...",
    models: [
      { id: "gemini-2.0-flash", label: "gemini-2.0-flash" },
      { id: "gemini-2.0-flash-lite", label: "gemini-2.0-flash-lite" },
      { id: "gemini-1.5-pro", label: "gemini-1.5-pro" },
      { id: "gemini-1.5-flash", label: "gemini-1.5-flash" },
    ],
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    docsUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-...",
    models: [
      { id: "gpt-4o-mini", label: "gpt-4o-mini" },
      { id: "gpt-4o", label: "gpt-4o" },
      { id: "gpt-4-turbo", label: "gpt-4-turbo" },
    ],
  },
  anthropic: {
    id: "anthropic",
    label: "Claude",
    docsUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-...",
    models: [
      { id: "claude-haiku-4-5-20251001", label: "claude-haiku-4-5-20251001" },
      { id: "claude-sonnet-4-6", label: "claude-sonnet-4-6" },
    ],
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    docsUrl: "https://openrouter.ai/keys",
    keyPlaceholder: "sk-or-...",
    models: [
      {
        id: "meta-llama/llama-3.1-8b-instruct:free",
        label: "meta-llama/llama-3.1-8b-instruct:free",
      },
      {
        id: "mistralai/mistral-7b-instruct:free",
        label: "mistralai/mistral-7b-instruct:free",
      },
      { id: "anthropic/claude-haiku", label: "anthropic/claude-haiku" },
      { id: "google/gemini-flash-1.5", label: "google/gemini-flash-1.5" },
      { id: "openai/gpt-4o-mini", label: "openai/gpt-4o-mini" },
    ],
  },
};

const FALLBACK_EMBEDDINGS = [
  {
    id: "all-minilm-l6-v2",
    label: "MiniLM-L6",
    size: "23MB",
    note: "Fast, balanced",
  },
  {
    id: "all-mpnet-base-v2",
    label: "MPNet Base",
    size: "86MB",
    note: "Higher accuracy",
  },
  {
    id: "bge-small-en-v1.5",
    label: "BGE Small",
    size: "33MB",
    note: "Strong retrieval",
  },
  {
    id: "gte-small",
    label: "GTE Small",
    size: "34MB",
    note: "Technical prompts",
  },
];

const uiState = {
  bound: false,
  pane: "ai",
  providerId: "gemini",
  providers: FALLBACK_PROVIDERS,
  embeddings: FALLBACK_EMBEDDINGS,
  providerDraftKeys: {},
  providerValidation: {},
  embeddingStatus: null,
  pendingEmbeddingModelId: "",
  keyVisible: false,
};

let statusTimer = null;

const byId = (id) => document.getElementById(id);

const asObject = (value) => (value && typeof value === "object" ? value : {});

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const normalizeProviderId = (value = "") =>
  PROVIDER_ORDER.includes(String(value || "").trim().toLowerCase())
    ? String(value || "").trim().toLowerCase()
    : DEFAULT_SETTINGS.activeProvider;

const normalizeFeatureFlags = (value = {}, legacy = {}) => {
  const source = asObject(value);
  const fallback = asObject(legacy);
  return {
    polish: source.polish !== false && fallback.polish !== false,
    autoTags: source.autoTags !== false && fallback.autoTags !== false,
    improvePrompt:
      source.improvePrompt !== false && fallback.improvePrompt !== false,
    continueSummary:
      source.continueSummary !== false && fallback.continueSummary !== false,
  };
};

const normalizeBooleanMap = (value = {}, fallback = {}) => {
  const source = asObject(value);
  return Object.fromEntries(
    Object.keys(fallback).map((key) => [key, source[key] !== false]),
  );
};

const normalizeExportFormat = (value = "") =>
  EXPORT_FORMATS.includes(String(value || "").trim().toLowerCase())
    ? String(value || "").trim().toLowerCase()
    : DEFAULT_SETTINGS.defaultExportFormat;

const normalizeSettings = (value = {}) => {
  const source = asObject(value);
  const activeProvider = normalizeProviderId(source.activeProvider || source.aiBackend);
  const providerModels = deepClone(DEFAULT_SETTINGS.providerModels);
  PROVIDER_ORDER.forEach((providerId) => {
    const requested = String(source.providerModels?.[providerId] || "").trim();
    if (requested) {
      providerModels[providerId] = requested;
    }
  });

  return {
    ...deepClone(DEFAULT_SETTINGS),
    activeProvider,
    providerModels,
    embeddingModelId:
      String(source.embeddingModelId || "").trim() ||
      DEFAULT_SETTINGS.embeddingModelId,
    featureFlags: normalizeFeatureFlags(
      source.featureFlags,
      source["local" + "FeatureFlags"],
    ),
    fabPosition:
      source.fabPosition === "left" || source.fabPosition === "bottom-left"
        ? "bottom-left"
        : DEFAULT_SETTINGS.fabPosition,
    fabStyle: ["circle", "pill", "icon-only"].includes(source.fabStyle)
      ? source.fabStyle
      : DEFAULT_SETTINGS.fabStyle,
    fabButtons: {
      ...deepClone(DEFAULT_SETTINGS.fabButtons),
      ...normalizeBooleanMap(source.fabButtons || source.fabActions, DEFAULT_SETTINGS.fabButtons),
      library:
        source.fabButtons?.library !== false &&
        source.fabActions?.promptLibrary !== false,
    },
    visibleTabs: normalizeBooleanMap(source.visibleTabs, DEFAULT_SETTINGS.visibleTabs),
    cardDensity:
      String(source.cardDensity || source.promptCardDensity || "")
        .trim()
        .toLowerCase() === "compact"
        ? "compact"
        : DEFAULT_SETTINGS.cardDensity,
    defaultExportFormat: normalizeExportFormat(source.defaultExportFormat),
    autoSaveHistory:
      source.autoSaveHistory ?? source.autoSaveExportsToHistory ?? true,
    settingsMigratedV2: source.settingsMigratedV2 === true,
    onboardingComplete: source.onboardingComplete === true,
  };
};

const setSettingsStatus = (text = "", isError = false) => {
  const node = byId("settings-status");
  if (!node) return;
  node.textContent = String(text || "").trim();
  node.className = "pn-sv-autosave-hint";
  node.classList.toggle("pn-hidden", !node.textContent);
  if (node.textContent) {
    node.classList.add(isError ? "pn-status-error" : "pn-status-ok");
  }
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
  if (!node.textContent) return;
  statusTimer = setTimeout(() => {
    node.classList.add("pn-hidden");
    statusTimer = null;
  }, isError ? 2400 : 1600);
};

const loadRuntimeRegistry = async () => {
  try {
    const mod = await import(chrome.runtime.getURL("utils/model-registry.js"));
    const providers = {};
    Object.values(mod.MODEL_REGISTRY?.providers || {}).forEach((provider) => {
      providers[provider.id] = {
        id: provider.id,
        label: provider.label,
        docsUrl: provider.docsUrl,
        keyPlaceholder: provider.keyPlaceholder,
        models: Array.isArray(provider.models) ? provider.models : [],
      };
    });
    uiState.providers = Object.keys(providers).length ? providers : FALLBACK_PROVIDERS;
    uiState.embeddings = Array.isArray(mod.EMBEDDING_MODELS) && mod.EMBEDDING_MODELS.length
      ? mod.EMBEDDING_MODELS
      : FALLBACK_EMBEDDINGS;
  } catch (error) {
    console.warn("[Promptium][Settings] Failed to load model registry.", error);
    uiState.providers = FALLBACK_PROVIDERS;
    uiState.embeddings = FALLBACK_EMBEDDINGS;
  }
};

const persistValidationState = async () => {
  await chrome.storage.session
    .set({ [PROVIDER_VALIDATION_SESSION_KEY]: uiState.providerValidation })
    .catch((error) => {
      console.warn("[Promptium][Settings] Failed to persist validation state.", error);
    });
};

const loadValidationState = async () => {
  const snapshot = await chrome.storage.session
    .get([PROVIDER_VALIDATION_SESSION_KEY])
    .catch(() => ({}));
  uiState.providerValidation = asObject(snapshot?.[PROVIDER_VALIDATION_SESSION_KEY]);
};

const readSettings = async () => {
  const snapshot = await chrome.storage.local
    .get([KEYS.SETTINGS_KEY])
    .catch(() => ({}));
  const normalized = normalizeSettings(snapshot?.[KEYS.SETTINGS_KEY]);
  if (!normalized.settingsMigratedV2) {
    normalized.settingsMigratedV2 = true;
    await chrome.storage.local
      .set({ [KEYS.SETTINGS_KEY]: normalized })
      .catch((error) => {
        console.warn("[Promptium][Settings] Failed to persist migrated settings.", error);
      });
  }
  state.settings = normalized;
  uiState.providerId = normalized.activeProvider;
};

const persistSettings = async (nextSettings) => {
  state.settings = normalizeSettings(nextSettings);
  state.settings.settingsMigratedV2 = true;
  await chrome.storage.local
    .set({ [KEYS.SETTINGS_KEY]: state.settings })
    .catch((error) => {
      console.warn("[Promptium][Settings] Failed to persist settings.", error);
      throw error;
    });
  applyInterfaceSettings(state.settings);
  callbacks.onApplyExportDefaults?.(state.settings);
  callbacks.onRenderExportPreview?.();
};

const getProviderMeta = (providerId = uiState.providerId) =>
  uiState.providers[normalizeProviderId(providerId)] || uiState.providers.gemini;

const getProviderDraftKey = async (providerId = uiState.providerId) => {
  const normalized = normalizeProviderId(providerId);
  if (Object.prototype.hasOwnProperty.call(uiState.providerDraftKeys, normalized)) {
    return String(uiState.providerDraftKeys[normalized] || "");
  }
  const stored = window.SessionStorage?.getStoredProviderKey
    ? await window.SessionStorage.getStoredProviderKey(normalized).catch(() => "")
    : "";
  uiState.providerDraftKeys[normalized] = stored;
  return String(stored || "");
};

const getProviderStatusLabel = async (providerId = uiState.providerId) => {
  const key = String(await getProviderDraftKey(providerId) || "").trim();
  if (!key) return "Not configured";
  const status = String(uiState.providerValidation?.[providerId]?.status || "").trim();
  if (status === "connected") return "Connected";
  if (status === "invalid") return "Invalid key";
  return "Not configured";
};

const syncDownloadIndicator = () => {
  const indicator = byId("pn-search-setup-indicator");
  const downloading =
    uiState.embeddingStatus?.status === "downloading" ||
    uiState.embeddingStatus?.reindex?.running === true;
  indicator?.classList.toggle("pn-hidden", !downloading);
};

const renderProviderTabs = async () => {
  const node = byId("pn-provider-tabs");
  if (!node) return;
  const parts = [];
  for (const providerId of PROVIDER_ORDER) {
    const status = await getProviderStatusLabel(providerId);
    const meta = getProviderMeta(providerId);
    const active = providerId === uiState.providerId;
    parts.push(
      `<button class="pn-provider-tab${active ? " is-editing" : ""}" type="button" data-provider-tab="${providerId}" data-status="${status.toLowerCase().replace(/\s+/g, "-")}">${meta.label}</button>`,
    );
  }
  node.innerHTML = parts.join("");
};

const renderProviderModels = () => {
  const node = byId("pn-provider-models");
  if (!node) return;
  const provider = getProviderMeta();
  const selected = state.settings.providerModels?.[provider.id];
  node.innerHTML = provider.models
    .map(
      (model) => `
        <label class="pn-sv-row pn-sv-row--compact pn-provider-model-row">
          <span class="pn-sv-row__copy">
            <span class="pn-sv-row__label">${model.label}</span>
          </span>
          <input type="radio" name="pn-provider-model" value="${model.id}" ${selected === model.id ? "checked" : ""} />
        </label>`,
    )
    .join("");
};

const renderProviderEditor = async () => {
  const provider = getProviderMeta();
  const keyInput = byId("pn-provider-key");
  const docs = byId("pn-provider-docs");
  const status = byId("pn-provider-status");
  const primary = byId("pn-provider-set-primary");
  const draftKey = await getProviderDraftKey(provider.id);
  if (keyInput) {
    keyInput.type = uiState.keyVisible ? "text" : "password";
    keyInput.placeholder = provider.keyPlaceholder || "API key";
    keyInput.value = draftKey;
  }
  if (docs) docs.href = provider.docsUrl || "#";
  if (status) status.textContent = await getProviderStatusLabel(provider.id);
  if (primary) {
    primary.textContent =
      state.settings.activeProvider === provider.id ? "Primary provider" : "Set as primary";
    primary.disabled = state.settings.activeProvider === provider.id;
  }
  renderProviderModels();
};

const getEmbeddingActionLabel = (modelId, activeId, status, downloaded) => {
  if (modelId === activeId && status === "ready") return "Active";
  if (modelId === activeId && status === "downloading") {
    return `Downloading ${Math.max(0, Number(uiState.embeddingStatus?.progress || 0))}%`;
  }
  return downloaded.has(modelId) ? "Switch" : "Download";
};

const renderEmbeddingModels = () => {
  const node = byId("pn-embedding-models");
  if (!node) return;
  const status = uiState.embeddingStatus || {};
  const activeId = String(state.settings.embeddingModelId || DEFAULT_SETTINGS.embeddingModelId);
  const downloaded = new Set(Array.isArray(status.downloadedModelIds) ? status.downloadedModelIds : []);
  node.innerHTML = uiState.embeddings
    .map((model) => {
      const actionLabel = getEmbeddingActionLabel(model.id, activeId, status.status, downloaded);
      const checked = model.id === activeId;
      return `
        <label class="pn-sv-row pn-embedding-row${checked ? " is-selected" : ""}">
          <span class="pn-sv-row__copy">
            <span class="pn-sv-row__label">${checked ? "●" : "○"} ${model.label}</span>
            <span class="pn-sv-row__desc">${model.size} · ${model.note}</span>
          </span>
          <button class="pn-btn pn-btn--ghost" type="button" data-embedding-action="${model.id}">${actionLabel}</button>
        </label>`;
    })
    .join("");
  syncDownloadIndicator();
};

const updateEmbeddingProgress = () => {
  const wrap = byId("pn-embedding-reindex-wrap");
  const progress = byId("pn-embedding-reindex-progress");
  const text = byId("pn-embedding-reindex-text");
  const reindex = uiState.embeddingStatus?.reindex || {};
  wrap?.classList.toggle("pn-hidden", !reindex.running && !reindex.error);
  if (progress) progress.value = Number(reindex.progress || 0);
  if (!text) return;
  if (reindex.error) {
    text.textContent = reindex.error;
    return;
  }
  text.textContent = reindex.running
    ? `Re-indexing prompts… ${Math.round(Number(reindex.progress || 0))}%`
    : "Re-indexing prompts…";
};

const renderFeaturePane = () => {
  const settings = state.settings;
  const assign = (id, value) => {
    const input = byId(id);
    if (input) input.checked = Boolean(value);
  };
  assign("setting-feature-polish", settings.featureFlags.polish);
  assign("setting-feature-autotags", settings.featureFlags.autoTags);
  assign("setting-feature-improve", settings.featureFlags.improvePrompt);
  assign("setting-feature-continue", settings.featureFlags.continueSummary);
  assign("setting-fab-position-right", settings.fabPosition === "bottom-right");
  assign("setting-fab-position-left", settings.fabPosition === "bottom-left");
  assign("setting-fab-style-circle", settings.fabStyle === "circle");
  assign("setting-fab-style-pill", settings.fabStyle === "pill");
  assign("setting-fab-style-icon", settings.fabStyle === "icon-only");
  assign("setting-density-comfortable", settings.cardDensity === "comfortable");
  assign("setting-density-compact", settings.cardDensity === "compact");
  assign("setting-tab-prompts", settings.visibleTabs.prompts);
  assign("setting-tab-export", settings.visibleTabs.export);
  assign("setting-tab-history", settings.visibleTabs.history);
  assign("setting-tab-tags", settings.visibleTabs.tags);
  assign("setting-auto-save-history", settings.autoSaveHistory);
  EXPORT_FORMATS.forEach((format) => {
    assign(`setting-export-format-${format}`, settings.defaultExportFormat === format);
  });
};

const renderAboutPane = () => {
  const version = byId("pn-version-label");
  if (version) {
    version.textContent = String(chrome.runtime.getManifest()?.version || "0.1.0");
  }
};

const getPaneTitle = (pane = uiState.pane) => {
  if (pane === "ai") return "AI Providers";
  if (pane === "platforms") return "Search Model";
  if (pane === "general") return "Features & Preferences";
  return "Data & About";
};

const showPane = (pane = "ai") => {
  uiState.pane = pane;
  const hero = byId("pn-settings-main-hero");
  const rootMenu = byId("pn-settings-root-menu");
  const wrapper = byId("pn-settings-panes-wrapper");
  const title = byId("pn-settings-pane-title");
  hero?.classList.add("pn-hidden");
  rootMenu?.classList.add("pn-hidden");
  wrapper?.classList.remove("pn-hidden");
  if (title) title.textContent = getPaneTitle(pane);
  document.querySelectorAll(".pn-settings-pane").forEach((node) => {
    node.classList.toggle("pn-hidden", node.dataset.settingsPane !== pane);
  });
};

const showRootMenu = () => {
  byId("pn-settings-main-hero")?.classList.remove("pn-hidden");
  byId("pn-settings-root-menu")?.classList.remove("pn-hidden");
  byId("pn-settings-panes-wrapper")?.classList.add("pn-hidden");
};

const ensurePaneMarkup = () => {
  const panes = {
    ai: `
      <div class="pn-sv-section">
        <h4 class="pn-sv-heading">Provider Setup</h4>
        <div id="pn-provider-tabs" class="pn-provider-tabs"></div>
        <div class="pn-provider-editor">
          <div class="pn-sv-api-row">
            <div class="pn-sv-api-row__icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <input id="pn-provider-key" type="password" class="pn-sv-api-row__input" placeholder="API key" autocomplete="off" />
            <button id="pn-provider-test" type="button" class="pn-sv-api-row__check">Test</button>
            <button id="pn-provider-key-toggle" type="button" class="pn-sv-api-row__eye">Show</button>
          </div>
          <div class="pn-provider-controls">
            <a id="pn-provider-docs" href="#" target="_blank" rel="noreferrer" class="pn-sv-api-link">Get API key →</a>
            <button id="pn-provider-set-primary" class="pn-btn pn-btn--ghost" type="button">Set as primary</button>
          </div>
          <p id="pn-provider-status" class="pn-sv-api-hint">Not configured</p>
          <div id="pn-provider-models" class="pn-provider-models"></div>
        </div>
      </div>`,
    platforms: `
      <div class="pn-sv-section">
        <h4 class="pn-sv-heading">Semantic Search Model</h4>
        <p class="pn-sv-api-hint">Powers intelligent prompt search.</p>
        <div id="pn-embedding-models" class="pn-embedding-models"></div>
        <div id="pn-embedding-confirm" class="pn-embedding-confirm pn-hidden">
          <p id="pn-embedding-confirm-text" class="pn-sv-api-hint">Switch model and re-index prompts?</p>
          <div class="pn-embedding-confirm-actions">
            <button id="pn-embedding-confirm-yes" class="pn-btn pn-btn--primary" type="button">Confirm</button>
            <button id="pn-embedding-confirm-no" class="pn-btn pn-btn--ghost" type="button">Cancel</button>
          </div>
        </div>
        <div id="pn-embedding-reindex-wrap" class="pn-local-model-progress pn-hidden">
          <progress id="pn-embedding-reindex-progress" max="100" value="0"></progress>
          <span id="pn-embedding-reindex-text">Re-indexing prompts…</span>
        </div>
      </div>`,
    general: `
      <div class="pn-sv-section">
        <h4 class="pn-sv-heading">AI Features</h4>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">Polish prompts when saving</span><label class="pn-toggle pn-toggle--sm"><input id="setting-feature-polish" type="checkbox" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">Auto-suggest tags</span><label class="pn-toggle pn-toggle--sm"><input id="setting-feature-autotags" type="checkbox" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">Improve Prompt</span><label class="pn-toggle pn-toggle--sm"><input id="setting-feature-improve" type="checkbox" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">Continue Chat summarisation</span><label class="pn-toggle pn-toggle--sm"><input id="setting-feature-continue" type="checkbox" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
      </div>
      <div class="pn-sv-section">
        <h4 class="pn-sv-heading">Interface</h4>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">Bottom-right FAB</span><label class="pn-toggle pn-toggle--sm"><input id="setting-fab-position-right" type="radio" name="setting-fab-position" value="bottom-right" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">Bottom-left FAB</span><label class="pn-toggle pn-toggle--sm"><input id="setting-fab-position-left" type="radio" name="setting-fab-position" value="bottom-left" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">Circle FAB</span><label class="pn-toggle pn-toggle--sm"><input id="setting-fab-style-circle" type="radio" name="setting-fab-style" value="circle" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">Pill FAB</span><label class="pn-toggle pn-toggle--sm"><input id="setting-fab-style-pill" type="radio" name="setting-fab-style" value="pill" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">Icon-only FAB</span><label class="pn-toggle pn-toggle--sm"><input id="setting-fab-style-icon" type="radio" name="setting-fab-style" value="icon-only" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">Comfortable density</span><label class="pn-toggle pn-toggle--sm"><input id="setting-density-comfortable" type="radio" name="setting-density" value="comfortable" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">Compact density</span><label class="pn-toggle pn-toggle--sm"><input id="setting-density-compact" type="radio" name="setting-density" value="compact" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">Prompts tab</span><label class="pn-toggle pn-toggle--sm"><input id="setting-tab-prompts" type="checkbox" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">Export tab</span><label class="pn-toggle pn-toggle--sm"><input id="setting-tab-export" type="checkbox" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">History tab</span><label class="pn-toggle pn-toggle--sm"><input id="setting-tab-history" type="checkbox" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">Tags tab</span><label class="pn-toggle pn-toggle--sm"><input id="setting-tab-tags" type="checkbox" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
      </div>
      <div class="pn-sv-section">
        <h4 class="pn-sv-heading">Export Defaults</h4>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">Markdown</span><label class="pn-toggle pn-toggle--sm"><input id="setting-export-format-markdown" type="radio" name="setting-export-format" value="markdown" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">TXT</span><label class="pn-toggle pn-toggle--sm"><input id="setting-export-format-txt" type="radio" name="setting-export-format" value="txt" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">PDF</span><label class="pn-toggle pn-toggle--sm"><input id="setting-export-format-pdf" type="radio" name="setting-export-format" value="pdf" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">Notion</span><label class="pn-toggle pn-toggle--sm"><input id="setting-export-format-notion" type="radio" name="setting-export-format" value="notion" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">Obsidian</span><label class="pn-toggle pn-toggle--sm"><input id="setting-export-format-obsidian" type="radio" name="setting-export-format" value="obsidian" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
        <div class="pn-sv-row pn-sv-row--compact"><span class="pn-sv-row__label">Auto-save to history</span><label class="pn-toggle pn-toggle--sm"><input id="setting-auto-save-history" type="checkbox" /><span class="pn-toggle__track"><span class="pn-toggle__knob"></span></span></label></div>
      </div>
      <p id="settings-status" class="pn-sv-autosave-hint pn-hidden"></p>`,
    about: `
      <div class="pn-sv-section">
        <h4 class="pn-sv-heading">Your Data</h4>
        <div class="pn-settings-actions">
          <button id="pn-export-all-data" class="pn-btn pn-btn--ghost" type="button">Export all data →</button>
          <label class="pn-btn pn-btn--ghost pn-inline-file">Import data →<input id="pn-import-all-data" type="file" accept="application/json" /></label>
        </div>
        <div class="pn-settings-danger-row"><button id="pn-clear-prompts" class="pn-btn pn-btn-danger" type="button">Clear all prompts</button><button id="pn-confirm-clear-prompts" class="pn-btn pn-btn--ghost pn-hidden" type="button">Confirm</button></div>
        <div class="pn-settings-danger-row"><button id="pn-clear-history" class="pn-btn pn-btn-danger" type="button">Clear history</button><button id="pn-confirm-clear-history" class="pn-btn pn-btn--ghost pn-hidden" type="button">Confirm</button></div>
        <div class="pn-settings-danger-row"><button id="pn-reset-all-settings" class="pn-btn pn-btn-danger" type="button">Reset all settings</button><button id="pn-confirm-reset-settings" class="pn-btn pn-btn--ghost pn-hidden" type="button">Confirm</button></div>
      </div>
      <div class="pn-sv-section">
        <h4 class="pn-sv-heading">About</h4>
        <p class="pn-sv-api-hint">Version <span id="pn-version-label">0.1.0</span></p>
        <a href="https://github.com/sh1shank/promptium/releases" target="_blank" rel="noreferrer" class="pn-sv-api-link">View changelog →</a>
      </div>`,
  };

  Object.entries(panes).forEach(([paneId, markup]) => {
    const pane = document.querySelector(`.pn-settings-pane[data-settings-pane="${paneId}"]`);
    if (pane && pane.dataset.rendered !== "true") {
      pane.innerHTML = markup;
      pane.dataset.rendered = "true";
    }
  });
};

const renderControls = () => {
  ensurePaneMarkup();
  showPane(uiState.pane);
  void renderProviderTabs();
  void renderProviderEditor();
  renderEmbeddingModels();
  updateEmbeddingProgress();
  renderFeaturePane();
  renderAboutPane();
  applyInterfaceSettings(state.settings);
};

const applyInterfaceSettings = (settingsInput = state.settings) => {
  const settings = normalizeSettings(settingsInput);
  state.settings = settings;
  document.body.classList.toggle("pn-density-compact", settings.cardDensity === "compact");
  document.querySelector('.tab[data-tab="prompts"]')?.classList.toggle("hidden", !settings.visibleTabs.prompts);
  document.querySelector('.tab[data-tab="tags"]')?.classList.toggle("hidden", !settings.visibleTabs.tags);
  window.AppShell?.refreshHeaderControls?.();
};

const readFeatureSettings = () => {
  const next = deepClone(state.settings);
  next.featureFlags.polish = byId("setting-feature-polish")?.checked !== false;
  next.featureFlags.autoTags = byId("setting-feature-autotags")?.checked !== false;
  next.featureFlags.improvePrompt = byId("setting-feature-improve")?.checked !== false;
  next.featureFlags.continueSummary = byId("setting-feature-continue")?.checked !== false;
  next.fabPosition = byId("setting-fab-position-left")?.checked ? "bottom-left" : "bottom-right";
  next.fabStyle = byId("setting-fab-style-pill")?.checked
    ? "pill"
    : byId("setting-fab-style-icon")?.checked
      ? "icon-only"
      : "circle";
  next.cardDensity = byId("setting-density-compact")?.checked ? "compact" : "comfortable";
  next.visibleTabs.prompts = byId("setting-tab-prompts")?.checked !== false;
  next.visibleTabs.export = byId("setting-tab-export")?.checked !== false;
  next.visibleTabs.history = byId("setting-tab-history")?.checked !== false;
  next.visibleTabs.tags = byId("setting-tab-tags")?.checked !== false;
  if (!Object.values(next.visibleTabs).some(Boolean)) {
    next.visibleTabs.prompts = true;
  }
  const format = EXPORT_FORMATS.find((item) => byId(`setting-export-format-${item}`)?.checked);
  next.defaultExportFormat = format || DEFAULT_SETTINGS.defaultExportFormat;
  next.autoSaveHistory = byId("setting-auto-save-history")?.checked !== false;
  return next;
};

const saveFromPanel = async () => {
  try {
    await persistSettings(readFeatureSettings());
    setSettingsStatus("Saved");
  } catch (_error) {
    setSettingsStatus("Save failed", true);
  }
};

const syncSaveState = async () => state.settings;

const syncAiState = async () => {
  uiState.embeddingStatus = await window.AIBridge.getEmbeddingStatus().catch(() => null);
  renderEmbeddingModels();
  updateEmbeddingProgress();
  syncDownloadIndicator();
  await renderProviderTabs();
  await renderProviderEditor();
  return uiState.embeddingStatus;
};

const setAiDisabledBadge = async () => {
  setSettingsStatus("Add a provider key to use AI features.", true);
};

const testProviderKey = async () => {
  const provider = getProviderMeta();
  const key = String(byId("pn-provider-key")?.value || "").trim();
  if (!key) {
    setSettingsStatus("Enter an API key first.", true);
    return;
  }
  const model = state.settings.providerModels?.[provider.id] || provider.models?.[0]?.id || "";
  const result = await window.AIBridge
    .validateProviderKey(provider.id, key, model)
    .catch(() => ({ ok: false, message: "Validation failed." }));
  uiState.providerValidation[provider.id] = {
    status: result?.ok ? "connected" : "invalid",
    message: String(result?.message || result?.error || "").trim(),
  };
  await persistValidationState();
  if (!result?.ok) {
    await renderProviderEditor();
    setSettingsStatus("Invalid key", true);
    return;
  }
  uiState.providerDraftKeys[provider.id] = key;
  await window.SessionStorage?.setStoredProviderKey?.(provider.id, key);
  await renderProviderTabs();
  await renderProviderEditor();
  setSettingsStatus("Provider connected");
};

const setPrimaryProvider = async () => {
  const next = deepClone(state.settings);
  next.activeProvider = uiState.providerId;
  await persistSettings(next);
  setSettingsStatus("Primary provider updated");
  await renderProviderEditor();
};

const updateProviderModel = async (modelId = "") => {
  const next = deepClone(state.settings);
  next.providerModels[uiState.providerId] = String(modelId || "").trim();
  await persistSettings(next);
  setSettingsStatus("Model updated");
};

const requestEmbeddingAction = (modelId = "") => {
  const current = String(state.settings.embeddingModelId || DEFAULT_SETTINGS.embeddingModelId);
  if (!modelId || modelId === current) return;
  uiState.pendingEmbeddingModelId = modelId;
  byId("pn-embedding-confirm")?.classList.remove("pn-hidden");
};

const confirmEmbeddingSwitch = async () => {
  const modelId = uiState.pendingEmbeddingModelId;
  if (!modelId) return;
  byId("pn-embedding-confirm")?.classList.add("pn-hidden");
  const result = await window.AIBridge.switchEmbeddingModel(modelId).catch(() => null);
  if (!result?.ok) {
    setSettingsStatus(result?.error || "Model switch failed", true);
    return;
  }
  const next = deepClone(state.settings);
  next.embeddingModelId = modelId;
  await persistSettings(next);
  uiState.pendingEmbeddingModelId = "";
  await syncAiState();
  callbacks.onLoadSmartSuggestions?.();
  setSettingsStatus("Search model updated");
};

const toggleConfirm = (confirmId, visible) => {
  byId(confirmId)?.classList.toggle("pn-hidden", !visible);
};

const exportAllData = async () => {
  const snapshot = await chrome.storage.local.get(null);
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: "promptium-export.json",
      saveAs: true,
    });
    setSettingsStatus("Export started");
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

const importAllData = async (file) => {
  if (!file) return;
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (parsed?.[KEYS.SETTINGS_KEY]) {
    parsed[KEYS.SETTINGS_KEY] = {
      ...normalizeSettings(parsed[KEYS.SETTINGS_KEY]),
      settingsMigratedV2: true,
    };
  }
  await chrome.storage.local.set(parsed);
  await readSettings();
  renderControls();
  callbacks.onApplyExportDefaults?.(state.settings);
  setSettingsStatus("Data imported");
};

const bindPaneNavigation = () => {
  byId("pn-settings-root-menu")?.addEventListener("click", (event) => {
    const button = event.target.closest(".pn-settings-item");
    if (!button) return;
    showPane(String(button.dataset.settingsTarget || "ai"));
    renderControls();
  });
  byId("pn-settings-back-btn")?.addEventListener("click", showRootMenu);
};

const bindProviderEvents = () => {
  document.addEventListener("click", (event) => {
    const providerButton = event.target.closest("[data-provider-tab]");
    if (providerButton) {
      uiState.providerId = normalizeProviderId(providerButton.dataset.providerTab);
      void renderControls();
      return;
    }
    const embeddingButton = event.target.closest("[data-embedding-action]");
    if (embeddingButton) {
      requestEmbeddingAction(String(embeddingButton.dataset.embeddingAction || ""));
      return;
    }
    if (event.target.id === "pn-provider-test") {
      void testProviderKey();
      return;
    }
    if (event.target.id === "pn-provider-key-toggle") {
      uiState.keyVisible = !uiState.keyVisible;
      void renderProviderEditor();
      return;
    }
    if (event.target.id === "pn-provider-set-primary") {
      void setPrimaryProvider();
      return;
    }
  });
  document.addEventListener("input", (event) => {
    if (event.target.id === "pn-provider-key") {
      uiState.providerDraftKeys[uiState.providerId] = String(event.target.value || "");
    }
  });
  document.addEventListener("change", (event) => {
    const modelInput = event.target.closest('input[name="pn-provider-model"]');
    if (modelInput) {
      void updateProviderModel(String(modelInput.value || ""));
      return;
    }
    if (event.target.closest('.pn-settings-pane[data-settings-pane="general"]')) {
      void saveFromPanel();
    }
  });
};

const bindEmbeddingEvents = () => {
  document.addEventListener("click", (event) => {
    if (event.target.id === "pn-embedding-confirm-yes") {
      void confirmEmbeddingSwitch();
      return;
    }
    if (event.target.id === "pn-embedding-confirm-no") {
      uiState.pendingEmbeddingModelId = "";
      byId("pn-embedding-confirm")?.classList.add("pn-hidden");
    }
  });
  chrome.runtime.onMessage.addListener((message) => {
    const type = String(message?.type || "").trim();
    if (!["AI_EMBEDDING_STATUS", "AI_EMBEDDING_REINDEX_PROGRESS"].includes(type)) {
      return;
    }
    void syncAiState();
  });
};

const bindDataEvents = () => {
  document.addEventListener("click", async (event) => {
    if (event.target.id === "pn-export-all-data") {
      void exportAllData();
      return;
    }
    if (event.target.id === "pn-clear-prompts") {
      toggleConfirm("pn-confirm-clear-prompts", true);
      return;
    }
    if (event.target.id === "pn-clear-history") {
      toggleConfirm("pn-confirm-clear-history", true);
      return;
    }
    if (event.target.id === "pn-reset-all-settings") {
      toggleConfirm("pn-confirm-reset-settings", true);
      return;
    }
    if (event.target.id === "pn-confirm-clear-prompts") {
      await chrome.storage.local.set({ prompts: [] });
      toggleConfirm("pn-confirm-clear-prompts", false);
      setSettingsStatus("Prompts cleared");
      return;
    }
    if (event.target.id === "pn-confirm-clear-history") {
      await chrome.storage.local.set({ chatHistory: [] });
      toggleConfirm("pn-confirm-clear-history", false);
      setSettingsStatus("History cleared");
      return;
    }
    if (event.target.id === "pn-confirm-reset-settings") {
      await persistSettings({ ...deepClone(DEFAULT_SETTINGS), settingsMigratedV2: true });
      toggleConfirm("pn-confirm-reset-settings", false);
      renderControls();
      setSettingsStatus("Settings reset");
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.id !== "pn-import-all-data") return;
    const file = event.target.files?.[0];
    void importAllData(file);
    event.target.value = "";
  });
};

const bindEvents = () => {
  if (uiState.bound) return;
  uiState.bound = true;
  bindPaneNavigation();
  bindProviderEvents();
  bindEmbeddingEvents();
  bindDataEvents();
};

const load = async () => {
  await loadRuntimeRegistry();
  await loadValidationState();
  await readSettings();
  ensurePaneMarkup();
  renderControls();
  await syncAiState();
};

const resetDraft = async () => {
  renderControls();
};

const setCallbacks = (nextCallbacks = {}) => {
  Object.assign(callbacks, nextCallbacks || {});
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
  normalizeSettings,
};
})();
