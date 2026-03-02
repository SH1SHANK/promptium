(() => {
/**
 * File: utils/dom-helpers.js
 * Purpose: Shared DOM utility functions used across popup, sidepanel, toolbar, and content scripts.
 * Eliminates duplication of showToast, createEmptyState, createTagPill, byId, and sortNodesByDomOrder.
 */

/** Returns a required DOM node by id. */
const byId = (id) => document.getElementById(id);
const TOAST_DURATION_MS = 2100;

/** Creates and displays a short-lived toast message. */
const showToast = (message) => {
  const toast = document.createElement('div');
  toast.className = 'pn-toast';
  toast.textContent = String(message || '').trim();
  document.body.appendChild(toast);
  setTimeout(() => { toast.remove(); }, TOAST_DURATION_MS);
};

/** Builds reusable empty state markup with icon, copy, and optional action button. */
const createEmptyState = (messageOrConfig, maybeOptions = {}) => {
  const isConfig = messageOrConfig && typeof messageOrConfig === 'object' && !Array.isArray(messageOrConfig);
  const title = isConfig ? String(messageOrConfig.title || '').trim() : '';
  const message = isConfig ? String(messageOrConfig.message || '').trim() : String(messageOrConfig || '').trim();
  const actionLabel = isConfig
    ? String(messageOrConfig.actionLabel || '').trim()
    : String(maybeOptions.actionLabel || '').trim();
  const onAction = isConfig ? messageOrConfig.onAction : maybeOptions.onAction;

  const stateNode = document.createElement('div');
  stateNode.className = 'pn-empty-state';
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke-width', '1.6');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');

  const pathTop = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathTop.setAttribute('d', 'M4 6.5h16v11H4z');
  const pathMid = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathMid.setAttribute('d', 'M8 10h8');
  const pathBottom = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathBottom.setAttribute('d', 'M8 13h5');
  icon.append(pathTop, pathMid, pathBottom);
  stateNode.appendChild(icon);

  if (title) {
    const titleNode = document.createElement('p');
    titleNode.className = 'pn-empty-state__title';
    titleNode.textContent = title;
    stateNode.appendChild(titleNode);
  }

  const messageNode = document.createElement('p');
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
const createTagPill = (tag) => {
  const pill = document.createElement('span');
  pill.className = 'pn-tag-pill';
  pill.textContent = String(tag || '').trim();
  return pill;
};

/** Escapes unsafe markup content. */
const escapeHtml = (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

/** Sorts nodes by their document position order. */
const sortNodesByDomOrder = (nodes) =>
  Array.from(nodes || []).sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  );

/** Returns true when URL is one of supported LLM hosts. */
const isSupportedTabUrl = (url) => {
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
    supported: isSupportedTabUrl(tab?.url || '')
  };
};

/** Sends one action payload to the active tab content script. */
const sendToActiveTab = async (payload) => {
  const context = await getActiveTabContext();
  if (!context.tabId) {
    return { ok: false, error: 'No active tab found.' };
  }
  try {
    return await chrome.tabs.sendMessage(context.tabId, payload);
  } catch (error) {
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
  sendToActiveTab
};

if (typeof window !== 'undefined') {
  Object.assign(window, DomHelpers);
  window.DomHelpers = DomHelpers;
}

})();
