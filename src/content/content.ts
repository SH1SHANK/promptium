import { getCurrentAdapter } from '../platform';
import { toast } from '../shared/utils/toast';

(() => {
  /**
   * File: content/content.js
   * Purpose: Boots Promptium content features, handles runtime actions, and drives side-panel export selection UI.
   * Communicates with: utils/platform.js, utils/storage.js, utils/exporter.js, content/scraper.js, content/injector.js, content/toolbar.js, background/service_worker.js.
   */

  window.__PN = window.__PN || {};

  const OPEN_SIDEPANEL_ACTION = 'OPEN_SIDEPANEL';
  const OBSERVER_DEBOUNCE_MS = 300;
  const URL_WATCH_INTERVAL_MS = 1000;
  const INJECTION_UNDO_TTL_MS = 8000;
  const INJECTION_CONFIRMATION_DELAY_MS = 360;
  const SELECTION_SHADOW_HOST_ID = 'pn-selection-shadow-host';

  const INLINE_SELECT_SHADOW_CSS = `
    :host {
      position: absolute;
      top: 12px;
      left: -24px;
      z-index: 2147483642;
      opacity: 0;
      transform: scale(0.9) translateX(-4px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
    }
    :host-context(.pn-selectable-message--relative:hover) {
      opacity: 0.85;
      transform: scale(1) translateX(0);
      pointer-events: auto;
    }
    :host([data-visible="true"]) {
      opacity: 0.9;
      transform: scale(1) translateX(0);
      pointer-events: auto;
    }
    :host([data-checked="true"]) {
      opacity: 1;
      transform: scale(1) translateX(0);
      pointer-events: auto;
    }
    .pn-inline-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .pn-inline-select {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      background: rgba(24, 24, 27, 0.85);
      border: 1.5px solid rgba(255, 255, 255, 0.25);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-sizing: border-box;
      user-select: none;
      transition: background 0.15s, border-color 0.15s;
    }
    .pn-inline-select:hover {
      border-color: rgba(20, 184, 166, 0.8);
      background: rgba(20, 184, 166, 0.1);
    }
    .pn-inline-select.pn-checked {
      background: rgba(20, 184, 166, 0.18);
      border-color: rgba(20, 184, 166, 0.9);
    }
    .pn-inline-check {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .pn-inline-mark {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      border: 1.5px solid rgba(255, 255, 255, 0.6);
      box-sizing: border-box;
      transition: background 150ms cubic-bezier(0.2, 0, 0.2, 1), border-color 150ms cubic-bezier(0.2, 0, 0.2, 1);
    }
    .pn-inline-check:checked + .pn-inline-mark {
      background: #14b8a6;
      border-color: #14b8a6;
      box-shadow: 0 0 6px rgba(20, 184, 166, 0.4);
    }
    .pn-inline-split-toggle {
      border: none;
      background: rgba(24, 24, 27, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 4px;
      color: #a1a1aa;
      cursor: pointer;
      font-size: 8px;
      padding: 1px 3px;
      white-space: nowrap;
      display: none;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, color 0.15s;
    }
    :host-context(.pn-selectable-message--relative:hover) .pn-inline-split-toggle,
    :host([data-checked="true"]) .pn-inline-split-toggle {
      display: flex;
    }
    .pn-inline-split-toggle:hover {
      background: #14b8a6;
      color: #fff;
    }
  `;

  const CONTEXT_FAB_SHADOW_CSS = `
    :host {
      --pn-color-bg: rgba(18, 20, 27, 0.85);
      --pn-color-border: rgba(255, 255, 255, 0.06);
      --pn-color-primary: #14b8a6;
      --pn-color-primary-hover: #36d6c3;
      --pn-color-text-primary: #ffffff;
      --pn-color-text-secondary: #a1a1aa;
      --pn-color-dark: #0b0f19;
      --pn-shadow-default: 0 12px 40px rgba(0, 0, 0, 0.45);
      --pn-blur-default: blur(16px);
      --pn-ease-default: cubic-bezier(0.2, 0, 0.2, 1);
      --pn-dur-morph: 180ms;
      --pn-dur-expand: 200ms;
      --pn-dur-feedback: 160ms;
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        --pn-dur-morph: 0ms !important;
        --pn-dur-expand: 0ms !important;
        --pn-dur-feedback: 0ms !important;
      }
    }

    #pn-context-fab {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 2147483644;
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--pn-color-bg);
      border: 1px solid var(--pn-color-border);
      border-radius: 99px;
      padding: 4px;
      box-shadow: var(--pn-shadow-default);
      backdrop-filter: var(--pn-blur-default);
      -webkit-backdrop-filter: var(--pn-blur-default);
      font-family: Outfit, Avenir Next, Segoe UI, sans-serif;
      transition: max-width var(--pn-dur-morph) var(--pn-ease-default), max-height var(--pn-dur-morph) var(--pn-ease-default), border-radius var(--pn-dur-morph) var(--pn-ease-default), opacity 120ms ease;
      overflow: hidden;
      max-width: 44px;
      max-height: 44px;
      height: 44px;
      pointer-events: auto;
      box-sizing: border-box;
    }

    #pn-context-fab.pn-expanded {
      max-width: 520px;
      border-radius: 24px;
    }

    #pn-context-fab.pn-menu-expanded {
      border-radius: 16px;
      max-height: 320px;
      max-width: 240px;
      height: auto;
      flex-direction: column;
      align-items: stretch;
      padding: 8px;
    }

    #pn-context-fab.pn-hidden {
      display: none !important;
    }

    .pn-fab-trigger {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      background: var(--pn-color-primary);
      color: var(--pn-color-dark);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: transform 100ms var(--pn-ease-default), background 100ms ease;
      padding: 0;
    }

    .pn-fab-trigger:hover, .pn-fab-trigger:focus-visible {
      transform: scale(1.05);
      outline: 2px solid var(--pn-color-primary);
      outline-offset: 2px;
    }

    .pn-fab-actions-stack {
      display: flex;
      align-items: center;
      gap: 6px;
      padding-right: 8px;
      opacity: 0;
      transition: opacity 120ms ease;
      pointer-events: none;
      white-space: nowrap;
    }

    #pn-context-fab.pn-expanded .pn-fab-actions-stack,
    #pn-context-fab.pn-menu-expanded .pn-fab-actions-stack {
      opacity: 1;
      pointer-events: auto;
    }

    #pn-context-fab.pn-menu-expanded .pn-fab-actions-stack {
      flex-direction: column;
      align-items: stretch;
      width: 100%;
      padding-right: 0;
      gap: 8px;
    }

    .pn-fab-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--pn-color-border);
      color: var(--pn-color-text-secondary);
      font-size: 11px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 20px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 100ms ease, max-width var(--pn-dur-morph) ease, padding var(--pn-dur-morph) ease;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      font-family: inherit;
    }

    .pn-fab-btn:hover, .pn-fab-btn:focus-visible {
      background: rgba(255, 255, 255, 0.1);
      color: var(--pn-color-text-primary);
      border-color: rgba(255, 255, 255, 0.15);
      outline: 2px solid var(--pn-color-primary);
      outline-offset: 2px;
    }

    .pn-fab-btn--primary {
      background: var(--pn-color-primary);
      border-color: var(--pn-color-primary);
      color: var(--pn-color-dark);
    }

    .pn-fab-btn--primary:hover, .pn-fab-btn--primary:focus-visible {
      background: var(--pn-color-primary-hover);
      border-color: var(--pn-color-primary-hover);
      color: var(--pn-color-dark);
    }

    .pn-fab-menu-toggle {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 1px solid var(--pn-color-border);
      background: rgba(255, 255, 255, 0.05);
      color: var(--pn-color-text-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: all 100ms ease;
      padding: 0;
    }
    .pn-fab-menu-toggle:hover, .pn-fab-menu-toggle:focus-visible {
      background: rgba(255, 255, 255, 0.1);
      color: var(--pn-color-text-primary);
      outline: 2px solid var(--pn-color-primary);
      outline-offset: 2px;
    }

    .pn-fab-vertical-list {
      display: none;
      flex-direction: column;
      gap: 6px;
      width: 100%;
    }

    #pn-context-fab.pn-menu-expanded .pn-fab-vertical-list {
      display: flex;
    }

    .pn-fab-vertical-divider {
      height: 1px;
      background: rgba(255, 255, 255, 0.1);
      margin: 4px 0;
      width: 100%;
    }

    .pn-fab-divider {
      width: 1px;
      height: 20px;
      background: rgba(255, 255, 255, 0.1);
      flex-shrink: 0;
      margin: 0 4px;
    }

    .pn-fab-count {
      margin: 0 4px;
      font-size: 11px;
      font-weight: 500;
      color: var(--pn-color-text-secondary);
      white-space: nowrap;
    }

    /* Quiet Hours Styling */
    #pn-context-fab.pn-quiet-mode {
      opacity: 0.3 !important;
      transform: scale(0.9);
    }
    #pn-context-fab.pn-quiet-mode:hover {
      opacity: 0.95 !important;
      transform: scale(1);
    }

    /* Self-contained toast checkmark styling */
    #pn-context-fab.pn-expanded-success {
      background: var(--pn-color-primary);
      border-color: var(--pn-color-primary);
      max-width: 320px;
      border-radius: 99px;
    }
    .pn-fab-success-check {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--pn-color-text-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .pn-fab-success-text {
      font-size: 11px;
      font-weight: 600;
      color: var(--pn-color-dark);
      white-space: nowrap;
    }
    .pn-fab-success-undo {
      background: transparent;
      border: none;
      color: var(--pn-color-dark);
      font-size: 11px;
      font-weight: 800;
      text-decoration: underline;
      cursor: pointer;
      padding: 0;
      margin-left: auto;
      padding-right: 8px;
    }

    /* Processing spinner style */
    .pn-fab-loader {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pn-spinner {
      animation: rotate 2s linear infinite;
      width: 16px;
      height: 16px;
    }
    .pn-spinner .path {
      stroke: var(--pn-color-primary);
      stroke-linecap: round;
      animation: dash 1.5s ease-in-out infinite;
    }
    @keyframes rotate {
      100% {
        transform: rotate(360deg);
      }
    }
    @keyframes dash {
      0% {
        stroke-dasharray: 1, 150;
        stroke-dashoffset: 0;
      }
      50% {
        stroke-dasharray: 90, 150;
        stroke-dashoffset: -35;
      }
      100% {
        stroke-dasharray: 90, 150;
        stroke-dashoffset: -124;
      }
    }
    .pn-fab-status-text {
      font-size: 11px;
      color: var(--pn-color-text-secondary);
      margin-left: 6px;
    }

    /* Error state styling */
    #pn-context-fab.pn-state-error {
      border-color: #ef4444;
      max-width: 240px;
    }
    .pn-fab-error-icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pn-fab-error-text {
      font-size: 11px;
      color: #ef4444;
    }
    .pn-fab-error-retry {
      background: transparent;
      border: none;
      color: var(--pn-color-primary);
      font-size: 11px;
      font-weight: 800;
      text-decoration: underline;
      cursor: pointer;
      padding: 0;
      margin-left: auto;
      padding-right: 8px;
    }

    /* Small Viewport Override: Icon only, morphing wide on hover */
    #pn-context-fab.pn-small-viewport .pn-fab-btn {
      max-width: 28px;
      overflow: hidden;
      padding: 6px 8px;
    }

    #pn-context-fab.pn-small-viewport .pn-fab-btn:hover {
      max-width: 150px;
      padding: 6px 12px;
    }

    @media (forced-colors: active) {
      #pn-context-fab {
        border: 2px solid CanvasText;
        background: Canvas;
      }
      .pn-fab-btn {
        border: 1px solid ButtonBorder;
      }
    }
  `;

  const exportSelectionState: any = {
    platform: null,
    selectors: null,
    selectionModeActive: false,
    observer: null,
    observerRoot: null,
    scanTimer: null,
    urlWatchTimer: null,
    lastUrl: window.location.href,
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

  let syncFABState: () => Promise<void>;
  let updateSelectionFab: () => Promise<void>;
  let ensureSelectionFab: () => Promise<void>;
  let FABRenderer: any;
  let ContextEngine: any;
  let ActionResolver: any;
  let ActionRouter: any;

  let activeContext = 'idle';
  let currentSelectionText = '';
  let currentSelectionRole: 'user' | 'assistant' | 'mixed' = 'mixed';
  let typingTimeout: any = null;
  let deselectTimeout: any = null;
  let lastSavedPromptText = '';
  let lastSavedPromptTime = 0;

  // Refined FAB Quality parameters
  let ignoreCount = 0;
  let inQuietMode = false;
  let confidenceLevel = 0;
  let confidenceInterval: any = null;
  const localTelemetry: Array<any> = [];

  const logTelemetry = (event: string, meta: Record<string, any> = {}) => {
    const entry = {
      event,
      timestamp: new Date().toISOString(),
      platform: getCurrentAdapter()?.id || 'unknown',
      ...meta,
    };
    localTelemetry.push(entry);
    console.debug('[Promptium][Telemetry]', entry);
  };

  // State Machine Audit (Component 1)
  type FabState =
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

  let currentFABState: FabState = 'hidden';

  const ALLOWED_TRANSITIONS: Record<FabState, FabState[]> = {
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

  const transitionTo = (nextState: FabState): boolean => {
    if (currentFABState === nextState) return true;
    const allowed = ALLOWED_TRANSITIONS[currentFABState] || [];
    if (!allowed.includes(nextState)) {
      console.warn(
        `[Promptium][FSM] Illegal state transition from ${currentFABState} to ${nextState}`
      );
      return false;
    }
    const prevState = currentFABState;
    currentFABState = nextState;
    logTelemetry('FAB_STATE_TRANSITION', { from: prevState, to: nextState });
    return true;
  };

  // Long Session Stability listener trackers (Component 7)
  const activeListeners: Array<{ target: EventTarget; type: string; listener: EventListener }> = [];
  const activeObservers: Array<MutationObserver> = [];

  const addTrackedListener = (target: EventTarget, type: string, listener: EventListener) => {
    target.addEventListener(type, listener);
    activeListeners.push({ target, type, listener });
  };

  const clearTrackedListeners = () => {
    for (const item of activeListeners) {
      item.target.removeEventListener(item.type, item.listener);
    }
    activeListeners.length = 0;
  };

  const addTrackedObserver = (obs: MutationObserver) => {
    activeObservers.push(obs);
  };

  const clearTrackedObservers = () => {
    for (const obs of activeObservers) {
      obs.disconnect();
    }
    activeObservers.length = 0;
  };

  // Interaction Stability transition queue (Component 2 & Component 8)
  let activeAnimationPromise: Promise<void> = Promise.resolve();

  const queueAnimation = (renderFn: () => Promise<void>) => {
    activeAnimationPromise = activeAnimationPromise.then(() => {
      return new Promise<void>((resolve) => {
        requestAnimationFrame(async () => {
          try {
            await renderFn();
          } catch (err) {
            console.error('[Promptium][Queue] Animation execution error:', err);
          }
          resolve();
        });
      });
    });
  };

  interface FabContext {
    platform: string;
    state: 'selection-mode' | 'overlay' | 'selection' | 'typing' | 'conversation' | 'idle';
    composer: {
      focused: boolean;
      text: string;
      hasText: boolean;
      rect: DOMRect | null;
    };
    selection: {
      text: string;
      role: 'user' | 'assistant' | 'mixed';
      rect: DOMRect | null;
    };
    conversation: {
      hasMessages: boolean;
      count: number;
    };
    overlay: {
      active: boolean;
    };
    viewport: {
      isSmall: boolean;
      width: number;
      height: number;
    };
  }

  interface ActionOption {
    id: string;
    label: string;
    score: number;
    primary: boolean;
  }

  const derivePromptTitle = (text: string): string => {
    const compact = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!compact) return 'Untitled Prompt';
    const first = compact.split(/[.!?]/)[0]?.trim() || compact;
    return first.slice(0, 80) || 'Untitled Prompt';
  };

  ContextEngine = {
    async getContext(): Promise<FabContext> {
      const adapter = getCurrentAdapter();
      const platform = adapter?.id || 'unknown';

      const selectionModeActive = exportSelectionState.selectionModeActive;

      const overlayActive =
        document.getElementById('pn-clipping-note-overlay') !== null ||
        document.getElementById('pn-toast-already-saved') !== null ||
        document.querySelector('.pn-toast') !== null ||
        document.body.classList.contains('pn-modal-open') ||
        document.querySelector('.pn-modal:not(.pn-hidden)') !== null;

      const selText = adapter
        ? adapter.getSelection().trim()
        : window.getSelection()?.toString().trim() || '';
      let selectionRole: 'user' | 'assistant' | 'mixed' = 'mixed';
      let selectionRect: DOMRect | null = null;

      if (selText) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          try {
            selectionRect = selection.getRangeAt(0).getBoundingClientRect();
          } catch (_) {}

          if (selection.anchorNode && adapter) {
            let curr: HTMLElement | null =
              selection.anchorNode instanceof HTMLElement
                ? selection.anchorNode
                : selection.anchorNode.parentElement;
            while (curr) {
              if (adapter.isUserMessage(curr)) {
                selectionRole = 'user';
                break;
              }
              if (adapter.isAssistantMessage(curr)) {
                selectionRole = 'assistant';
                break;
              }
              curr = curr.parentElement;
            }
          }
        }
      }

      let composerFocused = false;
      let composerText = '';
      let composerRect: DOMRect | null = null;

      if (adapter) {
        composerFocused = adapter.isComposerFocused();
        composerText = adapter.getComposerText();
        const composerEl = adapter.getComposerElement();
        if (composerEl) {
          composerRect = composerEl.getBoundingClientRect();
        }
      }

      let hasMessages = false;
      let msgCount = 0;
      if (adapter) {
        const elements = await adapter.getMessageElements();
        msgCount = elements.length;
        hasMessages = msgCount > 0;
      }

      const width = window.innerWidth;
      const height = window.innerHeight;
      const isSmall = width < 800;

      let state: FabContext['state'] = 'idle';
      if (selectionModeActive) {
        state = 'selection-mode';
      } else if (overlayActive) {
        state = 'overlay';
      } else if (selText) {
        state = 'selection';
      } else if (composerFocused && composerText.trim().length > 10) {
        state = 'typing';
      } else if (hasMessages) {
        state = 'conversation';
      }

      return {
        platform,
        state,
        composer: {
          focused: composerFocused,
          text: composerText,
          hasText: composerText.trim().length > 0,
          rect: composerRect,
        },
        selection: {
          text: selText,
          role: selectionRole,
          rect: selectionRect,
        },
        conversation: {
          hasMessages,
          count: msgCount,
        },
        overlay: {
          active: overlayActive,
        },
        viewport: {
          isSmall,
          width,
          height,
        },
      };
    },
  };

  ActionResolver = {
    async resolve(context: FabContext): Promise<ActionOption[]> {
      const actions: ActionOption[] = [];

      if (context.state === 'overlay' || context.state === 'selection-mode') {
        return [];
      }

      // Memory preferences
      let memory: any = {};
      try {
        const snap = await chrome.storage.local.get(['pn_fab_memory']);
        memory = snap.pn_fab_memory || {};
      } catch (_) {}
      const platformMem = memory[context.platform] || {};

      const candidates = [
        {
          id: 'save_prompt',
          label: 'Save Prompt',
          isVisible: (ctx: FabContext) => {
            return (
              (ctx.state === 'typing' && ctx.composer.text.trim().length > 10) ||
              (ctx.state === 'selection' && ctx.selection.role === 'user')
            );
          },
          getPriority: (ctx: FabContext) => {
            let p = 90;
            const text = ctx.state === 'selection' ? ctx.selection.text : context.composer.text;
            const wordCount = text.split(/\s+/).filter(Boolean).length;
            if (wordCount > 50) {
              p += 10;
            }
            return p;
          },
        },
        {
          id: 'open_library',
          label: 'Open Library',
          isVisible: (ctx: FabContext) => ctx.state === 'idle',
          getPriority: () => 50,
        },
      ];

      for (const cand of candidates) {
        if (cand.isVisible(context)) {
          let score = cand.getPriority(context);

          if (cand.id === 'save_prompt') {
            const text =
              context.state === 'selection' ? context.selection.text : context.composer.text;
            const isDuplicate = await findExistingPrompt(text);
            if (isDuplicate) {
              score -= 30;
            }
          }

          const chosenCount = platformMem[cand.id] || 0;
          if (chosenCount > 0) {
            score += Math.min(20, chosenCount * 2);
          }

          actions.push({
            id: cand.id,
            label: cand.label,
            score,
            primary: false,
          });
        }
      }

      actions.sort((a, b) => b.score - a.score);
      if (actions[0]) {
        actions[0].primary = true;
      }

      return actions;
    },
  };

  ActionRouter = {
    async dispatch(actionId: string, context: FabContext) {
      logTelemetry('FAB_ACTION_CLICKED', { actionId });

      // Record count in storage memory
      try {
        const snap = await chrome.storage.local.get(['pn_fab_memory']);
        const memory: Record<string, any> = snap.pn_fab_memory || {};
        if (!memory[context.platform]) {
          memory[context.platform] = {};
        }
        memory[context.platform][actionId] = (memory[context.platform][actionId] || 0) + 1;
        await chrome.storage.local.set({ pn_fab_memory: memory });
      } catch (_) {}

      switch (actionId) {
        case 'save_prompt':
          await handleSavePromptAction();
          break;
        case 'open_library':
          chrome.runtime.sendMessage({ action: 'OPEN_PROMPTIUM_WINDOW', source: 'fab' });
          break;
        default:
          console.warn('[Promptium][ActionRouter] Unknown action:', actionId);
      }
    },
  };

  const showUndoToast = (messageText: string, undoCallback: () => void) => {
    FABRenderer.showSuccessToast(messageText, undoCallback);
  };

  const showAlreadySavedToast = (existingPrompt: any, currentText: string) => {
    document.getElementById('pn-toast-already-saved')?.remove();

    const toastEl = document.createElement('div');
    toastEl.id = 'pn-toast-already-saved';
    toastEl.className = 'pn-toast pn-toast--undo';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');

    const message = document.createElement('span');
    message.textContent = 'Already saved.';

    const updateBtn = document.createElement('button');
    updateBtn.className = 'pn-toast-undo-btn';
    updateBtn.type = 'button';
    updateBtn.textContent = 'Update';
    updateBtn.style.color = '#14b8a6';
    updateBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const snap = await chrome.storage.local.get(['prompts']);
      const list = Array.isArray(snap.prompts) ? snap.prompts : [];
      const idx = list.findIndex((p: any) => p.id === existingPrompt.id);
      if (idx >= 0) {
        list[idx].text = currentText;
        list[idx].updatedAt = new Date().toISOString();
        await chrome.storage.local.set({ prompts: list });
        toastEl.remove();
        toast.success('Prompt updated.');
      }
    });

    const openBtn = document.createElement('button');
    openBtn.className = 'pn-toast-undo-btn';
    openBtn.type = 'button';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({ action: 'OPEN_PROMPTIUM_WINDOW', source: 'fab' });
      toastEl.remove();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'pn-toast-undo-btn';
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.color = '#71717a';
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toastEl.remove();
    });

    toastEl.appendChild(message);
    toastEl.appendChild(document.createTextNode(' '));
    toastEl.appendChild(updateBtn);
    toastEl.appendChild(document.createTextNode(' '));
    toastEl.appendChild(openBtn);
    toastEl.appendChild(document.createTextNode(' '));
    toastEl.appendChild(cancelBtn);

    document.body.appendChild(toastEl);
    setTimeout(() => {
      toastEl.remove();
    }, 6000);
  };

  const findExistingPrompt = async (text: string) => {
    const snap = await chrome.storage.local.get(['prompts']);
    const list = Array.isArray(snap.prompts) ? snap.prompts : [];
    return list.find((p: any) => p.text.trim() === text.trim());
  };

  const handleSavePromptAction = async () => {
    const adapter = getCurrentAdapter();
    if (!adapter) return;

    const text = activeContext === 'selection' ? currentSelectionText : adapter.getComposerText();
    if (!text.trim()) return;

    const existing = await findExistingPrompt(text);
    if (existing) {
      showAlreadySavedToast(existing, text);
      return;
    }

    const description = `Saved from ${adapter.hosts[0]}`;

    chrome.runtime.sendMessage(
      {
        action: 'OPEN_PROMPTIUM_WINDOW',
        source: 'fab',
        text: text,
        description: description,
      },
      (response: any) => {
        if (!response || !response.ok) {
          toast.error('Failed to open Prompt Builder.');
        }
      }
    );
  };

  const deriveFsmState = (context: FabContext, actions: ActionOption[]): FabState => {
    if (inQuietMode) {
      return 'sleeping';
    }
    if (context.state === 'overlay') {
      return 'hidden';
    }
    if (actions.length === 0 && context.state === 'idle') {
      return 'hidden';
    }
    switch (context.state) {
      case 'typing':
        return 'typing';
      case 'selection':
        return context.selection.role === 'user' ? 'selection_user' : 'selection_assistant';
      case 'conversation':
        return 'conversation';
      case 'selection-mode':
        return 'expanded';
      case 'idle':
      default:
        return 'idle';
    }
  };

  syncFABState = async () => {
    const context = await ContextEngine.getContext();

    // Reset quiet hours on explicit selection mode or new routes
    if (context.state === 'selection-mode' && inQuietMode) {
      ignoreCount = 0;
      inQuietMode = false;
      logTelemetry('FAB_QUIET_MODE_RESET', { reason: 'selection_mode_active' });
    }

    const actions = await ActionResolver.resolve(context);
    const targetState = deriveFsmState(context, actions);

    // Typing Confidence window
    if (context.state === 'typing') {
      if (currentFABState !== 'typing' && !inQuietMode) {
        if (!confidenceInterval) {
          confidenceLevel = 0;
          confidenceInterval = setInterval(async () => {
            confidenceLevel += 25;
            if (confidenceLevel >= 100) {
              clearInterval(confidenceInterval);
              confidenceInterval = null;

              if (transitionTo('typing')) {
                const freshActions = await ActionResolver.resolve(context);
                queueAnimation(() => FABRenderer.render(context, freshActions));
              }
            }
          }, 120); // 120ms * 4 = 480ms window
        }
        return;
      }
    } else {
      if (confidenceInterval) {
        clearInterval(confidenceInterval);
        confidenceInterval = null;
        confidenceLevel = 0;
      }
    }

    // Selection deselect transition delay (300ms)
    const isSelectionState =
      currentFABState === 'selection_user' || currentFABState === 'selection_assistant';
    if (isSelectionState && context.state !== 'selection') {
      if (!deselectTimeout) {
        deselectTimeout = setTimeout(async () => {
          ignoreCount++;
          logTelemetry('FAB_IGNORED', { count: ignoreCount });
          if (ignoreCount >= 3 && !inQuietMode) {
            inQuietMode = true;
            logTelemetry('FAB_QUIET_MODE_ENTERED');
          }

          const freshActions = await ActionResolver.resolve(context);
          const nextTarget = deriveFsmState(context, freshActions);
          if (transitionTo(nextTarget)) {
            queueAnimation(() => FABRenderer.render(context, freshActions));
          }
          deselectTimeout = null;
        }, 300);
      }
      return;
    } else {
      if (deselectTimeout) {
        clearTimeout(deselectTimeout);
        deselectTimeout = null;
      }
    }

    // General state transition checks
    if (currentFABState !== targetState) {
      if (currentFABState === 'typing' && context.state !== 'typing') {
        ignoreCount++;
        logTelemetry('FAB_IGNORED', { count: ignoreCount });
        if (ignoreCount >= 3 && !inQuietMode) {
          inQuietMode = true;
          logTelemetry('FAB_QUIET_MODE_ENTERED');
        }
      }

      const freshTarget = inQuietMode ? 'sleeping' : targetState;
      if (transitionTo(freshTarget)) {
        queueAnimation(() => FABRenderer.render(context, actions));
      }
    } else {
      queueAnimation(() => FABRenderer.render(context, actions));
    }
  };

  const teardownContextFAB = () => {
    clearTrackedListeners();
    clearTrackedObservers();
    if (confidenceInterval) {
      clearInterval(confidenceInterval);
      confidenceInterval = null;
    }
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      typingTimeout = null;
    }
    if (deselectTimeout) {
      clearTimeout(deselectTimeout);
      deselectTimeout = null;
    }
    logTelemetry('FAB_TEARDOWN_COMPLETED');
  };

  const initContextFAB = () => {
    teardownContextFAB();

    addTrackedListener(document, 'selectionchange', () => {
      void syncFABState();
    });

    addTrackedListener(document, 'focusin', (e) => {
      const adapter = getCurrentAdapter();
      const composer = adapter?.getComposerElement();
      if (composer && (e.target === composer || composer.contains(e.target as Node))) {
        void syncFABState();
      }
    });

    addTrackedListener(document, 'focusout', (e) => {
      const adapter = getCurrentAdapter();
      const composer = adapter?.getComposerElement();
      if (composer && (e.target === composer || composer.contains(e.target as Node))) {
        void syncFABState();
      }
    });

    addTrackedListener(document, 'input', (e) => {
      const adapter = getCurrentAdapter();
      const composer = adapter?.getComposerElement();
      if (composer && (e.target === composer || composer.contains(e.target as Node))) {
        void syncFABState();
      }
    });

    const bodyObserver = new MutationObserver(() => {
      void syncFABState();
    });
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    addTrackedObserver(bodyObserver);

    void syncFABState();
  };
  const injectionUndoState: any = {
    previousText: '',
    injectedText: '',
    platform: null,
    createdAt: 0,
    consumed: true,
    timer: null,
    toast: null,
    toastTimer: null,
  };

  /** Creates a chat payload object from scraped messages and page metadata. */
  const createChatPayload = async (platform: any, messages: any) => ({
    title: document.title || 'Untitled chat',
    platform,
    tags: [],
    messages,
    url: window.location.href,
  });

  /** Shows a user notification via toast utility. */
  const notify = async (message: any) => {
    const text = String(message || '').trim();

    if (!text) {
      return;
    }

    toast.info(text);
  };

  const normalizeComposerText = (value: any) => String(value || '').replace(/\r\n/g, '\n');

  const clearInjectionUndoState = () => {
    if (injectionUndoState.timer) {
      clearTimeout(injectionUndoState.timer);
      injectionUndoState.timer = null;
    }
    injectionUndoState.toast?.remove();
    injectionUndoState.toast = null;
    if (injectionUndoState.toastTimer) {
      clearTimeout(injectionUndoState.toastTimer);
      injectionUndoState.toastTimer = null;
    }
    injectionUndoState.previousText = '';
    injectionUndoState.injectedText = '';
    injectionUndoState.platform = null;
    injectionUndoState.createdAt = 0;
    injectionUndoState.consumed = true;
  };

  const getComposerNode = async (platform: any) => {
    const adapter = getCurrentAdapter();
    return adapter ? adapter.getComposerElement() : null;
  };

  const readComposerText = async (platform: any) => {
    const composer = await getComposerNode(platform);
    if (!composer) return null;

    if (composer instanceof HTMLInputElement || composer instanceof HTMLTextAreaElement) {
      return String(composer.value || '');
    }
    return String(composer.textContent || '');
  };

  const undoInjectedPrompt = async () => {
    if (injectionUndoState.consumed || !injectionUndoState.platform) {
      return;
    }
    injectionUndoState.consumed = true;

    const currentText = await readComposerText(injectionUndoState.platform);
    if (currentText == null) {
      clearInjectionUndoState();
      await notify('Undo unavailable: input not found.');
      return;
    }

    const currentNormalized = normalizeComposerText(currentText);
    const injectedNormalized = normalizeComposerText(injectionUndoState.injectedText);
    if (currentNormalized !== injectedNormalized) {
      clearInjectionUndoState();
      await notify('Undo unavailable: input changed.');
      return;
    }

    const reverted = await window.Injector.inject(
      injectionUndoState.previousText,
      injectionUndoState.platform
    );
    clearInjectionUndoState();
    await notify(reverted ? 'Injection undone.' : 'Undo failed.');
  };

  const showInjectionUndoToast = () => {
    document.querySelectorAll('.pn-toast').forEach((node) => node.remove());
    const toast = document.createElement('div');
    toast.className = 'pn-toast pn-toast--undo';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const message = document.createElement('span');
    message.textContent = 'Prompt injected.';

    const undoButton = document.createElement('button');
    undoButton.className = 'pn-toast-undo-btn';
    undoButton.type = 'button';
    undoButton.textContent = 'Undo';
    undoButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void undoInjectedPrompt();
    });

    toast.appendChild(message);
    toast.appendChild(document.createTextNode(' '));
    toast.appendChild(undoButton);
    document.body.appendChild(toast);
    return toast;
  };

  const stageInjectionUndo = (platform: any, previousText: any, injectedText: any) => {
    clearInjectionUndoState();
    injectionUndoState.previousText = String(previousText || '');
    injectionUndoState.injectedText = String(injectedText || '');
    injectionUndoState.platform = String(platform || '');
    injectionUndoState.createdAt = Date.now();
    injectionUndoState.consumed = false;
    // Let injected-field highlight animation land before rendering the Undo affordance.
    injectionUndoState.toastTimer = setTimeout(() => {
      if (injectionUndoState.consumed) return;
      injectionUndoState.toast = showInjectionUndoToast();
      injectionUndoState.toastTimer = null;
    }, INJECTION_CONFIRMATION_DELAY_MS);
    injectionUndoState.timer = setTimeout(() => {
      clearInjectionUndoState();
    }, INJECTION_UNDO_TTL_MS);
  };

  /** Safely queries one element and returns null if the selector throws. */
  const safeQuery = async (selector: any, root: any = document) => {
    if (!selector || typeof selector !== 'string') {
      return null;
    }

    try {
      return root.querySelector(selector);
    } catch (_error) {
      return null;
    }
  };

  /** Safely queries all elements and returns an empty list if selector parsing fails. */
  const safeQueryAllInScope = async (selector: any, root: any = document) => {
    if (!selector || typeof selector !== 'string') {
      return [];
    }

    try {
      return Array.from(root.querySelectorAll(selector));
    } catch (_error) {
      return [];
    }
  };

  /** Sorts nodes in stable document order to preserve chat turn sequence across platforms. */
  const sortContentNodesByDomOrder = async (nodes: any[]) => {
    const sorted = [...nodes];

    sorted.sort((left, right) => {
      if (left === right) {
        return 0;
      }

      const relation = left.compareDocumentPosition(right);

      if (relation & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }

      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      }

      return 0;
    });

    return sorted;
  };

  /** Returns a stable local id for one chat message node across observer rescans. */
  const ensureMessageNodeId = async (node: any) => {
    if (node.dataset.pnMessageId) {
      return node.dataset.pnMessageId;
    }

    exportSelectionState.sequence += 1;
    const nextId = `pn-msg-${Date.now()}-${exportSelectionState.sequence}`;
    node.dataset.pnMessageId = nextId;
    return nextId;
  };

  /** Removes Promptium-injected controls from cloned content and returns clean message HTML. */
  const getSanitizedMessageHtml = async (node: any) => {
    if (!node) {
      return '';
    }

    const clone = node.cloneNode(true);
    clone.querySelectorAll('.pn-inline-select, .pn-inline-select-host').forEach((injected: any) => {
      injected.remove();
    });

    // Strip executable/dangerous elements before carrying HTML into extension pages.
    clone
      .querySelectorAll('script, style, iframe, object, embed, link, meta')
      .forEach((unsafeNode: any) => {
        unsafeNode.remove();
      });

    clone.querySelectorAll('*').forEach((element: any) => {
      Array.from(element.attributes).forEach((attribute: any) => {
        const name = String(attribute.name || '').toLowerCase();
        const value = String(attribute.value || '').trim();

        if (name.startsWith('on')) {
          element.removeAttribute(attribute.name);
          return;
        }

        if (name === 'style') {
          element.removeAttribute(attribute.name);
          return;
        }

        if (['href', 'src', 'xlink:href', 'formaction'].includes(name)) {
          const normalized = value.toLowerCase();
          if (!normalized) {
            element.removeAttribute(attribute.name);
            return;
          }

          const isRelative =
            normalized.startsWith('#') ||
            normalized.startsWith('/') ||
            normalized.startsWith('./') ||
            normalized.startsWith('../');

          if (isRelative) {
            return;
          }

          const allowedSchemes = ['http:', 'https:', 'mailto:', 'tel:'];
          let url = null;
          try {
            url = new URL(value, window.location.href);
          } catch (_) {
            element.removeAttribute(attribute.name);
            return;
          }

          if (!url || !allowedSchemes.includes(url.protocol)) {
            element.removeAttribute(attribute.name);
          }
        }
      });
    });

    return String(clone.innerHTML || '').trim();
  };

  /** Returns one normalized message payload from a platform chat message DOM node. */
  const readMessageNode = async (node: any, role: string, order: any) => {
    if (!node || typeof node.matches !== 'function') {
      return null;
    }

    const text = String(node.innerText || node.textContent || '').trim();

    if (!text) {
      return null;
    }

    const id = await ensureMessageNodeId(node);

    return {
      id,
      role,
      text,
      html: await getSanitizedMessageHtml(node),
      order,
    };
  };

  const ensureSelectionShadowRoot = () => {
    let host = document.getElementById(SELECTION_SHADOW_HOST_ID);
    if (!(host instanceof HTMLElement)) {
      host = document.createElement('div');
      host.id = SELECTION_SHADOW_HOST_ID;
      host.style.position = 'fixed';
      host.style.inset = '0';
      host.style.pointerEvents = 'none';
      host.style.zIndex = '2147483641';
      document.documentElement.appendChild(host);
    }

    if (!host.shadowRoot) {
      host.attachShadow({ mode: 'open' });
    }

    return host.shadowRoot;
  };

  const getSelectionFabNode = () =>
    ensureSelectionShadowRoot()?.getElementById('pn-selection-fab') || null;

  const getSelectionCountNode = () =>
    ensureSelectionShadowRoot()?.getElementById('pn-selection-fab-count') || null;

  const getSelectionControls = () =>
    Array.from(document.querySelectorAll('.pn-inline-select-host'))
      .map((host) => {
        if (!(host instanceof HTMLElement)) return null;
        const input = host.shadowRoot?.querySelector('.pn-inline-check') || null;
        const control = host.shadowRoot?.querySelector('.pn-inline-select') || null;
        const messageId = String(host.dataset.messageId || '').trim();
        return { host, input, control, messageId };
      })
      .filter(Boolean);

  const syncSelectionClassesAndControls = () => {
    getSelectionControls().forEach((entry: any) => {
      if (!entry?.messageId) return;
      const isChecked = exportSelectionState.selectedIds.has(entry.messageId);
      if (entry.input instanceof HTMLInputElement) {
        entry.input.checked = isChecked;
      }
      entry.control?.classList.toggle('pn-checked', isChecked);
      entry.host?.setAttribute('data-checked', isChecked ? 'true' : 'false');
      entry.host?.setAttribute('data-visible', isChecked ? 'true' : 'false');

      const messageNode = entry.host?.parentElement;
      if (messageNode) {
        messageNode.classList.toggle('pn-message-selected', isChecked);
        const style = exportSelectionState.chatHighlightStyle;
        messageNode.classList.toggle('pn-chat-highlight-solid', isChecked && style === 'solid');
        messageNode.classList.toggle('pn-chat-highlight-dotted', isChecked && style === 'dotted');
      }
    });
  };

  const setControlChecked = (entry: any, checked: any) => {
    if (!entry) return;
    const bool = Boolean(checked);
    if (entry.input instanceof HTMLInputElement) {
      entry.input.checked = bool;
    }
    entry.control?.classList.toggle('pn-checked', bool);
    entry.host?.setAttribute('data-checked', bool ? 'true' : 'false');
    entry.host?.setAttribute('data-visible', bool ? 'true' : 'false');

    const messageNode = entry.host?.parentElement;
    if (messageNode) {
      messageNode.classList.toggle('pn-message-selected', bool);
      const style = exportSelectionState.chatHighlightStyle;
      messageNode.classList.toggle('pn-chat-highlight-solid', bool && style === 'solid');
      messageNode.classList.toggle('pn-chat-highlight-dotted', bool && style === 'dotted');
    }
  };

  const setAllSelectionControls = (checked: any) => {
    getSelectionControls().forEach((entry) => setControlChecked(entry, checked));
  };

  /** Ensures each message gets a single injected checkbox control and syncs checked state. */
  const ensureMessageCheckbox = async (node: any, messageId: any) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }

    const existingHost = node.querySelector(':scope > .pn-inline-select-host');
    if (existingHost instanceof HTMLElement) {
      existingHost.dataset.messageId = messageId;
      const existingInput = existingHost.shadowRoot?.querySelector('.pn-inline-check') || null;
      const existingControl = existingHost.shadowRoot?.querySelector('.pn-inline-select') || null;

      // Update Split button in existing shadow root
      const splitBtn = existingHost.shadowRoot?.querySelector('.pn-inline-split-toggle');
      if (splitBtn) {
        const group = exportSelectionState.groups?.find((g: any) =>
          g.messageIds.includes(messageId)
        );
        if (group && group.messageIds.length > 1) {
          splitBtn.textContent = group.split ? '🔗' : '✂️';
          splitBtn.setAttribute(
            'title',
            group.split
              ? 'Group messages in this turn'
              : 'Select messages in this turn independently'
          );
        } else {
          splitBtn.remove();
        }
      }

      setControlChecked(
        {
          host: existingHost,
          input: existingInput,
          control: existingControl,
          messageId,
        },
        exportSelectionState.selectedIds.has(messageId)
      );
      return;
    }

    if (window.getComputedStyle(node).position === 'static') {
      node.classList.add('pn-selectable-message--relative');
    }

    const host = document.createElement('span');
    host.className = 'pn-inline-select-host';
    host.dataset.messageId = messageId;
    host.dataset.visible = 'false';
    host.dataset.checked = 'false';

    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>${INLINE_SELECT_SHADOW_CSS}</style>
      <div class="pn-inline-wrapper">
        <label class="pn-inline-select">
          <input type="checkbox" class="pn-inline-check" aria-label="Select message for Promptium export" />
          <span class="pn-inline-mark"></span>
        </label>
        <button type="button" class="pn-inline-split-toggle" title="Split conversation turn">✂️</button>
      </div>
    `;

    const checkbox = shadowRoot.querySelector('.pn-inline-check');
    const control = shadowRoot.querySelector('.pn-inline-select');
    const splitBtn = shadowRoot.querySelector('.pn-inline-split-toggle') as HTMLButtonElement;

    // Toggle split button visibility depending on unit size
    const group = exportSelectionState.groups?.find((g: any) => g.messageIds.includes(messageId));
    if (group && group.messageIds.length > 1) {
      if (splitBtn) {
        splitBtn.textContent = group.split ? '🔗' : '✂️';
        splitBtn.setAttribute(
          'title',
          group.split ? 'Group messages in this turn' : 'Select messages in this turn independently'
        );
        splitBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          group.split = !group.split;
          if (group.split) {
            exportSelectionState.splitGroupIds.add(group.messageIds[0]);
          } else {
            exportSelectionState.splitGroupIds.delete(group.messageIds[0]);
            // Sync selection inside group to match the clicked element
            const clickedChecked = exportSelectionState.selectedIds.has(messageId);
            for (const id of group.messageIds) {
              if (clickedChecked) {
                exportSelectionState.selectedIds.add(id);
              } else {
                exportSelectionState.selectedIds.delete(id);
              }
            }
          }
          void scanSelectionTargets();
        });
      }
    } else if (splitBtn) {
      splitBtn.remove();
    }

    if (checkbox instanceof HTMLInputElement) {
      setControlChecked(
        { host, input: checkbox, control, messageId },
        exportSelectionState.selectedIds.has(messageId)
      );

      // Handle checkbox value change
      const toggleMessage = (id: string, checked: boolean) => {
        if (checked) {
          exportSelectionState.selectedIds.add(id);
        } else {
          exportSelectionState.selectedIds.delete(id);
        }
      };

      const handleValueChange = (checked: boolean, isShift: boolean) => {
        if (isShift && exportSelectionState.lastClickedId) {
          // Range selection
          const lastIdx = exportSelectionState.messageOrder.indexOf(
            exportSelectionState.lastClickedId
          );
          const currIdx = exportSelectionState.messageOrder.indexOf(messageId);
          if (lastIdx !== -1 && currIdx !== -1) {
            const start = Math.min(lastIdx, currIdx);
            const end = Math.max(lastIdx, currIdx);
            for (let i = start; i <= end; i++) {
              toggleMessage(exportSelectionState.messageOrder[i], checked);
            }
          }
        } else {
          // Standard check or grouped check
          const activeGroup = exportSelectionState.groups?.find((g: any) =>
            g.messageIds.includes(messageId)
          );
          if (activeGroup && !activeGroup.split) {
            for (const id of activeGroup.messageIds) {
              toggleMessage(id, checked);
            }
          } else {
            toggleMessage(messageId, checked);
          }
        }
        exportSelectionState.lastClickedId = messageId;
        syncSelectionClassesAndControls();
        void updateSelectionFab();
      };

      checkbox.addEventListener('change', (event) => {
        const target = event.currentTarget;
        if (target instanceof HTMLInputElement) {
          handleValueChange(target.checked, false);
        }
      });

      // Shift-click listener
      checkbox.addEventListener('click', (event: MouseEvent) => {
        if (event.shiftKey) {
          handleValueChange(checkbox.checked, true);
        }
      });

      // Click and Drag Selection MouseListeners
      if (control) {
        control.addEventListener('mousedown', ((e: MouseEvent) => {
          e.stopPropagation();
          exportSelectionState.isDragging = true;
          exportSelectionState.dragChecked = !checkbox.checked;
          handleValueChange(exportSelectionState.dragChecked, e.shiftKey);
        }) as EventListener);

        control.addEventListener('mouseenter', () => {
          if (exportSelectionState.isDragging) {
            handleValueChange(exportSelectionState.dragChecked, false);
          }
        });
      }
    }

    control?.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    node.addEventListener('mouseenter', () => {
      if (host.dataset.checked !== 'true') {
        host.dataset.visible = 'true';
      }
    });

    node.addEventListener('mouseleave', () => {
      if (host.dataset.checked !== 'true') {
        host.dataset.visible = 'false';
      }
    });

    node.appendChild(host);
  };

  // Add global mouseup listener to end click-and-drag selection
  if (typeof window !== 'undefined') {
    window.addEventListener('mouseup', () => {
      exportSelectionState.isDragging = false;
    });
  }

  /** Builds selected messages in original order for side panel export payloads. */
  const buildSelectedMessages = () =>
    exportSelectionState.messageOrder
      .filter((id: any) => exportSelectionState.selectedIds.has(id))
      .map((id: any) => exportSelectionState.messagesById.get(id))
      .filter(Boolean)
      .map((message: any) => ({
        role: message.role,
        text: message.text,
        html: message.html,
        index: message.order,
      }));

  /** Stores selected data in session storage and asks service worker to open side panel. */
  const openSidePanelWithSelection = () => {
    const selected = buildSelectedMessages();

    if (!selected.length) {
      notify('Select at least one message to export.').catch(console.error);
      return { ok: false, error: 'No selected messages.' };
    }

    const payload = {
      title: document.title || 'Untitled chat',
      platform: String(exportSelectionState.platform || 'unknown'),
      url: window.location.href,
      createdAt: new Date().toISOString(),
      messages: selected,
    };

    try {
      chrome.runtime.sendMessage(
        {
          action: 'SET_SIDEPANEL_PAYLOAD',
          payload,
        },
        (response) => {
          // Background script stores the payload
          if (!response?.ok) {
            console.warn('[Promptium] Side panel payload issue:', response?.error);
          }
        }
      );

      return { ok: true };
    } catch (error) {
      notify((error as any)?.message || 'Failed to prepare Promptium export.').catch(console.error);
      return {
        ok: false,
        error: (error as any)?.message || 'Failed to open side panel.',
      };
    }
  };

  /** Opens the side panel without mutating current message selection payload. */
  const openSidePanelOnly = () => {
    // Opening the panel is handled directly by primitive synchronous listeners now.
    return { ok: true };
  };

  /** Activates the selection mode with all messages pre-selected for UI review. */
  const activateSelectionModeAll = async () => {
    await ensureSelectionModeActive();

    if (!exportSelectionState.messageOrder.length) {
      notify('No messages found in this chat.').catch(console.error);
      return false;
    }

    exportSelectionState.selectedIds = new Set(exportSelectionState.messageOrder);

    setAllSelectionControls(true);

    updateSelectionFab().catch(console.error);
    return true;
  };

  /** Selects all visible messages by scraping the page and stages side panel export payload. */
  const openSidePanelWithAllMessages = async () => {
    const platform = String(exportSelectionState.platform || 'unknown');
    const messages = await window.Scraper.scrape(platform);

    if (!messages.length) {
      notify('No messages found in this chat.').catch(console.error);
      return { ok: false, error: 'No messages available.' };
    }

    const payload = {
      title: document.title || 'Untitled chat',
      platform,
      url: window.location.href,
      createdAt: new Date().toISOString(),
      messages: messages.map((message: any, index: any) => ({
        role: message.role,
        text: message.text,
        html: String(message.html || ''),
        index,
      })),
    };

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'SET_SIDEPANEL_PAYLOAD',
        payload,
      });

      if (!response?.ok) {
        return {
          ok: false,
          error: response?.error || 'Failed to stage full export payload.',
        };
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: (error as any)?.message || 'Failed to prepare full export payload.',
      };
    }
  };

  const handleSelectionKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      void deactivateSelectionMode();
    }
  };

  /** Enables selection mode only when explicitly requested by the user. */
  const ensureSelectionModeActive = async () => {
    if (exportSelectionState.selectionModeActive) {
      return;
    }

    exportSelectionState.selectionModeActive = true;
    document.body.classList.add('pn-export-selection-active');

    let styleEl = document.getElementById('pn-export-selection-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'pn-export-selection-style';
      styleEl.textContent = `
        body.pn-export-selection-active [data-message-author-role],
        body.pn-export-selection-active .human-turn,
        body.pn-export-selection-active .assistant-turn,
        body.pn-export-selection-active [data-testid="user-message"],
        body.pn-export-selection-active [data-content="user-message"],
        body.pn-export-selection-active .user-query-bubble-with-background,
        body.pn-export-selection-active [data-turn-role] {
          opacity: 0.45;
          transition: opacity 0.25s ease, background-color 0.25s ease, border-color 0.25s ease !important;
        }
        body.pn-export-selection-active [data-message-author-role].pn-message-selected,
        body.pn-export-selection-active .human-turn.pn-message-selected,
        body.pn-export-selection-active .assistant-turn.pn-message-selected,
        body.pn-export-selection-active [data-testid="user-message"].pn-message-selected,
        body.pn-export-selection-active [data-content="user-message"].pn-message-selected,
        body.pn-export-selection-active .user-query-bubble-with-background.pn-message-selected,
        body.pn-export-selection-active [data-turn-role].pn-message-selected {
          opacity: 1 !important;
          background-color: rgba(20, 184, 166, 0.08) !important;
          box-shadow: inset 4px 0 0 #14b8a6 !important;
        }
        body.pn-export-selection-active [data-message-author-role]:hover,
        body.pn-export-selection-active .human-turn:hover,
        body.pn-export-selection-active .assistant-turn:hover,
        body.pn-export-selection-active [data-testid="user-message"]:hover,
        body.pn-export-selection-active [data-content="user-message"]:hover,
        body.pn-export-selection-active .user-query-bubble-with-background:hover,
        body.pn-export-selection-active [data-turn-role]:hover {
          opacity: 0.8 !important;
        }
      `;
      document.head.appendChild(styleEl);
    }

    window.addEventListener('keydown', handleSelectionKeyDown);

    await ensureSelectionFab();
    await attachSelectionObserver();
    await scanSelectionTargets();
  };

  const getContextFabNode = () =>
    ensureSelectionShadowRoot()?.getElementById('pn-context-fab') || null;

  ensureSelectionFab = async () => {
    const shadowRoot = ensureSelectionShadowRoot();
    if (!shadowRoot) return;
    if (shadowRoot.getElementById('pn-context-fab')) {
      return;
    }

    const style = document.createElement('style');
    style.textContent = CONTEXT_FAB_SHADOW_CSS;
    shadowRoot.appendChild(style);

    const root = document.createElement('div');
    root.id = 'pn-context-fab';
    root.className = 'pn-context-fab pn-hidden';

    const trigger = document.createElement('button');
    trigger.id = 'pn-fab-trigger-btn';
    trigger.className = 'pn-fab-trigger';
    trigger.type = 'button';
    trigger.setAttribute('aria-label', 'Promptium Action Surface');
    trigger.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 8l4 4-4 4M8 12h8"/></svg>`;
    root.appendChild(trigger);

    const stack = document.createElement('div');
    stack.className = 'pn-fab-actions-stack';
    root.appendChild(stack);

    root.addEventListener('mouseenter', () => {
      root.classList.add('pn-expanded');
    });
    root.addEventListener('mouseleave', () => {
      root.classList.remove('pn-expanded');
    });

    shadowRoot.appendChild(root);
  };

  const executeActionWithLifecycle = async (actionId: string, context: FabContext) => {
    if (currentFABState === 'processing') return;

    if (!transitionTo('processing')) {
      return;
    }

    FABRenderer.renderProcessing(actionId);

    try {
      await ActionRouter.dispatch(actionId, context);

      if (transitionTo('success')) {
        const msg =
          actionId === 'save_prompt' || actionId === 'save_clipping' || actionId === 'save_to_vault'
            ? 'Saved successfully'
            : 'Completed';
        FABRenderer.showSuccessToast(msg);
      }
    } catch (err) {
      console.error('[Promptium][Lifecycle] Action failed:', err);
      if (transitionTo('error')) {
        FABRenderer.showErrorState('Failed to process.', async () => {
          await executeActionWithLifecycle(actionId, context);
        });
      }
    }
  };

  updateSelectionFab = async () => {
    await syncFABState();
  };

  FABRenderer = {
    async render(context: FabContext, actions: ActionOption[]) {
      await ensureSelectionFab();
      const root = getContextFabNode();
      if (!root) return;

      if (
        root.classList.contains('pn-state-success') ||
        root.classList.contains('pn-state-processing') ||
        root.classList.contains('pn-state-error')
      ) {
        return;
      }

      if (context.state === 'overlay') {
        root.classList.add('pn-hidden');
        return;
      }

      root.classList.remove('pn-hidden');
      root.className = `pn-context-fab pn-state-${context.state}`;
      root.setAttribute('aria-expanded', 'false');

      if (inQuietMode) {
        root.classList.add('pn-quiet-mode');
      } else {
        root.classList.remove('pn-quiet-mode');
      }

      const stack = root.querySelector('.pn-fab-actions-stack');
      if (!stack) return;
      stack.innerHTML = '';

      if (context.viewport.isSmall) {
        root.classList.add('pn-small-viewport');
      } else {
        root.classList.remove('pn-small-viewport');
      }

      this.checkPositionCollisions(root, context);

      if (context.state === 'selection-mode') {
        root.setAttribute('aria-expanded', 'true');
        const selectedCount = exportSelectionState.selectedIds.size;
        let words = 0;
        exportSelectionState.selectedIds.forEach((id: string) => {
          const msg = exportSelectionState.messagesById.get(id);
          if (msg) {
            const text = msg.text || '';
            words += text.split(/\s+/).filter(Boolean).length;
          }
        });

        const countSpan = document.createElement('span');
        countSpan.className = 'pn-fab-count';
        countSpan.innerHTML = `<b>${selectedCount}</b> selected &nbsp;&bull;&nbsp; <b>${words}</b> words`;
        stack.appendChild(countSpan);

        const divider = document.createElement('span');
        divider.className = 'pn-fab-divider';
        stack.appendChild(divider);

        const exportBtn = document.createElement('button');
        exportBtn.className = 'pn-fab-btn pn-fab-btn--primary';
        exportBtn.textContent = 'Export Selected';
        exportBtn.setAttribute('tabindex', '0');
        exportBtn.setAttribute('aria-label', 'Export selected conversation turns');
        exportBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          chrome.runtime.sendMessage({ action: 'OPEN_SIDEPANEL' });
          openSidePanelWithSelection();
          void deactivateSelectionMode();
        });
        stack.appendChild(exportBtn);

        const allBtn = document.createElement('button');
        allBtn.className = 'pn-fab-btn';
        allBtn.textContent = 'Select All';
        allBtn.setAttribute('tabindex', '0');
        allBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          exportSelectionState.selectedIds = new Set(exportSelectionState.messageOrder);
          syncSelectionClassesAndControls();
          void syncFABState();
        });
        stack.appendChild(allBtn);

        const deselectBtn = document.createElement('button');
        deselectBtn.className = 'pn-fab-btn';
        deselectBtn.textContent = 'Deselect';
        deselectBtn.setAttribute('tabindex', '0');
        deselectBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          exportSelectionState.selectedIds.clear();
          syncSelectionClassesAndControls();
          void syncFABState();
        });
        stack.appendChild(deselectBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'pn-fab-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.setAttribute('tabindex', '0');
        cancelBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          void deactivateSelectionMode();
        });
        stack.appendChild(cancelBtn);
      } else {
        if (actions.length === 0) {
          root.classList.add('pn-hidden');
          return;
        }

        const primary = actions.find((a) => a.primary) || actions[0];
        if (!primary) {
          root.classList.add('pn-hidden');
          return;
        }
        const secondaries = actions.filter((a) => a !== primary);

        const primaryBtn = document.createElement('button');
        primaryBtn.className = 'pn-fab-btn pn-fab-btn--primary';
        primaryBtn.textContent = primary.label;
        primaryBtn.setAttribute('tabindex', '0');
        primaryBtn.setAttribute('aria-label', `${primary.label} (Primary action)`);
        primaryBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          void executeActionWithLifecycle(primary.id, context);
        });
        stack.appendChild(primaryBtn);

        if (secondaries.length > 0) {
          const toggleBtn = document.createElement('button');
          toggleBtn.className = 'pn-fab-menu-toggle';
          toggleBtn.setAttribute('tabindex', '0');
          toggleBtn.setAttribute('aria-label', 'Toggle alternative actions menu');
          toggleBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
          toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isMenuExpanded = root.classList.contains('pn-menu-expanded');
            if (isMenuExpanded) {
              root.classList.remove('pn-menu-expanded');
              root.setAttribute('aria-expanded', 'false');
            } else {
              root.classList.add('pn-menu-expanded');
              root.setAttribute('aria-expanded', 'true');
            }
          });
          stack.appendChild(toggleBtn);

          const verticalList = document.createElement('div');
          verticalList.className = 'pn-fab-vertical-list';

          const divider = document.createElement('div');
          divider.className = 'pn-fab-vertical-divider';
          verticalList.appendChild(divider);

          for (const sec of secondaries) {
            const secBtn = document.createElement('button');
            secBtn.className = 'pn-fab-btn pn-fab-btn--secondary';
            secBtn.textContent = sec.label;
            secBtn.setAttribute('tabindex', '0');
            secBtn.setAttribute('aria-label', sec.label);
            secBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              root.classList.remove('pn-menu-expanded');
              root.setAttribute('aria-expanded', 'false');
              void executeActionWithLifecycle(sec.id, context);
            });
            verticalList.appendChild(secBtn);
          }
          stack.appendChild(verticalList);
        }
      }
    },

    checkPositionCollisions(fabEl: HTMLElement, context: FabContext) {
      let defaultRight = 24;
      let defaultBottom = 24;

      if (context.platform === 'chatgpt') {
        defaultRight = 32;
        defaultBottom = 32;
        fabEl.style.borderRadius = '99px';
        fabEl.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.45)';
      } else if (context.platform === 'claude') {
        defaultRight = 24;
        defaultBottom = 24;
        fabEl.style.borderRadius = '16px';
        fabEl.style.boxShadow = '0 8px 30px rgba(0, 0, 0, 0.25)';
      } else if (context.platform === 'gemini') {
        defaultRight = 16;
        defaultBottom = 16;
        fabEl.style.borderRadius = '24px';
        fabEl.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
      }

      fabEl.style.right = `${defaultRight}px`;
      fabEl.style.bottom = `${defaultBottom}px`;

      const colliders = [
        '[data-testid="send-button"]',
        '[aria-label="Attach files"]',
        '[aria-label="Upload files"]',
        '[aria-label="Voice input"]',
        '[aria-label="Read aloud"]',
        '[data-testid="chat-controls"]',
        '.canvas-sidebar',
        '.artifacts-pane',
        '[aria-label="Send message"]',
        '.voice-input-button',
        '.scroll-to-bottom-btn',
        '[aria-label="Scroll to bottom"]',
        '[class*="scroll-to-bottom"]',
        '[class*="arrow-down"]',
        '[class*="submit-btn"]',
        '[class*="VoiceButton"]',
        '[class*="AttachmentButton"]',
      ];

      const fabWidth = fabEl.offsetWidth || 180;
      const fabHeight = fabEl.offsetHeight || 48;

      let overlapDetected = false;
      let highestOverlapTop = window.innerHeight;

      const composerRect = context.composer.rect;
      if (composerRect) {
        const fabLeft = window.innerWidth - defaultRight - fabWidth;
        const fabTop = window.innerHeight - defaultBottom - fabHeight;
        const overlapX =
          composerRect.left < window.innerWidth - defaultRight && composerRect.right > fabLeft;
        const overlapY =
          composerRect.top < window.innerHeight - defaultBottom && composerRect.bottom > fabTop;
        if (overlapX && overlapY) {
          overlapDetected = true;
          highestOverlapTop = Math.min(highestOverlapTop, composerRect.top);
        }
      }

      for (const selector of colliders) {
        const el = document.querySelector(selector);
        if (el && el instanceof HTMLElement && el.isConnected) {
          const rect = el.getBoundingClientRect();
          const fabLeft = window.innerWidth - defaultRight - fabWidth;
          const fabTop = window.innerHeight - defaultBottom - fabHeight;
          const overlapX = rect.left < window.innerWidth - defaultRight && rect.right > fabLeft;
          const overlapY = rect.top < window.innerHeight - defaultBottom && rect.bottom > fabTop;
          if (overlapX && overlapY) {
            overlapDetected = true;
            highestOverlapTop = Math.min(highestOverlapTop, rect.top);
          }
        }
      }

      if (overlapDetected) {
        const newBottom = window.innerHeight - highestOverlapTop + 16;
        fabEl.style.bottom = `${Math.max(defaultBottom, newBottom)}px`;
      }
    },

    renderProcessing(actionId: string) {
      const root = getContextFabNode();
      if (!root) return;
      root.className = 'pn-context-fab pn-state-processing';
      const stack = root.querySelector('.pn-fab-actions-stack');
      if (stack) {
        stack.innerHTML = '';
        const loader = document.createElement('span');
        loader.className = 'pn-fab-loader';
        loader.innerHTML = `<svg class="pn-spinner" width="16" height="16" viewBox="0 0 50 50"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle></svg>`;
        stack.appendChild(loader);

        const statusText = document.createElement('span');
        statusText.className = 'pn-fab-status-text';
        statusText.textContent = 'Processing...';
        stack.appendChild(statusText);
      }
    },

    showErrorState(message: string, retryCallback: () => void) {
      const root = getContextFabNode();
      if (!root) return;

      const prevClass = root.className;
      root.className = 'pn-context-fab pn-state-error';
      const stack = root.querySelector('.pn-fab-actions-stack');
      if (stack) {
        stack.innerHTML = '';

        const errorIcon = document.createElement('span');
        errorIcon.className = 'pn-fab-error-icon';
        errorIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
        stack.appendChild(errorIcon);

        const errText = document.createElement('span');
        errText.className = 'pn-fab-error-text';
        errText.textContent = message;
        stack.appendChild(errText);

        const retryBtn = document.createElement('button');
        retryBtn.className = 'pn-fab-error-retry';
        retryBtn.textContent = 'Retry';
        retryBtn.setAttribute('tabindex', '0');
        retryBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          retryCallback();
        });
        stack.appendChild(retryBtn);
      }

      setTimeout(() => {
        if (root.className.includes('pn-state-error')) {
          root.className = prevClass;
          void syncFABState();
        }
      }, 4000);
    },

    showSuccessToast(message: string, undoCallback?: () => void) {
      const root = getContextFabNode();
      if (!root) return;

      logTelemetry('FAB_TOAST_SHOWN', { message });

      const prevClass = root.className;
      root.className = 'pn-context-fab pn-state-success pn-expanded-success';

      const stack = root.querySelector('.pn-fab-actions-stack');
      if (stack) {
        stack.innerHTML = '';

        const checkIcon = document.createElement('span');
        checkIcon.className = 'pn-fab-success-check';
        checkIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0b0f19" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        stack.appendChild(checkIcon);

        const toastSpan = document.createElement('span');
        toastSpan.className = 'pn-fab-success-text';
        toastSpan.textContent = message;
        stack.appendChild(toastSpan);

        if (undoCallback) {
          const undoBtn = document.createElement('button');
          undoBtn.className = 'pn-fab-success-undo';
          undoBtn.textContent = 'Undo';
          undoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            undoCallback();
            logTelemetry('FAB_ACTION_UNDONE');
            root.className = prevClass;
            void syncFABState();
          });
          stack.appendChild(undoBtn);
        }
      }

      setTimeout(() => {
        if (root.className.includes('pn-state-success')) {
          root.className = prevClass;
          void syncFABState();
        }
      }, 3500);
    },
  };

  /** Clears selections that no longer exist in the latest DOM scan snapshot. */
  const pruneMissingSelections = async (currentIds: any) => {
    for (const id of Array.from(exportSelectionState.selectedIds) as any[]) {
      if (!currentIds.has(id)) {
        exportSelectionState.selectedIds.delete(id);
      }
    }

    document.querySelectorAll('.pn-inline-select-host').forEach((host) => {
      if (!(host instanceof HTMLElement)) return;
      const messageId = String(host.dataset.messageId || '').trim();
      if (!messageId || currentIds.has(messageId)) return;
      host.remove();
    });
  };

  /** Collects all known chat message nodes for the current platform in order. */
  const collectChatMessageNodes = async () => {
    const adapter = getCurrentAdapter();
    if (!adapter) return [];
    const elements = await adapter.getMessageElements();
    const uniqueNodes = elements.map((e) => e.element);
    const topLevelNodes = uniqueNodes.filter(
      (node) =>
        !uniqueNodes.some((candidate: any) => candidate !== node && candidate.contains(node))
    );
    return sortContentNodesByDomOrder(topLevelNodes);
  };

  /** Scans message DOM, injects checkboxes, and refreshes cached extraction payloads. */
  const scanSelectionTargets = async () => {
    if (!exportSelectionState.selectionModeActive) {
      return;
    }

    const adapter = getCurrentAdapter();
    if (!adapter) {
      return;
    }

    const nodes = await collectChatMessageNodes();
    const elements = await adapter.getMessageElements();
    const roleMap = new Map(elements.map((e) => [e.element, e.role]));

    const nextOrder = [];
    const nextMessagesById = new Map();

    const groups: any[] = [];
    let currentGroup: any = null;

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const role = roleMap.get(node) || 'user';
      const row = await readMessageNode(node, role, index);

      if (!row) {
        continue;
      }

      nextOrder.push(row.id);
      nextMessagesById.set(row.id, row);

      // Determine if we start a new group or continue the current one
      if (role === 'user' || !currentGroup) {
        currentGroup = {
          id: `group-${row.id}`,
          messageIds: [row.id],
          split: exportSelectionState.splitGroupIds?.has(row.id) || false,
        };
        groups.push(currentGroup);
      } else {
        currentGroup.messageIds.push(row.id);
      }
    }

    exportSelectionState.messageOrder = nextOrder;
    exportSelectionState.messagesById = nextMessagesById;
    exportSelectionState.groups = groups;

    await pruneMissingSelections(new Set(nextOrder));

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const rowId = nextOrder[index];
      if (rowId) {
        await ensureMessageCheckbox(node, rowId);
      }
    }

    syncSelectionClassesAndControls();
    await updateSelectionFab();
  };

  /** Debounces expensive message scan work during rapid streaming DOM updates. */
  const scheduleSelectionScan = async () => {
    if (!exportSelectionState.selectionModeActive) {
      return;
    }

    if (exportSelectionState.scanTimer) {
      clearTimeout(exportSelectionState.scanTimer);
    }

    exportSelectionState.scanTimer = setTimeout(() => {
      exportSelectionState.scanTimer = null;
      void scanSelectionTargets();
    }, OBSERVER_DEBOUNCE_MS) as any;
  };

  /** Resolves the narrowest stable container to observe for chat message DOM changes. */
  const resolveObserverRoot = async (selectors: any) => {
    const seed = (await safeQuery(selectors.userMsg)) || (await safeQuery(selectors.botMsg));

    if (seed) {
      return (
        seed.closest(
          'main, [role="main"], [class*="conversation"], [class*="thread"], [class*="chat"]'
        ) ||
        seed.parentElement ||
        document.body
      );
    }

    return document.querySelector('main, [role="main"]') || document.body;
  };

  /** Attaches a scoped MutationObserver for streaming chat updates and DOM pagination shifts. */
  const attachSelectionObserver = async () => {
    const selectors = exportSelectionState.selectors;

    if (!selectors) {
      return;
    }

    const root = await resolveObserverRoot(selectors);

    if (!root) {
      return;
    }

    if (exportSelectionState.observer) {
      exportSelectionState.observer.disconnect();
    }

    const observer = new MutationObserver((mutations) => {
      // High-performance, zero-allocation check to prevent infinite loops globally
      let isPromptiumMutation = true;
      for (const m of mutations) {
        let isLocalMutation = false;

        if (m.type === 'childList') {
          if (m.addedNodes.length > 0 || m.removedNodes.length > 0) {
            let allPn = true;
            for (let j = 0; j < m.addedNodes.length; j++) {
              const n = m.addedNodes[j];
              if (!(n instanceof HTMLElement)) {
                allPn = false;
                break;
              }
              const c = typeof n.className === 'string' ? n.className : '';
              const id = typeof n.id === 'string' ? n.id : '';
              if (c.indexOf('pn-') === -1 && id.indexOf('pn-') === -1) {
                allPn = false;
                break;
              }
            }
            if (allPn) {
              for (let j = 0; j < m.removedNodes.length; j++) {
                const n = m.removedNodes[j];
                if (!(n instanceof HTMLElement)) {
                  allPn = false;
                  break;
                }
                const c = typeof n.className === 'string' ? n.className : '';
                const id = typeof n.id === 'string' ? n.id : '';
                if (c.indexOf('pn-') === -1 && id.indexOf('pn-') === -1) {
                  allPn = false;
                  break;
                }
              }
            }
            isLocalMutation = allPn;
          } else {
            isLocalMutation = true;
          }
        }

        if (!isLocalMutation && m.target instanceof HTMLElement) {
          const tc = typeof m.target.className === 'string' ? m.target.className : '';
          const tid = typeof m.target.id === 'string' ? m.target.id : '';
          if (tc.indexOf('pn-') !== -1 || tid.indexOf('pn-') !== -1) {
            isLocalMutation = true;
          }
        }

        if (!isLocalMutation) {
          isPromptiumMutation = false;
          break;
        }
      }

      if (isPromptiumMutation) return;
      void scheduleSelectionScan();
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: false,
      attributes: false,
    });

    exportSelectionState.observerRoot = root;
    exportSelectionState.observer = observer;
    await scheduleSelectionScan();
  };

  /** Handles SPA navigation by resetting selection state and rebinding scoped observers. */
  const handleNavigationRefresh = async (platform: any) => {
    exportSelectionState.selectedIds.clear();
    exportSelectionState.messageOrder = [];
    exportSelectionState.messagesById = new Map();

    if (exportSelectionState.selectionModeActive) {
      await attachSelectionObserver();
    }

    await updateSelectionFab();
  };

  /** Starts lightweight URL watcher to rebind observers when SPAs change route. */
  const startSelectionUrlWatcher = async (platform: any) => {
    if (exportSelectionState.urlWatchTimer) {
      return;
    }

    exportSelectionState.urlWatchTimer = setInterval(() => {
      void (async () => {
        if (window.location.href !== exportSelectionState.lastUrl) {
          exportSelectionState.lastUrl = window.location.href;
          await handleNavigationRefresh(platform);
          return;
        }

        if (exportSelectionState.observerRoot && !exportSelectionState.observerRoot.isConnected) {
          await attachSelectionObserver();
        }
      })();
    }, URL_WATCH_INTERVAL_MS) as any;
  };

  /** Initializes in-page selection affordances used to launch side panel exports. */
  const initExportSelectionUi = async (platform: any) => {
    exportSelectionState.platform = platform;

    const adapter = getCurrentAdapter();
    if (!adapter) {
      return;
    }

    await startSelectionUrlWatcher(platform);
  };

  /** Handles injectPrompt action messages from popup and returns operation status. */
  const handleInjectPrompt = async (msg: any, platform: any, sendResponse: any) => {
    const nextText = String(msg?.text || '');
    const previousText = await readComposerText(platform);
    const success = await window.Injector.inject(nextText, platform);
    if (success && previousText != null) {
      stageInjectionUndo(platform, previousText, nextText);
    }
    sendResponse({ ok: success });
  };

  /** Handles exportChat action by scraping and exporting chat data. */
  const handleExportChat = async (msg: any, platform: any, sendResponse: any) => {
    const messages = await window.Scraper.scrape(platform);

    if (!messages.length) {
      sendResponse({
        ok: false,
        error: 'No chat messages available to export.',
      });
      return;
    }

    const payload = await createChatPayload(platform, messages);
    const result = await (window.Exporter as any).exportChat(
      payload,
      String(msg?.format || 'md').toLowerCase(),
      msg?.prefs || {}
    );

    sendResponse(result);
  };

  /** Handles getPlatform action by returning the detected platform identifier. */
  const handleGetPlatform = async (platform: any, sendResponse: any) => {
    sendResponse({ ok: true, platform });
  };

  /** Handles side-panel export open requests that should include every visible message. */
  const handleOpenSidePanelAll = async (sendResponse: any) => {
    sendResponse(await openSidePanelWithAllMessages());
  };

  /** Handles cross-LLM bridge scrape requests from sidepanel modules. */
  const handleScrapeForBridge = async (platform: any, sendResponse: any) => {
    const messages = await window.Scraper.scrape(platform);
    sendResponse({ ok: true, platform, messages });
  };

  /** Handles continuation scrape requests by returning full normalized message rows. */
  const handleScrapeForContinuation = async (platform: any, sendResponse: any) => {
    const messages = await window.Scraper.scrape(platform);
    sendResponse({ ok: true, platform, messages });
  };

  /** Routes incoming runtime messages by action name and wraps execution errors. */
  const onRuntimeMessage = (msg: any, _sender: any, sendResponse: any) => {
    void (async () => {
      let responded = false;

      /** Sends a response once to avoid message channel closure errors. */
      const respond = (payload: any) => {
        if (responded) {
          return;
        }

        responded = true;

        try {
          sendResponse(payload);
        } catch (_error) {
          return;
        }
      };

      try {
        if (msg?.action === 'GET_SELECTION' || msg?.type === 'GET_SELECTION') {
          const text = String(window.getSelection()?.toString() || '').trim();
          const url = window.location.href;
          const platform = getCurrentAdapter()?.id || null;
          const sourceTitle = document.title || '';
          respond({ text, url, platform, sourceTitle });
          return;
        }

        if (msg?.action === 'CHECK_ADAPTER_HEALTH' || msg?.type === 'CHECK_ADAPTER_HEALTH') {
          try {
            const adapter = getCurrentAdapter();
            const validation = adapter ? await adapter.validate() : null;
            respond({ ok: true, healthy: Boolean(validation && validation.healthy) });
          } catch (_) {
            respond({ ok: true, healthy: false });
          }
          return;
        }

        if (msg?.action === 'SHOW_TOAST' || msg?.type === 'SHOW_TOAST') {
          if (msg.type === 'error' || msg.toastType === 'error') {
            toast.error(msg.text);
          } else if (msg.type === 'success' || msg.toastType === 'success') {
            toast.success(msg.text);
          } else {
            toast.info(msg.text);
          }
          respond({ ok: true });
          return;
        }

        if (msg?.action === 'COPY_TO_CLIPBOARD' || msg?.type === 'COPY_TO_CLIPBOARD') {
          try {
            const text = String(msg.text || '').trim();
            await navigator.clipboard.writeText(text);
            respond({ ok: true });
          } catch (err: any) {
            respond({ ok: false, error: err.message || 'Clipboard write failed.' });
          }
          return;
        }

        const platform = getCurrentAdapter()?.id || null;

        if (!platform) {
          respond({ ok: false, error: 'Unsupported platform.' });
          return;
        }

        if (msg?.action === 'injectPrompt') {
          await handleInjectPrompt(msg, platform, respond);
          return;
        }

        if (msg?.action === 'exportChat') {
          await handleExportChat(msg, platform, respond);
          return;
        }

        if (msg?.action === 'getPlatform') {
          await handleGetPlatform(platform, respond);
          return;
        }

        if (msg?.action === 'enterSelectionMode') {
          await ensureSelectionModeActive();
          respond({ ok: true });
          return;
        }

        if (msg?.action === 'openSidePanelAll') {
          await handleOpenSidePanelAll(respond);
          return;
        }

        if (msg?.action === 'scrapeForBridge') {
          await handleScrapeForBridge(platform, respond);
          return;
        }

        if (msg?.action === 'scrapeForContinuation') {
          await handleScrapeForContinuation(platform, respond);
          return;
        }

        if (msg?.action === 'notifyPromptium') {
          await notify(msg?.text || 'Saved to Promptium');
          respond({ ok: true });
          return;
        }

        if (msg?.type === 'GET_CONVERSATION_SNIPPET') {
          try {
            const adapter = getCurrentAdapter();
            if (!adapter) {
              respond({ text: null });
              return;
            }
            const elements = await adapter.getMessageElements();
            const text = elements
              .slice(-4)
              .map((el) => (el.element.innerText || '').trim())
              .filter(Boolean)
              .join(' ')
              .slice(0, 600);
            respond({ text: text || null });
          } catch (_) {
            respond({ text: null });
          }
          return;
        }

        respond({
          ok: false,
          error: `Unknown action: ${String(msg?.action || 'undefined')}`,
        });
      } catch (error: any) {
        respond({
          ok: false,
          error: error.message || 'Unexpected content script failure.',
        });
      } finally {
        if (!responded) {
          respond({ ok: false, error: 'No response generated for request.' });
        }
      }
    })();

    return true;
  };

  /* ——— Continuation loading banner helpers ——— */

  let _continuationBanner: any = null;
  let _continuationBannerTimer: any = null;

  const showContinuationBanner = (message: string) => {
    _continuationBanner?.remove();
    if (_continuationBannerTimer) {
      clearTimeout(_continuationBannerTimer);
      _continuationBannerTimer = null;
    }
    const el = document.createElement('div');
    el.className = 'pn-continuation-banner';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');

    const spinner = document.createElement('div');
    spinner.className = 'pn-continuation-banner__spinner';

    const textSpan = document.createElement('span');

    const labelSpan = document.createElement('span');
    labelSpan.className = 'pn-continuation-banner__label';
    labelSpan.textContent = 'Promptium';

    const messageText = document.createTextNode(message);

    textSpan.appendChild(labelSpan);
    textSpan.appendChild(messageText);

    el.appendChild(spinner);
    el.appendChild(textSpan);

    document.body.appendChild(el);
    _continuationBanner = el;
  };

  const updateContinuationBanner = (message: string, state: string) => {
    const el = _continuationBanner;
    if (!el) return;
    el.classList.remove('pn-continuation-banner--success', 'pn-continuation-banner--error');
    const spinner = el.querySelector('.pn-continuation-banner__spinner') as HTMLElement | null;
    const checkEl = el.querySelector('.pn-continuation-banner__check') as HTMLElement | null;
    const activeIcon = spinner || checkEl;

    if (state === 'success') {
      el.classList.add('pn-continuation-banner--success');
      if (activeIcon) {
        activeIcon.className = 'pn-continuation-banner__check';
        activeIcon.style.cssText = '';
        activeIcon.textContent = '✓';
      }
    } else if (state === 'error') {
      el.classList.add('pn-continuation-banner--error');
      if (activeIcon) {
        activeIcon.className = 'pn-continuation-banner__spinner';
        activeIcon.style.cssText =
          'border-color:rgba(239,68,68,0.22);border-top-color:#ef4444;animation:none';
        activeIcon.textContent = '';
      }
    }

    const textSpan = el.querySelector(
      'span:not(.pn-continuation-banner__check):not(.pn-continuation-banner__label)'
    ) as HTMLElement | null;
    if (textSpan) {
      textSpan.replaceChildren();
      const labelSpan = document.createElement('span');
      labelSpan.className = 'pn-continuation-banner__label';
      labelSpan.textContent = state === 'success' ? '' : 'Promptium';

      textSpan.appendChild(labelSpan);
      textSpan.appendChild(document.createTextNode(message));
    }
  };

  const hideContinuationBanner = (delay: any) => {
    const el = _continuationBanner;
    if (!el) return;
    const safeDelay = typeof delay === 'number' ? delay : 2400;
    _continuationBannerTimer = setTimeout(() => {
      el.classList.add('pn-continuation-banner--out');
      setTimeout(() => {
        el.remove();
        if (_continuationBanner === el) _continuationBanner = null;
      }, 300);
      _continuationBannerTimer = null;
    }, safeDelay) as any;
  };

  /** Reads pending cross-LLM bridge context and injects it on target platform load. */
  const hydratePendingBridge = async (platform: any) => {
    try {
      if (!(window.Bridge as any)?.checkPendingBridge) {
        return;
      }

      const bridge = await (window.Bridge as any).checkPendingBridge(platform);
      if (!bridge) return;

      if (bridge.kind === 'expired') {
        await notify('Bridge expired. Open source tab and try again.');
        return;
      }

      if (bridge.kind !== 'ready' || !bridge.text) {
        return;
      }

      showContinuationBanner('Loading conversation context…');

      let success = false;

      for (let attempt = 0; attempt < 12; attempt += 1) {
        success = await window.Injector.inject(String(bridge.text), platform);

        if (success) {
          break;
        }

        await new Promise((resolve) => {
          setTimeout(resolve, 300);
        });
      }

      if (success) {
        const bridgeKey = (window.Bridge as any)?.BRIDGE_KEY || 'pendingBridge';
        await chrome.storage.local.remove([bridgeKey]).catch(() => {});
        const label = PLATFORM_LABELS[bridge.sourcePlatform] || bridge.sourcePlatform;
        updateContinuationBanner(`Continued from ${label}`, 'success');
        hideContinuationBanner(2600);
        await notify(`Continued from ${label}`);
      } else {
        updateContinuationBanner('Bridge failed — reopen extension to retry.', 'error');
        hideContinuationBanner(4000);
        await notify('Bridge failed — reopen extension to retry.');
      }
    } catch (error) {
      hideContinuationBanner(0);
      console.error('[Promptium][Content] Failed pending bridge hydration.', error);
    }
  };

  /** Reads pending continuation handoff and injects it once on target platform load. */
  const hydratePendingContinuation = async (platform: any) => {
    try {
      if (!window.Continuation?.checkPending) {
        return;
      }

      const pending = await window.Continuation.checkPending(platform);
      if (!pending) return;

      if (pending.kind === 'expired') {
        await notify('Continuation expired. Start Continue Chat again.');
        return;
      }

      if (pending.kind !== 'ready' || !pending.text) return;

      showContinuationBanner('Loading conversation context…');

      let success = false;

      for (let attempt = 0; attempt < 12; attempt += 1) {
        success = await window.Injector.inject(String(pending.text), platform);
        if (success) break;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      if (success) {
        const continuationKey = window.Continuation?.CONTINUATION_KEY || 'pendingContinuation';
        await chrome.storage.local.remove([continuationKey]).catch(() => {});
        updateContinuationBanner('Context ready — continue your conversation', 'success');
        hideContinuationBanner(2600);
        await notify('Context loaded — continue your conversation');
      } else {
        updateContinuationBanner('Injection failed — open the extension to retry.', 'error');
        hideContinuationBanner(4000);
        await notify('Injection failed — open the extension to retry.');
      }
    } catch (error) {
      hideContinuationBanner(0);
      console.error('[Promptium][Content] Failed continuation hydration.', error);
    }
  };

  const deactivateSelectionMode = async () => {
    document.body.classList.remove('pn-export-selection-active');
    document.getElementById('pn-export-selection-style')?.remove();
    window.removeEventListener('keydown', handleSelectionKeyDown);

    document.querySelectorAll('.pn-inline-select-host').forEach((host) => host.remove());

    // Reset highlighted elements
    document.querySelectorAll('.pn-message-selected').forEach((node) => {
      node.classList.remove('pn-message-selected');
      node.classList.remove('pn-chat-highlight-solid');
      node.classList.remove('pn-chat-highlight-dotted');
    });

    if (exportSelectionState.scanTimer) {
      clearTimeout(exportSelectionState.scanTimer);
      exportSelectionState.scanTimer = null;
    }

    if (exportSelectionState.observer) {
      exportSelectionState.observer.disconnect();
      exportSelectionState.observer = null;
      exportSelectionState.observerRoot = null;
    }

    exportSelectionState.selectionModeActive = false;
    void syncFABState();
  };

  /** Disconnects observers and timers when the page unloads. */
  const cleanup = async () => {
    clearInjectionUndoState();
    await deactivateSelectionMode();
    teardownContextFAB();

    if (exportSelectionState.urlWatchTimer) {
      clearInterval(exportSelectionState.urlWatchTimer);
      exportSelectionState.urlWatchTimer = null;
    }
  };

  /** Initializes content execution when the current page matches a supported platform. */
  const init = async () => {
    const platform = getCurrentAdapter()?.id || null;

    if (!platform) {
      return;
    }

    // Legacy toolbar is disabled in Phase S4.5 in favor of the new lightweight FAB launcher
    await hydratePendingBridge(platform);
    await hydratePendingContinuation(platform);
    if (window.Clippings?.init) {
      await window.Clippings.init(platform);
    }
    await initExportSelectionUi(platform);
    initContextFAB();

    if (window.PromptSuggestions?.init) {
      try {
        const snap = await chrome.storage.local.get('promptiumSettings');
        window.PromptSuggestions.init(snap?.promptiumSettings || {});
      } catch (_) {}
    }

    window.__PN.SidePanelExport = {
      openPanelOnly: openSidePanelOnly,
      openWithSelection: openSidePanelWithSelection,
      openWithAllMessages: openSidePanelWithAllMessages,
      activateSelectionModeAll: activateSelectionModeAll,
      getSelectedMessages: buildSelectedMessages,
    };

    const syncHighlightSettings = async () => {
      try {
        const snap = (await chrome.storage.local.get('promptiumSettings')) as any;
        exportSelectionState.chatHighlightStyle =
          snap?.promptiumSettings?.chatHighlightStyle || 'solid';
        getSelectionControls().forEach((entry: any) => {
          setControlChecked(entry, entry.host?.getAttribute('data-checked') === 'true');
        });
      } catch (e) {}
    };

    chrome.storage.local.onChanged.addListener((changes) => {
      if (changes.promptiumSettings) {
        syncHighlightSettings();
        const newSettings = (changes.promptiumSettings.newValue || {}) as any;
        window.PromptSuggestions?.setEnabled(newSettings?.featureFlags?.smartSuggestions !== false);
      }
    });

    await syncHighlightSettings();

    window.addEventListener(
      'beforeunload',
      () => {
        void cleanup();
      },
      { once: true }
    );
  };

  const looksLikeCode = (text: string): boolean => {
    const codeSignals = [
      /function\s+\w+\s*\(/i,
      /import\s+[\s\S]+?\s+from\s+['"]/i,
      /const\s+\w+\s*=/i,
      /let\s+\w+\s*=/i,
      /class\s+\w+/i,
      /def\s+\w+\s*\(/i,
      /fn\s+\w+\s*\(/i,
      /\{\s*[\s\S]*?\}/,
      /;\s*$/m,
      /\/\//,
    ];
    return codeSignals.some((regex) => regex.test(text));
  };

  document.addEventListener('contextmenu', () => {
    const selection = window.getSelection()?.toString() || '';
    if (selection.trim()) {
      const isCode = looksLikeCode(selection);
      chrome.runtime
        .sendMessage({
          action: 'UPDATE_CONTEXT_MENU_TITLES',
          isCode,
          selectionLength: selection.length,
        })
        .catch(() => {});
    }
  });

  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  void init();
})();
