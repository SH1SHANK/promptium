(() => {
  /**
   * File: sidepanel/state.js
   * Purpose: Shared sidepanel constants and mutable in-memory state.
   */

  const KEYS = Object.freeze({
    SIDEPANEL_SESSION_KEY: "promptiumSidePanelPayload",
    SETTINGS_KEY: "promptiumSettings",
    GEMINI_KEY: "promptiumGeminiKey",
    OPENAI_KEY: "promptiumOpenAIKey",
    ANTHROPIC_KEY: "promptiumAnthropicKey",
    OPENROUTER_KEY: "promptiumOpenRouterKey",
    IMPROVE_PAYLOAD_KEY: "promptiumImprovePayload",
    WORKFLOWS_KEY: "promptiumWorkflows",
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
    },
    fabPosition: "bottom-right",
    fabStyle: "circle",
    fabButtons: {
      savePrompt: true,
      exportChat: true,
      continueChat: true,
      library: true,
    },
    visibleTabs: {
      prompts: true,
      workflows: true,
      export: true,
      history: true,
      tags: true,
    },
    cardDensity: "comfortable",
    defaultExportFormat: "markdown",
    autoSaveHistory: true,
    settingsMigratedV2: false,
    onboardingComplete: false,
  });

  const ONBOARDING_CARDS = [
    {
      id: "welcome",
      icon: "✦",
      iconClass: "pn-card-icon--violet",
      subheadline: "Welcome to Promptium",
      headline: "Your AI workflow, organized.",
      body: "Promptium combines reusable prompts, variable templates, semantic search, cross-LLM continuation, bookmarks, and export workflows in one place.",
      isPersonalize: false,
    },
    {
      id: "library",
      icon: "⌘",
      iconClass: "pn-card-icon--mint",
      subheadline: "Prompt Library",
      headline: "Capture great prompts once.",
      body: "Save prompts with tags and categories, then inject directly into your active LLM chat. Use [name] for required blanks and [name?] for optional blanks.",
      isPersonalize: false,
    },
    {
      id: "search",
      icon: "◈",
      iconClass: "pn-card-icon--pink",
      subheadline: "Semantic Search",
      headline: "Find prompts by meaning.",
      body: "Transformers.js powers relevance ranking, vector similarity, and efficient local retrieval.",
      isPersonalize: false,
    },
    {
      id: "improve",
      icon: "✨",
      iconClass: "pn-card-icon--violet",
      subheadline: "Prompt Improvement",
      headline: "Optimize before you send.",
      body: "One click improves prompts and can inject optimized results into the active conversation.",
      isPersonalize: false,
    },
    {
      id: "export",
      icon: "↑",
      iconClass: "pn-card-icon--amber",
      subheadline: "Precision Export",
      headline: "Select only what matters.",
      body: "Select exact message ranges, keep key responses starred, and export Markdown, TXT, JSON, PDF, PNG, JPEG, Notion, or Obsidian with smart filenames.",
      isPersonalize: false,
    },
    {
      id: "privacy",
      icon: "◉",
      iconClass: "pn-card-icon--green",
      subheadline: "Local & Private",
      headline: "No backend required.",
      body: "Promptium keeps prompts local in extension storage and uses privacy-first processing where possible.",
      isPersonalize: false,
    },
    {
      id: "launch",
      icon: "→",
      iconClass: "pn-card-icon--pink",
      subheadline: "Ready to start",
      headline: "Choose your next step.",
      body: "Open your library, jump to settings, or start directly.",
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
    workflows: [],
    activeWorkflowId: null,
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
