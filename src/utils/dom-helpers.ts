(() => {
  /**
   * File: utils/dom-helpers.js
   * Purpose: Shared DOM utility functions used across popup, sidepanel, toolbar, and content scripts.
   * Eliminates duplication of showToast, createEmptyState, createTagPill, byId, and sortNodesByDomOrder.
   */

  /** Returns a required DOM node by id. */
  const byId = (id: string) => document.getElementById(id);
  const TOAST_DURATION_SUCCESS_MS = 2500;
  const TOAST_DURATION_ERROR_MS = 4000;
  const TOAST_MAX_LENGTH = 80;
  const toastQueue: { message: string; kind: string; resolve: (value?: any) => void }[] = [];
  let activeToast: HTMLElement | null = null;

  const normalizeToastText = (value: any) => {
    const trimmed = String(value || '')
      .replace(/!/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const text = trimmed || 'Done';
    const sentenceCase = text.charAt(0).toUpperCase() + text.slice(1);
    if (sentenceCase.length <= TOAST_MAX_LENGTH) {
      return sentenceCase;
    }
    return `${sentenceCase.slice(0, TOAST_MAX_LENGTH - 1).trimEnd()}…`;
  };

  const isErrorToast = (value: any) =>
    /\b(error|failed|invalid|unable|retry|missing|expired|quota|cannot|could not|unavailable)\b/i.test(
      String(value || '')
    );

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const flushToastQueue = async () => {
    if (activeToast) return;

    while (toastQueue.length) {
      while (document.querySelector('.pn-toast--undo')) {
        await wait(120);
      }

      const next = toastQueue.shift();
      if (!next) continue;

      const { message, kind, resolve } = next;
      const inferredError = kind === 'error' || (kind !== 'success' && isErrorToast(message));
      const inferredSuccess = !inferredError && (kind === 'success' || !isErrorToast(message));
      const toast = document.createElement('div');
      const toastClass = inferredError
        ? ' pn-toast--error'
        : inferredSuccess
          ? ' pn-toast--success'
          : '';
      toast.className = `pn-toast${toastClass}`;
      toast.textContent = normalizeToastText(message);
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      activeToast = toast;
      document.body.appendChild(toast);

      await wait(inferredError ? TOAST_DURATION_ERROR_MS : TOAST_DURATION_SUCCESS_MS);
      toast.remove();
      activeToast = null;
      resolve();
    }
  };

  /** Creates and displays a short-lived toast message. */
  const showToast = (message: string, options: any = {}) =>
    new Promise((resolve) => {
      toastQueue.push({
        message,
        kind: String(options?.kind || '')
          .trim()
          .toLowerCase(),
        resolve,
      });
      void flushToastQueue();
    });

  /** Builds reusable empty state markup with icon, copy, and optional action button. */
  const createEmptyState = (messageOrConfig: any, maybeOptions: any = {}) => {
    const isConfig =
      messageOrConfig && typeof messageOrConfig === 'object' && !Array.isArray(messageOrConfig);
    const title = isConfig ? String((messageOrConfig as any).title || '').trim() : '';
    const message = isConfig
      ? String((messageOrConfig as any).message || '').trim()
      : String(messageOrConfig || '').trim();
    const actionLabel = isConfig
      ? String((messageOrConfig as any).actionLabel || '').trim()
      : String(maybeOptions.actionLabel || '').trim();
    const onAction = isConfig ? (messageOrConfig as any).onAction : maybeOptions.onAction;

    const stateNode = document.createElement('div');
    stateNode.className = 'pn-empty-state';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 64 64');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('class', 'pn-empty-state__illustration');
    icon.setAttribute('aria-hidden', 'true');

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '32');
    circle.setAttribute('cy', '32');
    circle.setAttribute('r', '30');
    circle.setAttribute('fill', 'var(--surface-sunken, #F3F4F6)');

    const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path1.setAttribute('d', 'M20 22h24v24H20z');
    path1.setAttribute('fill', 'var(--surface, #FFFFFF)');
    path1.setAttribute('stroke', 'var(--border, #E5E7EB)');
    path1.setAttribute('stroke-width', '2');
    path1.setAttribute('stroke-linejoin', 'round');

    const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path2.setAttribute('d', 'M26 28h12M26 34h8');
    path2.setAttribute('stroke', 'var(--text-muted, #9CA3AF)');
    path2.setAttribute('stroke-width', '2');
    path2.setAttribute('stroke-linecap', 'round');

    const spark = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    spark.setAttribute('d', 'M46 16l2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4z');
    spark.setAttribute('fill', 'var(--primary, #3B82F6)');

    icon.append(circle, path1, path2, spark);
    stateNode.appendChild(icon);

    if (title) {
      const titleNode = document.createElement('p');
      titleNode.className = 'pn-empty-state__title';
      titleNode.textContent = title;
      stateNode.appendChild(titleNode);
    }

    const messageNode = document.createElement('p');
    messageNode.className = 'pn-empty-state__message';
    messageNode.textContent = message;
    stateNode.appendChild(messageNode);

    if (actionLabel) {
      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'pn-btn pn-btn--primary pn-empty-state__action';
      actionButton.textContent = actionLabel;
      if (typeof onAction === 'function') {
        actionButton.addEventListener('click', onAction);
      }
      stateNode.appendChild(actionButton);
    }

    return stateNode;
  };

  /** Builds a reusable tag pill node. */
  const createTagPill = (tag: any) => {
    const pill = document.createElement('span');
    pill.className = 'pn-tag-pill';
    pill.textContent = String(tag || '').trim();
    return pill;
  };

  /** Escapes unsafe markup content. */
  const escapeHtml = (value: any) =>
    String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  /** Sorts nodes by their document position order. */
  const sortNodesByDomOrder = (nodes: any) =>
    Array.from(nodes || []).sort((a: any, b: any) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    );

  /** Returns true when URL is one of supported LLM hosts. */
  const isSupportedTabUrl = (url: any) => {
    const value = String(url || '').toLowerCase();
    return SUPPORTED_URLS.some((prefix) => value.startsWith(prefix));
  };

  /** Returns active tab metadata used for inject actions. */
  const getActiveTabContext = async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0] || null;
    return {
      tabId: tab?.id || null,
      url: tab?.url || '',
      supported: isSupportedTabUrl(tab?.url || ''),
    };
  };

  /** Sends one action payload to the active tab content script. */
  const sendToActiveTab = async (payload: any) => {
    const context = await getActiveTabContext();
    if (!context.tabId) {
      return { ok: false, error: 'No active tab found.' };
    }
    try {
      return await chrome.tabs.sendMessage(context.tabId, payload);
    } catch (error: any) {
      return { ok: false, error: error?.message || 'Unable to reach content script.' };
    }
  };

  const DomHelpers = {
    byId,
    showToast,
    createEmptyState,
    createTagPill,
    escapeHtml,
    sortNodesByDomOrder,
    isSupportedTabUrl,
    getActiveTabContext,
    sendToActiveTab,
  };

  if (typeof window !== 'undefined') {
    Object.assign(window, DomHelpers);
    window.DomHelpers = DomHelpers;
  }
})();
