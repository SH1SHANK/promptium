/**
 * File: content/export-dialog.js
 * Purpose: Provides the unified export dialog with message selection, customization, live preview, and cross-LLM send actions.
 * Communicates with: content/toolbar.js, utils/exporter.js, utils/storage.js, background/service_worker.js.
 */

const EXPORT_PREFS_KEY = 'exportPrefs';
const PREVIEW_DEBOUNCE_MS = 150;
const CONTEXT_FOOTER = '\n\n---\nPlease acknowledge you have read this context.';

window.__PN = window.__PN || {};

if (!window.__PN.PENDING_CONTEXT_KEY) {
  window.__PN.PENDING_CONTEXT_KEY = 'pendingContext';
}

const SEND_TARGETS = {
  chatgpt: { label: 'ChatGPT (new tab)', platform: 'chatgpt', url: 'https://chatgpt.com/' },
  claude: { label: 'Claude (new tab)', platform: 'claude', url: 'https://claude.ai/new' },
  gemini: { label: 'Gemini (new tab)', platform: 'gemini', url: 'https://gemini.google.com/app' },
  perplexity: { label: 'Perplexity (new tab)', platform: 'perplexity', url: 'https://www.perplexity.ai/' },
  copy: { label: 'Copy as context prompt', platform: null, url: null }
};

const defaultPrefs = {
  fontStyle: 'Outfit',
  fontSize: 14,
  background: 'dark',
  customBackground: '#18181c',
  includeTimestamps: true,
  includePlatformLabel: true,
  includeMessageNumbers: false,
  headerText: ''
};

const dialogState = {
  platform: 'unknown',
  title: 'PromptNest Chat',
  messages: [],
  selectedIndices: new Set(),
  lastCheckedIndex: null,
  prefs: { ...defaultPrefs },
  previewFormat: 'markdown',
  notify: async (_message) => {},
  previewTimer: null,
  keyHandler: null,
  outsideHandler: null
};

/** Returns the active export dialog overlay node if present. */
const getOverlay = async () => document.getElementById('pn-export-dialog-overlay');

/** Escapes unsafe HTML characters for safe preview and row rendering. */
const escapeHtml = async (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

/** Returns normalized messages array containing role and text fields only. */
const normalizeMessages = async (messages) => {
  const source = Array.isArray(messages) ? messages : [];
  return source
    .map((message) => ({
      role: String(message?.role || 'assistant').toLowerCase(),
      text: String(message?.text || '').trim(),
      timestamp: message?.timestamp || message?.createdAt || null
    }))
    .filter((message) => Boolean(message.text));
};

/** Reads export customization preferences from local storage with fallback defaults. */
const loadPrefs = async () => {
  try {
    const state = await chrome.storage.local.get([EXPORT_PREFS_KEY]);
    const saved = state?.[EXPORT_PREFS_KEY] || {};
    return {
      ...defaultPrefs,
      ...(saved || {}),
      fontSize: Math.min(20, Math.max(12, Number(saved?.fontSize || defaultPrefs.fontSize)))
    };
  } catch (_error) {
    return { ...defaultPrefs };
  }
};

/** Persists export preferences to local storage for future dialog sessions. */
const savePrefs = async () => {
  try {
    await chrome.storage.local.set({ [EXPORT_PREFS_KEY]: dialogState.prefs });
  } catch (_error) {
    return;
  }
};

/** Returns currently selected messages preserving original DOM order. */
const getSelectedMessages = async () => {
  const indices = Array.from(dialogState.selectedIndices).sort((a, b) => a - b);
  return indices.map((index) => dialogState.messages[index]).filter(Boolean);
};

/** Updates the visible count label showing selected versus total message count. */
const updateSelectionCount = async () => {
  const countNode = document.querySelector('.pn-selection-count');

  if (countNode) {
    countNode.textContent = `${dialogState.selectedIndices.size} of ${dialogState.messages.length} messages selected`;
  }
};

/** Updates select-all toggle label based on current selection state. */
const updateSelectToggleLabel = async () => {
  const button = document.getElementById('pn-select-toggle');

  if (!button) {
    return;
  }

  button.textContent = dialogState.selectedIndices.size === dialogState.messages.length ? 'Deselect All' : 'Select All';
};

/** Applies selected row visual state to match checkbox and selection set values. */
const refreshRowStates = async () => {
  const rows = Array.from(document.querySelectorAll('.pn-msg-row'));

  rows.forEach((row) => {
    const index = Number(row.dataset.index);
    const checkbox = row.querySelector('.pn-msg-check');
    const selected = dialogState.selectedIndices.has(index);
    row.classList.toggle('selected', selected);

    if (checkbox) {
      checkbox.checked = selected;
    }
  });

  await updateSelectionCount();
  await updateSelectToggleLabel();
};

/** Schedules live preview rendering with debouncing to reduce iframe update churn. */
const schedulePreview = async () => {
  if (dialogState.previewTimer) {
    clearTimeout(dialogState.previewTimer);
  }

  dialogState.previewTimer = setTimeout(() => {
    dialogState.previewTimer = null;
    void renderPreview();
  }, PREVIEW_DEBOUNCE_MS);
};

/** Returns CSS font stack string for preview rendering from selected font option. */
const resolvePreviewFont = async (fontStyle) => {
  const normalized = String(fontStyle || '').toLowerCase();

  if (normalized.includes('jetbrains')) {
    return "'JetBrains Mono', monospace";
  }

  if (normalized.includes('georgia')) {
    return 'Georgia, serif';
  }

  if (normalized.includes('outfit')) {
    return "'Outfit', sans-serif";
  }

  return 'system-ui, -apple-system, Segoe UI, sans-serif';
};

/** Resolves preview background and text colors from background preference values. */
const resolvePreviewColors = async () => {
  const background = String(dialogState.prefs.background || 'dark').toLowerCase();

  if (background === 'light') {
    return { bg: '#ffffff', text: '#141414', border: 'rgba(0,0,0,0.1)' };
  }

  if (background === 'sepia') {
    return { bg: '#f4ecd8', text: '#2f2417', border: 'rgba(47,36,23,0.18)' };
  }

  if (background === 'custom') {
    return {
      bg: String(dialogState.prefs.customBackground || '#18181c'),
      text: '#f3f3f6',
      border: 'rgba(255,255,255,0.14)'
    };
  }

  return { bg: '#18181c', text: '#f3f3f6', border: 'rgba(255,255,255,0.14)' };
};

/** Creates message markup for preview frame using current selection and preference toggles. */
const buildPreviewBody = async (messages) => {
  const rows = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const role = message.role === 'user' ? 'You' : 'Assistant';
    const numbering = dialogState.prefs.includeMessageNumbers ? `${index + 1}. ` : '';
    const timestamp = dialogState.prefs.includeTimestamps ? `<span class="stamp">[${new Date().toLocaleTimeString()}]</span> ` : '';
    rows.push(`<article class="row"><h4>${numbering}${role}</h4><p>${timestamp}${await escapeHtml(message.text)}</p></article>`);
  }

  return rows.join('');
};

/** Renders live preview in iframe srcdoc using selected messages and current settings. */
const renderPreview = async () => {
  const frame = document.getElementById('pn-preview-frame');
  const label = document.getElementById('pn-preview-label');

  if (!frame || !label) {
    return;
  }

  const selected = await getSelectedMessages();
  const colors = await resolvePreviewColors();
  const font = await resolvePreviewFont(dialogState.prefs.fontStyle);
  const previewTitle = dialogState.prefs.headerText || dialogState.title;
  const platformLine = dialogState.prefs.includePlatformLabel ? `<p class="meta">Platform: ${await escapeHtml(dialogState.platform.toUpperCase())}</p>` : '';
  const body = await buildPreviewBody(selected);

  label.textContent = dialogState.previewFormat === 'pdf' ? 'Preview — PDF layout' : `Preview — ${dialogState.previewFormat.toUpperCase()}`;

  frame.srcdoc = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body { margin:0; padding:18px; font-family:${font}; font-size:${dialogState.prefs.fontSize}px; background:${colors.bg}; color:${colors.text}; }
      h1 { margin:0 0 8px; font-size:1.2em; }
      .meta { margin:0 0 8px; opacity:0.75; font-size:0.86em; }
      .row { border:1px solid ${colors.border}; border-radius:8px; padding:10px; margin-bottom:8px; }
      .row h4 { margin:0 0 6px; font-size:0.9em; }
      .row p { margin:0; line-height:1.4; white-space:pre-wrap; }
      .stamp { opacity:0.7; font-size:0.9em; }
    </style>
  </head>
  <body>
    <h1>${await escapeHtml(previewTitle)}</h1>
    ${platformLine}
    ${body || '<p>No selected messages.</p>'}
  </body>
</html>`;
};

/** Applies a selection toggle for one message index including optional shift-range behavior. */
const toggleSelection = async (index, checked, shiftKey = false) => {
  const maxIndex = dialogState.messages.length - 1;

  if (index < 0 || index > maxIndex) {
    return;
  }

  if (shiftKey && dialogState.lastCheckedIndex !== null) {
    const start = Math.min(dialogState.lastCheckedIndex, index);
    const end = Math.max(dialogState.lastCheckedIndex, index);

    for (let cursor = start; cursor <= end; cursor += 1) {
      if (checked) {
        dialogState.selectedIndices.add(cursor);
      } else {
        dialogState.selectedIndices.delete(cursor);
      }
    }
  } else if (checked) {
    dialogState.selectedIndices.add(index);
  } else {
    dialogState.selectedIndices.delete(index);
  }

  dialogState.lastCheckedIndex = index;
  await refreshRowStates();
  await schedulePreview();
};

/** Toggles all message checkboxes on or off based on current global selection state. */
const toggleAll = async () => {
  const shouldSelectAll = dialogState.selectedIndices.size !== dialogState.messages.length;

  dialogState.selectedIndices.clear();

  if (shouldSelectAll) {
    for (let index = 0; index < dialogState.messages.length; index += 1) {
      dialogState.selectedIndices.add(index);
    }
  }

  await refreshRowStates();
  await schedulePreview();
};

/** Builds and appends one interactive message selection row into the dialog list. */
const appendMessageRow = async (container, message, index) => {
  const row = document.createElement('div');
  row.className = 'pn-msg-row selected';
  row.dataset.index = String(index);
  row.innerHTML = `
    <input type="checkbox" class="pn-msg-check" checked />
    <span class="pn-msg-role ${message.role === 'user' ? 'user' : 'assistant'}">${message.role === 'user' ? 'You' : 'Assistant'}</span>
    <span class="pn-msg-preview">${await escapeHtml(message.text)}</span>
  `;

  const checkbox = row.querySelector('.pn-msg-check');

  checkbox?.addEventListener('click', (event) => {
    event.stopPropagation();
    void toggleSelection(index, Boolean(checkbox.checked), event.shiftKey);
  });

  row.addEventListener('click', (event) => {
    if (event.target === checkbox) {
      return;
    }

    const targetChecked = !dialogState.selectedIndices.has(index);
    void toggleSelection(index, targetChecked, event.shiftKey);
  });

  container.appendChild(row);
};

/** Renders all message rows and initializes their selected state values. */
const renderMessageList = async () => {
  const list = document.getElementById('pn-message-list');

  if (!list) {
    return;
  }

  list.innerHTML = '';

  for (let index = 0; index < dialogState.messages.length; index += 1) {
    await appendMessageRow(list, dialogState.messages[index], index);
  }

  await refreshRowStates();
};

/** Applies prefs from form controls into memory and persists them for future sessions. */
const updatePrefsFromControls = async () => {
  const fontStyle = document.getElementById('pn-pref-font-style');
  const fontSize = document.getElementById('pn-pref-font-size');
  const fontSizeLabel = document.getElementById('pn-font-size-value');
  const backgroundChoice = document.querySelector('input[name="pn-pref-bg"]:checked');
  const customColor = document.getElementById('pn-pref-custom-bg');
  const includeTimestamps = document.getElementById('pn-pref-timestamps');
  const includePlatform = document.getElementById('pn-pref-platform');
  const includeNumbers = document.getElementById('pn-pref-numbers');
  const headerText = document.getElementById('pn-pref-header-text');

  dialogState.prefs = {
    ...dialogState.prefs,
    fontStyle: String(fontStyle?.value || dialogState.prefs.fontStyle),
    fontSize: Math.min(20, Math.max(12, Number(fontSize?.value || dialogState.prefs.fontSize))),
    background: String(backgroundChoice?.value || dialogState.prefs.background),
    customBackground: String(customColor?.value || dialogState.prefs.customBackground),
    includeTimestamps: Boolean(includeTimestamps?.checked),
    includePlatformLabel: Boolean(includePlatform?.checked),
    includeMessageNumbers: Boolean(includeNumbers?.checked),
    headerText: String(headerText?.value || '').trim()
  };

  if (fontSizeLabel) {
    fontSizeLabel.textContent = `${dialogState.prefs.fontSize}px`;
  }

  await savePrefs();
  await schedulePreview();
};

/** Renders current preference values into dialog controls after overlay mounts. */
const hydratePrefsControls = async () => {
  const fontStyle = document.getElementById('pn-pref-font-style');
  const fontSize = document.getElementById('pn-pref-font-size');
  const fontSizeLabel = document.getElementById('pn-font-size-value');
  const customColor = document.getElementById('pn-pref-custom-bg');
  const includeTimestamps = document.getElementById('pn-pref-timestamps');
  const includePlatform = document.getElementById('pn-pref-platform');
  const includeNumbers = document.getElementById('pn-pref-numbers');
  const headerText = document.getElementById('pn-pref-header-text');
  const backgroundRadio = document.querySelector(`input[name="pn-pref-bg"][value="${dialogState.prefs.background}"]`);

  if (fontStyle) {
    fontStyle.value = dialogState.prefs.fontStyle;
  }

  if (fontSize) {
    fontSize.value = String(dialogState.prefs.fontSize);
  }

  if (fontSizeLabel) {
    fontSizeLabel.textContent = `${dialogState.prefs.fontSize}px`;
  }

  if (customColor) {
    customColor.value = dialogState.prefs.customBackground;
  }

  if (includeTimestamps) {
    includeTimestamps.checked = dialogState.prefs.includeTimestamps;
  }

  if (includePlatform) {
    includePlatform.checked = dialogState.prefs.includePlatformLabel;
  }

  if (includeNumbers) {
    includeNumbers.checked = dialogState.prefs.includeMessageNumbers;
  }

  if (headerText) {
    headerText.value = dialogState.prefs.headerText;
  }

  if (backgroundRadio) {
    backgroundRadio.checked = true;
  }
};

/** Builds context prompt text from selected chat rows for cross-LLM injection. */
const buildContextPrompt = async (messages) => {
  const selected = Array.isArray(messages) ? messages : [];
  const header = `I'm sharing a conversation from ${dialogState.platform} for context:\n\n`;
  const body = selected
    .map((message) => `${message.role === 'user' ? 'Human' : 'Assistant'}: ${message.text}`)
    .join('\n\n');
  return `${header}${body}${CONTEXT_FOOTER}`;
};

/** Copies text to clipboard with execCommand fallback for restricted page contexts. */
const copyToClipboard = async (text) => {
  const value = String(text || '');

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (_error) {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  return copied;
};

/** Persists pending context and requests background to open a target LLM tab. */
const sendToTargetPlatform = async (target) => {
  const selected = await getSelectedMessages();

  if (!selected.length) {
    await dialogState.notify('Select at least one message to send.');
    return;
  }

  const prompt = await buildContextPrompt(selected);

  if (target.platform) {
    const pendingKey = window.__PN.PENDING_CONTEXT_KEY;
    await chrome.storage.local.set({
      [pendingKey]: {
        targetPlatform: target.platform,
        text: prompt,
        createdAt: new Date().toISOString()
      }
    });

    let response = null;

    try {
      response = await chrome.runtime.sendMessage({ action: 'openLlmTab', url: target.url });
    } catch (error) {
      await chrome.storage.local.remove(pendingKey);
      await dialogState.notify(error.message || 'Failed to open target LLM tab.');
      return;
    }

    if (!response?.ok) {
      await chrome.storage.local.remove(pendingKey);
      await dialogState.notify(response?.error || 'Failed to open target LLM tab.');
      return;
    }

    await dialogState.notify(`Context queued for ${target.platform}.`);
    await close();
    return;
  }

  const copied = await copyToClipboard(prompt);

  if (!copied) {
    await dialogState.notify('Unable to copy context prompt.');
    return;
  }

  await dialogState.notify('Copied to clipboard.');
};

/** Exports selected messages using requested format and current customization preferences. */
const exportSelected = async (format) => {
  const selected = await getSelectedMessages();

  if (!selected.length) {
    await dialogState.notify('Select at least one message to export.');
    return;
  }

  dialogState.previewFormat = format === 'md' ? 'markdown' : format;
  await schedulePreview();

  const payload = {
    title: dialogState.title,
    platform: dialogState.platform,
    tags: [],
    messages: selected,
    url: window.location.href
  };

  const saved = await window.Store.saveChatToHistory(payload);

  if (!saved) {
    await dialogState.notify('Failed to save chat history.');
  }

  const result = await window.Exporter.exportChat(saved || payload, format, dialogState.prefs);

  if (!result.ok) {
    await dialogState.notify(result.error || 'Export failed.');
    return;
  }

  await dialogState.notify(`Exported ${format.toUpperCase()} file.`);
};

/** Closes the send dropdown menu element if currently visible. */
const closeSendMenu = async () => {
  const sendMenu = document.getElementById('pn-send-menu');
  sendMenu?.classList.add('hidden');
};

/** Closes and destroys the export dialog overlay while removing event listeners. */
const close = async () => {
  const overlay = await getOverlay();

  if (dialogState.previewTimer) {
    clearTimeout(dialogState.previewTimer);
    dialogState.previewTimer = null;
  }

  if (dialogState.keyHandler) {
    document.removeEventListener('keydown', dialogState.keyHandler);
    dialogState.keyHandler = null;
  }

  if (dialogState.outsideHandler) {
    document.removeEventListener('click', dialogState.outsideHandler);
    dialogState.outsideHandler = null;
  }

  overlay?.remove();
};

/** Returns export dialog HTML shell with selection panel, settings, and preview pane. */
const buildDialogTemplate = async () => {
  const sendItems = [
    SEND_TARGETS.chatgpt,
    SEND_TARGETS.claude,
    SEND_TARGETS.gemini,
    SEND_TARGETS.perplexity,
    SEND_TARGETS.copy
  ]
    .map((target) => `<button class="pn-send-item" type="button" data-target="${target.platform || 'copy'}">${target.label}</button>`)
    .join('');

  return `
    <div id="pn-export-dialog">
      <header class="pn-export-header">
        <h2 class="pn-export-title">PromptNest Export</h2>
        <button class="pn-export-close" id="pn-export-close" type="button" aria-label="Close export dialog">✕</button>
      </header>

      <section class="pn-export-left">
        <div class="pn-select-head">
          <div class="pn-select-head-top">
            <h3>Select messages to export</h3>
            <button id="pn-select-toggle" class="pn-link-btn" type="button">Deselect All</button>
          </div>
          <div class="pn-selection-count">0 of 0 messages selected</div>
        </div>

        <div id="pn-message-list" class="pn-message-list"></div>

        <div class="pn-customize-wrap">
          <button id="pn-customize-toggle" class="pn-customize-toggle" type="button">▸ Customize Export</button>
          <div id="pn-customize-body" class="pn-customize-body hidden">
            <label class="pn-setting-row">
              <span>Font Style</span>
              <select id="pn-pref-font-style">
                <option value="Outfit">Outfit</option>
                <option value="JetBrains Mono">JetBrains Mono</option>
                <option value="Georgia">Georgia</option>
                <option value="System">System</option>
              </select>
            </label>

            <div class="pn-setting-row">
              <span>Font Size</span>
              <div class="pn-range-row">
                <input id="pn-pref-font-size" class="pn-range-slider" type="range" min="12" max="20" step="1" />
                <span id="pn-font-size-value">14px</span>
              </div>
            </div>

            <div class="pn-setting-row">
              <span>Background</span>
              <div class="pn-bg-options">
                <label><input type="radio" name="pn-pref-bg" value="dark" /> Dark</label>
                <label><input type="radio" name="pn-pref-bg" value="light" /> Light</label>
                <label><input type="radio" name="pn-pref-bg" value="sepia" /> Sepia</label>
                <label><input type="radio" name="pn-pref-bg" value="custom" /> Custom</label>
                <input id="pn-pref-custom-bg" type="color" value="#18181c" />
              </div>
            </div>

            <div class="pn-setting-row">
              <span>Include</span>
              <div class="pn-include-options">
                <label><input id="pn-pref-timestamps" type="checkbox" /> Timestamps</label>
                <label><input id="pn-pref-platform" type="checkbox" /> Platform Label</label>
                <label><input id="pn-pref-numbers" type="checkbox" /> Message Numbers</label>
              </div>
            </div>

            <label class="pn-setting-row">
              <span>Header Text</span>
              <input id="pn-pref-header-text" type="text" placeholder="Optional custom title" />
            </label>
          </div>
        </div>
      </section>

      <section class="pn-export-right">
        <div id="pn-preview-label" class="pn-preview-head">Preview — Markdown</div>
        <div class="pn-preview-body">
          <iframe id="pn-preview-frame" title="PromptNest export preview"></iframe>
        </div>
      </section>

      <footer class="pn-export-actions">
        <button id="pn-export-md" class="pn-btn" type="button">Export as MD</button>
        <button id="pn-export-txt" class="pn-btn" type="button">Export TXT</button>
        <button id="pn-export-pdf" class="pn-btn" type="button">Export PDF</button>

        <div class="pn-send-wrap">
          <button id="pn-send-trigger" class="pn-btn" type="button">Send to LLM ▾</button>
          <div id="pn-send-menu" class="pn-send-menu hidden">${sendItems}</div>
        </div>
      </footer>
    </div>
  `;
};

/** Registers event listeners for dialog controls, selection logic, and action buttons. */
const bindDialogEvents = async () => {
  const closeButton = document.getElementById('pn-export-close');
  const overlay = await getOverlay();
  const selectToggle = document.getElementById('pn-select-toggle');
  const customizeToggle = document.getElementById('pn-customize-toggle');
  const customizeBody = document.getElementById('pn-customize-body');
  const sendTrigger = document.getElementById('pn-send-trigger');
  const sendMenu = document.getElementById('pn-send-menu');
  const controlSelectors = [
    '#pn-pref-font-style',
    '#pn-pref-font-size',
    '#pn-pref-custom-bg',
    '#pn-pref-timestamps',
    '#pn-pref-platform',
    '#pn-pref-numbers',
    '#pn-pref-header-text'
  ];

  closeButton?.addEventListener('click', () => {
    void close();
  });

  overlay?.addEventListener('click', (event) => {
    if (event.target === overlay) {
      void close();
    }
  });

  selectToggle?.addEventListener('click', () => {
    void toggleAll();
  });

  customizeToggle?.addEventListener('click', () => {
    if (!customizeBody) {
      return;
    }

    const isHidden = customizeBody.classList.toggle('hidden');
    customizeToggle.textContent = `${isHidden ? '▸' : '▾'} Customize Export`;
  });

  document.querySelectorAll('input[name="pn-pref-bg"]').forEach((input) => {
    input.addEventListener('change', () => {
      void updatePrefsFromControls();
    });
  });

  controlSelectors.forEach((selector) => {
    const node = document.querySelector(selector);

    if (!node) {
      return;
    }

    const syncPrefs = () => {
      void updatePrefsFromControls();
    };

    node.addEventListener('input', syncPrefs);
    node.addEventListener('change', syncPrefs);
  });

  sendTrigger?.addEventListener('click', (event) => {
    event.stopPropagation();
    sendMenu?.classList.toggle('hidden');
  });

  sendMenu?.querySelectorAll('.pn-send-item').forEach((button) => {
    button.addEventListener('click', () => {
      void (async () => {
        await closeSendMenu();
        const targetKey = String(button.dataset.target || 'copy');
        const target = SEND_TARGETS[targetKey] || SEND_TARGETS.copy;
        await sendToTargetPlatform(target);
      })();
    });
  });

  const exportMd = document.getElementById('pn-export-md');
  const exportTxt = document.getElementById('pn-export-txt');
  const exportPdf = document.getElementById('pn-export-pdf');

  exportMd?.addEventListener('click', () => {
    void exportSelected('md');
  });

  exportTxt?.addEventListener('click', () => {
    void exportSelected('txt');
  });

  exportPdf?.addEventListener('click', () => {
    void exportSelected('pdf');
  });

  dialogState.keyHandler = (event) => {
    if (event.key === 'Escape') {
      void close();
    }
  };

  dialogState.outsideHandler = (event) => {
    if (!sendMenu || sendMenu.classList.contains('hidden')) {
      return;
    }

    if (!sendMenu.contains(event.target) && event.target !== sendTrigger) {
      void closeSendMenu();
    }
  };

  document.addEventListener('keydown', dialogState.keyHandler);
  document.addEventListener('click', dialogState.outsideHandler);
};

/** Opens the unified export dialog with preselected messages and persisted preferences. */
const open = async ({ platform, title, messages, showNotification }) => {
  await close();

  dialogState.platform = String(platform || 'unknown');
  dialogState.title = String(title || document.title || 'PromptNest Chat');
  dialogState.messages = await normalizeMessages(messages);
  dialogState.selectedIndices = new Set();
  dialogState.lastCheckedIndex = null;
  dialogState.prefs = await loadPrefs();
  dialogState.previewFormat = 'markdown';
  dialogState.notify = typeof showNotification === 'function' ? showNotification : async (_message) => {};

  if (!dialogState.messages.length) {
    await dialogState.notify('No chat messages found to export.');
    return false;
  }

  for (let index = 0; index < dialogState.messages.length; index += 1) {
    dialogState.selectedIndices.add(index);
  }

  const overlay = document.createElement('div');
  overlay.id = 'pn-export-dialog-overlay';
  overlay.innerHTML = await buildDialogTemplate();
  document.body.appendChild(overlay);

  await hydratePrefsControls();
  await renderMessageList();
  await bindDialogEvents();
  await renderPreview();
  return true;
};

const ExportDialog = {
  open,
  close,
  renderPreview,
  buildContextPrompt
};

if (typeof window !== 'undefined') {
  window.ExportDialog = ExportDialog;
}
