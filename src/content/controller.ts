/**
 * content/controller.ts
 * Owns: init(), cleanup(), onRuntimeMessage routing, context FAB lifecycle.
 * Coordinates all content sub-modules without owning their implementations.
 */
import { getCurrentAdapter } from '../platform';
import { toast } from '../shared/utils/toast';
import {
  exportSelectionState,
  injectionUndoState,
  ALLOWED_TRANSITIONS,
  localTelemetry,
  activeListeners,
  activeObservers,
  activeAnimationPromise,
  currentFABState,
  inQuietMode,
  ignoreCount,
  confidenceLevel,
  confidenceInterval,
  activeContext,
  currentSelectionText,
  deselectTimeout,
  typingTimeout,
  FabState,
  FabContext,
  ActionOption,
  URL_WATCH_INTERVAL_MS,
  INJECTION_UNDO_TTL_MS,
  INJECTION_CONFIRMATION_DELAY_MS,
} from './state';
import {
  handleInjectPrompt,
  handleExportChat,
  handleGetPlatform,
  handleScrapeForBridge,
  handleScrapeForContinuation,
  normalizeComposerText,
  readComposerText,
  notify,
  createChatPayload,
} from './integration/messaging';
import { attachSelectionObserver, scheduleSelectionScan } from './observer/observer';
import {
  clearInjectionUndoState,
  stageInjectionUndo,
  showAlreadySavedToast,
} from './overlay/overlay';
import {
  ensureSelectionShadowRoot,
  getSelectionControls,
  setControlChecked,
  setAllSelectionControls,
  syncSelectionClassesAndControls,
  buildSelectedMessages,
  openSidePanelWithSelection,
  openSidePanelOnly,
  openSidePanelWithAllMessages,
  activateSelectionModeAll,
  ensureSelectionModeActive,
  deactivateSelectionMode,
  scanSelectionTargets,
} from './selection/selection';

// ─── Telemetry ────────────────────────────────────────────────────────────────

let _ignoreCount = 0;
let _inQuietMode = false;
let _confidenceLevel = 0;
let _confidenceInterval: any = null;
let _currentFABState: FabState = 'hidden';
let _deselectTimeout: any = null;
let _typingTimeout: any = null;
let _activeAnimationPromise: Promise<void> = Promise.resolve();

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

// ─── FAB State Machine ────────────────────────────────────────────────────────

const transitionTo = (nextState: FabState): boolean => {
  if (_currentFABState === nextState) return true;
  const allowed = ALLOWED_TRANSITIONS[_currentFABState] || [];
  if (!allowed.includes(nextState)) {
    console.warn(`[Promptium][FSM] Illegal state transition from ${_currentFABState} to ${nextState}`);
    return false;
  }
  const prevState = _currentFABState;
  _currentFABState = nextState;
  logTelemetry('FAB_STATE_TRANSITION', { from: prevState, to: nextState });
  return true;
};

const queueAnimation = (renderFn: () => Promise<void>) => {
  _activeAnimationPromise = _activeAnimationPromise.then(() =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(async () => {
        try { await renderFn(); } catch (err) { console.error('[Promptium][Queue] Animation error:', err); }
        resolve();
      });
    })
  );
};

// ─── Listener & Observer Trackers ─────────────────────────────────────────────

const addTrackedListener = (target: EventTarget, type: string, listener: EventListener) => {
  target.addEventListener(type, listener);
  activeListeners.push({ target, type, listener });
};

const clearTrackedListeners = () => {
  for (const item of activeListeners) item.target.removeEventListener(item.type, item.listener);
  activeListeners.length = 0;
};

const addTrackedObserver = (obs: MutationObserver) => activeObservers.push(obs);

const clearTrackedObservers = () => {
  for (const obs of activeObservers) obs.disconnect();
  activeObservers.length = 0;
};

// ─── Context Engine ───────────────────────────────────────────────────────────

const ContextEngine = {
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

    const selText = adapter ? adapter.getSelection().trim() : window.getSelection()?.toString().trim() || '';
    let selectionRole: 'user' | 'assistant' | 'mixed' = 'mixed';
    let selectionRect: DOMRect | null = null;

    if (selText) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        try { selectionRect = selection.getRangeAt(0).getBoundingClientRect(); } catch (_) {}
        if (selection.anchorNode && adapter) {
          let curr: HTMLElement | null =
            selection.anchorNode instanceof HTMLElement
              ? selection.anchorNode
              : selection.anchorNode.parentElement;
          while (curr) {
            if (adapter.isUserMessage(curr)) { selectionRole = 'user'; break; }
            if (adapter.isAssistantMessage(curr)) { selectionRole = 'assistant'; break; }
            curr = curr.parentElement;
          }
        }
      }
    }

    let composerFocused = false, composerText = '', composerRect: DOMRect | null = null;
    if (adapter) {
      composerFocused = adapter.isComposerFocused();
      composerText = adapter.getComposerText();
      const composerEl = adapter.getComposerElement();
      if (composerEl) composerRect = composerEl.getBoundingClientRect();
    }

    let hasMessages = false, msgCount = 0;
    if (adapter) {
      const elements = await adapter.getMessageElements();
      msgCount = elements.length;
      hasMessages = msgCount > 0;
    }

    const width = window.innerWidth, height = window.innerHeight, isSmall = width < 800;
    let state: FabContext['state'] = 'idle';
    if (selectionModeActive) state = 'selection-mode';
    else if (overlayActive) state = 'overlay';
    else if (selText) state = 'selection';
    else if (composerFocused && composerText.trim().length > 10) state = 'typing';
    else if (hasMessages) state = 'conversation';

    return {
      platform, state,
      composer: { focused: composerFocused, text: composerText, hasText: composerText.trim().length > 0, rect: composerRect },
      selection: { text: selText, role: selectionRole, rect: selectionRect },
      conversation: { hasMessages, count: msgCount },
      overlay: { active: overlayActive },
      viewport: { isSmall, width, height },
    };
  },
};

// ─── Action Resolver ──────────────────────────────────────────────────────────

const findExistingPrompt = async (text: string) => {
  const snap = await chrome.storage.local.get(['prompts']);
  const list = Array.isArray(snap.prompts) ? snap.prompts : [];
  return list.find((p: any) => p.text.trim() === text.trim());
};

const ActionResolver = {
  async resolve(context: FabContext): Promise<ActionOption[]> {
    if (context.state === 'overlay' || context.state === 'selection-mode') return [];
    let memory: any = {};
    try { const snap = await chrome.storage.local.get(['pn_fab_memory']); memory = snap.pn_fab_memory || {}; } catch (_) {}
    const platformMem = memory[context.platform] || {};
    const candidates = [
      {
        id: 'save_prompt', label: 'Save Prompt',
        isVisible: (ctx: FabContext) =>
          (ctx.state === 'typing' && ctx.composer.text.trim().length > 10) ||
          (ctx.state === 'selection' && ctx.selection.role === 'user'),
        getPriority: (ctx: FabContext) => {
          let p = 90;
          const text = ctx.state === 'selection' ? ctx.selection.text : context.composer.text;
          if (text.split(/\s+/).filter(Boolean).length > 50) p += 10;
          return p;
        },
      },
      { id: 'open_library', label: 'Open Library', isVisible: (ctx: FabContext) => ctx.state === 'idle', getPriority: () => 50 },
    ];

    const actions: ActionOption[] = [];
    for (const cand of candidates) {
      if (cand.isVisible(context)) {
        let score = cand.getPriority(context);
        if (cand.id === 'save_prompt') {
          const text = context.state === 'selection' ? context.selection.text : context.composer.text;
          if (await findExistingPrompt(text)) score -= 30;
        }
        const chosenCount = platformMem[cand.id] || 0;
        if (chosenCount > 0) score += Math.min(20, chosenCount * 2);
        actions.push({ id: cand.id, label: cand.label, score, primary: false });
      }
    }
    actions.sort((a, b) => b.score - a.score);
    if (actions[0]) actions[0].primary = true;
    return actions;
  },
};

// ─── Action Router ────────────────────────────────────────────────────────────

const handleSavePromptAction = async () => {
  const adapter = getCurrentAdapter();
  if (!adapter) return;
  const _activeCtx = exportSelectionState.selectionModeActive ? 'selection' : 'idle';
  const text = _activeCtx === 'selection' ? window.getSelection()?.toString().trim() || '' : adapter.getComposerText();
  if (!text.trim()) return;
  const existing = await findExistingPrompt(text);
  if (existing) { showAlreadySavedToast(existing, text); return; }
  chrome.runtime.sendMessage(
    { action: 'OPEN_PROMPTIUM_WINDOW', source: 'fab', text, description: `Saved from ${adapter.hosts[0]}` },
    (response: any) => { if (!response || !response.ok) toast.error('Failed to open Prompt Builder.'); }
  );
};

const ActionRouter = {
  async dispatch(actionId: string, context: FabContext) {
    logTelemetry('FAB_ACTION_CLICKED', { actionId });
    try {
      const snap = await chrome.storage.local.get(['pn_fab_memory']);
      const memory: Record<string, any> = snap.pn_fab_memory || {};
      if (!memory[context.platform]) memory[context.platform] = {};
      memory[context.platform][actionId] = (memory[context.platform][actionId] || 0) + 1;
      await chrome.storage.local.set({ pn_fab_memory: memory });
    } catch (_) {}
    switch (actionId) {
      case 'save_prompt': await handleSavePromptAction(); break;
      case 'open_library':
        chrome.runtime.sendMessage({ action: 'OPEN_PROMPTIUM_WINDOW', source: 'fab' }); break;
      default: console.warn('[Promptium][ActionRouter] Unknown action:', actionId);
    }
  },
};

// ─── FAB Renderer ─────────────────────────────────────────────────────────────

const CONTEXT_FAB_SHADOW_CSS = `
  /* Minimal positioning for the context FAB root */
  :host { all: initial; }
`;

const getContextFabNode = () =>
  ensureSelectionShadowRoot()?.getElementById('pn-context-fab') || null;

const ensureSelectionFabFn = async () => {
  const shadowRoot = ensureSelectionShadowRoot();
  if (!shadowRoot || shadowRoot.getElementById('pn-context-fab')) return;
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
  root.addEventListener('mouseenter', () => root.classList.add('pn-expanded'));
  root.addEventListener('mouseleave', () => root.classList.remove('pn-expanded'));
  shadowRoot.appendChild(root);
};

const FABRenderer = {
  async render(context: FabContext, actions: ActionOption[]) {
    await ensureSelectionFabFn();
    const root = getContextFabNode();
    if (!root) return;
    if (root.classList.contains('pn-state-success') || root.classList.contains('pn-state-processing') || root.classList.contains('pn-state-error')) return;
    if (context.state === 'overlay') { root.classList.add('pn-hidden'); return; }
    root.classList.remove('pn-hidden');
    root.className = `pn-context-fab pn-state-${context.state}`;
    root.setAttribute('aria-expanded', 'false');
    root.classList.toggle('pn-quiet-mode', _inQuietMode);
    root.classList.toggle('pn-small-viewport', context.viewport.isSmall);
    this.checkPositionCollisions(root, context);
    const stack = root.querySelector('.pn-fab-actions-stack');
    if (!stack) return;
    stack.innerHTML = '';
    if (context.state === 'selection-mode') {
      root.setAttribute('aria-expanded', 'true');
      const selectedCount = exportSelectionState.selectedIds.size;
      let words = 0;
      exportSelectionState.selectedIds.forEach((id: string) => {
        const msg = exportSelectionState.messagesById.get(id);
        if (msg) words += (msg.text || '').split(/\s+/).filter(Boolean).length;
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
        void deactivateSelectionMode(handleSelectionKeyDown, syncFABState);
      });
      stack.appendChild(exportBtn);
      const allBtn = document.createElement('button');
      allBtn.className = 'pn-fab-btn';
      allBtn.textContent = 'Select All';
      allBtn.setAttribute('tabindex', '0');
      allBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        void activateSelectionModeAll(
          () => ensureSelectionModeActive(handleSelectionKeyDown, ensureSelectionFabFn, attachSelectionObserver, syncFABState),
          syncFABState
        );
      });
      stack.appendChild(allBtn);
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'pn-fab-btn pn-fab-btn--cancel';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.setAttribute('tabindex', '0');
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        void deactivateSelectionMode(handleSelectionKeyDown, syncFABState);
      });
      stack.appendChild(cancelBtn);
    } else {
      for (const action of actions) {
        const btn = document.createElement('button');
        btn.className = `pn-fab-btn${action.primary ? ' pn-fab-btn--primary' : ''}`;
        btn.textContent = action.label;
        btn.setAttribute('tabindex', '0');
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          void executeActionWithLifecycle(action.id, context);
        });
        stack.appendChild(btn);
      }
    }
  },
  checkPositionCollisions(root: HTMLElement, context: FabContext) {
    const defaultRight = 24, defaultBottom = 24;
    const fabWidth = root.offsetWidth || 56, fabHeight = root.offsetHeight || 56;
    const chatElements = document.querySelectorAll(
      '[data-message-author-role], .human-turn, .assistant-turn, [data-testid="user-message"], [data-turn-role]'
    );
    let highestOverlapTop = window.innerHeight;
    for (const el of Array.from(chatElements)) {
      const rect = el.getBoundingClientRect();
      const fabLeft = window.innerWidth - defaultRight - fabWidth;
      const fabTop = window.innerHeight - defaultBottom - fabHeight;
      const overlapX = rect.left < window.innerWidth - defaultRight && rect.right > fabLeft;
      const overlapY = rect.top < window.innerHeight - defaultBottom && rect.bottom > fabTop;
      if (overlapX && overlapY && rect.top < highestOverlapTop) highestOverlapTop = rect.top;
    }
    if (highestOverlapTop < window.innerHeight) {
      const newBottom = window.innerHeight - highestOverlapTop + 16;
      root.style.bottom = `${Math.max(defaultBottom, newBottom)}px`;
    } else {
      root.style.bottom = `${defaultBottom}px`;
    }
  },
  renderProcessing(actionId: string) {
    const root = getContextFabNode();
    if (!root) return;
    root.classList.add('pn-state-processing');
    const stack = root.querySelector('.pn-fab-actions-stack');
    if (stack) stack.innerHTML = '<span class="pn-fab-processing">Processing…</span>';
  },
  showSuccessToast(msg: string, undoCallback?: () => void) {
    toast.success(msg);
  },
  showErrorState(msg: string, retryCallback?: () => void) {
    const root = getContextFabNode();
    if (!root) return;
    root.classList.add('pn-state-error');
    const stack = root.querySelector('.pn-fab-actions-stack');
    if (stack) {
      stack.innerHTML = `<span class="pn-fab-error">${msg}</span>`;
      if (retryCallback) {
        const btn = document.createElement('button');
        btn.className = 'pn-fab-btn';
        btn.textContent = 'Retry';
        btn.addEventListener('click', retryCallback);
        stack.appendChild(btn);
      }
    }
    setTimeout(() => {
      root.classList.remove('pn-state-error');
      void syncFABState();
    }, 3000);
  },
};

// ─── Context FAB Sync ─────────────────────────────────────────────────────────

const deriveFsmState = (context: FabContext, actions: ActionOption[]): FabState => {
  if (_inQuietMode) return 'sleeping';
  if (context.state === 'overlay') return 'hidden';
  if (actions.length === 0 && context.state === 'idle') return 'hidden';
  switch (context.state) {
    case 'typing': return 'typing';
    case 'selection': return context.selection.role === 'user' ? 'selection_user' : 'selection_assistant';
    case 'conversation': return 'conversation';
    case 'selection-mode': return 'expanded';
    default: return 'idle';
  }
};

const syncFABState = async () => {
  const context = await ContextEngine.getContext();
  if (context.state === 'selection-mode' && _inQuietMode) {
    _ignoreCount = 0; _inQuietMode = false;
    logTelemetry('FAB_QUIET_MODE_RESET', { reason: 'selection_mode_active' });
  }
  const actions = await ActionResolver.resolve(context);
  const targetState = deriveFsmState(context, actions);

  if (context.state === 'typing') {
    if (_currentFABState !== 'typing' && !_inQuietMode) {
      if (!_confidenceInterval) {
        _confidenceLevel = 0;
        _confidenceInterval = setInterval(async () => {
          _confidenceLevel += 25;
          if (_confidenceLevel >= 100) {
            clearInterval(_confidenceInterval); _confidenceInterval = null;
            if (transitionTo('typing')) {
              const freshActions = await ActionResolver.resolve(context);
              queueAnimation(() => FABRenderer.render(context, freshActions));
            }
          }
        }, 120);
      }
      return;
    }
  } else {
    if (_confidenceInterval) { clearInterval(_confidenceInterval); _confidenceInterval = null; _confidenceLevel = 0; }
  }

  const isSelectionState = _currentFABState === 'selection_user' || _currentFABState === 'selection_assistant';
  if (isSelectionState && context.state !== 'selection') {
    if (!_deselectTimeout) {
      _deselectTimeout = setTimeout(async () => {
        _ignoreCount++;
        logTelemetry('FAB_IGNORED', { count: _ignoreCount });
        if (_ignoreCount >= 3 && !_inQuietMode) { _inQuietMode = true; logTelemetry('FAB_QUIET_MODE_ENTERED'); }
        const freshActions = await ActionResolver.resolve(context);
        const nextTarget = deriveFsmState(context, freshActions);
        if (transitionTo(nextTarget)) queueAnimation(() => FABRenderer.render(context, freshActions));
        _deselectTimeout = null;
      }, 300);
    }
    return;
  } else {
    if (_deselectTimeout) { clearTimeout(_deselectTimeout); _deselectTimeout = null; }
  }

  if (_currentFABState !== targetState) {
    if (_currentFABState === 'typing' && context.state !== 'typing') {
      _ignoreCount++;
      logTelemetry('FAB_IGNORED', { count: _ignoreCount });
      if (_ignoreCount >= 3 && !_inQuietMode) { _inQuietMode = true; logTelemetry('FAB_QUIET_MODE_ENTERED'); }
    }
    const freshTarget = _inQuietMode ? 'sleeping' : targetState;
    if (transitionTo(freshTarget)) queueAnimation(() => FABRenderer.render(context, actions));
  } else {
    queueAnimation(() => FABRenderer.render(context, actions));
  }
};

const executeActionWithLifecycle = async (actionId: string, context: FabContext) => {
  if (_currentFABState === 'processing') return;
  if (!transitionTo('processing')) return;
  FABRenderer.renderProcessing(actionId);
  try {
    await ActionRouter.dispatch(actionId, context);
    if (transitionTo('success')) {
      const msg = ['save_prompt', 'save_clipping', 'save_to_vault'].includes(actionId) ? 'Saved successfully' : 'Completed';
      FABRenderer.showSuccessToast(msg);
    }
  } catch (err) {
    console.error('[Promptium][Lifecycle] Action failed:', err);
    if (transitionTo('error')) {
      FABRenderer.showErrorState('Failed to process.', async () => { await executeActionWithLifecycle(actionId, context); });
    }
  }
};

// ─── Context FAB Init / Teardown ──────────────────────────────────────────────

const teardownContextFAB = () => {
  clearTrackedListeners();
  clearTrackedObservers();
  if (_confidenceInterval) { clearInterval(_confidenceInterval); _confidenceInterval = null; }
  if (_typingTimeout) { clearTimeout(_typingTimeout); _typingTimeout = null; }
  if (_deselectTimeout) { clearTimeout(_deselectTimeout); _deselectTimeout = null; }
  logTelemetry('FAB_TEARDOWN_COMPLETED');
};

const initContextFAB = () => {
  teardownContextFAB();
  addTrackedListener(document, 'selectionchange', () => void syncFABState());
  addTrackedListener(document, 'focusin', (e) => {
    const adapter = getCurrentAdapter();
    const composer = adapter?.getComposerElement();
    if (composer && (e.target === composer || composer.contains(e.target as Node))) void syncFABState();
  });
  addTrackedListener(document, 'focusout', (e) => {
    const adapter = getCurrentAdapter();
    const composer = adapter?.getComposerElement();
    if (composer && (e.target === composer || composer.contains(e.target as Node))) void syncFABState();
  });
  addTrackedListener(document, 'input', (e) => {
    const adapter = getCurrentAdapter();
    const composer = adapter?.getComposerElement();
    if (composer && (e.target === composer || composer.contains(e.target as Node))) void syncFABState();
  });
  const bodyObserver = new MutationObserver(() => void syncFABState());
  bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  addTrackedObserver(bodyObserver);
  void syncFABState();
};

// ─── Continuation Banners ─────────────────────────────────────────────────────

const hydratePendingBridge = async (platform: any) => {
  if (!(window as any).Bridge?.checkPendingBridge) return;
  const bridge = await ((window as any).Bridge as any).checkPendingBridge(platform);
  if (!bridge) return;
  try {
    const success = await (window as any).Injector.inject(String(bridge.text), platform);
    if (success) {
      const bridgeKey = ((window as any).Bridge as any)?.BRIDGE_KEY || 'pendingBridge';
      await chrome.storage.local.remove(bridgeKey);
    }
  } catch (err) { console.warn('[Promptium] Bridge hydration failed', err); }
};

const hydratePendingContinuation = async (platform: any) => {
  if (!(window as any).Continuation?.checkPending) return;
  const pending = await (window as any).Continuation.checkPending(platform);
  if (!pending) return;
  try {
    const success = await (window as any).Injector.inject(String(pending.text), platform);
    if (success) {
      const continuationKey = (window as any).Continuation?.CONTINUATION_KEY || 'pendingContinuation';
      await chrome.storage.local.remove(continuationKey);
    }
  } catch (err) { console.warn('[Promptium] Continuation hydration failed', err); }
};

// ─── Runtime Message Handler ──────────────────────────────────────────────────

const handleSelectionKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') void deactivateSelectionMode(handleSelectionKeyDown, syncFABState);
};

const undoInjectedPrompt = async () => {
  if (injectionUndoState.consumed || !injectionUndoState.platform) return;
  injectionUndoState.consumed = true;
  const currentText = await readComposerText(injectionUndoState.platform);
  if (currentText == null) { clearInjectionUndoState(); await notify('Undo unavailable: input not found.'); return; }
  const currentNormalized = normalizeComposerText(currentText);
  const injectedNormalized = normalizeComposerText(injectionUndoState.injectedText);
  if (currentNormalized !== injectedNormalized) { clearInjectionUndoState(); await notify('Undo unavailable: input changed.'); return; }
  const reverted = await (window as any).Injector.inject(injectionUndoState.previousText, injectionUndoState.platform);
  clearInjectionUndoState();
  await notify(reverted ? 'Injection undone.' : 'Undo failed.');
};

const onRuntimeMessage = (msg: any, _sender: any, sendResponse: any) => {
  void (async () => {
    let responded = false;
    const respond = (payload: any) => {
      if (responded) return;
      responded = true;
      try { sendResponse(payload); } catch (_) {}
    };
    try {
      const platform = getCurrentAdapter()?.id || null;
      if (msg?.action === 'GET_SELECTION' || msg?.type === 'GET_SELECTION') {
        respond({ text: String(window.getSelection()?.toString() || '').trim(), url: window.location.href, platform, sourceTitle: document.title || '' });
        return;
      }
      if (msg?.action === 'CHECK_ADAPTER_HEALTH' || msg?.type === 'CHECK_ADAPTER_HEALTH') {
        try {
          const adapter = getCurrentAdapter();
          const validation = adapter ? await adapter.validate() : null;
          respond({ ok: true, healthy: Boolean(validation && validation.healthy) });
        } catch (_) { respond({ ok: true, healthy: false }); }
        return;
      }
      if (msg?.action === 'SHOW_TOAST' || msg?.type === 'SHOW_TOAST') {
        if (msg.type === 'error' || msg.toastType === 'error') toast.error(msg.text);
        else if (msg.type === 'success' || msg.toastType === 'success') toast.success(msg.text);
        else toast.info(msg.text);
        respond({ ok: true }); return;
      }
      if (msg?.action === 'INJECT_PROMPT' || msg?.type === 'INJECT_PROMPT') {
        const nextText = String(msg?.text || '');
        const previousText = await readComposerText(platform);
        const success = await (window as any).Injector.inject(nextText, platform);
        if (success && previousText != null) {
          stageInjectionUndo(platform, previousText, nextText, undoInjectedPrompt);
        }
        respond({ ok: success }); return;
      }
      if (msg?.action === 'EXPORT_CHAT' || msg?.type === 'EXPORT_CHAT') {
        await handleExportChat(msg, platform, respond); return;
      }
      if (msg?.action === 'GET_PLATFORM' || msg?.type === 'GET_PLATFORM') {
        await handleGetPlatform(platform, respond); return;
      }
      if (msg?.action === 'OPEN_SIDEPANEL_ALL') {
        respond(await openSidePanelWithAllMessages()); return;
      }
      if (msg?.action === 'SCRAPE_FOR_BRIDGE') {
        await handleScrapeForBridge(platform, respond); return;
      }
      if (msg?.action === 'SCRAPE_FOR_CONTINUATION') {
        await handleScrapeForContinuation(platform, respond); return;
      }
      if (msg?.action === 'ACTIVATE_SELECTION_MODE') {
        await ensureSelectionModeActive(handleSelectionKeyDown, ensureSelectionFabFn, attachSelectionObserver, syncFABState);
        respond({ ok: true }); return;
      }
      if (msg?.action === 'DEACTIVATE_SELECTION_MODE') {
        await deactivateSelectionMode(handleSelectionKeyDown, syncFABState);
        respond({ ok: true }); return;
      }
      if (msg?.action === 'ACTIVATE_SELECTION_ALL') {
        const ok = await activateSelectionModeAll(
          () => ensureSelectionModeActive(handleSelectionKeyDown, ensureSelectionFabFn, attachSelectionObserver, syncFABState),
          syncFABState
        );
        respond({ ok }); return;
      }
      respond({ ok: false, error: `Unknown action: ${msg?.action}` });
    } catch (err) {
      console.error('[Promptium][Message] Handler failed:', err);
      respond({ ok: false, error: String(err) });
    }
  })();
  return true; // Keep channel open for async responses
};

// ─── Liveness Helpers ─────────────────────────────────────────────────────────

const looksLikeCode = (text: string): boolean => {
  return [
    /function\s+\w+\s*\(/i, /import\s+[\s\S]+?\s+from\s+['"]/i,
    /const\s+\w+\s*=/i, /let\s+\w+\s*=/i, /class\s+\w+/i,
    /def\s+\w+\s*\(/i, /fn\s+\w+\s*\(/i, /\{\s*[\s\S]*?\}/, /;\s*$/m, /\/\//,
  ].some((re) => re.test(text));
};

// ─── Lifecycle ────────────────────────────────────────────────────────────────

const cleanup = async () => {
  clearInjectionUndoState();
  await deactivateSelectionMode(handleSelectionKeyDown, syncFABState);
  teardownContextFAB();
  if (exportSelectionState.urlWatchTimer) {
    clearInterval(exportSelectionState.urlWatchTimer);
    exportSelectionState.urlWatchTimer = null;
  }
};

export const init = async () => {
  const platform = getCurrentAdapter()?.id || null;
  if (!platform) return;

  await hydratePendingBridge(platform);
  await hydratePendingContinuation(platform);
  if ((window as any).Clippings?.init) await (window as any).Clippings.init(platform);

  // Initialize export selection UI with URL watcher
  exportSelectionState.platform = platform;
  if (getCurrentAdapter()) {
    exportSelectionState.urlWatchTimer = setInterval(() => {
      void (async () => {
        if (window.location.href !== exportSelectionState.lastUrl) {
          exportSelectionState.lastUrl = window.location.href;
          exportSelectionState.selectedIds.clear();
          exportSelectionState.messageOrder = [];
          exportSelectionState.messagesById = new Map();
          if (exportSelectionState.selectionModeActive) await attachSelectionObserver();
          await syncFABState();
          return;
        }
        if (exportSelectionState.observerRoot && !exportSelectionState.observerRoot.isConnected) {
          await attachSelectionObserver();
        }
      })();
    }, URL_WATCH_INTERVAL_MS) as any;
  }

  initContextFAB();

  if ((window as any).PromptSuggestions?.init) {
    try {
      const snap = await chrome.storage.local.get('promptiumSettings');
      (window as any).PromptSuggestions.init(snap?.promptiumSettings || {});
    } catch (_) {}
  }

  window.__PN.SidePanelExport = {
    openPanelOnly: openSidePanelOnly,
    openWithSelection: openSidePanelWithSelection,
    openWithAllMessages: openSidePanelWithAllMessages,
    activateSelectionModeAll: () =>
      activateSelectionModeAll(
        () => ensureSelectionModeActive(handleSelectionKeyDown, ensureSelectionFabFn, attachSelectionObserver, syncFABState),
        syncFABState
      ),
    getSelectedMessages: buildSelectedMessages,
  };

  const syncHighlightSettings = async () => {
    try {
      const snap = (await chrome.storage.local.get('promptiumSettings')) as any;
      exportSelectionState.chatHighlightStyle = snap?.promptiumSettings?.chatHighlightStyle || 'solid';
      getSelectionControls().forEach((entry: any) => {
        setControlChecked(entry, entry.host?.getAttribute('data-checked') === 'true');
      });
    } catch (_) {}
  };

  chrome.storage.local.onChanged.addListener((changes) => {
    if (changes.promptiumSettings) {
      void syncHighlightSettings();
      const newSettings = (changes.promptiumSettings.newValue || {}) as any;
      (window as any).PromptSuggestions?.setEnabled(newSettings?.featureFlags?.smartSuggestions !== false);
    }
  });

  await syncHighlightSettings();

  document.addEventListener('contextmenu', () => {
    const selection = window.getSelection()?.toString() || '';
    if (selection.trim()) {
      chrome.runtime.sendMessage({
        action: 'UPDATE_CONTEXT_MENU_TITLES',
        isCode: looksLikeCode(selection),
        selectionLength: selection.length,
      }).catch(() => {});
    }
  });

  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  window.addEventListener('beforeunload', () => void cleanup(), { once: true });
};

// Initialize the global __PN namespace
if (typeof window !== 'undefined') {
  window.__PN = window.__PN || {};
}
