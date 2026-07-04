// File: src/sidepanel/state.ts

export const KEYS = Object.freeze({
  SIDEPANEL_SESSION_KEY: 'promptiumSidePanelPayload',
  PENDING_PANEL_ACTION_KEY: 'promptiumPendingPanelAction',
  PANEL_MODE_KEY: 'promptiumPanelMode',
  SETTINGS_KEY: 'promptiumSettings',
  GEMINI_KEY: 'promptiumGeminiKey',
  IMPROVE_PAYLOAD_KEY: 'promptiumImprovePayload',
  PENDING_SNIPPET_KEY: 'pendingSnippet',
  ONBOARDING_KEY: 'onboardingComplete',
});

export const DEFAULT_SETTINGS = Object.freeze({
  geminiApiKey: '',
  geminiModel: 'gemini-2.0-flash',
  improvePrompt: true,
  defaultExportFormat: 'markdown',
  onboardingComplete: false,
  theme: 'dark',
});

export interface OnboardingCard {
  id: string;
  icon: string;
  iconClass: string;
  subheadline: string;
  headline: string;
  body: string;
  isPersonalize?: boolean;
  isLaunch?: boolean;
}

export const ONBOARDING_CARDS: OnboardingCard[] = [
  {
    id: 'welcome',
    icon: '✦',
    iconClass: 'card-icon--violet',
    subheadline: 'Welcome to Promptium',
    headline: 'Your dedicated prompt writing environment.',
    body: 'Create, parameterize, compile, and organize your prompts with a local-first editor built for writing speed and efficiency.',
    isPersonalize: false,
  },
  {
    id: 'diagnostics',
    icon: '◈',
    iconClass: 'card-icon--pink',
    subheadline: 'Diagnostics & Quality',
    headline: 'Power your writing with live feedback.',
    body: 'Get live checks for malformed variables, duplicate variables, unused configs, generic titles, and prompt health directly as you type.',
    isPersonalize: false,
  },
  {
    id: 'launch',
    icon: '→',
    iconClass: 'card-icon--pink',
    subheadline: 'Ready',
    headline: 'Choose your first step.',
    body: 'Open your prompt library, configure settings, or dive straight into writing.',
    isLaunch: true,
  },
];

export interface AppState {
  activeTab: string;
  pendingDuplicatePayload: any;
  settings: typeof DEFAULT_SETTINGS & {
    geminiApiKey: string;
    geminiModel: string;
    improvePrompt: boolean;
    defaultExportFormat: string;
    onboardingComplete: boolean;
    theme: string;
  };
  exportPayload: any;
  exportSnapshotPayload: any;
  pendingExportPayload: any;
  hasPendingExportUpdate: boolean;
  exportPrefs: {
    format: string;
    exportStyle: string;
    includeDate: boolean;
    includePlatform: boolean;
    includeMessageNumbers: boolean;
    contentMode: string;
    fontStyle: string;
    fontSize: number;
    background: string;
    customBackground: string;
  };
  turndown: any;
  markdownParser: any;
  onboardingIndex: number;
  aiReady: boolean;
  semanticResults: any;
  _searchDebounce: any;
  pendingActions: any[];
  initialized: boolean;
}

export const state: AppState = {
  activeTab: 'prompts',
  pendingDuplicatePayload: null,
  settings: { ...DEFAULT_SETTINGS },
  exportPayload: null,
  exportSnapshotPayload: null,
  pendingExportPayload: null,
  hasPendingExportUpdate: false,
  exportPrefs: {
    format: DEFAULT_SETTINGS.defaultExportFormat,
    exportStyle: 'standard',
    includeDate: false,
    includePlatform: false,
    includeMessageNumbers: false,
    contentMode: 'structured',
    fontStyle: 'System',
    fontSize: 14,
    background: 'dark',
    customBackground: '#18181c',
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

export const UI_FEEDBACK_MS = Object.freeze({
  SEARCH_DEBOUNCE: 170,
  COPY_RESET: 1400,
  API_CHECK_RESET_SHORT: 1600,
  API_CHECK_RESET_LONG: 2200,
  IMPROVE_UNDO: 4200,
});

export const isEditableField = (node: any): boolean => {
  if (!(node instanceof HTMLElement)) return false;
  if (node.isContentEditable || node instanceof HTMLTextAreaElement) return true;
  if (!(node instanceof HTMLInputElement)) return false;
  const type = String(node.type || 'text').toLowerCase();
  return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'].includes(
    type
  );
};

const SidepanelState = {
  KEYS,
  DEFAULT_SETTINGS,
  ONBOARDING_CARDS,
  state,
  UI_FEEDBACK_MS,
  isEditableField,
};

if (typeof window !== 'undefined') {
  (window as any).SidepanelState = SidepanelState;
}

export default SidepanelState;
