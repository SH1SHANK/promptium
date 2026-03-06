/**
 * File: sidepanel/settings-ui.js
 * Purpose: Settings panel UI module — renders all 5 settings sections and handles
 */

(() => {
  const { KEYS, DEFAULT_SETTINGS, state } = window.SidepanelState;

  const SECTION_IDS = ["providers", "search", "features", "interface", "data"];
  const PROVIDER_ORDER = ["gemini", "openai", "anthropic", "openrouter"];

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
    activeSection: "providers",
    providers: FALLBACK_PROVIDERS,
    embeddings: FALLBACK_EMBEDDINGS,
    expandedProvider: "",
    providerDraftKeys: {},
    providerValidation: {},
    keyVisible: {},
    embeddingStatus: null,
    pendingEmbeddingId: "",
    bound: false,
  };

  let statusTimer = null;

  const byId = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const deepClone = (v) => JSON.parse(JSON.stringify(v));

  const NAV_ICONS = {
    providers:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z"/><circle cx="12" cy="15" r="2"/></svg>',
    search:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
    features:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01z"/></svg>',
    interface:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    data: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4"/><path d="M14 2v5h5"/><path d="M3 15h6"/><path d="M6 12v6"/></svg>',
  };

  const NAV_LABELS = {
    providers: "AI",
    search: "Search",
    features: "Features",
    interface: "Interface",
    data: "Data",
  };

  const VALIDATION_SESSION_KEY = "promptiumProviderValidationState";

  /* ── Helpers ─────────────────────────────────────────────────────────────── */

  const normalizeProviderId = (v) =>
    PROVIDER_ORDER.includes(
      String(v || "")
        .trim()
        .toLowerCase(),
    )
      ? String(v || "")
          .trim()
          .toLowerCase()
      : DEFAULT_SETTINGS.activeProvider;

  const getProviderMeta = (id) =>
    uiState.providers[normalizeProviderId(id)] || uiState.providers.gemini;

  const getProviderDraftKey = async (id) => {
    const pid = normalizeProviderId(id);
    if (Object.prototype.hasOwnProperty.call(uiState.providerDraftKeys, pid)) {
      return String(uiState.providerDraftKeys[pid] || "");
    }
    const stored = window.SessionStorage?.getStoredProviderKey
      ? await window.SessionStorage.getStoredProviderKey(pid).catch(() => "")
      : "";
    uiState.providerDraftKeys[pid] = stored;
    return String(stored || "");
  };

  const getValidationStatus = (id) => {
    const pid = normalizeProviderId(id);
    return String(uiState.providerValidation?.[pid]?.status || "").trim();
  };

  const setStatus = (text, isError) => {
    const node = byId("pn-settings-ui-status");
    if (!node) return;
    node.textContent = String(text || "").trim();
    node.className = "pn-settings-status";
    node.classList.toggle("pn-hidden", !node.textContent);
    if (node.textContent) node.classList.add(isError ? "is-error" : "is-ok");
    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }
    if (!node.textContent) return;
    statusTimer = setTimeout(
      () => {
        node.classList.add("pn-hidden");
        statusTimer = null;
      },
      isError ? 2400 : 1600,
    );
  };

  const persistSettings = async (next) => {
    if (window.SettingsAI?.normalizeSettings) {
      state.settings = window.SettingsAI.normalizeSettings(next);
    } else {
      state.settings = next;
    }
    state.settings.settingsMigratedV2 = true;
    await chrome.storage.local
      .set({ [KEYS.SETTINGS_KEY]: state.settings })
      .catch(() => {});
    window.SettingsAI?.applyInterfaceSettings?.(state.settings);
  };

  const persistValidation = async () => {
    await chrome.storage.session
      .set({ [VALIDATION_SESSION_KEY]: uiState.providerValidation })
      .catch(() => {});
  };

  const loadValidation = async () => {
    const snap = await chrome.storage.session
      .get([VALIDATION_SESSION_KEY])
      .catch(() => ({}));
    uiState.providerValidation =
      snap && typeof snap[VALIDATION_SESSION_KEY] === "object"
        ? snap[VALIDATION_SESSION_KEY]
        : {};
  };

  const loadRegistry = async () => {
    try {
      const mod = await import(
        chrome.runtime.getURL("utils/model-registry.js")
      );
      const providers = {};
      Object.values(mod.MODEL_REGISTRY?.providers || {}).forEach((p) => {
        providers[p.id] = {
          id: p.id,
          label: p.label,
          docsUrl: p.docsUrl,
          keyPlaceholder: p.keyPlaceholder,
          models: Array.isArray(p.models) ? p.models : [],
        };
      });
      uiState.providers = Object.keys(providers).length
        ? providers
        : FALLBACK_PROVIDERS;
      uiState.embeddings =
        Array.isArray(mod.EMBEDDING_MODELS) && mod.EMBEDDING_MODELS.length
          ? mod.EMBEDDING_MODELS
          : FALLBACK_EMBEDDINGS;
    } catch (_e) {
      uiState.providers = FALLBACK_PROVIDERS;
      uiState.embeddings = FALLBACK_EMBEDDINGS;
    }
  };

  /* ── Toggle HTML helper ──────────────────────────────────────────────────── */

  const toggleHTML = (id, checked, ariaLabel) =>
    `<label class="pn-settings-toggle" role="switch" aria-checked="${checked}" aria-label="${esc(ariaLabel || id)}" tabindex="0">
    <input id="${esc(id)}" type="checkbox"${checked ? " checked" : ""} />
    <span class="pn-settings-toggle-track"></span>
    <span class="pn-settings-toggle-thumb"></span>
  </label>`;

  /* ── Render nav ──────────────────────────────────────────────────────────── */

  const renderNav = () => {
    const nav = byId("pn-settings-nav");
    if (!nav) return;
    nav.innerHTML = SECTION_IDS.map(
      (id) =>
        `<button class="pn-settings-nav-btn${uiState.activeSection === id ? " is-active" : ""}" type="button" data-settings-nav="${id}" aria-label="${esc(NAV_LABELS[id])}">${NAV_ICONS[id]}<span>${esc(NAV_LABELS[id])}</span></button>`,
    ).join("");
  };

  /* ── Section switching ───────────────────────────────────────────────────── */

  const switchSection = (sectionId) => {
    if (!SECTION_IDS.includes(sectionId)) return;
    uiState.activeSection = sectionId;
    renderNav();
    const panels = document.querySelectorAll(
      ".pn-settings-panel[data-settings-section]",
    );
    panels.forEach((p) =>
      p.classList.toggle("is-active", p.dataset.settingsSection === sectionId),
    );
  };

  /* ── Section 1: AI Providers ─────────────────────────────────────────────── */

  const renderProviders = async () => {
    const container = byId("pn-settings-providers-list");
    if (!container) return;
    const parts = [];
    const primary =
      state.settings.activeProvider || DEFAULT_SETTINGS.activeProvider;

    for (const pid of PROVIDER_ORDER) {
      const meta = getProviderMeta(pid);
      const draftKey = await getProviderDraftKey(pid);
      const hasKey = Boolean(draftKey);
      const vstatus = getValidationStatus(pid);
      const isPrimary = pid === primary;
      const isExpanded = uiState.expandedProvider === pid;
      const statusDotClass =
        vstatus === "connected"
          ? "pn-settings-status-dot--connected"
          : vstatus === "invalid"
            ? "pn-settings-status-dot--invalid"
            : "pn-settings-status-dot--idle";
      const statusText =
        vstatus === "connected"
          ? "Connected"
          : vstatus === "invalid"
            ? "Invalid key"
            : hasKey
              ? "Key saved"
              : "Not configured";
      const badge = isPrimary
        ? '<span class="pn-settings-provider-badge pn-settings-provider-badge--primary">Primary</span>'
        : !hasKey
          ? '<span class="pn-settings-provider-badge pn-settings-provider-badge--dormant">Setup</span>'
          : "";
      const selectedModel =
        state.settings.providerModels?.[pid] || meta.models?.[0]?.id || "";
      const keyVisible = uiState.keyVisible[pid] || false;

      parts.push(`
      <div class="pn-settings-provider${isPrimary ? " is-primary" : ""}${isExpanded ? " is-expanded" : ""}" data-provider-id="${esc(pid)}">
        <div class="pn-settings-provider-head" data-provider-toggle="${esc(pid)}">
          <span class="pn-settings-provider-icon">${esc(meta.label.charAt(0))}</span>
          <div class="pn-settings-provider-info">
            <span class="pn-settings-provider-name">${esc(meta.label)} ${badge}</span>
            <span class="pn-settings-provider-status"><span class="pn-settings-status-dot ${statusDotClass}"></span>${esc(statusText)}</span>
          </div>
          <svg class="pn-settings-provider-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </div>
        <div class="pn-settings-provider-body">
          <div class="pn-settings-provider-body-inner">
            <div class="pn-settings-key-row">
              <input class="pn-settings-key-input" type="${keyVisible ? "text" : "password"}" placeholder="${esc(meta.keyPlaceholder)}" value="${esc(draftKey)}" autocomplete="off" data-provider-key="${esc(pid)}" />
              <button class="pn-settings-key-btn" type="button" data-provider-test="${esc(pid)}">Test</button>
              <button class="pn-settings-key-btn" type="button" data-provider-eye="${esc(pid)}">${keyVisible ? "Hide" : "Show"}</button>
            </div>
            <div class="pn-settings-provider-controls">
              <a class="pn-settings-provider-link" href="${esc(meta.docsUrl)}" target="_blank" rel="noreferrer">Get API key →</a>
              <button class="pn-settings-primary-btn${isPrimary ? " is-primary" : ""}" type="button" data-provider-primary="${esc(pid)}"${isPrimary ? " disabled" : ""}>${isPrimary ? "Primary provider" : "Set as primary"}</button>
            </div>
            <div class="pn-settings-select-field">
              <span class="pn-settings-model-label">Model</span>
              <select class="pn-settings-model-select" data-provider-model="${esc(pid)}">
                ${meta.models.map((m) => `<option value="${esc(m.id)}"${m.id === selectedModel ? " selected" : ""}>${esc(m.label)}</option>`).join("")}
              </select>
            </div>
          </div>
        </div>
      </div>`);
    }
    container.innerHTML = parts.join("");
  };

  /* ── Section 2: Search Model ─────────────────────────────────────────────── */

  const renderEmbeddings = () => {
    const container = byId("pn-settings-embed-list");
    if (!container) return;
    const status = uiState.embeddingStatus || {};
    const activeId = String(
      state.settings.embeddingModelId || DEFAULT_SETTINGS.embeddingModelId,
    );
    const downloaded = new Set(
      Array.isArray(status.downloadedModelIds) ? status.downloadedModelIds : [],
    );

    container.innerHTML = uiState.embeddings
      .map((m) => {
        const isActive = m.id === activeId;
        const isDownloading = isActive && status.status === "downloading";
        let actionLabel = "Download";
        let actionClass = "";
        if (isActive && status.status === "ready") {
          actionLabel = "Active";
          actionClass = " is-active-label";
        } else if (isDownloading) {
          actionLabel = `${Math.max(0, Number(status.progress || 0))}%`;
          actionClass = " is-active-label";
        } else if (downloaded.has(m.id)) {
          actionLabel = "Switch";
        }
        return `
      <div class="pn-settings-embed-row${isActive ? " is-active" : ""}" data-embed-id="${esc(m.id)}">
        <span class="pn-settings-embed-dot"></span>
        <div class="pn-settings-embed-info">
          <span class="pn-settings-embed-name">${esc(m.label)}</span>
          <span class="pn-settings-embed-meta">${esc(m.size)} · ${esc(m.note)}</span>
        </div>
        <button class="pn-settings-embed-action${actionClass}" type="button" data-embed-action="${esc(m.id)}">${esc(actionLabel)}</button>
      </div>`;
      })
      .join("");

    renderEmbeddingProgress();
  };

  const renderEmbeddingProgress = () => {
    const wrap = byId("pn-settings-embed-progress");
    if (!wrap) return;
    const reindex = uiState.embeddingStatus?.reindex || {};
    const isVisible = reindex.running || reindex.error;
    wrap.classList.toggle("pn-hidden", !isVisible);
    const fill = wrap.querySelector(".pn-settings-progress-fill");
    const text = wrap.querySelector(".pn-settings-progress-text");
    if (fill)
      fill.style.width = `${Math.max(0, Number(reindex.progress || 0))}%`;
    if (text) {
      text.textContent = reindex.error
        ? String(reindex.error)
        : reindex.running
          ? `Re-indexing prompts… ${Math.round(Number(reindex.progress || 0))}%`
          : "";
    }
  };

  /* ── Section 3: Features ─────────────────────────────────────────────────── */

  const FEATURE_TOGGLES = [
    {
      id: "setting-feat-polish",
      key: "polish",
      label: "Polish prompts when saving",
      desc: "Clean up grammar and clarity before storing.",
    },
    {
      id: "setting-feat-autotags",
      key: "autoTags",
      label: "Auto-suggest tags",
      desc: "AI suggests relevant tags based on prompt content.",
    },
    {
      id: "setting-feat-improve",
      key: "improvePrompt",
      label: "Improve Prompt",
      desc: "Show one-click prompt enhancement actions.",
    },
    {
      id: "setting-feat-continue",
      key: "continueSummary",
      label: "Continue Chat summarisation",
      desc: "Summarise conversations to carry context forward.",
    },
  ];

  const renderFeatures = () => {
    const container = byId("pn-settings-features-list");
    if (!container) return;
    const flags = state.settings.featureFlags || {};
    container.innerHTML = FEATURE_TOGGLES.map(
      (t) =>
        `<div class="pn-settings-row">
      <div class="pn-settings-row-copy">
        <span class="pn-settings-row-label">${esc(t.label)}</span>
        <span class="pn-settings-row-desc">${esc(t.desc)}</span>
      </div>
      ${toggleHTML(t.id, flags[t.key] !== false, t.label)}
    </div>`,
    ).join("");
  };

  /* ── Section 4: Interface ────────────────────────────────────────────────── */

  const renderInterface = () => {
    const container = byId("pn-settings-interface-content");
    if (!container) return;
    const s = state.settings;
    container.innerHTML = `
    <div class="pn-settings-section">
      <h4 class="pn-settings-section-title">Quick Actions Button</h4>
      <div class="pn-settings-select-field">
        <span class="pn-settings-select-label">Position</span>
        <select class="pn-settings-select" id="pn-sui-fab-position">
          <option value="bottom-right"${s.fabPosition !== "bottom-left" ? " selected" : ""}>Bottom-right</option>
          <option value="bottom-left"${s.fabPosition === "bottom-left" ? " selected" : ""}>Bottom-left</option>
        </select>
      </div>
      <div class="pn-settings-select-field">
        <span class="pn-settings-select-label">Style</span>
        <select class="pn-settings-select" id="pn-sui-fab-style">
          <option value="circle"${s.fabStyle === "circle" ? " selected" : ""}>Circle</option>
          <option value="pill"${s.fabStyle === "pill" ? " selected" : ""}>Pill</option>
          <option value="icon-only"${s.fabStyle === "icon-only" ? " selected" : ""}>Icon-only</option>
        </select>
      </div>
    </div>
    <div class="pn-settings-section">
      <h4 class="pn-settings-section-title">Visible Tabs</h4>
      <div class="pn-settings-row">${tabRowCopy("Prompts")}${toggleHTML("pn-sui-tab-prompts", s.visibleTabs?.prompts !== false, "Prompts tab")}</div>
      <div class="pn-settings-row">${tabRowCopy("Export")}${toggleHTML("pn-sui-tab-export", s.visibleTabs?.export !== false, "Export tab")}</div>
      <div class="pn-settings-row">${tabRowCopy("History")}${toggleHTML("pn-sui-tab-history", s.visibleTabs?.history !== false, "History tab")}</div>
      <div class="pn-settings-row">${tabRowCopy("Tags")}${toggleHTML("pn-sui-tab-tags", s.visibleTabs?.tags !== false, "Tags tab")}</div>
    </div>
    <div class="pn-settings-section">
      <h4 class="pn-settings-section-title">Card Density</h4>
      <div class="pn-settings-select-field">
        <select class="pn-settings-select" id="pn-sui-density">
          <option value="comfortable"${s.cardDensity !== "compact" ? " selected" : ""}>Comfortable</option>
          <option value="compact"${s.cardDensity === "compact" ? " selected" : ""}>Compact</option>
        </select>
      </div>
    </div>`;
  };

  const tabRowCopy = (label) =>
    `<div class="pn-settings-row-copy"><span class="pn-settings-row-label">${esc(label)}</span></div>`;

  /* ── Section 5: Data ─────────────────────────────────────────────────────── */

  const renderData = () => {
    const container = byId("pn-settings-data-content");
    if (!container) return;
    const version = String(chrome.runtime?.getManifest?.()?.version || "0.1.0");
    container.innerHTML = `
    <div class="pn-settings-section">
      <h4 class="pn-settings-section-title">Import / Export</h4>
      <div class="pn-settings-data-row">
        <button class="pn-settings-data-btn" type="button" id="pn-sui-export">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Export All Data
        </button>
        <label class="pn-settings-import-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Import Data
          <input type="file" accept="application/json" id="pn-sui-import" />
        </label>
      </div>
    </div>
    <div class="pn-settings-section">
      <h4 class="pn-settings-section-title">Danger Zone</h4>
      <div class="pn-settings-danger-row">
        <button class="pn-settings-danger-btn" type="button" data-danger="clear-prompts">Clear All Prompts</button>
      </div>
      <div class="pn-settings-danger-row">
        <button class="pn-settings-danger-btn" type="button" data-danger="clear-history">Clear History</button>
      </div>
      <div class="pn-settings-danger-row">
        <button class="pn-settings-danger-btn" type="button" data-danger="reset-settings">Reset All Settings</button>
      </div>
    </div>
    <div class="pn-settings-version">Promptium v${esc(version)}</div>`;
  };

  /* ── Render all ──────────────────────────────────────────────────────────── */

  const renderAll = async () => {
    renderNav();
    switchSection(uiState.activeSection);
    await renderProviders();
    renderEmbeddings();
    renderFeatures();
    renderInterface();
    renderData();
  };

  /* ── Event binding ───────────────────────────────────────────────────────── */

  const readAndSaveInterface = async () => {
    const next = deepClone(state.settings);
    const fabPos = byId("pn-sui-fab-position");
    const fabStyle = byId("pn-sui-fab-style");
    const density = byId("pn-sui-density");
    if (fabPos)
      next.fabPosition =
        fabPos.value === "bottom-left" ? "bottom-left" : "bottom-right";
    if (fabStyle)
      next.fabStyle = ["circle", "pill", "icon-only"].includes(fabStyle.value)
        ? fabStyle.value
        : "circle";
    if (density)
      next.cardDensity =
        density.value === "compact" ? "compact" : "comfortable";
    next.visibleTabs = {
      prompts: byId("pn-sui-tab-prompts")?.checked !== false,
      export: byId("pn-sui-tab-export")?.checked !== false,
      history: byId("pn-sui-tab-history")?.checked !== false,
      tags: byId("pn-sui-tab-tags")?.checked !== false,
    };
    if (!Object.values(next.visibleTabs).some(Boolean))
      next.visibleTabs.prompts = true;
    await persistSettings(next);
    setStatus("Saved");
  };

  const readAndSaveFeatures = async () => {
    const next = deepClone(state.settings);
    FEATURE_TOGGLES.forEach((t) => {
      const el = byId(t.id);
      if (el) next.featureFlags[t.key] = el.checked;
    });
    await persistSettings(next);
    setStatus("Saved");
  };

  const bindEvents = () => {
    if (uiState.bound) return;
    uiState.bound = true;
    const root = byId("pn-settings-ui-root");
    if (!root) return;

    root.addEventListener("click", async (e) => {
      const navBtn = e.target.closest("[data-settings-nav]");
      if (navBtn) {
        switchSection(navBtn.dataset.settingsNav);
        return;
      }
      const provToggle = e.target.closest("[data-provider-toggle]");
      if (provToggle) {
        const pid = provToggle.dataset.providerToggle;
        uiState.expandedProvider = uiState.expandedProvider === pid ? "" : pid;
        await renderProviders();
        return;
      }
      const testBtn = e.target.closest("[data-provider-test]");
      if (testBtn) {
        await testProviderKey(testBtn.dataset.providerTest);
        return;
      }
      const eyeBtn = e.target.closest("[data-provider-eye]");
      if (eyeBtn) {
        const pid = eyeBtn.dataset.providerEye;
        uiState.keyVisible[pid] = !uiState.keyVisible[pid];
        await renderProviders();
        return;
      }
      const primaryBtn = e.target.closest("[data-provider-primary]");
      if (primaryBtn && !primaryBtn.disabled) {
        const next = deepClone(state.settings);
        next.activeProvider = primaryBtn.dataset.providerPrimary;
        await persistSettings(next);
        setStatus("Primary provider updated");
        await renderProviders();
        return;
      }
      const embedAction = e.target.closest("[data-embed-action]");
      if (embedAction) {
        requestEmbeddingSwitch(embedAction.dataset.embedAction);
        return;
      }
      if (e.target.id === "pn-sui-embed-confirm-yes") {
        await confirmEmbeddingSwitch();
        return;
      }
      if (e.target.id === "pn-sui-embed-confirm-no") {
        uiState.pendingEmbeddingId = "";
        byId("pn-settings-embed-confirm")?.classList.add("pn-hidden");
        return;
      }
      if (e.target.id === "pn-sui-export") {
        await exportAllData();
        return;
      }
      const dangerBtn = e.target.closest("[data-danger]");
      if (dangerBtn) {
        handleDanger(dangerBtn);
        return;
      }
    });

    root.addEventListener("input", (e) => {
      const keyInput = e.target.closest("[data-provider-key]");
      if (keyInput) {
        uiState.providerDraftKeys[keyInput.dataset.providerKey] = String(
          keyInput.value || "",
        );
      }
    });

    root.addEventListener("change", async (e) => {
      const modelSelect = e.target.closest("[data-provider-model]");
      if (modelSelect) {
        const next = deepClone(state.settings);
        next.providerModels[modelSelect.dataset.providerModel] =
          modelSelect.value;
        await persistSettings(next);
        setStatus("Model updated");
        return;
      }
      if (e.target.id === "pn-sui-import") {
        const file = e.target.files?.[0];
        if (file) await importAllData(file);
        e.target.value = "";
        return;
      }
      if (e.target.closest("[data-settings-section='features']")) {
        await readAndSaveFeatures();
        return;
      }
      if (e.target.closest("[data-settings-section='interface']")) {
        await readAndSaveInterface();
        return;
      }
    });

    root.addEventListener("keydown", (e) => {
      if (e.key === " " && e.target.closest(".pn-settings-toggle")) {
        e.preventDefault();
        const input =
          e.target.querySelector("input") ||
          e.target.closest(".pn-settings-toggle")?.querySelector("input");
        if (input) {
          input.checked = !input.checked;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    });

    chrome.runtime.onMessage.addListener((message) => {
      const type = String(message?.type || "").trim();
      if (
        ["AI_EMBEDDING_STATUS", "AI_EMBEDDING_REINDEX_PROGRESS"].includes(type)
      ) {
        syncEmbeddingStatus();
      }
    });
  };

  /* ── Provider key test ───────────────────────────────────────────────────── */

  const testProviderKey = async (pid) => {
    const meta = getProviderMeta(pid);
    const keyInput = document.querySelector(`[data-provider-key="${pid}"]`);
    const key = String(keyInput?.value || "").trim();
    if (!key) {
      setStatus("Enter an API key first.", true);
      return;
    }
    const dotEl = document.querySelector(
      `.pn-settings-provider[data-provider-id="${pid}"] .pn-settings-status-dot`,
    );
    if (dotEl) {
      dotEl.className =
        "pn-settings-status-dot pn-settings-status-dot--testing";
    }
    const model =
      state.settings.providerModels?.[pid] || meta.models?.[0]?.id || "";
    const result = await window.AIBridge.validateProviderKey(
      pid,
      key,
      model,
    ).catch(() => ({ ok: false, message: "Validation failed." }));
    uiState.providerValidation[pid] = {
      status: result?.ok ? "connected" : "invalid",
      message: String(result?.message || result?.error || "").trim(),
    };
    await persistValidation();
    if (result?.ok) {
      uiState.providerDraftKeys[pid] = key;
      await window.SessionStorage?.setStoredProviderKey?.(pid, key);
      setStatus("Provider connected");
    } else {
      setStatus("Invalid key", true);
    }
    await renderProviders();
  };

  /* ── Embedding switch ────────────────────────────────────────────────────── */

  const requestEmbeddingSwitch = (modelId) => {
    const current = String(
      state.settings.embeddingModelId || DEFAULT_SETTINGS.embeddingModelId,
    );
    if (!modelId || modelId === current) return;
    uiState.pendingEmbeddingId = modelId;
    byId("pn-settings-embed-confirm")?.classList.remove("pn-hidden");
  };

  const confirmEmbeddingSwitch = async () => {
    const modelId = uiState.pendingEmbeddingId;
    if (!modelId) return;
    byId("pn-settings-embed-confirm")?.classList.add("pn-hidden");
    const result = await window.AIBridge?.switchEmbeddingModel?.(modelId).catch(
      () => null,
    );
    if (!result?.ok) {
      setStatus(result?.error || "Model switch failed", true);
      return;
    }
    const next = deepClone(state.settings);
    next.embeddingModelId = modelId;
    await persistSettings(next);
    uiState.pendingEmbeddingId = "";
    await syncEmbeddingStatus();
    setStatus("Search model updated");
  };

  const syncEmbeddingStatus = async () => {
    uiState.embeddingStatus =
      await window.AIBridge?.getEmbeddingStatus?.().catch(() => null);
    renderEmbeddings();
  };

  /* ── Danger zone handlers ────────────────────────────────────────────────── */

  const dangerTimers = {};

  const handleDanger = (btn) => {
    const action = btn.dataset.danger;
    if (btn.classList.contains("is-confirming")) {
      executeDanger(action);
      btn.classList.remove("is-confirming");
      btn.textContent = getDangerLabel(action);
      if (dangerTimers[action]) {
        clearTimeout(dangerTimers[action]);
        delete dangerTimers[action];
      }
      return;
    }
    btn.classList.add("is-confirming");
    btn.textContent = "Confirm? Click again";
    if (dangerTimers[action]) clearTimeout(dangerTimers[action]);
    dangerTimers[action] = setTimeout(() => {
      btn.classList.remove("is-confirming");
      btn.textContent = getDangerLabel(action);
      delete dangerTimers[action];
    }, 3000);
  };

  const getDangerLabel = (action) => {
    if (action === "clear-prompts") return "Clear All Prompts";
    if (action === "clear-history") return "Clear History";
    return "Reset All Settings";
  };

  const executeDanger = async (action) => {
    if (action === "clear-prompts") {
      await chrome.storage.local.set({ prompts: [] });
      setStatus("Prompts cleared");
    } else if (action === "clear-history") {
      await chrome.storage.local.set({ chatHistory: [] });
      setStatus("History cleared");
    } else if (action === "reset-settings") {
      await persistSettings({
        ...deepClone(DEFAULT_SETTINGS),
        settingsMigratedV2: true,
      });
      await renderAll();
      setStatus("Settings reset");
    }
  };

  /* ── Data export/import ──────────────────────────────────────────────────── */

  const exportAllData = async () => {
    const snapshot = await chrome.storage.local.get(null);
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({
        url,
        filename: "promptium-export.json",
        saveAs: true,
      });
      setStatus("Export started");
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const importAllData = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed?.[KEYS.SETTINGS_KEY]) {
        parsed[KEYS.SETTINGS_KEY] = {
          ...(window.SettingsAI?.normalizeSettings?.(
            parsed[KEYS.SETTINGS_KEY],
          ) || parsed[KEYS.SETTINGS_KEY]),
          settingsMigratedV2: true,
        };
      }
      await chrome.storage.local.set(parsed);
      const snap = await chrome.storage.local
        .get([KEYS.SETTINGS_KEY])
        .catch(() => ({}));
      state.settings =
        window.SettingsAI?.normalizeSettings?.(snap?.[KEYS.SETTINGS_KEY]) ||
        snap?.[KEYS.SETTINGS_KEY] ||
        state.settings;
      await renderAll();
      setStatus("Data imported");
    } catch (err) {
      setStatus("Import failed: " + (err?.message || "Invalid file"), true);
    }
  };

  /* ── Public API ──────────────────────────────────────────────────────────── */

  const init = async () => {
    await loadRegistry();
    await loadValidation();
    await renderAll();
    bindEvents();
    await syncEmbeddingStatus();
  };

  window.SettingsUI = {
    init,
    renderAll,
    syncEmbeddingStatus,
    setStatus,
    switchSection,
  };
})();
