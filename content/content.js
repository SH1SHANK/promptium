/**
 * File: content/content.js
 * Purpose: Boots PromptNest content features, handles runtime actions, and drives side-panel export selection UI.
 * Communicates with: utils/platform.js, utils/storage.js, utils/exporter.js, content/scraper.js, content/injector.js, content/toolbar.js, background/service_worker.js.
 */

window.__PN = window.__PN || {};

if (!window.__PN.PENDING_CONTEXT_KEY) {
  window.__PN.PENDING_CONTEXT_KEY = 'pendingContext';
}

const PLATFORM_LABELS = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  copilot: 'Copilot'
};

const OPEN_SIDEPANEL_ACTION = 'OPEN_SIDEPANEL';
const OBSERVER_DEBOUNCE_MS = 140;
const URL_WATCH_INTERVAL_MS = 1000;

const exportSelectionState = {
  platform: null,
  selectors: null,
  observer: null,
  observerRoot: null,
  scanTimer: null,
  urlWatchTimer: null,
  lastUrl: window.location.href,
  selectedIds: new Set(),
  messageOrder: [],
  messagesById: new Map(),
  sequence: 0
};

/** Creates a chat payload object from scraped messages and page metadata. */
const createChatPayload = async (platform, messages) => ({
  title: document.title || 'Untitled chat',
  platform,
  tags: [],
  messages,
  url: window.location.href
});

/** Shows a user notification via toolbar toast when available, else logs to console. */
const notify = async (message) => {
  const text = String(message || '').trim();

  if (!text) {
    return;
  }

  if (window.Toolbar?.showNotification) {
    await window.Toolbar.showNotification(text);
    return;
  }

  console.info('[PromptNest][Content]', text);
};

/** Safely queries one element and returns null if the selector throws. */
const safeQuery = async (selector, root = document) => {
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
const safeQueryAllInScope = async (selector, root = document) => {
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
const sortContentNodesByDomOrder = async (nodes) => {
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
const ensureMessageNodeId = async (node) => {
  if (node.dataset.pnMessageId) {
    return node.dataset.pnMessageId;
  }

  exportSelectionState.sequence += 1;
  const nextId = `pn-msg-${Date.now()}-${exportSelectionState.sequence}`;
  node.dataset.pnMessageId = nextId;
  return nextId;
};

/** Removes PromptNest-injected controls from cloned content and returns clean message HTML. */
const getSanitizedMessageHtml = async (node) => {
  if (!node) {
    return '';
  }

  const clone = node.cloneNode(true);
  clone.querySelectorAll('.pn-inline-select').forEach((injected) => {
    injected.remove();
  });

  // Strip executable/dangerous elements before carrying HTML into extension pages.
  clone.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((unsafeNode) => {
    unsafeNode.remove();
  });

  clone.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
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

        if (normalized.startsWith('javascript:') || normalized.startsWith('data:text/html')) {
          element.removeAttribute(attribute.name);
        }
      }
    });
  });

  return String(clone.innerHTML || '').trim();
};

/** Returns one normalized message payload from a platform chat message DOM node. */
const readMessageNode = async (node, selectors, order) => {
  if (!node || typeof node.matches !== 'function') {
    return null;
  }

  const text = String(node.innerText || node.textContent || '').trim();

  if (!text) {
    return null;
  }

  const id = await ensureMessageNodeId(node);
  const role = node.matches(selectors.userMsg) ? 'user' : 'assistant';

  return {
    id,
    role,
    text,
    html: await getSanitizedMessageHtml(node),
    order
  };
};

/** Ensures each message gets a single injected checkbox control and syncs checked state. */
const ensureMessageCheckbox = async (node, messageId) => {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  const existing = node.querySelector(':scope > .pn-inline-select');

  if (existing) {
    const existingInput = existing.querySelector('.pn-inline-check');

    if (existingInput instanceof HTMLInputElement) {
      existingInput.checked = exportSelectionState.selectedIds.has(messageId);
    }

    return;
  }

  if (window.getComputedStyle(node).position === 'static') {
    node.classList.add('pn-selectable-message--relative');
  }

  const control = document.createElement('label');
  control.className = 'pn-inline-select';
  control.innerHTML = `
    <input
      type="checkbox"
      class="pn-inline-check"
      aria-label="Select message for PromptNest export"
    />
    <span class="pn-inline-mark"></span>
  `;

  const checkbox = control.querySelector('.pn-inline-check');

  if (checkbox instanceof HTMLInputElement) {
    checkbox.checked = exportSelectionState.selectedIds.has(messageId);

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

      void updateSelectionFab();
    });
  }

  control.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  node.appendChild(control);
};

/** Builds selected messages in original order for side panel export payloads. */
const buildSelectedMessages = () => exportSelectionState.messageOrder
  .filter((id) => exportSelectionState.selectedIds.has(id))
  .map((id) => exportSelectionState.messagesById.get(id))
  .filter(Boolean)
  .map((message) => ({
    role: message.role,
    text: message.text,
    html: message.html
  }));

/** Stores selected data in session storage and asks service worker to open side panel. */
const openSidePanelWithSelection = async () => {
  const selected = buildSelectedMessages();

  if (!selected.length) {
    await notify('Select at least one message to export.');
    return { ok: false, error: 'No selected messages.' };
  }

  const payload = {
    title: document.title || 'Untitled chat',
    platform: String(exportSelectionState.platform || 'unknown'),
    url: window.location.href,
    createdAt: new Date().toISOString(),
    messages: selected
  };

  try {
    const response = await chrome.runtime.sendMessage({
      action: OPEN_SIDEPANEL_ACTION,
      payload
    });

    if (!response?.ok) {
      await notify(response?.error || 'Failed to open PromptNest side panel.');
      return { ok: false, error: response?.error || 'Failed to open side panel.' };
    }

    return { ok: true };
  } catch (error) {
    await notify(error?.message || 'Failed to open PromptNest side panel.');
    return { ok: false, error: error?.message || 'Failed to open side panel.' };
  }
};

/** Opens the side panel without mutating current message selection payload. */
const openSidePanelOnly = async () => {
  try {
    const response = await chrome.runtime.sendMessage({ action: OPEN_SIDEPANEL_ACTION });

    if (!response?.ok) {
      await notify(response?.error || 'Failed to open PromptNest side panel.');
      return { ok: false, error: response?.error || 'Failed to open side panel.' };
    }

    return { ok: true };
  } catch (error) {
    await notify(error?.message || 'Failed to open PromptNest side panel.');
    return { ok: false, error: error?.message || 'Failed to open side panel.' };
  }
};

/** Selects all currently discovered message rows then opens side panel export view. */
const openSidePanelWithAllMessages = async () => {
  if (!exportSelectionState.messageOrder.length) {
    void scanSelectionTargets();
    await notify('Messages are still loading. Please try again.');
    return { ok: false, error: 'Messages still loading.' };
  }

  exportSelectionState.selectedIds = new Set(exportSelectionState.messageOrder);

  document.querySelectorAll('.pn-inline-check').forEach((checkbox) => {
    if (checkbox instanceof HTMLInputElement) {
      checkbox.checked = true;
    }
  });

  void updateSelectionFab();
  return openSidePanelWithSelection();
};

/** Creates the floating export bar once and wires click handling for side panel open. */
const ensureSelectionFab = async () => {
  if (document.getElementById('pn-selection-fab')) {
    return;
  }

  const root = document.createElement('div');
  root.id = 'pn-selection-fab';
  root.className = 'pn-selection-fab pn-hidden';
  root.innerHTML = `
    <p id="pn-selection-fab-count" class="pn-selection-fab__count">0 selected</p>
    <button id="pn-selection-fab-trigger" type="button" class="pn-selection-fab__button">Export Selected</button>
  `;

  const trigger = root.querySelector('#pn-selection-fab-trigger');

  trigger?.addEventListener('click', () => {
    void openSidePanelWithSelection();
  });

  if (document.body) {
    document.body.appendChild(root);
  }
};

/** Syncs floating export bar visibility and count label with selection state. */
const updateSelectionFab = async () => {
  await ensureSelectionFab();
  const root = document.getElementById('pn-selection-fab');
  const count = document.getElementById('pn-selection-fab-count');

  if (!root || !count) {
    return;
  }

  const selectedCount = exportSelectionState.selectedIds.size;
  const totalCount = exportSelectionState.messageOrder.length;
  count.textContent = `${selectedCount} selected of ${totalCount}`;
  root.classList.toggle('pn-hidden', selectedCount === 0);
};

/** Clears selections that no longer exist in the latest DOM scan snapshot. */
const pruneMissingSelections = async (currentIds) => {
  for (const id of Array.from(exportSelectionState.selectedIds)) {
    if (!currentIds.has(id)) {
      exportSelectionState.selectedIds.delete(id);
    }
  }
};

/** Collects all known chat message nodes for the current platform in order. */
const collectChatMessageNodes = async (selectors) => {
  const userNodes = await safeQueryAllInScope(selectors.userMsg);
  const assistantNodes = await safeQueryAllInScope(selectors.botMsg);
  const uniqueNodes = Array.from(new Set([...userNodes, ...assistantNodes]));
  const topLevelNodes = uniqueNodes.filter((node) => !uniqueNodes.some((candidate) => candidate !== node && candidate.contains(node)));
  return sortContentNodesByDomOrder(topLevelNodes);
};

/** Scans message DOM, injects checkboxes, and refreshes cached extraction payloads. */
const scanSelectionTargets = async () => {
  const selectors = exportSelectionState.selectors;

  if (!selectors) {
    return;
  }

  const nodes = await collectChatMessageNodes(selectors);
  const nextOrder = [];
  const nextMessagesById = new Map();

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const row = await readMessageNode(node, selectors, index);

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

  document.querySelectorAll('.pn-inline-check').forEach((checkbox) => {
    if (!(checkbox instanceof HTMLInputElement)) {
      return;
    }

    const host = checkbox.closest('.pn-inline-select')?.parentElement;

    if (!host?.dataset?.pnMessageId) {
      return;
    }

    checkbox.checked = exportSelectionState.selectedIds.has(host.dataset.pnMessageId);
  });

  await updateSelectionFab();
};

/** Debounces expensive message scan work during rapid streaming DOM updates. */
const scheduleSelectionScan = async () => {
  if (exportSelectionState.scanTimer) {
    clearTimeout(exportSelectionState.scanTimer);
  }

  exportSelectionState.scanTimer = setTimeout(() => {
    exportSelectionState.scanTimer = null;
    void scanSelectionTargets();
  }, OBSERVER_DEBOUNCE_MS);
};

/** Resolves the narrowest stable container to observe for chat message DOM changes. */
const resolveObserverRoot = async (selectors) => {
  const seed = (await safeQuery(selectors.userMsg)) || (await safeQuery(selectors.botMsg));

  if (seed) {
    return seed.closest('main, [role="main"], [class*="conversation"], [class*="thread"], [class*="chat"]') || seed.parentElement || document.body;
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

  const observer = new MutationObserver(() => {
    void scheduleSelectionScan();
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true
  });

  exportSelectionState.observerRoot = root;
  exportSelectionState.observer = observer;
  await scheduleSelectionScan();
};

/** Handles SPA navigation by resetting selection state and rebinding scoped observers. */
const handleNavigationRefresh = async (platform) => {
  exportSelectionState.selectedIds.clear();
  exportSelectionState.messageOrder = [];
  exportSelectionState.messagesById = new Map();
  exportSelectionState.selectors = await window.Platform.getSelectors(platform);
  await attachSelectionObserver();
  await updateSelectionFab();
};

/** Starts lightweight URL watcher to rebind observers when SPAs change route. */
const startSelectionUrlWatcher = async (platform) => {
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
  }, URL_WATCH_INTERVAL_MS);
};

/** Initializes in-page selection affordances used to launch side panel exports. */
const initExportSelectionUi = async (platform) => {
  exportSelectionState.platform = platform;
  exportSelectionState.selectors = await window.Platform.getSelectors(platform);

  if (!exportSelectionState.selectors) {
    return;
  }

  await ensureSelectionFab();
  await attachSelectionObserver();
  await startSelectionUrlWatcher(platform);
};

/** Handles injectPrompt action messages from popup and returns operation status. */
const handleInjectPrompt = async (msg, platform, sendResponse) => {
  const success = await window.Injector.inject(String(msg?.text || ''), platform);
  sendResponse({ ok: success });
};

/** Handles exportChat action by scraping, storing history, and exporting chat data. */
const handleExportChat = async (msg, platform, sendResponse) => {
  const messages = await window.Scraper.scrape(platform);

  if (!messages.length) {
    sendResponse({ ok: false, error: 'No chat messages available to export.' });
    return;
  }

  const payload = await createChatPayload(platform, messages);
  const saved = await window.Store.saveChatToHistory(payload);

  if (!saved) {
    sendResponse({ ok: false, error: 'Failed to save chat history.' });
    return;
  }

  const result = await window.Exporter.exportChat(
    saved,
    String(msg?.format || 'md').toLowerCase(),
    msg?.prefs || {}
  );

  sendResponse(result);
};

/** Handles getPlatform action by returning the detected platform identifier. */
const handleGetPlatform = async (platform, sendResponse) => {
  sendResponse({ ok: true, platform });
};

/** Handles side-panel export open requests that should include every visible message. */
const handleOpenSidePanelAll = async (sendResponse) => {
  sendResponse(await openSidePanelWithAllMessages());
};

/** Routes incoming runtime messages by action name and wraps execution errors. */
const onRuntimeMessage = (msg, _sender, sendResponse) => {
  void (async () => {
    let responded = false;

    /** Sends a response once to avoid message channel closure errors. */
    const respond = (payload) => {
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
      const platform = await window.Platform.detect();

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

      respond({ ok: false, error: `Unknown action: ${String(msg?.action || 'undefined')}` });
    } catch (error) {
      respond({ ok: false, error: error.message || 'Unexpected content script failure.' });
    } finally {
      if (!responded) {
        respond({ ok: false, error: 'No response generated for request.' });
      }
    }
  })();

  return true;
};

/** Reads pending cross-LLM context and injects it when current platform matches target. */
const hydratePendingContext = async (platform) => {
  try {
    const pendingKey = window.__PN.PENDING_CONTEXT_KEY;
    const state = await chrome.storage.local.get([pendingKey]);
    const pending = state?.[pendingKey];

    if (!pending || pending.targetPlatform !== platform || !pending.text) {
      return;
    }

    let success = false;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      success = await window.Injector.inject(String(pending.text), platform);

      if (success) {
        break;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 300);
      });
    }

    if (success) {
      await chrome.storage.local.remove(pendingKey);
      const label = PLATFORM_LABELS[platform] || platform;
      await notify(`Context injected into ${label}`);
    }
  } catch (error) {
    console.error('[PromptNest][Content] Failed pending context hydration.', error);
  }
};

/** Disconnects observers and timers when the page unloads. */
const cleanup = async () => {
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
};

/** Initializes content execution when the current page matches a supported platform. */
const init = async () => {
  const platform = await window.Platform.detect();

  if (!platform) {
    return;
  }

  await window.Toolbar.waitAndInject(platform);
  await hydratePendingContext(platform);
  await initExportSelectionUi(platform);

  window.__PN.SidePanelExport = {
    openPanelOnly: openSidePanelOnly,
    openWithSelection: openSidePanelWithSelection,
    openWithAllMessages: openSidePanelWithAllMessages
  };

  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  window.addEventListener('beforeunload', () => {
    void cleanup();
  }, { once: true });
};

void init();
