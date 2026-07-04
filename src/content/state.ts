/**
 * content/state.ts
 * Owns all mutable runtime state for the content script.
 * No DOM manipulation or side-effects — only state containers.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const OPEN_SIDEPANEL_ACTION = 'OPEN_SIDEPANEL';
export const OBSERVER_DEBOUNCE_MS = 300;
export const URL_WATCH_INTERVAL_MS = 1000;
export const INJECTION_UNDO_TTL_MS = 8000;
export const INJECTION_CONFIRMATION_DELAY_MS = 360;
export const SELECTION_SHADOW_HOST_ID = 'selection-shadow-host';

// ─── FAB State Machine ────────────────────────────────────────────────────────

export type FabState =
  | 'hidden'
  | 'idle'
  | 'typing'
  | 'selection_user'
  | 'selection_assistant'
  | 'conversation'
  | 'expanded'
  | 'processing'
  | 'success'
  | 'error'
  | 'sleeping';

export interface FabContext {
  platform: string;
  state: 'selection-mode' | 'overlay' | 'selection' | 'typing' | 'conversation' | 'idle';
  composer: { focused: boolean; text: string; hasText: boolean; rect: DOMRect | null };
  selection: { text: string; role: 'user' | 'assistant' | 'mixed'; rect: DOMRect | null };
  conversation: { hasMessages: boolean; count: number };
  overlay: { active: boolean };
  viewport: { isSmall: boolean; width: number; height: number };
}

export interface ActionOption {
  id: string;
  label: string;
  score: number;
  primary: boolean;
}

// ─── Selection Export State ───────────────────────────────────────────────────

export const exportSelectionState: {
  platform: string | null;
  selectors: any | null;
  selectionModeActive: boolean;
  observer: MutationObserver | null;
  observerRoot: Element | null;
  scanTimer: any;
  urlWatchTimer: any;
  lastUrl: string;
  selectedIds: Set<string>;
  messageOrder: string[];
  messagesById: Map<string, any>;
  sequence: number;
  chatHighlightStyle: string;
  lastClickedId: string | null;
  isDragging: boolean;
  dragChecked: boolean;
  groups: any[];
  splitGroupIds: Set<string>;
} = {
  platform: null,
  selectors: null,
  selectionModeActive: false,
  observer: null,
  observerRoot: null,
  scanTimer: null,
  urlWatchTimer: null,
  lastUrl: typeof window !== 'undefined' ? window.location.href : '',
  selectedIds: new Set(),
  messageOrder: [],
  messagesById: new Map(),
  sequence: 0,
  chatHighlightStyle: 'solid',
  lastClickedId: null,
  isDragging: false,
  dragChecked: false,
  groups: [],
  splitGroupIds: new Set(),
};

// ─── Injection Undo State ─────────────────────────────────────────────────────

export const injectionUndoState: {
  previousText: string;
  injectedText: string;
  platform: string | null;
  createdAt: number;
  consumed: boolean;
  timer: any;
  toast: HTMLElement | null;
  toastTimer: any;
} = {
  previousText: '',
  injectedText: '',
  platform: null,
  createdAt: 0,
  consumed: true,
  timer: null,
  toast: null,
  toastTimer: null,
};

// ─── FAB Quality Counters ─────────────────────────────────────────────────────

export let ignoreCount = 0;
export let inQuietMode = false;
export let confidenceLevel = 0;
export let confidenceInterval: any = null;
export const localTelemetry: Array<any> = [];

// ─── Content Listener Trackers ────────────────────────────────────────────────

export const activeListeners: Array<{
  target: EventTarget;
  type: string;
  listener: EventListener;
}> = [];
export const activeObservers: Array<MutationObserver> = [];

// ─── Misc Context FAB State ───────────────────────────────────────────────────

export let activeAnimationPromise: Promise<void> = Promise.resolve();
export let currentFABState: FabState = 'hidden';
export let activeContext = 'idle';
export let currentSelectionText = '';
export let currentSelectionRole: 'user' | 'assistant' | 'mixed' = 'mixed';
export let typingTimeout: any = null;
export let deselectTimeout: any = null;
export let lastSavedPromptText = '';
export let lastSavedPromptTime = 0;

// ─── FAB Allowed Transitions ──────────────────────────────────────────────────

export const ALLOWED_TRANSITIONS: Record<FabState, FabState[]> = {
  hidden: ['idle', 'typing', 'selection_user', 'selection_assistant', 'conversation', 'sleeping'],
  idle: [
    'hidden',
    'typing',
    'selection_user',
    'selection_assistant',
    'conversation',
    'expanded',
    'sleeping',
  ],
  typing: ['hidden', 'idle', 'processing', 'sleeping'],
  selection_user: ['hidden', 'idle', 'processing', 'sleeping'],
  selection_assistant: ['hidden', 'idle', 'processing', 'sleeping'],
  conversation: ['hidden', 'idle', 'processing', 'sleeping'],
  expanded: ['hidden', 'idle', 'processing', 'sleeping'],
  processing: ['success', 'error'],
  success: [
    'idle',
    'typing',
    'selection_user',
    'selection_assistant',
    'conversation',
    'sleeping',
    'hidden',
  ],
  error: [
    'idle',
    'typing',
    'selection_user',
    'selection_assistant',
    'conversation',
    'sleeping',
    'hidden',
  ],
  sleeping: ['idle', 'typing', 'selection_user', 'selection_assistant', 'conversation', 'hidden'],
};
