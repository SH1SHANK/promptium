/**
 * content/selection/selection.ts
 * Owns: message checkbox injection, selection-mode lifecycle, drag/shift-select,
 * message node scanning, DOM traversal helpers, and side panel payload building.
 */
import { getCurrentAdapter } from '../../platform';
import { notify } from '../integration/messaging';
import { exportSelectionState, SELECTION_SHADOW_HOST_ID } from '../state';

// Inline shadow CSS is self-contained here as it owns the selection UI
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
  :host-context(.selectable-message--relative:hover) {
    opacity: 0.85; transform: scale(1) translateX(0); pointer-events: auto;
  }
  :host([data-visible="true"]) { opacity: 0.9; transform: scale(1) translateX(0); pointer-events: auto; }
  :host([data-checked="true"]) { opacity: 1; transform: scale(1) translateX(0); pointer-events: auto; }
  .pn-inline-wrapper { display:flex; flex-direction:column; align-items:center; gap:4px; }
  .pn-inline-select {
    width:22px; height:22px; border-radius:6px;
    background:rgba(24,24,27,0.85); border:1.5px solid rgba(255,255,255,0.25);
    backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px);
    display:inline-flex; align-items:center; justify-content:center;
    cursor:pointer; box-sizing:border-box; user-select:none;
    transition:background 0.15s,border-color 0.15s;
  }
  .pn-inline-select:hover { border-color:rgba(20,184,166,0.8); background:rgba(20,184,166,0.1); }
  .pn-inline-select.pn-checked { background:rgba(20,184,166,0.18); border-color:rgba(20,184,166,0.9); }
  .pn-inline-check { position:absolute; opacity:0; pointer-events:none; }
  .pn-inline-mark {
    width:10px; height:10px; border-radius:3px; border:1.5px solid rgba(255,255,255,0.6);
    box-sizing:border-box; transition:background 150ms cubic-bezier(0.2,0,0.2,1),border-color 150ms cubic-bezier(0.2,0,0.2,1);
  }
  .pn-inline-check:checked + .pn-inline-mark {
    background:#14b8a6; border-color:#14b8a6; box-shadow:0 0 6px rgba(20,184,166,0.4);
  }
  .pn-inline-split-toggle {
    border:none; background:rgba(24,24,27,0.85); border:1px solid rgba(255,255,255,0.15);
    border-radius:4px; color:#a1a1aa; cursor:pointer; font-size:11px; padding:2px 5px;
    transition:background 0.15s;
  }
  .pn-inline-split-toggle:hover { background:rgba(20,184,166,0.12); color:#14b8a6; }
`;

// ─── DOM Query Helpers ────────────────────────────────────────────────────────

export const safeQuery = async (selector: any, root: any = document) => {
  if (!selector || typeof selector !== 'string') return null;
  try {
    return root.querySelector(selector);
  } catch (_) {
    return null;
  }
};

export const safeQueryAllInScope = async (selector: any, root: any = document) => {
  if (!selector || typeof selector !== 'string') return [];
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch (_) {
    return [];
  }
};

export const sortContentNodesByDomOrder = async (nodes: any[]) => {
  return [...nodes].sort((l, r) => {
    if (l === r) return 0;
    const rel = l.compareDocumentPosition(r);
    if (rel & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    return 0;
  });
};

export const ensureMessageNodeId = async (node: any) => {
  if (node.dataset.pnMessageId) return node.dataset.pnMessageId;
  exportSelectionState.sequence += 1;
  const nextId = `pn-msg-${Date.now()}-${exportSelectionState.sequence}`;
  node.dataset.pnMessageId = nextId;
  return nextId;
};

export const getSanitizedMessageHtml = async (node: any) => {
  if (!node) return '';
  const clone = node.cloneNode(true);
  clone
    .querySelectorAll('.pn-inline-select, .pn-inline-select-host')
    .forEach((n: any) => n.remove());
  clone
    .querySelectorAll('script, style, iframe, object, embed, link, meta')
    .forEach((n: any) => n.remove());
  clone.querySelectorAll('*').forEach((element: any) => {
    Array.from(element.attributes).forEach((attribute: any) => {
      const name = String(attribute.name || '').toLowerCase();
      const value = String(attribute.value || '').trim();
      if (name.startsWith('on') || name === 'style') {
        element.removeAttribute(attribute.name);
        return;
      }
      if (['href', 'src', 'xlink:href', 'formaction'].includes(name)) {
        const normalized = value.toLowerCase();
        if (!normalized) {
          element.removeAttribute(attribute.name);
          return;
        }
        if (
          normalized.startsWith('#') ||
          normalized.startsWith('/') ||
          normalized.startsWith('./') ||
          normalized.startsWith('../')
        )
          return;
        const allowedSchemes = ['http:', 'https:', 'mailto:', 'tel:'];
        try {
          const url = new URL(value, window.location.href);
          if (!allowedSchemes.includes(url.protocol)) element.removeAttribute(attribute.name);
        } catch (_) {
          element.removeAttribute(attribute.name);
        }
      }
    });
  });
  return String(clone.innerHTML || '').trim();
};

export const readMessageNode = async (node: any, role: string, order: any) => {
  if (!node || typeof node.matches !== 'function') return null;
  const text = String(node.innerText || node.textContent || '').trim();
  if (!text) return null;
  const id = await ensureMessageNodeId(node);
  return { id, role, text, html: await getSanitizedMessageHtml(node), order };
};

// ─── Shadow Root Helpers ──────────────────────────────────────────────────────

export const ensureSelectionShadowRoot = () => {
  let host = document.getElementById(SELECTION_SHADOW_HOST_ID);
  if (!(host instanceof HTMLElement)) {
    host = document.createElement('div');
    host.id = SELECTION_SHADOW_HOST_ID;
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483641;';
    document.documentElement.appendChild(host);
  }
  if (!host.shadowRoot) host.attachShadow({ mode: 'open' });
  return host.shadowRoot;
};

export const getSelectionControls = () =>
  Array.from(document.querySelectorAll('.pn-inline-select-host'))
    .map((host) => {
      if (!(host instanceof HTMLElement)) return null;
      const input = host.shadowRoot?.querySelector('.pn-inline-check') || null;
      const control = host.shadowRoot?.querySelector('.pn-inline-select') || null;
      const messageId = String(host.dataset.messageId || '').trim();
      return { host, input, control, messageId };
    })
    .filter(Boolean);

export const setControlChecked = (entry: any, checked: any) => {
  if (!entry) return;
  const bool = Boolean(checked);
  if (entry.input instanceof HTMLInputElement) entry.input.checked = bool;
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

export const syncSelectionClassesAndControls = () => {
  getSelectionControls().forEach((entry: any) => {
    if (!entry?.messageId) return;
    setControlChecked(entry, exportSelectionState.selectedIds.has(entry.messageId));
  });
};

export const setAllSelectionControls = (checked: any) => {
  getSelectionControls().forEach((entry) => setControlChecked(entry, checked));
};

// ─── Message Checkbox ─────────────────────────────────────────────────────────

export const ensureMessageCheckbox = async (
  node: any,
  messageId: any,
  updateSelectionFabFn: () => Promise<void>
) => {
  if (!(node instanceof HTMLElement)) return;

  const existingHost = node.querySelector(':scope > .pn-inline-select-host');
  if (existingHost instanceof HTMLElement) {
    existingHost.dataset.messageId = messageId;
    const existingInput = existingHost.shadowRoot?.querySelector('.pn-inline-check') || null;
    const existingControl = existingHost.shadowRoot?.querySelector('.pn-inline-select') || null;
    const splitBtn = existingHost.shadowRoot?.querySelector('.pn-inline-split-toggle');
    if (splitBtn) {
      const group = exportSelectionState.groups?.find((g: any) => g.messageIds.includes(messageId));
      if (group && group.messageIds.length > 1) {
        splitBtn.textContent = group.split ? '🔗' : '✂️';
        splitBtn.setAttribute(
          'title',
          group.split ? 'Group messages in this turn' : 'Select messages in this turn independently'
        );
      } else {
        splitBtn.remove();
      }
    }
    setControlChecked(
      { host: existingHost, input: existingInput, control: existingControl, messageId },
      exportSelectionState.selectedIds.has(messageId)
    );
    return;
  }

  if (window.getComputedStyle(node).position === 'static') {
    node.classList.add('selectable-message--relative');
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
          const clickedChecked = exportSelectionState.selectedIds.has(messageId);
          for (const id of group.messageIds) {
            if (clickedChecked) exportSelectionState.selectedIds.add(id);
            else exportSelectionState.selectedIds.delete(id);
          }
        }
        void scanSelectionTargets(updateSelectionFabFn);
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

    const toggleMessage = (id: string, checked: boolean) => {
      if (checked) exportSelectionState.selectedIds.add(id);
      else exportSelectionState.selectedIds.delete(id);
    };

    const handleValueChange = (checked: boolean, isShift: boolean) => {
      if (isShift && exportSelectionState.lastClickedId) {
        const lastIdx = exportSelectionState.messageOrder.indexOf(
          exportSelectionState.lastClickedId
        );
        const currIdx = exportSelectionState.messageOrder.indexOf(messageId);
        if (lastIdx !== -1 && currIdx !== -1) {
          const start = Math.min(lastIdx, currIdx);
          const end = Math.max(lastIdx, currIdx);
          for (let i = start; i <= end; i++) {
            const id = exportSelectionState.messageOrder[i];
            if (id !== undefined) toggleMessage(id, checked);
          }
        }
      } else {
        const activeGroup = exportSelectionState.groups?.find((g: any) =>
          g.messageIds.includes(messageId)
        );
        if (activeGroup && !activeGroup.split) {
          for (const id of activeGroup.messageIds) toggleMessage(id, checked);
        } else {
          toggleMessage(messageId, checked);
        }
      }
      exportSelectionState.lastClickedId = messageId;
      syncSelectionClassesAndControls();
      void updateSelectionFabFn();
    };

    checkbox.addEventListener('change', (event) => {
      const target = event.currentTarget;
      if (target instanceof HTMLInputElement) handleValueChange(target.checked, false);
    });
    checkbox.addEventListener('click', (event: MouseEvent) => {
      if (event.shiftKey) handleValueChange(checkbox.checked, true);
    });

    if (control) {
      control.addEventListener('mousedown', ((e: MouseEvent) => {
        e.stopPropagation();
        exportSelectionState.isDragging = true;
        exportSelectionState.dragChecked = !checkbox.checked;
        handleValueChange(exportSelectionState.dragChecked, e.shiftKey);
      }) as EventListener);
      control.addEventListener('mouseenter', () => {
        if (exportSelectionState.isDragging)
          handleValueChange(exportSelectionState.dragChecked, false);
      });
    }
  }

  control?.addEventListener('click', (event) => event.stopPropagation());
  node.addEventListener('mouseenter', () => {
    if (host.dataset.checked !== 'true') host.dataset.visible = 'true';
  });
  node.addEventListener('mouseleave', () => {
    if (host.dataset.checked !== 'true') host.dataset.visible = 'false';
  });
  node.appendChild(host);
};

// ─── Scan & Collection ────────────────────────────────────────────────────────

export const pruneMissingSelections = async (currentIds: any) => {
  const missing = new Set<string>();
  exportSelectionState.selectedIds.forEach((id) => {
    if (!currentIds.has(id)) missing.add(id);
  });
  if (missing.size > 0) {
    missing.forEach((id) => exportSelectionState.selectedIds.delete(id));
  }
};

export const collectChatMessageNodes = async () => {
  const adapter = getCurrentAdapter();
  if (!adapter) return [];
  const elements = await adapter.getMessageElements();
  return sortContentNodesByDomOrder(elements);
};

export const scanSelectionTargets = async (updateSelectionFabFn?: () => Promise<void>) => {
  const adapter = getCurrentAdapter();
  if (!adapter) return;

  const messageNodes = await collectChatMessageNodes();
  const seenIds = new Set<string>();
  const newOrder: string[] = [];
  const groups: any[] = [];

  for (const node of messageNodes) {
    const id = await ensureMessageNodeId(node);
    const role = adapter.isUserMessage(node as HTMLElement) ? 'user' : 'assistant';
    const message = await readMessageNode(node, role, newOrder.length);
    if (message) {
      exportSelectionState.messagesById.set(id, message);
      newOrder.push(id);
      seenIds.add(id);
    }
    if (exportSelectionState.selectionModeActive && updateSelectionFabFn) {
      await ensureMessageCheckbox(node, id, updateSelectionFabFn);
    }
  }

  exportSelectionState.messageOrder = newOrder;
  await pruneMissingSelections(seenIds);
  syncSelectionClassesAndControls();
};

// ─── Selected Message Payload Builder ────────────────────────────────────────

export const buildSelectedMessages = () =>
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

// ─── Selection Mode Lifecycle ─────────────────────────────────────────────────

export const ensureSelectionModeActive = async (
  handleSelectionKeyDown: (e: KeyboardEvent) => void,
  ensureSelectionFabFn: () => Promise<void>,
  attachSelectionObserverFn: () => Promise<void>,
  updateSelectionFabFn: () => Promise<void>
) => {
  if (exportSelectionState.selectionModeActive) return;
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
      body.pn-export-selection-active .pn-message-selected { opacity:1!important; background-color:rgba(20,184,166,0.08)!important; box-shadow:inset 4px 0 0 #14b8a6!important; }
      body.pn-export-selection-active [data-message-author-role]:hover,
      body.pn-export-selection-active .human-turn:hover,
      body.pn-export-selection-active .assistant-turn:hover,
      body.pn-export-selection-active [data-testid="user-message"]:hover,
      body.pn-export-selection-active [data-content="user-message"]:hover,
      body.pn-export-selection-active .user-query-bubble-with-background:hover,
      body.pn-export-selection-active [data-turn-role]:hover { opacity:0.8!important; }
    `;
    document.head.appendChild(styleEl);
  }

  window.addEventListener('keydown', handleSelectionKeyDown);
  await ensureSelectionFabFn();
  await attachSelectionObserverFn();
  await scanSelectionTargets(updateSelectionFabFn);
};

export const deactivateSelectionMode = async (
  handleSelectionKeyDown: (e: KeyboardEvent) => void,
  syncFABStateFn: () => Promise<void>
) => {
  exportSelectionState.selectionModeActive = false;
  document.body.classList.remove('pn-export-selection-active');
  document.getElementById('pn-export-selection-style')?.remove();
  window.removeEventListener('keydown', handleSelectionKeyDown);

  document.querySelectorAll('.pn-inline-select-host').forEach((host) => host.remove());
  document.querySelectorAll('.pn-message-selected').forEach((node) => {
    node.classList.remove(
      'pn-message-selected',
      'pn-chat-highlight-solid',
      'pn-chat-highlight-dotted'
    );
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
  void syncFABStateFn();
};

// ─── Side Panel Openers ───────────────────────────────────────────────────────

export const openSidePanelWithSelection = () => {
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
    chrome.runtime.sendMessage({ action: 'SET_SIDEPANEL_PAYLOAD', payload }, (response) => {
      if (!response?.ok) console.warn('[Promptium] Side panel payload issue:', response?.error);
    });
    return { ok: true };
  } catch (error) {
    notify((error as any)?.message || 'Failed to prepare Promptium export.').catch(console.error);
    return { ok: false, error: (error as any)?.message || 'Failed to open side panel.' };
  }
};

export const openSidePanelOnly = () => ({ ok: true });

export const openSidePanelWithAllMessages = async () => {
  const platform = String(exportSelectionState.platform || 'unknown');
  const messages = await (window as any).Scraper.scrape(platform);
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
    const response = await chrome.runtime.sendMessage({ action: 'SET_SIDEPANEL_PAYLOAD', payload });
    if (!response?.ok)
      return { ok: false, error: response?.error || 'Failed to stage full export payload.' };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: (error as any)?.message || 'Failed to prepare full export payload.',
    };
  }
};

export const activateSelectionModeAll = async (
  ensureSelectionModeActiveFn: () => Promise<void>,
  updateSelectionFabFn: () => Promise<void>
) => {
  await ensureSelectionModeActiveFn();
  if (!exportSelectionState.messageOrder.length) {
    notify('No messages found in this chat.').catch(console.error);
    return false;
  }
  exportSelectionState.selectedIds = new Set(exportSelectionState.messageOrder);
  setAllSelectionControls(true);
  updateSelectionFabFn().catch(console.error);
  return true;
};

// Global drag-end listener
if (typeof window !== 'undefined') {
  window.addEventListener('mouseup', () => {
    exportSelectionState.isDragging = false;
  });
}
