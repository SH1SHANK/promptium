/**
 * File: sidepanel/sidepanel.js
 * Purpose: Provides a full side-panel workspace for prompts, history, export, tags, and settings.
 * Communicates with: utils/storage.js, utils/exporter.js, utils/ai.js, content/content.js.
 */

const SIDEPANEL_SESSION_KEY = 'pnSidePanelPayload';
const SETTINGS_KEY = 'pnSettings';
const ONBOARDING_KEY = 'onboardingComplete';

const DEFAULT_SETTINGS = {
  enableAI: true,
  semanticSearch: true,
  autoSuggestTags: true,
  duplicateCheck: true,
  defaultExportFormat: 'markdown',
  defaultIncludeDate: true,
  defaultIncludePlatform: true,
  userContext: ''
};

const PLATFORM_LABELS = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  copilot: 'Copilot'
};

const ONBOARDING_CARDS = [
  {
    id: 'welcome',
    icon: '✦',
    iconClass: 'pn-card-icon--violet',
    subheadline: 'Welcome to PromptNest',
    headline: 'Your AI workflow, organized.',
    body: 'Save prompts, search by meaning, and export precisely selected messages from one side panel.',
    isPersonalize: false
  },
  {
    id: 'prompts',
    icon: '⌘',
    iconClass: 'pn-card-icon--mint',
    subheadline: 'Prompt Library',
    headline: 'Capture great prompts once.',
    body: 'Use Add Prompt, tag everything clearly, and inject into active chat tabs in one click.',
    isPersonalize: false
  },
  {
    id: 'export',
    icon: '↑',
    iconClass: 'pn-card-icon--amber',
    subheadline: 'Precision Export',
    headline: 'Select only what matters.',
    body: 'Pick exact chat messages with in-page checkboxes, then export Markdown or PDF with live preview.',
    isPersonalize: false
  },
  {
    id: 'privacy',
    icon: '◉',
    iconClass: 'pn-card-icon--green',
    subheadline: 'Local & Private',
    headline: 'No backend required.',
    body: 'PromptNest stores data locally and uses built-in model-free smart features.',
    isPersonalize: false
  },
  {
    id: 'personalize',
    icon: '◈',
    iconClass: 'pn-card-icon--pink',
    subheadline: 'Personalize',
    headline: 'Tune suggestions for your workflow.',
    body: '',
    isPersonalize: true
  }
];

const state = {
  activeTab: 'prompts',
  pendingDuplicatePayload: null,
  settings: { ...DEFAULT_SETTINGS },
  exportPayload: null,
  exportPrefs: {
    format: DEFAULT_SETTINGS.defaultExportFormat,
    includeDate: DEFAULT_SETTINGS.defaultIncludeDate,
    includePlatform: DEFAULT_SETTINGS.defaultIncludePlatform
  },
  turndown: null,
  onboardingIndex: 0
};

/** Returns a required DOM node by id. */
const byId = async (id) => document.getElementById(id);

/** Creates and displays a short-lived toast message. */
const showToast = async (message) => {
  const toast = document.createElement('div');
  toast.className = 'pn-toast';
  toast.textContent = String(message || '').trim();
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2400);
};

/** Builds reusable empty state markup with icon and copy. */
const createEmptyState = async (message) => {
  const stateNode = document.createElement('div');
  stateNode.className = 'pn-empty-state';
  stateNode.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 6.5h16v11H4z"></path>
      <path d="M8 10h8"></path>
      <path d="M8 13h5"></path>
    </svg>
    <p>${String(message || '').trim()}</p>
  `;
  return stateNode;
};

/** Builds a reusable tag pill node. */
const createTagPill = async (tag) => {
  const pill = document.createElement('span');
  pill.className = 'pn-tag-pill';
  pill.textContent = String(tag || '').trim();
  return pill;
};

/** Escapes unsafe markup content. */
const escapeHtml = async (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

/** Removes inline style attributes and style tags before Turndown parses HTML under strict CSP. */
const stripInlineStylesFromHtml = async (rawHtml) => String(rawHtml || '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/\sstyle\s*=\s*"[^"]*"/gi, '')
  .replace(/\sstyle\s*=\s*'[^']*'/gi, '')
  .replace(/\sstyle\s*=\s*[^\s>]+/gi, '')
  .trim();

/** Converts comma-separated tag text into normalized string array. */
const parseTags = async (raw) => String(raw || '').split(',').map((item) => item.trim()).filter(Boolean);

/** Returns true when URL is one of supported LLM hosts. */
const isSupportedTabUrl = async (url) => {
  const value = String(url || '').toLowerCase();
  return [
    'https://chatgpt.com/',
    'https://claude.ai/',
    'https://gemini.google.com/',
    'https://www.perplexity.ai/',
    'https://copilot.microsoft.com/'
  ].some((prefix) => value.startsWith(prefix));
};

/** Returns active tab metadata used for inject actions. */
const getActiveTabContext = async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0] || null;

  return {
    tabId: tab?.id || null,
    url: tab?.url || '',
    supported: await isSupportedTabUrl(tab?.url || '')
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

/** Applies sticky underline indicator for active tab button. */
const updateTabIndicator = async () => {
  return;
};

/** Returns accent class for one onboarding card icon identifier. */
const getOnboardingIconClass = async (card) => String(card?.iconClass || 'pn-card-icon--violet');

/** Returns personalization inputs markup for final onboarding card. */
const renderOnboardingPersonalizeInputs = async () => `
  <div class="pn-onboard-inputs">
    <div class="pn-input-group">
      <label>What should we call you?</label>
      <input type="text" id="pn-onboard-user-name" placeholder="Your name" maxlength="32" autocomplete="off" />
    </div>
    <div class="pn-input-group">
      <label>What do you mainly use LLMs for?</label>
      <textarea id="pn-onboard-user-context" placeholder="e.g. coding, studying, research, writing..." maxlength="160" rows="2"></textarea>
    </div>
    <p class="pn-input-hint">This helps improve AI tag suggestions and prompt search context.</p>
  </div>
`;

/** Builds one onboarding slide section from static card metadata. */
const renderOnboardingCard = async (card, index) => `
  <section class="pn-onboard-card" data-onboard-index="${index}">
    <span class="pn-card-icon ${await getOnboardingIconClass(card)}">${card.icon}</span>
    <p class="pn-card-sub">${card.subheadline}</p>
    <h2 class="pn-card-headline">${card.headline}</h2>
    ${card.isPersonalize ? await renderOnboardingPersonalizeInputs() : `<p class="pn-card-body">${card.body}</p>`}
    <div class="pn-onboard-actions">
      <button class="pn-onboard-btn" type="button" data-action="onboard-next">${card.isPersonalize ? 'Finish Setup →' : 'Continue'}</button>
      ${card.isPersonalize ? '' : '<a class="pn-onboard-skip" href="#" data-action="onboard-skip">Skip</a>'}
    </div>
  </section>
`;

/** Updates onboarding card and dot states for current active index. */
const updateOnboardingPositions = async () => {
  const cards = Array.from(document.querySelectorAll('#pn-onboarding .pn-onboard-card'));
  const dots = Array.from(document.querySelectorAll('#pn-onboarding .pn-dot'));

  cards.forEach((card, index) => {
    card.classList.toggle('active', index === state.onboardingIndex);
    card.classList.toggle('exited', index < state.onboardingIndex);
    card.classList.toggle('pn-reveal', index === state.onboardingIndex);
  });

  dots.forEach((dot, index) => {
    dot.classList.toggle('active', index === state.onboardingIndex);
  });

  const nameInput = document.getElementById('pn-onboard-user-name');

  if (nameInput && state.onboardingIndex === ONBOARDING_CARDS.length - 1) {
    nameInput.focus();
  }
};

/** Completes onboarding state and removes overlay. */
const completeOnboarding = async () => {
  await chrome.storage.local.set({ [ONBOARDING_KEY]: true });
  const overlay = document.getElementById('pn-onboarding');
  overlay?.remove();
};

/** Handles onboarding continuation from each card step. */
const onOnboardingNext = async () => {
  if (state.onboardingIndex < ONBOARDING_CARDS.length - 1) {
    state.onboardingIndex += 1;
    await updateOnboardingPositions();
    return false;
  }

  const name = String(document.getElementById('pn-onboard-user-name')?.value || '').trim();
  const context = String(document.getElementById('pn-onboard-user-context')?.value || '').trim();

  await chrome.storage.local.set({
    userName: name,
    userContext: context
  });

  const aiInitialized = state.settings.enableAI ? await window.AI.initModel() : false;
  await completeOnboarding();
  return aiInitialized;
};

/** Jumps onboarding directly to personalization card. */
const onOnboardingSkip = async () => {
  state.onboardingIndex = ONBOARDING_CARDS.length - 1;
  await updateOnboardingPositions();
};

/** Renders and runs side panel onboarding if this is the first open. */
const maybeRunOnboarding = async () => {
  const onboardingState = await chrome.storage.local.get([ONBOARDING_KEY]);

  if (Boolean(onboardingState?.[ONBOARDING_KEY])) {
    return false;
  }

  state.onboardingIndex = 0;
  const overlay = document.createElement('div');
  overlay.id = 'pn-onboarding';

  const cardsMarkup = await Promise.all(ONBOARDING_CARDS.map((card, index) => renderOnboardingCard(card, index)));
  const dotsMarkup = ONBOARDING_CARDS.map((_, index) => `<span class="pn-dot${index === 0 ? ' active' : ''}"></span>`).join('');

  overlay.innerHTML = `
    <div class="pn-card-deck">${cardsMarkup.join('')}</div>
    <div class="pn-dot-row">${dotsMarkup}</div>
  `;

  document.body.appendChild(overlay);
  await updateOnboardingPositions();

  let aiInitialized = false;

  overlay.addEventListener('click', (event) => {
    void (async () => {
      const action = String(event.target?.dataset?.action || '');

      if (action === 'onboard-skip') {
        event.preventDefault();
        await onOnboardingSkip();
        return;
      }

      if (action === 'onboard-next') {
        event.preventDefault();
        aiInitialized = await onOnboardingNext();
      }
    })();
  });

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (!document.getElementById('pn-onboarding')) {
        clearInterval(interval);
        resolve(aiInitialized);
      }
    }, 120);
  });
};

/** Adjusts view-level controls when tab switches. */
const refreshHeaderControls = async () => {
  const addPromptButton = await byId('add-prompt-btn');
  const searchWrap = await byId('search-wrap');
  const isPromptTab = state.activeTab === 'prompts';

  if (addPromptButton) {
    addPromptButton.classList.toggle('hidden', !isPromptTab);
  }

  if (searchWrap) {
    searchWrap.classList.toggle('hidden', !isPromptTab);
  }
};

/** Switches active tab and updates visible content pane. */
const switchTab = async (tabName) => {
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const panes = Array.from(document.querySelectorAll('.tab-content'));

  state.activeTab = String(tabName || 'prompts');

  tabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === state.activeTab);
  });

  panes.forEach((pane) => {
    pane.classList.toggle('active', pane.dataset.tab === state.activeTab);
  });

  await refreshHeaderControls();
  await updateTabIndicator();
};

/** Sets plain fallback AI badge state when AI is disabled by settings. */
const setAiDisabledBadge = async () => {
  const statusNode = await byId('ai-status');
  const progressTrack = await byId('ai-progress-track');
  const progressText = await byId('ai-progress-text');

  if (statusNode) {
    statusNode.classList.remove('pn-ai-status--loading', 'pn-ai-status--ready');
    statusNode.classList.add('pn-ai-status--unavailable');
    statusNode.innerHTML = '<span class="pn-ai-dot"></span><span class="pn-ai-status__text">AI Disabled</span>';
  }

  if (progressTrack) {
    progressTrack.classList.add('hidden');
  }

  if (progressTrack instanceof HTMLProgressElement) {
    progressTrack.value = 0;
  }

  if (progressText) {
    progressText.textContent = 'Enable Smart Features in Settings to use ranking, tag suggestions, and duplicate checks.';
  }
};

/** Loads and merges side panel settings from local storage. */
const loadSettings = async () => {
  try {
    const snapshot = await chrome.storage.local.get([SETTINGS_KEY, 'userContext']);
    const saved = snapshot?.[SETTINGS_KEY] || {};
    const merged = {
      ...DEFAULT_SETTINGS,
      ...(saved || {})
    };

    const legacyContext = String(snapshot?.userContext || '').trim();

    if (!merged.userContext && legacyContext) {
      merged.userContext = legacyContext;
    }

    state.settings = await normalizeSettings(merged);
  } catch (_error) {
    state.settings = { ...DEFAULT_SETTINGS };
  }
};

/** Persists side panel settings and user context. */
const saveSettings = async () => {
  await chrome.storage.local.set({
    [SETTINGS_KEY]: state.settings,
    userContext: String(state.settings.userContext || '').trim()
  });
};

/** Returns one normalized settings object with safe defaults. */
const normalizeSettings = async (raw) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const exportFormat = String(source.defaultExportFormat || DEFAULT_SETTINGS.defaultExportFormat);

  return {
    enableAI: Boolean(source.enableAI),
    semanticSearch: Boolean(source.semanticSearch),
    autoSuggestTags: Boolean(source.autoSuggestTags),
    duplicateCheck: Boolean(source.duplicateCheck),
    defaultExportFormat: exportFormat === 'pdf' ? 'pdf' : 'markdown',
    defaultIncludeDate: Boolean(source.defaultIncludeDate),
    defaultIncludePlatform: Boolean(source.defaultIncludePlatform),
    userContext: String(source.userContext || '').trim()
  };
};

/** Returns all settings control nodes. */
const getSettingsControls = async () => ({
  enableAI: await byId('setting-enable-ai'),
  semanticSearch: await byId('setting-semantic-search'),
  autoSuggestTags: await byId('setting-auto-suggest'),
  duplicateCheck: await byId('setting-duplicate-check'),
  defaultExportFormat: await byId('setting-export-format'),
  defaultIncludeDate: await byId('setting-export-date'),
  defaultIncludePlatform: await byId('setting-export-platform'),
  userContext: await byId('setting-user-context')
});

/** Reads current settings control values into a normalized object without mutating state. */
const readSettingsControlsSnapshot = async () => {
  const controls = await getSettingsControls();
  return normalizeSettings({
    enableAI: controls.enableAI?.checked,
    semanticSearch: controls.semanticSearch?.checked,
    autoSuggestTags: controls.autoSuggestTags?.checked,
    duplicateCheck: controls.duplicateCheck?.checked,
    defaultExportFormat: controls.defaultExportFormat?.value,
    defaultIncludeDate: controls.defaultIncludeDate?.checked,
    defaultIncludePlatform: controls.defaultIncludePlatform?.checked,
    userContext: controls.userContext?.value
  });
};

/** Returns true when two settings payloads are equivalent. */
const areSettingsEqual = async (left, right) => {
  const a = await normalizeSettings(left);
  const b = await normalizeSettings(right);

  return (
    a.enableAI === b.enableAI &&
    a.semanticSearch === b.semanticSearch &&
    a.autoSuggestTags === b.autoSuggestTags &&
    a.duplicateCheck === b.duplicateCheck &&
    a.defaultExportFormat === b.defaultExportFormat &&
    a.defaultIncludeDate === b.defaultIncludeDate &&
    a.defaultIncludePlatform === b.defaultIncludePlatform &&
    a.userContext === b.userContext
  );
};

/** Applies current settings values into settings form controls. */
const renderSettingsControls = async (settingsInput = state.settings) => {
  const settings = await normalizeSettings(settingsInput);
  const controls = await getSettingsControls();

  if (controls.enableAI) {
    controls.enableAI.checked = Boolean(settings.enableAI);
  }

  if (controls.semanticSearch) {
    controls.semanticSearch.checked = Boolean(settings.semanticSearch);
  }

  if (controls.autoSuggestTags) {
    controls.autoSuggestTags.checked = Boolean(settings.autoSuggestTags);
  }

  if (controls.duplicateCheck) {
    controls.duplicateCheck.checked = Boolean(settings.duplicateCheck);
  }

  if (controls.defaultExportFormat) {
    controls.defaultExportFormat.value = String(settings.defaultExportFormat || 'markdown');
  }

  if (controls.defaultIncludeDate) {
    controls.defaultIncludeDate.checked = Boolean(settings.defaultIncludeDate);
  }

  if (controls.defaultIncludePlatform) {
    controls.defaultIncludePlatform.checked = Boolean(settings.defaultIncludePlatform);
  }

  if (controls.userContext) {
    controls.userContext.value = String(settings.userContext || '');
  }
};

/** Reads settings form controls into in-memory settings state. */
const readSettingsControls = async () => {
  state.settings = await readSettingsControlsSnapshot();
};

/** Writes a status line in the settings panel. */
const setSettingsStatus = async (message, tone = '') => {
  const node = await byId('settings-status');

  if (!node) {
    return;
  }

  const normalizedTone = String(tone || '').toLowerCase();
  node.textContent = String(message || '').trim();
  node.classList.remove('pn-status-error', 'pn-status-ok', 'pn-status-info');

  if (normalizedTone === 'error') {
    node.classList.add('pn-status-error');
  }

  if (normalizedTone === 'ok') {
    node.classList.add('pn-status-ok');
  }

  if (normalizedTone === 'info') {
    node.classList.add('pn-status-info');
  }
};

/** Enables save button only when settings controls differ from persisted state. */
const syncSettingsSaveState = async () => {
  const saveButton = await byId('save-settings-btn');
  const statusNode = await byId('settings-status');

  if (!saveButton) {
    return;
  }

  const draftSettings = await readSettingsControlsSnapshot();
  const hasChanges = !(await areSettingsEqual(draftSettings, state.settings));

  saveButton.disabled = !hasChanges;

  if (hasChanges) {
    await setSettingsStatus('Unsaved changes. Save to apply.', 'info');
    return;
  }

  if (statusNode?.classList.contains('pn-status-info')) {
    await setSettingsStatus('');
  }
};

/** Replaces current form values with defaults without persisting until Save is clicked. */
const resetSettingsDraft = async () => {
  await renderSettingsControls(DEFAULT_SETTINGS);
  const draftSettings = await readSettingsControlsSnapshot();
  const hasChanges = !(await areSettingsEqual(draftSettings, state.settings));
  await syncSettingsSaveState();

  if (hasChanges) {
    await setSettingsStatus('Defaults loaded. Save settings to apply.', 'info');
    return;
  }

  await setSettingsStatus('Settings already match defaults.', 'ok');
};

/** Applies settings defaults to export controls and state. */
const applyExportDefaultsFromSettings = async () => {
  state.exportPrefs = {
    format: String(state.settings.defaultExportFormat || 'markdown'),
    includeDate: Boolean(state.settings.defaultIncludeDate),
    includePlatform: Boolean(state.settings.defaultIncludePlatform)
  };

  const formatNode = await byId('export-format');
  const includeDateNode = await byId('include-date');
  const includePlatformNode = await byId('include-platform');

  if (formatNode) {
    formatNode.value = state.exportPrefs.format;
  }

  if (includeDateNode) {
    includeDateNode.checked = state.exportPrefs.includeDate;
  }

  if (includePlatformNode) {
    includePlatformNode.checked = state.exportPrefs.includePlatform;
  }
};

/** Refreshes AI runtime state based on current settings toggles. */
const syncAiState = async () => {
  if (!state.settings.enableAI) {
    await setAiDisabledBadge();
    return false;
  }

  const ready = await window.AI.initModel();

  if (!ready) {
    await showToast('Smart features unavailable. You can continue with basic keyword behavior.');
  }

  return ready;
};

/** Returns readable platform label from known platform id keys. */
const getPlatformLabel = async (platform) => {
  const key = String(platform || '').toLowerCase();
  return PLATFORM_LABELS[key] || String(platform || 'Unknown');
};

/** Filters prompts by text when semantic search is not enabled. */
const sidepanelKeywordFilter = async (query, prompts) => {
  const normalized = String(query || '').trim().toLowerCase();

  if (!normalized) {
    return prompts;
  }

  return prompts.filter((prompt) => {
    const titleMatch = String(prompt.title || '').toLowerCase().includes(normalized);
    const textMatch = String(prompt.text || '').toLowerCase().includes(normalized);
    const tagsMatch = (prompt.tags || []).join(' ').toLowerCase().includes(normalized);
    return titleMatch || textMatch || tagsMatch;
  });
};

/** Filters prompts with semantic mode if enabled, otherwise keyword mode. */
const filterPrompts = async (filter, prompts) => {
  const normalized = String(filter || '').trim();

  if (!normalized) {
    return prompts;
  }

  if (state.settings.enableAI && state.settings.semanticSearch) {
    return window.AI.semanticSearch(normalized, prompts);
  }

  return sidepanelKeywordFilter(normalized, prompts);
};

/** Renders one prompt card with inject and delete actions. */
const createPromptCard = async (prompt, activeFilter, canInject) => {
  const card = document.createElement('article');
  card.className = 'pn-prompt-card';

  const title = document.createElement('h3');
  title.className = 'pn-card-title';
  title.textContent = prompt.title;

  const text = document.createElement('p');
  text.className = 'pn-card-text';
  text.textContent = prompt.text;

  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'pn-tag-wrap';

  for (const tag of prompt.tags || []) {
    tagsWrap.appendChild(await createTagPill(tag));
  }

  const actions = document.createElement('div');
  actions.className = 'pn-card-actions';

  const injectButton = document.createElement('button');
  injectButton.className = 'pn-btn pn-btn--ghost';
  injectButton.type = 'button';
  injectButton.textContent = 'Inject';

  if (!canInject) {
    injectButton.disabled = true;
    injectButton.title = 'Open a supported LLM tab to inject.';
  } else {
    injectButton.addEventListener('click', () => {
      void (async () => {
        const response = await sendToActiveTab({ action: 'injectPrompt', text: prompt.text });

        if (!response?.ok) {
          await showToast(response?.error || 'Inject failed.');
        }
      })();
    });
  }

  const deleteButton = document.createElement('button');
  deleteButton.className = 'pn-btn pn-btn-danger';
  deleteButton.type = 'button';
  deleteButton.textContent = 'Delete';

  deleteButton.addEventListener('click', () => {
    void (async () => {
      const deleted = await window.Store.deletePrompt(prompt.id);

      if (!deleted) {
        await showToast('Failed to delete prompt.');
        return;
      }

      await renderPrompts(activeFilter);
      await renderTags();
    })();
  });

  if (typeof prompt._semanticScore === 'number') {
    const relevance = document.createElement('p');
    relevance.className = 'pn-relevance';
    relevance.textContent = `Relevance: ${(prompt._semanticScore * 100).toFixed(0)}%`;
    card.appendChild(relevance);
  }

  actions.appendChild(injectButton);
  actions.appendChild(deleteButton);
  card.appendChild(title);
  card.appendChild(text);
  card.appendChild(tagsWrap);
  card.appendChild(actions);
  return card;
};

/** Renders prompts list using active search query and settings behavior. */
const renderPrompts = async (filter = '') => {
  const container = await byId('prompt-list');

  if (!container) {
    return;
  }

  const prompts = await window.Store.getPrompts();
  const filtered = await filterPrompts(filter, prompts);
  const tabContext = await getActiveTabContext();

  container.innerHTML = '';

  if (!prompts.length) {
    container.appendChild(await createEmptyState('No prompts saved yet. Click Add Prompt to create one.'));
    return;
  }

  if (!filtered.length) {
    container.appendChild(await createEmptyState('No prompts found for your current search.'));
    return;
  }

  for (const prompt of filtered) {
    container.appendChild(await createPromptCard(prompt, String(filter || '').trim(), tabContext.supported));
  }
};

/** Renders one history card with export and delete actions. */
const createHistoryCard = async (entry) => {
  const card = document.createElement('article');
  card.className = 'pn-history-card';

  const title = document.createElement('h3');
  title.className = 'pn-card-title';
  title.textContent = entry.title || 'Untitled chat';

  const meta = document.createElement('p');
  meta.className = 'pn-card-meta';
  meta.textContent = `${await getPlatformLabel(entry.platform)} • ${new Date(entry.createdAt).toLocaleString()}`;

  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'pn-tag-wrap';

  for (const tag of entry.tags || []) {
    tagsWrap.appendChild(await createTagPill(tag));
  }

  const actions = document.createElement('div');
  actions.className = 'pn-card-actions';

  const exportMd = document.createElement('button');
  exportMd.className = 'pn-btn pn-btn--ghost';
  exportMd.type = 'button';
  exportMd.textContent = 'Export MD';

  exportMd.addEventListener('click', () => {
    void (async () => {
      const result = await window.Exporter.exportChat(entry, 'md');

      if (!result?.ok) {
        await showToast(result?.error || 'Markdown export failed.');
      }
    })();
  });

  const exportPdf = document.createElement('button');
  exportPdf.className = 'pn-btn pn-btn--ghost';
  exportPdf.type = 'button';
  exportPdf.textContent = 'Export PDF';

  exportPdf.addEventListener('click', () => {
    void (async () => {
      const result = await window.Exporter.exportChat(entry, 'pdf');

      if (!result?.ok) {
        await showToast(result?.error || 'PDF export failed.');
      }
    })();
  });

  const deleteButton = document.createElement('button');
  deleteButton.className = 'pn-btn pn-btn-danger';
  deleteButton.type = 'button';
  deleteButton.textContent = 'Delete';

  deleteButton.addEventListener('click', () => {
    void (async () => {
      const deleted = await window.Store.deleteChatFromHistory(entry.id);

      if (!deleted) {
        await showToast('Failed to delete history item.');
        return;
      }

      await renderHistory();
    })();
  });

  actions.appendChild(exportMd);
  actions.appendChild(exportPdf);
  actions.appendChild(deleteButton);

  card.appendChild(title);
  card.appendChild(meta);
  card.appendChild(tagsWrap);
  card.appendChild(actions);
  return card;
};

/** Renders chat history from newest to oldest. */
const renderHistory = async () => {
  const container = await byId('history-list');

  if (!container) {
    return;
  }

  const history = await window.Store.getChatHistory();
  const reversed = [...history].reverse();
  container.innerHTML = '';

  if (!reversed.length) {
    container.appendChild(await createEmptyState('No chat history yet. Export a chat to populate this section.'));
    return;
  }

  for (const entry of reversed) {
    container.appendChild(await createHistoryCard(entry));
  }
};

/** Saves prompts array directly to storage for batch tag rename/delete operations. */
const savePromptCollection = async (prompts) => {
  const nextPrompts = Array.isArray(prompts) ? prompts : [];
  await chrome.storage.local.set({ prompts: nextPrompts });
};

/** Builds a frequency map of tags currently used by saved prompts. */
const collectTags = async (prompts) => {
  const map = new Map();

  for (const prompt of prompts) {
    for (const tag of prompt.tags || []) {
      const normalized = String(tag || '').trim();

      if (!normalized) {
        continue;
      }

      map.set(normalized, (map.get(normalized) || 0) + 1);
    }
  }

  return Array.from(map.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
};

/** Renames one existing tag across all saved prompts. */
const renameTag = async (oldTag, nextTag) => {
  const prompts = await window.Store.getPrompts();
  const oldValue = String(oldTag || '').trim();
  const nextValue = String(nextTag || '').trim();

  if (!oldValue || !nextValue) {
    return false;
  }

  const nextPrompts = prompts.map((prompt) => {
    const updatedTags = (prompt.tags || []).map((tag) => {
      if (String(tag || '').trim() !== oldValue) {
        return String(tag || '').trim();
      }

      return nextValue;
    });

    return {
      ...prompt,
      tags: Array.from(new Set(updatedTags.filter(Boolean)))
    };
  });

  await savePromptCollection(nextPrompts);
  return true;
};

/** Removes one tag from all saved prompts. */
const deleteTag = async (tagToDelete) => {
  const prompts = await window.Store.getPrompts();
  const normalized = String(tagToDelete || '').trim();

  if (!normalized) {
    return false;
  }

  const nextPrompts = prompts.map((prompt) => ({
    ...prompt,
    tags: (prompt.tags || []).map((tag) => String(tag || '').trim()).filter((tag) => tag && tag !== normalized)
  }));

  await savePromptCollection(nextPrompts);
  return true;
};

/** Renders tag management rows with rename, delete, and filter actions. */
const renderTags = async () => {
  const container = await byId('tag-list');

  if (!container) {
    return;
  }

  const prompts = await window.Store.getPrompts();
  const tags = await collectTags(prompts);

  container.innerHTML = '';

  if (!tags.length) {
    container.appendChild(await createEmptyState('No tags yet. Add tags when saving prompts, then manage them here.'));
    return;
  }

  for (const item of tags) {
    const card = document.createElement('article');
    card.className = 'pn-history-card';

    const title = document.createElement('h3');
    title.className = 'pn-card-title';
    title.textContent = item.tag;

    const meta = document.createElement('p');
    meta.className = 'pn-card-meta';
    meta.textContent = `Used in ${item.count} prompt${item.count === 1 ? '' : 's'}`;

    const actions = document.createElement('div');
    actions.className = 'pn-card-actions';

    const filterButton = document.createElement('button');
    filterButton.className = 'pn-btn pn-btn--ghost';
    filterButton.type = 'button';
    filterButton.textContent = 'Filter';

    filterButton.addEventListener('click', () => {
      void (async () => {
        const search = await byId('prompt-search');

        if (search) {
          search.value = item.tag;
        }

        await switchTab('prompts');
        await renderPrompts(item.tag);
      })();
    });

    const renameButton = document.createElement('button');
    renameButton.className = 'pn-btn pn-btn--ghost';
    renameButton.type = 'button';
    renameButton.textContent = 'Rename';

    renameButton.addEventListener('click', () => {
      void (async () => {
        const nextValue = window.prompt(`Rename tag "${item.tag}" to:`, item.tag);

        if (nextValue === null) {
          return;
        }

        const normalized = String(nextValue || '').trim();

        if (!normalized) {
          await showToast('Tag name cannot be empty.');
          return;
        }

        await renameTag(item.tag, normalized);
        await renderTags();
        await renderPrompts(String((await byId('prompt-search'))?.value || ''));
        await showToast('Tag renamed.');
      })();
    });

    const deleteButton = document.createElement('button');
    deleteButton.className = 'pn-btn pn-btn-danger';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';

    deleteButton.addEventListener('click', () => {
      void (async () => {
        const confirmed = window.confirm(`Delete tag "${item.tag}" from all prompts?`);

        if (!confirmed) {
          return;
        }

        await deleteTag(item.tag);
        await renderTags();
        await renderPrompts(String((await byId('prompt-search'))?.value || ''));
        await showToast('Tag deleted from prompts.');
      })();
    });

    actions.appendChild(filterButton);
    actions.appendChild(renameButton);
    actions.appendChild(deleteButton);

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(actions);
    container.appendChild(card);
  }
};

/** Opens add prompt modal and clears previous values. */
const openModal = async () => {
  const modal = await byId('add-modal');
  const title = await byId('prompt-title');
  const text = await byId('prompt-text');
  const tags = await byId('prompt-tags');
  const confirmDuplicate = await byId('confirm-duplicate');

  state.pendingDuplicatePayload = null;

  if (title) {
    title.value = '';
  }

  if (text) {
    text.value = '';
  }

  if (tags) {
    tags.value = '';
  }

  confirmDuplicate?.classList.add('hidden');
  modal?.classList.remove('pn-hidden');
};

/** Closes add prompt modal and clears duplicate state. */
const closeModal = async () => {
  const modal = await byId('add-modal');
  const confirmDuplicate = await byId('confirm-duplicate');

  state.pendingDuplicatePayload = null;
  confirmDuplicate?.classList.add('hidden');
  modal?.classList.add('pn-hidden');
};

/** Auto-fills tags from AI suggestions when enabled and tag field is empty. */
const prefillSuggestedTags = async () => {
  if (!state.settings.enableAI || !state.settings.autoSuggestTags) {
    return;
  }

  const textInput = await byId('prompt-text');
  const tagsInput = await byId('prompt-tags');

  if (!textInput || !tagsInput || String(tagsInput.value || '').trim()) {
    return;
  }

  const suggestions = await window.AI.suggestTags(String(textInput.value || '').trim());

  if (suggestions.length) {
    tagsInput.value = suggestions.join(', ');
  }
};

/** Persists one prompt and refreshes prompts/tags sections. */
const persistPrompt = async (payload) => {
  const embeddingVector = state.settings.enableAI ? await window.AI.embedText(payload.text) : null;

  const saved = await window.Store.savePrompt({
    ...payload,
    embedding: embeddingVector ? Array.from(embeddingVector) : null
  });

  if (!saved) {
    await showToast('Failed to save prompt.');
    return false;
  }

  await closeModal();
  await renderPrompts(String((await byId('prompt-search'))?.value || ''));
  await renderTags();
  await showToast('Prompt saved.');
  return true;
};

/** Handles duplicate confirmation path for prompt save. */
const saveDuplicateAnyway = async () => {
  if (!state.pendingDuplicatePayload) {
    return;
  }

  await persistPrompt(state.pendingDuplicatePayload);
};

/** Saves prompt from modal fields with optional AI duplicate check and tag suggestion. */
const savePromptFromModal = async () => {
  const titleInput = await byId('prompt-title');
  const textInput = await byId('prompt-text');
  const tagsInput = await byId('prompt-tags');

  if (!titleInput || !textInput || !tagsInput) {
    return;
  }

  const titleValue = String(titleInput.value || '').trim();
  const textValue = String(textInput.value || '').trim();

  if (!titleValue || !textValue) {
    await showToast('Title and prompt text are required.');
    return;
  }

  await prefillSuggestedTags();

  const payload = {
    title: titleValue,
    text: textValue,
    tags: await parseTags(tagsInput.value || ''),
    category: null
  };

  if (state.settings.enableAI && state.settings.duplicateCheck) {
    const existingPrompts = await window.Store.getPrompts();
    const duplicate = await window.AI.isDuplicate(textValue, existingPrompts);

    if (duplicate.duplicate) {
      state.pendingDuplicatePayload = payload;
      (await byId('confirm-duplicate'))?.classList.remove('hidden');
      await showToast(`Similar prompt exists: ${duplicate.match?.title || 'Untitled'}. Save anyway?`);
      return;
    }
  }

  await persistPrompt(payload);
};

/** Normalizes session payload shape for export tab rendering. */
const normalizeExportPayload = async (rawPayload) => {
  const value = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
  const messages = Array.isArray(value.messages) ? value.messages : [];

  return {
    title: String(value.title || 'PromptNest Chat').trim(),
    platform: String(value.platform || 'unknown').trim(),
    url: String(value.url || '').trim(),
    createdAt: String(value.createdAt || new Date().toISOString()),
    messages: messages
      .map((message) => ({
        role: String(message?.role || 'assistant').toLowerCase(),
        text: String(message?.text || '').trim(),
        html: String(message?.html || '').trim()
      }))
      .filter((message) => message.text.length > 0)
  };
};

/** Loads latest selected export payload from storage.session. */
const loadExportPayload = async () => {
  const snapshot = await chrome.storage.session.get([SIDEPANEL_SESSION_KEY]);
  state.exportPayload = await normalizeExportPayload(snapshot?.[SIDEPANEL_SESSION_KEY]);
};

/** Returns lazily initialized Turndown converter instance. */
const getTurndownService = async () => {
  if (state.turndown) {
    return state.turndown;
  }

  if (!window.TurndownService) {
    return null;
  }

  state.turndown = new window.TurndownService({
    codeBlockStyle: 'fenced',
    headingStyle: 'atx',
    bulletListMarker: '-'
  });

  return state.turndown;
};

/** Converts one message row into markdown with role heading. */
const toMessageMarkdown = async (message, index) => {
  const roleLabel = message.role === 'user' ? 'You' : 'Assistant';
  const service = await getTurndownService();
  const rawHtml = String(message?.html || '').trim();
  const safeHtml = await stripInlineStylesFromHtml(rawHtml);
  const hasInlineStyleSignature = /(?:<style\b|style\s*=)/i.test(rawHtml) || /(?:<style\b|style\s*=)/i.test(safeHtml);

  if (service && safeHtml && !hasInlineStyleSignature) {
    const converted = service.turndown(`<div>${safeHtml}</div>`).trim();

    if (converted) {
      return `### ${index + 1}. ${roleLabel}\n\n${converted}`;
    }
  }

  return `### ${index + 1}. ${roleLabel}\n\n${message.text}`;
};

/** Builds markdown output for selected export payload and options. */
const buildMarkdown = async () => {
  const payload = state.exportPayload;

  if (!payload || !payload.messages.length) {
    return '';
  }

  const lines = [`# ${payload.title || 'PromptNest Chat'}`];

  if (state.exportPrefs.includePlatform) {
    lines.push(`Platform: ${await getPlatformLabel(payload.platform)}`);
  }

  if (state.exportPrefs.includeDate) {
    lines.push(`Exported: ${new Date().toLocaleString()}`);
  }

  const sections = [];

  for (let index = 0; index < payload.messages.length; index += 1) {
    sections.push(await toMessageMarkdown(payload.messages[index], index));
  }

  return `${lines.join('\n')}\n\n---\n\n${sections.join('\n\n---\n\n')}`.trim();
};

/** Creates styled HTML snapshot for preview and PDF generation. */
const buildPdfPreviewMarkup = async () => {
  const payload = state.exportPayload;

  if (!payload || !payload.messages.length) {
    return '<div class="pn-empty">No selected messages found. Select messages in chat and click Export Selected.</div>';
  }

  const platformLine = state.exportPrefs.includePlatform
    ? `<p class="pn-export-meta-line">Platform: ${await escapeHtml(await getPlatformLabel(payload.platform))}</p>`
    : '';

  const dateLine = state.exportPrefs.includeDate
    ? `<p class="pn-export-meta-line">Exported: ${await escapeHtml(new Date().toLocaleString())}</p>`
    : '';

  const rows = [];

  for (let index = 0; index < payload.messages.length; index += 1) {
    const message = payload.messages[index];
    const roleLabel = await escapeHtml(message.role === 'user' ? 'You' : 'Assistant');
    const messageText = (await escapeHtml(message.text)).replaceAll('\\n', '<br />');
    rows.push(`
      <article class="pn-export-card">
        <h3>${index + 1}. ${roleLabel}</h3>
        <p>${messageText}</p>
      </article>
    `);
  }

  return `
    <section id="pn-export-snapshot" class="pn-export-sheet">
      <header class="pn-export-head">
        <h2>${await escapeHtml(payload.title || 'PromptNest Chat')}</h2>
        ${platformLine}
        ${dateLine}
      </header>
      <div class="pn-export-list">${rows.join('')}</div>
    </section>
  `;
};

/** Writes export status text below export controls. */
const setExportStatus = async (message, isError = false) => {
  const node = await byId('export-status');

  if (!node) {
    return;
  }

  node.textContent = String(message || '').trim();
  node.classList.toggle('pn-status-error', Boolean(isError));
};

/** Synchronizes export preference state from currently rendered controls. */
const syncExportPrefsFromControls = async () => {
  const format = await byId('export-format');
  const includeDate = await byId('include-date');
  const includePlatform = await byId('include-platform');

  state.exportPrefs = {
    format: String(format?.value || state.exportPrefs.format || 'markdown'),
    includeDate: Boolean(includeDate?.checked),
    includePlatform: Boolean(includePlatform?.checked)
  };
};

/** Updates export summary metadata and export action label. */
const renderExportMeta = async () => {
  const payload = state.exportPayload;
  const selectionMeta = await byId('selection-meta');
  const previewLabel = await byId('preview-label');
  const exportButton = await byId('export-btn');
  const isPdf = state.exportPrefs.format === 'pdf';

  if (selectionMeta) {
    const count = payload?.messages?.length || 0;

    if (!count) {
      selectionMeta.textContent = 'No message selection received yet.';
    } else {
      selectionMeta.textContent = `${count} selected message${count === 1 ? '' : 's'} • ${await getPlatformLabel(payload.platform)}`;
    }
  }

  if (previewLabel) {
    previewLabel.textContent = isPdf ? 'PDF layout preview' : 'Markdown preview';
  }

  if (exportButton) {
    exportButton.textContent = isPdf ? 'Export PDF' : 'Export Markdown';
  }
};

/** Renders export preview area from current payload and selected format. */
const renderExportPreview = async () => {
  const preview = await byId('preview');

  if (!preview) {
    return;
  }

  const payload = state.exportPayload;

  if (!payload || !payload.messages.length) {
    preview.innerHTML = '<div class="pn-empty">No selected messages found. Select messages in chat and click Export Selected.</div>';
    await renderExportMeta();
    return;
  }

  if (state.exportPrefs.format === 'pdf') {
    preview.innerHTML = await buildPdfPreviewMarkup();
    await renderExportMeta();
    return;
  }

  const markdown = await buildMarkdown();
  preview.innerHTML = '<pre class="pn-markdown-preview"></pre>';
  const pre = preview.querySelector('pre');

  if (pre) {
    pre.textContent = markdown;
  }

  await renderExportMeta();
};

/** Generates deterministic export filename based on platform and date. */
const buildExportFilename = async (extension) => {
  const platform = String(state.exportPayload?.platform || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const date = new Date().toISOString().slice(0, 10);
  return `promptnest_${platform || 'unknown'}_${date}.${extension}`;
};

/** Downloads plain text content with blob-backed object URL. */
const downloadSidepanelText = async (content, filename, mimeType) => {
  const blob = new Blob([String(content || '')], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
};

/** Executes export action for markdown or PDF. */
const runExport = async () => {
  await syncExportPrefsFromControls();

  const payload = state.exportPayload;

  if (!payload || !payload.messages.length) {
    await setExportStatus('No selected messages available for export.', true);
    return;
  }

  if (state.exportPrefs.format === 'markdown') {
    const markdown = await buildMarkdown();

    if (!markdown) {
      await setExportStatus('Unable to build markdown output.', true);
      return;
    }

    await downloadSidepanelText(markdown, await buildExportFilename('md'), 'text/markdown;charset=utf-8');
    await setExportStatus('Markdown exported.');
    return;
  }

  if (!window.html2pdf) {
    await setExportStatus('html2pdf library unavailable.', true);
    return;
  }

  await renderExportPreview();

  const snapshot = document.getElementById('pn-export-snapshot');

  if (!snapshot) {
    await setExportStatus('Unable to render PDF snapshot.', true);
    return;
  }

  await setExportStatus('Building PDF...');

  try {
    await window.html2pdf()
      .set({
        margin: [16, 16, 16, 16],
        filename: await buildExportFilename('pdf'),
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#18181c' },
        jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' }
      })
      .from(snapshot)
      .save();

    await setExportStatus('PDF exported.');
  } catch (error) {
    await setExportStatus(error?.message || 'PDF export failed.', true);
  }
};

/** Applies settings/save flow and refreshes dependent UI state. */
const saveSettingsFromPanel = async () => {
  await readSettingsControls();
  await saveSettings();
  await applyExportDefaultsFromSettings();
  await renderExportPreview();

  if (state.settings.enableAI) {
    await syncAiState();
  } else {
    await setAiDisabledBadge();
  }

  await setSettingsStatus('Settings saved.', 'ok');
  await syncSettingsSaveState();
};

/** Loads session payload updates and keeps export tab live during FAB-triggered changes. */
const bindSessionPayloadUpdates = async () => {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'session' || !changes[SIDEPANEL_SESSION_KEY]) {
      return;
    }

    void (async () => {
      state.exportPayload = await normalizeExportPayload(changes[SIDEPANEL_SESSION_KEY].newValue);
      await renderExportPreview();
      await setExportStatus('Loaded latest selected messages.');

      if (state.exportPayload.messages.length > 0) {
        await switchTab('export');
      }
    })();
  });
};

/** Binds side panel event handlers for tabs, modal, search, export, and settings. */
const bindEvents = async () => {
  Array.from(document.querySelectorAll('.tab')).forEach((tab) => {
    tab.addEventListener('click', () => {
      void switchTab(String(tab.dataset.tab || 'prompts'));
    });
  });

  (await byId('add-prompt-btn'))?.addEventListener('click', () => {
    void openModal();
  });

  (await byId('save-new-prompt'))?.addEventListener('click', () => {
    void savePromptFromModal();
  });

  (await byId('confirm-duplicate'))?.addEventListener('click', () => {
    void saveDuplicateAnyway();
  });

  (await byId('cancel-modal'))?.addEventListener('click', () => {
    void closeModal();
  });

  document.querySelector('[data-close-modal]')?.addEventListener('click', () => {
    void closeModal();
  });

  (await byId('prompt-text'))?.addEventListener('blur', () => {
    void prefillSuggestedTags();
  });

  (await byId('prompt-search'))?.addEventListener('input', (event) => {
    const target = event.target;
    void renderPrompts(String(target?.value || ''));
  });

  (await byId('export-format'))?.addEventListener('change', () => {
    void (async () => {
      await syncExportPrefsFromControls();
      await renderExportPreview();
    })();
  });

  (await byId('include-date'))?.addEventListener('change', () => {
    void (async () => {
      await syncExportPrefsFromControls();
      await renderExportPreview();
    })();
  });

  (await byId('include-platform'))?.addEventListener('change', () => {
    void (async () => {
      await syncExportPrefsFromControls();
      await renderExportPreview();
    })();
  });

  (await byId('export-btn'))?.addEventListener('click', () => {
    void runExport();
  });

  (await byId('save-settings-btn'))?.addEventListener('click', () => {
    void saveSettingsFromPanel();
  });

  (await byId('reset-settings-btn'))?.addEventListener('click', () => {
    void resetSettingsDraft();
  });

  const settingsControlIds = [
    'setting-enable-ai',
    'setting-semantic-search',
    'setting-auto-suggest',
    'setting-duplicate-check',
    'setting-export-format',
    'setting-export-date',
    'setting-export-platform',
    'setting-user-context'
  ];

  for (const controlId of settingsControlIds) {
    const control = await byId(controlId);

    if (!control) {
      continue;
    }

    control.addEventListener('change', () => {
      void syncSettingsSaveState();
    });

    if (controlId === 'setting-user-context') {
      control.addEventListener('input', () => {
        void syncSettingsSaveState();
      });
    }
  }

  window.addEventListener('resize', () => {
    void updateTabIndicator();
  });
};

/** Initializes full side panel workspace and renders all sections. */
const init = async () => {
  await bindEvents();
  await loadSettings();
  await renderSettingsControls();
  await syncSettingsSaveState();
  await applyExportDefaultsFromSettings();
  await loadExportPayload();
  await bindSessionPayloadUpdates();

  const hasSelectionPayload = Boolean(state.exportPayload?.messages?.length);
  await switchTab(hasSelectionPayload ? 'export' : 'prompts');
  await renderPrompts('');
  await renderHistory();
  await renderTags();
  await renderExportPreview();

  const onboardingInitializedAi = await maybeRunOnboarding();

  if (state.settings.enableAI) {
    if (!onboardingInitializedAi) {
      await syncAiState();
    }

    const prompts = await window.Store.getPrompts();
    void window.AI.rehydratePromptEmbeddings(prompts);
  } else {
    await setAiDisabledBadge();
  }

  if (state.exportPayload?.messages?.length) {
    await setExportStatus('Selection loaded.');
  } else {
    await setExportStatus('Select messages in chat, then click Export Selected.', false);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  void init();
});
