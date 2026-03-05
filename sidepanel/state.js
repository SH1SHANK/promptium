(() => {
/**
 * File: sidepanel/state.js
 * Purpose: Shared sidepanel constants and mutable in-memory state.
 */

const KEYS = Object.freeze({
  SIDEPANEL_SESSION_KEY: 'promptiumSidePanelPayload',
  SETTINGS_KEY: 'promptiumSettings',
  GEMINI_KEY: 'promptiumGeminiKey',
  OPENAI_KEY: 'promptiumOpenAIKey',
  ANTHROPIC_KEY: 'promptiumAnthropicKey',
  OPENROUTER_KEY: 'promptiumOpenRouterKey',
  IMPROVE_PAYLOAD_KEY: 'promptiumImprovePayload',
  PENDING_SNIPPET_KEY: 'pendingSnippet',
  ONBOARDING_KEY: 'onboardingComplete',
  LOCAL_CACHE_INDEX_KEY: 'localModelCacheIndex',
  EMBEDDING_META_KEY: 'promptiumEmbeddingMeta',
  EMBEDDING_REINDEX_KEY: 'promptiumEmbeddingReindexState'
});

const DEFAULT_SETTINGS = Object.freeze({
  enableAI: true,
  activeProvider: 'gemini',
  providerModels: {
    gemini: 'gemini-3.0-flash-preview',
    openai: 'gpt-5.2-mini',
    anthropic: 'claude-sonnet-4-5',
    openrouter: 'openrouter/auto'
  },
  embeddingModelId: 'all-minilm-l6-v2',
  preferLocal: false,
  useLocalFallback: true,
  geminiPrimary: true,
  localModelId: 'smollm2_1_7b',
  legacyAutoRewriteOnSave: false,
  settingsMigratedV2: false,
  localFeatureFlags: {
    polish: true,
    autoTags: true,
    improvePrompt: true,
    continueSummary: true,
    smartExportTitle: false
  },
  aiBackend: 'gemini',
  aiAutoFallback: true,
  semanticSearch: true,
  autoSuggestTags: true,
  duplicateCheck: true,
  polishWithGemini: true,
  enabledPlatforms: {
    chatgpt: true,
    claude: true,
    gemini: true,
    perplexity: true,
    copilot: true,
    deepseek: true,
    qwen: true,
    mistral: true,
    kimi: true,
    moonshot: true,
    grok: true,
    huggingchat: true,
    poe: true,
    you: true,
    phind: true,
    characterai: true,
    pi: true,
    metaai: true,
    amazonq: true,
    ernie: true,
    doubao: true,
    yichat: true,
    coherecoral: true,
    groq: true,
    fireworks: true,
    together: true
  },
  platformLabels: {
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
  },
  customPlatforms: [],
  fabPosition: 'right',
  fabStyle: 'circle',
  fabActions: {
    savePrompt: true,
    exportChat: true,
    continueChat: true,
    promptLibrary: true
  },
  visibleTabs: {
    prompts: true,
    export: true,
    history: true,
    tags: true
  },
  promptCardDensity: 'comfortable',
  defaultExportFormat: 'markdown',
  defaultExportNaming: 'smart',
  autoSaveExportsToHistory: true,
  defaultIncludeDate: true,
  defaultIncludePlatform: true,
  // Default remains Alt+Shift+B to avoid common browser/browser-input conflicts.
  bookmarkShortcut: 'Alt+Shift+B',
  hoverPreviewEnabled: true,
  hoverPreviewDelay: 400,
  continueDefaultMode: 'FULL_SUMMARY',
  userContext: ''
});

const ONBOARDING_CARDS = [
  {
    id: 'welcome',
    icon: '✦',
    iconClass: 'pn-card-icon--violet',
    subheadline: 'Welcome to Promptium',
    headline: 'Your AI workflow, organized.',
    body: 'Promptium combines reusable prompts, variable templates, semantic search, cross-LLM continuation, bookmarks, and export workflows in one place.',
    isPersonalize: false
  },
  {
    id: 'library',
    icon: '⌘',
    iconClass: 'pn-card-icon--mint',
    subheadline: 'Prompt Library',
    headline: 'Capture great prompts once.',
    body: 'Save prompts with tags and categories, then inject directly into your active LLM chat. Use [name] for required blanks and [name?] for optional blanks.',
    isPersonalize: false
  },
  {
    id: 'search',
    icon: '◈',
    iconClass: 'pn-card-icon--pink',
    subheadline: 'Semantic Search',
    headline: 'Find prompts by meaning.',
    body: 'Transformers.js powers relevance ranking, vector similarity, and efficient local retrieval.',
    isPersonalize: false
  },
  {
    id: 'improve',
    icon: '✨',
    iconClass: 'pn-card-icon--violet',
    subheadline: 'Prompt Improvement',
    headline: 'Optimize before you send.',
    body: 'One click improves prompts and can inject optimized results into the active conversation.',
    isPersonalize: false
  },
  {
    id: 'export',
    icon: '↑',
    iconClass: 'pn-card-icon--amber',
    subheadline: 'Precision Export',
    headline: 'Select only what matters.',
    body: 'Select exact message ranges, keep key responses starred, and export Markdown, TXT, JSON, PDF, PNG, JPEG, Notion, or Obsidian with smart filenames.',
    isPersonalize: false
  },
  {
    id: 'privacy',
    icon: '◉',
    iconClass: 'pn-card-icon--green',
    subheadline: 'Local & Private',
    headline: 'No backend required.',
    body: 'Promptium keeps prompts local in extension storage and uses privacy-first processing where possible.',
    isPersonalize: false
  },
  {
    id: 'launch',
    icon: '→',
    iconClass: 'pn-card-icon--pink',
    subheadline: 'Ready to start',
    headline: 'Choose your next step.',
    body: 'Open your library, jump to settings, or start directly.',
    isLaunch: true
  }
];

const state = {
  activeTab: 'prompts',
  pendingDuplicatePayload: null,
  settings: { ...DEFAULT_SETTINGS },
  exportPayload: null,
  exportSnapshotPayload: null,
  pendingExportPayload: null,
  hasPendingExportUpdate: false,
  exportPrefs: {
    format: DEFAULT_SETTINGS.defaultExportFormat,
    includeDate: DEFAULT_SETTINGS.defaultIncludeDate,
    includePlatform: DEFAULT_SETTINGS.defaultIncludePlatform,
    includeMessageNumbers: false,
    contentMode: 'structured',
    fontStyle: 'System',
    fontSize: 14,
    background: 'dark',
    customBackground: '#18181c'
  },
  turndown: null,
  markdownParser: null,
  onboardingIndex: 0,
  aiReady: false,
  semanticResults: null,
  _searchDebounce: null,
  pendingActions: [],
  initialized: false
};

const UI_FEEDBACK_MS = Object.freeze({
  SEARCH_DEBOUNCE: 170,
  COPY_RESET: 1400,
  API_CHECK_RESET_SHORT: 1600,
  API_CHECK_RESET_LONG: 2200,
  IMPROVE_UNDO: 4200
});

const isEditableField = (node) => {
  if (!(node instanceof HTMLElement)) return false;
  if (node.isContentEditable || node instanceof HTMLTextAreaElement) return true;
  if (!(node instanceof HTMLInputElement)) return false;
  const type = String(node.type || 'text').toLowerCase();
  return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
};

const SidepanelState = {
  KEYS,
  DEFAULT_SETTINGS,
  ONBOARDING_CARDS,
  state,
  UI_FEEDBACK_MS,
  isEditableField
};

if (typeof window !== 'undefined') {
  window.SidepanelState = SidepanelState;
}
})();
