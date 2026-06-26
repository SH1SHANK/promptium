import { Prompt } from './prompt';
import { UserSettings } from './settings';
import { ExportChat, ExportPreferences } from './export';

declare global {
  interface Window {
    // Stores
    Store: {
      getPrompts(): Promise<Prompt[]>;
      savePrompt(payload: any): Promise<any>;
      updatePrompt(id: string, updates: any): Promise<any>;
      deletePrompt(id: string): Promise<boolean>;
      getLastError(): string;
      isQuotaError(value: any): boolean;
    };
    PromptStore: {
      getPrompts(): Promise<Prompt[]>;
      savePrompt(payload: any): Promise<any>;
      updatePrompt(id: string, updates: any): Promise<any>;
      deletePrompt(id: string): Promise<boolean>;
      getLastError(): string;
      isQuotaError(value: any): boolean;
      duplicatePrompt(id: string): Promise<any>;
      setFavorite(id: string, isFavorite: boolean): Promise<any>;
      buildSearchText(prompt: any): string;
      benchmarkSearch(
        prompts: any[],
        query?: string
      ): { count: number; resultCount: number; durationMs: number };
    };
    SettingsStore: {
      getSettings(defaults?: any): Promise<UserSettings>;
      setSettings(settings: UserSettings): Promise<UserSettings>;
      setOnboardingComplete(value?: boolean): Promise<void>;
    };
    ContinuationStore: {
      set(key: string, value: any): Promise<any>;
      get(key: string): Promise<any>;
      remove(key: string): Promise<void>;
      setSession(key: string, value: any): Promise<any>;
      getSession(key: string): Promise<any>;
      removeSession(key: string): Promise<void>;
    };
    ClippingStore: {
      KEY: string;
      getAll(): Promise<Record<string, any>>;
      setAll(clippings?: any): Promise<any>;
    };

    // Services
    Exporter: {
      toJSON(chat: ExportChat, prefs?: ExportPreferences): Promise<string>;
      toTXT(chat: ExportChat, prefs?: ExportPreferences): Promise<string>;
      toPDF(chat: ExportChat, prefs?: ExportPreferences): Promise<ArrayBuffer>;
      toNotion(chat: ExportChat, prefs?: ExportPreferences): Promise<string>;
      toObsidian(chat: ExportChat, prefs?: ExportPreferences): Promise<string>;
      toClipboardText(chat: ExportChat, prefs?: ExportPreferences): Promise<string>;
    };

    // App Navigation & State
    AppShell: {
      switchTab(tabName: string): Promise<void>;
      refreshHeaderControls(): void;
    };
    SidepanelState: {
      KEYS: {
        SIDEPANEL_SESSION_KEY: string;
        PENDING_PANEL_ACTION_KEY: string;
        PANEL_MODE_KEY: string;
        SETTINGS_KEY: string;
        GEMINI_KEY: string;
        IMPROVE_PAYLOAD_KEY: string;
        PENDING_SNIPPET_KEY: string;
        ONBOARDING_KEY: string;
      };
      ONBOARDING_CARDS: any[];
      state: {
        settings: UserSettings;
        onboardingIndex: number;
        activeTab: string;
        exportPayload: any;
        exportSnapshotPayload: any;
        pendingExportPayload: any;
        hasPendingExportUpdate: boolean;
        aiReady: boolean;
        initialized: boolean;
        pendingActions: any[];
        exportPrefs: any;
        turndown?: any;
        markdownParser?: any;
      };
      isEditableField(el: any): boolean;
    };

    // UI Features
    PromptsUI: {
      render(filterValue?: string): Promise<void>;
      bindSearchHandlers(): void;
      getSearchValue(): string;
      clearSearch(): void;
      loadSmartSuggestions(): void;
      renderBridgeStrip(): void;
      setCallbacks(callbacks: any): void;
      focusSearch(): void;
      getSearchInput(): HTMLElement | null;
      getSearchWrap(): HTMLElement | null;
      bindTemplateFilters(): void;
      setActiveFilter(el: any): void;
      resetTemplateFilter(): void;
      renderModelFeedback(): void;
      insertSelectedPrompt(): void;
    };
    PromptForm: {
      setCallbacks(callbacks: any): void;
      bindEvents(): void;
      prefillSuggestedTags(): void;
      open(): void;
      close(): void;
      openPlainPrefilled(text: string, sourceUrl?: string): void;
    };
    TagsUI: {
      render(): Promise<void>;
      renameTag(oldTag: string, nextTag: string): Promise<boolean>;
      deleteTag(tagToDelete: string): Promise<boolean>;
      setCallbacks(callbacks: any): void;
    };
    SettingsUI: {
      init(): Promise<void>;
    };
    SettingsAI: {
      setCallbacks(callbacks: any): void;
      bindEvents(): void;
      load(): Promise<void>;
      renderControls(): void;
      syncSaveState(): Promise<void>;
      syncAiState(): Promise<any>;
      setAiDisabledBadge(): Promise<void>;
    };
    ImproveUI: {
      open(promptId: string | null, text: string, tags: string[], options?: any): void;
      setCallbacks(callbacks: any): void;
      bindEvents(): void;
      normalizePayload(payload: any): any;
      close(): void;
    };
    ExportPayloadUI: {
      setCallbacks(callbacks: any): void;
      bindEvents(): void;
      applyDefaultsFromSettings(settings: UserSettings): void;
      loadPayload(): Promise<any>;
      renderPreview(): Promise<void>;
      setStatus(text: string, isSuccess?: boolean, options?: any): Promise<void>;
      buildExporterChatPayload(): ExportChat | null;
      buildExporterPrefs(): ExportPreferences;
      ingestIncomingPayload(payload: any): any;
      renderMeta(): void;
      hasPayloadMessages(payload: any): boolean;
      normalizePayload(payload: any): any;
      applyLatestSnapshot(): Promise<void>;
      syncPrefsFromControls(): Promise<void>;
      resolveExportThemeColors(): any;
      getActivePayload(): any;
      getPlatformLabel(platform: any): string;
    };
    ExportActionsUI: {
      runExport(): Promise<void>;
      selectMessagesForExport(): Promise<void>;
      bindEvents(): void;
      copyToClipboard(): Promise<void>;
      buildFilename(chat: ExportChat, format: string, options?: any): string;
      renderBridgeStrip(): void;
      resolveExtensionForFormat(format: string): string;
    };
    ContinuationUI: {
      bindEvents(): void;
      openFromActiveTab(): Promise<boolean>;
    };
    ChainsUI: {
      bindEvents(): void;
      render(filterValue?: string): Promise<void>;
    };
    HistoryUI: {
      render(): Promise<void>;
    };
    TemplateParser: {
      hasVariables(text: string): boolean;
      parse?(text: string): any;
    };
    ExportPreviewRenderer: {
      createMarkdownParser(factory: any): any;
      highlightCodeForPreview(code: string, language: string): string;
      renderMarkdownDocument(parser: any, markdown: string): string;
    };
    SessionStorage: {
      cloneExportPayload(payload: any): any;
      getStoredProviderKey(provider: string): Promise<string>;
      getStoredGeminiKey(): Promise<string>;
      getActiveExportPayload(state: any): any;
    };
    Bridge: {
      LLM_URLS: Record<string, string>;
      bridgeTo(messages: any[], source: string, target: string): Promise<boolean>;
    };

    // Helper Utilities
    PnDialog: any;
    PromptDuplicate: any;
    SmartName: any;
    Tags: any;
    PromptTemplates: any;
    TokenCounter: any;
    AI: any;
    markdownit: any;

    Continuation: {
      CONTINUATION_KEY: string;
      CONTINUATION_TTL_MS: number;
      normalizeMode(value: any): string;
      buildHandoff(
        messages: any[],
        mode?: string,
        userNote?: string,
        cloudKey?: string
      ): Promise<any>;
      buildFallback(messages: any[]): string;
      store(handoffText: string, targetPlatform: string, sourcePlatform?: string): Promise<void>;
      checkPending(currentPlatform: string): Promise<any>;
    };
    DomHelpers: any;
    SidepanelInit: {
      registerEarlyListeners(): void;
      init(): Promise<void>;
    };
    AIBridge: any;
    TemplateFill: any;
    commandPalette: any;
    createBuiltinCommands: any;
    __PN?: any;
    Scraper?: any;
    Injector?: any;
    Clippings?: any;
    PromptSuggestions?: any;
  }

  // Declared globals for legacy global scripts compatibility
  var showToast: (message: string) => Promise<void>;
  var getActiveTabContext: () => Promise<any>;
  var PLATFORM_LABELS: Record<string, string>;
  var SUPPORTED_URLS: string[];
  var escapeHtml: (text: string) => string;
  var TurndownService: any;
}
