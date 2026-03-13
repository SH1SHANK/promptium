(() => {
  /**
   * File: sidepanel/state.js
   * Purpose: Shared sidepanel constants and mutable in-memory state.
   */

  const KEYS = Object.freeze({
    SIDEPANEL_SESSION_KEY: "promptiumSidePanelPayload",
    PENDING_PANEL_ACTION_KEY: "promptiumPendingPanelAction",
    PANEL_MODE_KEY: "promptiumPanelMode",
    SETTINGS_KEY: "promptiumSettings",
    GEMINI_KEY: "promptiumGeminiKey",
    OPENAI_KEY: "promptiumOpenAIKey",
    ANTHROPIC_KEY: "promptiumAnthropicKey",
    OPENROUTER_KEY: "promptiumOpenRouterKey",
    IMPROVE_PAYLOAD_KEY: "promptiumImprovePayload",
    PENDING_SNIPPET_KEY: "pendingSnippet",
    ONBOARDING_KEY: "onboardingComplete",
    LOCAL_CACHE_INDEX_KEY: "localModelCacheIndex",
    EMBEDDING_META_KEY: "promptiumEmbeddingMeta",
    EMBEDDING_REINDEX_KEY: "promptiumEmbeddingReindexState",
  });

  const DEFAULT_SETTINGS = Object.freeze({
    activeProvider: "gemini",
    providerModels: {
      gemini: "gemini-2.0-flash",
      openai: "gpt-4o-mini",
      anthropic: "claude-haiku-4-5-20251001",
      openrouter: "meta-llama/llama-3.1-8b-instruct:free",
    },
    embeddingModelId: "all-minilm-l6-v2",
    featureFlags: {
      polish: true,
      autoTags: true,
      improvePrompt: true,
      continueSummary: true,
      smartSuggestions: true,
    },
    fabPosition: "bottom-right",
    fabStyle: "circle",
    chatHighlightStyle: "solid",
    fabButtons: {
      savePrompt: true,
      exportChat: true,
      continueChat: true,
      library: true,
    },
    visibleTabs: {
      prompts: true,
      chains: true,
      export: true,
      history: true,
      tags: true,
    },
    cardDensity: "comfortable",
    defaultExportFormat: "markdown",
    autoSaveHistory: true,
    enableAI: true,
    semanticSearch: true,
    settingsMigratedV2: false,
    onboardingComplete: false,
  });

  const ONBOARDING_CARDS = [
    {
      id: "welcome",
      icon: "✦",
      iconClass: "pn-card-icon--violet",
      subheadline: "Welcome to Promptium",
      headline: "Your AI workspace, elevated.",
      body: "One extension. Reusable prompts, smart templates, semantic search, cross-LLM continuation, bookmarks, and precision exports — all private and local.",
      isPersonalize: false,
    },
    {
      id: "library",
      icon: "⌘",
      iconClass: "pn-card-icon--mint",
      subheadline: "Prompt Library",
      headline: "Capture great prompts once.",
      body: "Save any prompt, tag it, then inject it directly into ChatGPT, Claude, Gemini, or 30+ platforms in one click. Use [name] for required fields and [name?] for optional ones.",
      isPersonalize: false,
    },
    {
      id: "search",
      icon: "◈",
      iconClass: "pn-card-icon--pink",
      subheadline: "Semantic Search",
      headline: "Finds prompts by meaning.",
      body: "No exact match needed. Vector similarity search powered by Transformers.js runs entirely on-device — fast, private, and relevance-ranked.",
      isPersonalize: false,
    },
    {
      id: "improve",
      icon: "✦",
      iconClass: "pn-card-icon--violet",
      subheadline: "Prompt Improvement",
      headline: "Optimize before you send.",
      body: "One click rewrites and sharpens your prompt using your chosen AI provider, then injects the improved version directly into the active chat.",
      isPersonalize: false,
    },
    {
      id: "export",
      icon: "↑",
      iconClass: "pn-card-icon--amber",
      subheadline: "Precision Export",
      headline: "Export anything, your way.",
      body: "Select exact message ranges, star key responses, and export in 8 formats — Markdown, PDF, JSON, PNG, TXT, Notion, Obsidian — with auto-generated smart filenames.",
      isPersonalize: false,
    },
    {
      id: "privacy",
      icon: "◉",
      iconClass: "pn-card-icon--green",
      subheadline: "Local & Private",
      headline: "No backend required.",
      body: "All prompts live in extension storage on your device. Embeddings are computed locally. Nothing is sent to a Promptium server — ever.",
      isPersonalize: false,
    },
    {
      id: "launch",
      icon: "→",
      iconClass: "pn-card-icon--pink",
      subheadline: "Ready",
      headline: "Choose your first step.",
      body: "Open your prompt library, configure AI settings, or dive straight in.",
      isLaunch: true,
    },
  ];

  const state = {
    activeTab: "prompts",
    pendingDuplicatePayload: null,
    settings: { ...DEFAULT_SETTINGS },
    exportPayload: null,
    exportSnapshotPayload: null,
    pendingExportPayload: null,
    hasPendingExportUpdate: false,
    exportPrefs: {
      format: DEFAULT_SETTINGS.defaultExportFormat,
      includeDate: false,
      includePlatform: false,
      includeMessageNumbers: false,
      contentMode: "structured",
      fontStyle: "System",
      fontSize: 14,
      background: "dark",
      customBackground: "#18181c",
    },
    turndown: null,
    markdownParser: null,
    onboardingIndex: 0,
    aiReady: false,
    semanticResults: null,
    _searchDebounce: null,
    pendingActions: [],
    initialized: false,
  };

  const UI_FEEDBACK_MS = Object.freeze({
    SEARCH_DEBOUNCE: 170,
    COPY_RESET: 1400,
    API_CHECK_RESET_SHORT: 1600,
    API_CHECK_RESET_LONG: 2200,
    IMPROVE_UNDO: 4200,
  });

  const isEditableField = (node) => {
    if (!(node instanceof HTMLElement)) return false;
    if (node.isContentEditable || node instanceof HTMLTextAreaElement)
      return true;
    if (!(node instanceof HTMLInputElement)) return false;
    const type = String(node.type || "text").toLowerCase();
    return ![
      "button",
      "checkbox",
      "radio",
      "submit",
      "reset",
      "range",
      "color",
      "file",
    ].includes(type);
  };

  const SidepanelState = {
    KEYS,
    DEFAULT_SETTINGS,
    ONBOARDING_CARDS,
    state,
    UI_FEEDBACK_MS,
    isEditableField,
  };

  if (typeof window !== "undefined") {
    window.SidepanelState = SidepanelState;
  }
})();
