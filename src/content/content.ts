import { getCurrentAdapter } from '../platforms';
import { toast } from '../utils/toast';

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
      left: -20px;
      z-index: 2147483642;
      width: 20px;
      height: 20px;
      opacity: 0;
      transform: scale(0.9) translateX(-4px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
    }
    :host-context(.pn-selectable-message--relative:hover) {
      opacity: 0.55;
      transform: scale(1) translateX(0);
      pointer-events: auto;
    }
    :host([data-visible="true"]) {
      opacity: 0.8;
      transform: scale(1) translateX(0);
      pointer-events: auto;
    }
    :host([data-checked="true"]) {
      opacity: 1;
      transform: scale(1) translateX(0);
      pointer-events: auto;
    }
    .pn-inline-select {
      width: 100%;
      height: 100%;
      border-radius: 6px;
      background: rgba(24, 24, 27, 0.72);
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

    /* Transparent bridge to connect hover area seamlessly to the message body */
    .pn-inline-select::after {
      content: '';
      position: absolute;
      top: -10px;
      right: -20px;
      bottom: -10px;
      left: -10px;
      z-index: -1;
    }
    .pn-inline-select:hover {
      border-color: rgba(54, 214, 195, 0.8);
      background: rgba(54, 214, 195, 0.1);
    }
    .pn-inline-select.pn-checked {
      background: rgba(54, 214, 195, 0.18);
      border-color: rgba(54, 214, 195, 0.9);
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
      transition: background 150ms cubic-bezier(0.2, 0, 0.2, 1), border-color 150ms cubic-bezier(0.2, 0, 0.2, 1), box-shadow 150ms cubic-bezier(0.2, 0, 0.2, 1);
    }
    .pn-inline-check:checked + .pn-inline-mark {
      background: #36d6c3;
      border-color: #36d6c3;
      box-shadow: 0 0 6px rgba(54, 214, 195, 0.4);
    }
  `;

  const SELECTION_FAB_SHADOW_CSS = `
    #pn-selection-fab {
      position: fixed;
      left: 50%;
      bottom: 20px;
      transform: translateX(-50%);
      z-index: 2147483643;
      pointer-events: auto;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(24, 24, 27, 0.95);
      color: #e4e4e7;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 6px 8px 6px 14px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      font-family: Outfit, Avenir Next, Segoe UI, sans-serif;
    }
    #pn-selection-fab.pn-hidden {
      display: none;
    }
    .pn-selection-fab__count {
      margin: 0;
      font-size: 12px;
      font-weight: 500;
      color: #a1a1aa;
      white-space: nowrap;
    }
    .pn-selection-fab__divider {
      width: 1px;
      height: 20px;
      background: rgba(255, 255, 255, 0.08);
      flex-shrink: 0;
    }
    .pn-selection-fab__btn {
      border: none;
      border-radius: 8px;
      padding: 6px 12px;
      font-family: inherit;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .pn-selection-fab__btn--primary {
      background: #14b8a6;
      color: #fff;
    }
    .pn-selection-fab__btn--ghost {
      background: rgba(255, 255, 255, 0.06);
      color: #a1a1aa;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .pn-selection-fab__btn--ghost:hover,
    .pn-selection-fab__btn--primary:hover {
      filter: brightness(1.08);
    }
    .pn-selection-fab__close {
      width: 26px;
      height: 26px;
      border-radius: 6px;
      border: none;
      background: rgba(255, 255, 255, 0.04);
      color: #71717a;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pn-selection-fab__close:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #e4e4e7;
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
      <label class="pn-inline-select">
        <input type="checkbox" class="pn-inline-check" aria-label="Select message for Promptium export" />
        <span class="pn-inline-mark"></span>
      </label>
    `;

    const checkbox = shadowRoot.querySelector('.pn-inline-check');
    const control = shadowRoot.querySelector('.pn-inline-select');

    if (checkbox instanceof HTMLInputElement) {
      setControlChecked(
        { host, input: checkbox, control, messageId },
        exportSelectionState.selectedIds.has(messageId)
      );

      checkbox.addEventListener('change', (event) => {
        const target = event.currentTarget;
        if (!(target instanceof HTMLInputElement)) {
          return;
        }

        if (target.checked) {
          exportSelectionState.selectedIds.add(messageId);
        } else {
          exportSelectionState.selectedIds.delete(messageId);
        }

        setControlChecked({ host, input: checkbox, control, messageId }, target.checked);
        void updateSelectionFab();
      });
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

  /** Enables selection mode only when explicitly requested by the user. */
  const ensureSelectionModeActive = async () => {
    if (exportSelectionState.selectionModeActive) {
      return;
    }

    exportSelectionState.selectionModeActive = true;
    await ensureSelectionFab();
    await attachSelectionObserver();
    await scanSelectionTargets();
  };

  /** Creates the floating selection bar once and wires all action handlers. */
  const ensureSelectionFab = async () => {
    const shadowRoot = ensureSelectionShadowRoot();
    if (!shadowRoot) return;
    if (shadowRoot.getElementById('pn-selection-fab')) {
      return;
    }

    const style = document.createElement('style');
    style.textContent = SELECTION_FAB_SHADOW_CSS;
    shadowRoot.appendChild(style);

    const root = document.createElement('div');
    root.id = 'pn-selection-fab';
    root.className = 'pn-selection-fab pn-hidden';

    const count = document.createElement('p');
    count.id = 'pn-selection-fab-count';
    count.className = 'pn-selection-fab__count';
    count.textContent = '0 of 0';
    root.appendChild(count);

    const divider = document.createElement('span');
    divider.className = 'pn-selection-fab__divider';
    root.appendChild(divider);

    const selectAllBtn = document.createElement('button');
    selectAllBtn.id = 'pn-fab-select-all';
    selectAllBtn.className = 'pn-selection-fab__btn pn-selection-fab__btn--ghost';
    selectAllBtn.type = 'button';
    selectAllBtn.textContent = 'Select All';
    root.appendChild(selectAllBtn);

    const deselectBtn = document.createElement('button');
    deselectBtn.id = 'pn-fab-deselect';
    deselectBtn.className = 'pn-selection-fab__btn pn-selection-fab__btn--ghost';
    deselectBtn.type = 'button';
    deselectBtn.textContent = 'Deselect';
    root.appendChild(deselectBtn);

    const exportBtn = document.createElement('button');
    exportBtn.id = 'pn-selection-fab-trigger';
    exportBtn.className = 'pn-selection-fab__btn pn-selection-fab__btn--primary';
    exportBtn.type = 'button';
    exportBtn.textContent = 'Export';
    root.appendChild(exportBtn);

    const dismissBtn = document.createElement('button');
    dismissBtn.id = 'pn-fab-dismiss';
    dismissBtn.className = 'pn-selection-fab__close';
    dismissBtn.type = 'button';
    dismissBtn.setAttribute('aria-label', 'Dismiss selection');
    dismissBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    root.appendChild(dismissBtn);

    // Export Selected
    root.querySelector('#pn-selection-fab-trigger')?.addEventListener('click', (event) => {
      event.stopPropagation();
      try {
        chrome.runtime.sendMessage({ action: 'OPEN_SIDEPANEL' });
        openSidePanelWithSelection();
      } catch (error) {
        console.error('[Promptium] Failed to trigger export selection.', error);
      }
    });

    // Select All
    root.querySelector('#pn-fab-select-all')?.addEventListener('click', (event) => {
      event.stopPropagation();
      exportSelectionState.selectedIds = new Set(exportSelectionState.messageOrder);
      setAllSelectionControls(true);
      void updateSelectionFab();
    });

    // Deselect All
    root.querySelector('#pn-fab-deselect')?.addEventListener('click', (event) => {
      event.stopPropagation();
      exportSelectionState.selectedIds.clear();
      setAllSelectionControls(false);
      void updateSelectionFab();
    });

    // Dismiss / Close
    root.querySelector('#pn-fab-dismiss')?.addEventListener('click', (event) => {
      event.stopPropagation();
      exportSelectionState.selectedIds.clear();
      setAllSelectionControls(false);
      root.classList.add('pn-hidden');
    });

    shadowRoot.appendChild(root);
    const countNode = root.querySelector('#pn-selection-fab-count');
    if (countNode) {
      countNode.setAttribute('role', 'status');
      countNode.setAttribute('aria-live', 'polite');
    }
  };

  /** Syncs floating selection bar visibility and count label with selection state. */
  const updateSelectionFab = async () => {
    await ensureSelectionFab();
    const root = getSelectionFabNode();
    const count = getSelectionCountNode();

    if (!root || !count) {
      return;
    }

    const selectedCount = exportSelectionState.selectedIds.size;
    const totalCount = exportSelectionState.messageOrder.length;
    count.textContent = `${selectedCount} of ${totalCount}`;
    root.classList.toggle('pn-hidden', selectedCount === 0);
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
      (node) => !uniqueNodes.some((candidate: any) => candidate !== node && candidate.contains(node))
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

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const role = roleMap.get(node) || 'user';
      const row = await readMessageNode(node, role, index);

      if (!row) {
        continue;
      }

      nextOrder.push(row.id);
      nextMessagesById.set(row.id, row);
      await ensureMessageCheckbox(node, row.id);
    }

    exportSelectionState.messageOrder = nextOrder;
    exportSelectionState.messagesById = nextMessagesById;
    await pruneMissingSelections(new Set(nextOrder));

    getSelectionControls().forEach((entry: any) => {
      if (!entry?.messageId) return;
      setControlChecked(entry, exportSelectionState.selectedIds.has(entry.messageId));
    });

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

    await ensureSelectionModeActive();
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

  /** Disconnects observers and timers when the page unloads. */
  const cleanup = async () => {
    clearInjectionUndoState();

    document.querySelectorAll('.pn-inline-select-host').forEach((host) => host.remove());
    document.getElementById(SELECTION_SHADOW_HOST_ID)?.remove();

    if (exportSelectionState.scanTimer) {
      clearTimeout(exportSelectionState.scanTimer);
      exportSelectionState.scanTimer = null;
    }

    if (exportSelectionState.urlWatchTimer) {
      clearInterval(exportSelectionState.urlWatchTimer);
      exportSelectionState.urlWatchTimer = null;
    }

    if (exportSelectionState.observer) {
      exportSelectionState.observer.disconnect();
      exportSelectionState.observer = null;
      exportSelectionState.observerRoot = null;
    }

    exportSelectionState.selectionModeActive = false;
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
    if (window.Bookmarks?.init) {
      await window.Bookmarks.init(platform);
    }
    await initExportSelectionUi(platform);

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
        const snap = await chrome.storage.local.get('promptiumSettings') as any;
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

  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  void init();
})();
