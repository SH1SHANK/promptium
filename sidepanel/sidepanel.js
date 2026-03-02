/**
 * File: sidepanel/sidepanel.js
 * Purpose: Provides a full side-panel workspace for prompts, history, export, tags, and settings.
 * Communicates with: utils/storage.js, utils/exporter.js, utils/ai.js, content/content.js.
 */

const SIDEPANEL_SESSION_KEY = 'promptiumSidePanelPayload';
const SETTINGS_KEY = 'promptiumSettings';
const GEMINI_KEY = 'promptiumGeminiKey';
const IMPROVE_PAYLOAD_KEY = 'promptiumImprovePayload';
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

/** Reads Gemini key from session storage, with one-time migration from legacy local storage. */
const getStoredGeminiKey = async () => {
  const sessionSnapshot = await chrome.storage.session.get([GEMINI_KEY]);
  const sessionKey = String(sessionSnapshot?.[GEMINI_KEY] || '').trim();
  if (sessionKey) {
    return sessionKey;
  }

  const localSnapshot = await chrome.storage.local.get([GEMINI_KEY]);
  const localKey = String(localSnapshot?.[GEMINI_KEY] || '').trim();
  if (localKey) {
    await chrome.storage.session.set({ [GEMINI_KEY]: localKey });
    await chrome.storage.local.remove([GEMINI_KEY]).catch(() => {});
  }
  return localKey;
};

/** Stores Gemini key in session storage only and clears any persistent legacy copy. */
const setStoredGeminiKey = async (rawKey) => {
  const key = String(rawKey || '').trim();
  if (key) {
    await chrome.storage.session.set({ [GEMINI_KEY]: key });
  } else {
    await chrome.storage.session.remove([GEMINI_KEY]).catch(() => {});
  }
  await chrome.storage.local.remove([GEMINI_KEY]).catch(() => {});
};

// PLATFORM_LABELS and SUPPORTED_URLS now provided by utils/constants.js

const ONBOARDING_CARDS = [
  {
    id: 'welcome',
    icon: '✦',
    iconClass: 'pn-card-icon--violet',
    subheadline: 'Welcome to Promptium',
    headline: 'Your AI workflow, organized.',
    body: 'Promptium combines prompt storage, semantic search, templates, improvement tools, and export workflows in one place.',
    isPersonalize: false
  },
  {
    id: 'library',
    icon: '⌘',
    iconClass: 'pn-card-icon--mint',
    subheadline: 'Prompt Library',
    headline: 'Capture great prompts once.',
    body: 'Save prompts with tags and categories, then inject them directly into your active LLM chat.',
    isPersonalize: false
  },
  {
    id: 'search',
    icon: '◈',
    iconClass: 'pn-card-icon--pink',
    subheadline: 'Semantic Search',
    headline: 'Find prompts by meaning.',
    body: 'Transformers.js powers relevance ranking, vector similarity, and efficient local retrieval.',
    isPersonalize: false
  },
  {
    id: 'improve',
    icon: '✨',
    iconClass: 'pn-card-icon--violet',
    subheadline: 'Prompt Improvement',
    headline: 'Optimize before you send.',
    body: 'One click improves prompts and can inject optimized results into the active conversation.',
    isPersonalize: false
  },
  {
    id: 'export',
    icon: '↑',
    iconClass: 'pn-card-icon--amber',
    subheadline: 'Precision Export',
    headline: 'Select only what matters.',
    body: 'Select exact message ranges, then export Markdown, PDF, JSON, or plain text with custom formatting.',
    isPersonalize: false
  },
  {
    id: 'privacy',
    icon: '◉',
    iconClass: 'pn-card-icon--green',
    subheadline: 'Local & Private',
    headline: 'No backend required.',
    body: 'Promptium keeps prompts local in extension storage and uses privacy-first processing where possible.',
    isPersonalize: false
  },
  {
    id: 'launch',
    icon: '→',
    iconClass: 'pn-card-icon--pink',
    subheadline: 'Ready to start',
    headline: 'Choose your next step.',
    body: 'Open your library, jump to settings, or start directly.',
    isLaunch: true
  }
];

const state = {
  activeTab: 'prompts',
  pendingDuplicatePayload: null,
  settings: { ...DEFAULT_SETTINGS },
  exportPayload: null,
  exportSnapshotPayload: null,
  pendingExportPayload: null,
  hasPendingExportUpdate: false,
  exportPrefs: {
    format: DEFAULT_SETTINGS.defaultExportFormat,
    includeDate: DEFAULT_SETTINGS.defaultIncludeDate,
    includePlatform: DEFAULT_SETTINGS.defaultIncludePlatform,
    includeMessageNumbers: false,
    contentMode: 'structured',
    fontStyle: 'System',
    fontSize: 14,
    background: 'dark',
    customBackground: '#18181c'
  },
  turndown: null,
  onboardingIndex: 0,
  aiReady: false,
  semanticResults: null,
  _searchDebounce: null,
};
const UI_FEEDBACK_MS = Object.freeze({
  SEARCH_DEBOUNCE: 170,
  COPY_RESET: 1400,
  API_CHECK_RESET_SHORT: 1600,
  API_CHECK_RESET_LONG: 2200,
  IMPROVE_UNDO: 4200
});

const isEditableField = (node) => {
  if (!(node instanceof HTMLElement)) return false;
  if (node.isContentEditable || node instanceof HTMLTextAreaElement) return true;
  if (!(node instanceof HTMLInputElement)) return false;
  const type = String(node.type || 'text').toLowerCase();
  return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
};

// Safety guard: sidepanel export must never use html2pdf/html2canvas due MV3 CSP.
if (typeof window !== 'undefined' && typeof window.html2pdf === 'function') {
  try {
    delete window.html2pdf;
  } catch (_) {
    window.html2pdf = undefined;
  }
  console.warn('[Promptium] Disabled html2pdf in sidepanel (CSP-safe PDF path uses jsPDF exporter).');
}

// Prevent accidental html2canvas/doc.html() path usage in MV3 extension pages.
if (window?.jspdf?.jsPDF?.API && typeof window.jspdf.jsPDF.API.html === 'function') {
  window.jspdf.jsPDF.API.html = function blockedHtmlPlugin() {
    throw new Error('CSP-safe mode: jsPDF html() is disabled. Use Exporter.toPDF().');
  };
}

const stripInlineStylesFromHtml = (rawHtml) => String(rawHtml || '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/\sstyle\s*=\s*"[^"]*"/gi, '')
  .replace(/\sstyle\s*=\s*'[^']*'/gi, '')
  .replace(/\sstyle\s*=\s*[^\s>]+/gi, '')
  .trim();

const cloneExportPayload = (payload) => {
  if (!payload || !Array.isArray(payload.messages)) {
    return null;
  }
  return {
    ...payload,
    messages: payload.messages.map((message) => ({
      role: String(message?.role || 'assistant'),
      text: String(message?.text || ''),
      html: String(message?.html || '')
    }))
  };
};

const getActiveExportPayload = () => state.exportSnapshotPayload || state.exportPayload;
const STYLE_RULE_TYPE = typeof CSSRule === 'undefined' ? 1 : CSSRule.STYLE_RULE;

const resolveExportThemeColors = () => {
  const choice = String(state.exportPrefs.background || 'dark').toLowerCase();
  if (choice === 'light') {
    return { page: '#ffffff', text: '#111111', card: '#f7f7f7', border: 'rgba(17, 17, 17, 0.16)' };
  }
  if (choice === 'sepia') {
    return { page: '#f4ecd8', text: '#2f2417', card: '#fbf3df', border: 'rgba(47, 36, 23, 0.2)' };
  }
  if (choice === 'custom' && /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(String(state.exportPrefs.customBackground || ''))) {
    return { page: String(state.exportPrefs.customBackground), text: '#f5f5f5', card: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.2)' };
  }
  return { page: '#18181c', text: '#f5f5f5', card: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.16)' };
};

const getExportThemeClass = () => {
  const choice = String(state.exportPrefs.background || 'dark').toLowerCase();
  if (choice === 'light') return 'pn-export-sheet--theme-light';
  if (choice === 'sepia') return 'pn-export-sheet--theme-sepia';
  if (choice === 'custom') return 'pn-export-sheet--theme-custom';
  return 'pn-export-sheet--theme-dark';
};

const getExportFontClass = () => {
  const selected = String(state.exportPrefs.fontStyle || 'System').toLowerCase();
  if (selected.includes('jetbrains')) return 'pn-export-font--mono';
  if (selected.includes('georgia') || selected.includes('merriweather')) return 'pn-export-font--serif';
  if (selected.includes('outfit')) return 'pn-export-font--outfit';
  if (selected.includes('montserrat') || selected.includes('montstret')) return 'pn-export-font--montserrat';
  if (selected.includes('inter')) return 'pn-export-font--inter';
  if (selected.includes('helvetica') || selected.includes('helivica')) return 'pn-export-font--helvetica';
  if (selected.includes('poppins')) return 'pn-export-font--poppins';
  if (selected.includes('roboto')) return 'pn-export-font--roboto';
  if (selected.includes('open sans')) return 'pn-export-font--opensans';
  if (selected.includes('lato')) return 'pn-export-font--lato';
  if (selected.includes('nunito')) return 'pn-export-font--nunito';
  if (selected.includes('source sans')) return 'pn-export-font--sourcesans';
  return 'pn-export-font--system';
};

const getExportSizeClass = () => {
  const size = Math.min(20, Math.max(12, Number(state.exportPrefs.fontSize) || 14));
  return `pn-export-size-${size}`;
};

const normalizeHexColor = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) {
    return '';
  }
  if (raw.length === 4) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  return raw;
};

const parseHexToRgb = (hexColor) => {
  const normalized = normalizeHexColor(hexColor);
  if (!normalized) return null;
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16)
  };
};

const applyCustomExportThemeRules = (colorValue) => {
  const hex = normalizeHexColor(colorValue || state.exportPrefs.customBackground);
  if (!hex) return;

  const rgb = parseHexToRgb(hex);
  if (!rgb) return;

  const luminance = ((0.299 * rgb.r) + (0.587 * rgb.g) + (0.114 * rgb.b)) / 255;
  const text = luminance > 0.6 ? '#1a1a1a' : '#f5f5f5';
  const card = luminance > 0.6 ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.08)';
  const border = luminance > 0.6 ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.24)';

  const selectors = [
    {
      selector: '.pn-export-sheet.pn-export-sheet--theme-custom',
      styles: { background: hex, color: text }
    },
    {
      selector: '.pn-export-sheet.pn-export-sheet--theme-custom .pn-export-card',
      styles: { background: card, 'border-color': border }
    },
  ];

  for (const sheet of Array.from(document.styleSheets || [])) {
    let rules = [];
    try {
      rules = Array.from(sheet.cssRules || []);
    } catch (_) {
      continue;
    }
    for (const rule of rules) {
      if (rule.type !== STYLE_RULE_TYPE) continue;
      const match = selectors.find((entry) => entry.selector === rule.selectorText);
      if (!match) continue;
      for (const [property, styleValue] of Object.entries(match.styles)) {
        rule.style.setProperty(property, styleValue);
      }
    }
  }
};

const getOnboardingIconClass = (card) => String(card?.iconClass || 'pn-card-icon--violet');

const renderOnboardingCard = async (card, index) => `
  <section class="pn-onboard-card" data-onboard-index="${index}">
    <span class="pn-card-icon ${await getOnboardingIconClass(card)}">${card.icon}</span>
    <p class="pn-card-sub">${card.subheadline}</p>
    <h2 class="pn-card-headline">${card.headline}</h2>
    <p class="pn-card-body">${card.body}</p>
    ${
      card.isLaunch
        ? `<div class="pn-onboard-actions">
            <button class="pn-onboard-btn" type="button" data-action="onboard-get-started">Get Started</button>
            <button class="pn-onboard-btn pn-btn--ghost" type="button" data-action="onboard-open-library">Open Library</button>
            <button class="pn-onboard-btn pn-btn--ghost" type="button" data-action="onboard-go-settings">Go to Settings</button>
          </div>`
        : `<div class="pn-onboard-actions">
            <button class="pn-onboard-btn" type="button" data-action="onboard-next">Continue</button>
            <a class="pn-onboard-skip" href="#" data-action="onboard-skip">Skip</a>
          </div>`
    }
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
  await completeOnboarding();
  return state.settings.enableAI;
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
        return;
      }

      if (action === 'onboard-get-started') {
        event.preventDefault();
        await completeOnboarding();
        return;
      }

      if (action === 'onboard-open-library') {
        event.preventDefault();
        await completeOnboarding();
        await switchTab('prompts');
        return;
      }

      if (action === 'onboard-go-settings') {
        event.preventDefault();
        await completeOnboarding();
        await switchTab('settings');
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
const refreshHeaderControls = () => {
  const addPromptButton = byId('add-prompt-btn');
  const searchWrap = byId('search-wrap');
  const isPromptTab = state.activeTab === 'prompts';
  if (addPromptButton) addPromptButton.classList.toggle('hidden', !isPromptTab);
  if (searchWrap) {
    const isPromptOrTagsTab = isPromptTab || state.activeTab === 'tags';
    searchWrap.classList.toggle('hidden', !isPromptOrTagsTab);
  }
};

/** Switches active tab and updates visible content pane and header state. */
const switchTab = async (tabName) => {
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const panes = Array.from(document.querySelectorAll('.tab-content'));
  
  const isStandaloneView = ['history', 'settings', 'export'].includes(tabName);

  state.activeTab = String(tabName || 'prompts');

  tabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === state.activeTab);
  });

  panes.forEach((pane) => {
    pane.classList.toggle('active', pane.dataset.tab === state.activeTab);
  });

  const tabBar = document.querySelector('.pn-tab-bar');
  const searchWrap = document.getElementById('search-wrap');
  const backBtn = document.getElementById('back-btn');
  const addPromptBtn = document.getElementById('add-prompt-btn');
  const historyBtn = document.getElementById('history-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const refreshBtn = document.getElementById('refresh-btn');

  if (tabBar) tabBar.classList.toggle('hidden', isStandaloneView);
  if (searchWrap) {
    searchWrap.classList.toggle('hidden', isStandaloneView);
  }
  
  if (backBtn) backBtn.classList.toggle('hidden', !isStandaloneView);
  if (addPromptBtn) addPromptBtn.classList.toggle('hidden', isStandaloneView);
  if (historyBtn) historyBtn.classList.toggle('hidden', isStandaloneView);
  if (settingsBtn) settingsBtn.classList.toggle('hidden', isStandaloneView);
  if (refreshBtn) refreshBtn.classList.toggle('hidden', isStandaloneView);

  refreshHeaderControls();

  if (state.activeTab === 'export') {
    if (!state.exportSnapshotPayload) {
      state.exportSnapshotPayload = cloneExportPayload(state.exportPayload);
    }
    await renderExportMeta();
  }
};

/** Sets plain fallback AI badge state when AI is disabled by settings. */
const setAiDisabledBadge = async () => {
  const statusNode = byId('ai-status');
  const progressTrack = byId('ai-progress-track');
  const progressText = byId('ai-progress-text');

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
    progressText.textContent = 'Disabled';
  }

  const modelPill = document.getElementById('pn-model-pill');
  if (modelPill) modelPill.classList.remove('pn-sv-model-pill--ready');
};

/** Loads and merges side panel settings from local storage. */
const loadSettings = async () => {
  try {
    const snapshot = await chrome.storage.local.get([SETTINGS_KEY, 'userContext']);
    const saved = snapshot?.[SETTINGS_KEY] || {};
    const merged = { ...DEFAULT_SETTINGS, ...(saved || {}) };
    const legacyContext = String(snapshot?.userContext || '').trim();
    if (!merged.userContext && legacyContext) merged.userContext = legacyContext;
    state.settings = normalizeSettings(merged);
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
const normalizeSettings = (raw) => {
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
const getSettingsControls = () => ({
  enableAI: byId('setting-enable-ai'),
  semanticSearch: byId('setting-semantic-search'),
  autoSuggestTags: byId('setting-auto-suggest'),
  duplicateCheck: byId('setting-duplicate-check'),
  defaultExportFormat: byId('setting-export-format'),
  defaultIncludeDate: byId('setting-export-date'),
  defaultIncludePlatform: byId('setting-export-platform'),
  userContext: byId('setting-user-context')
});

/** Reads current settings control values into a normalized object without mutating state. */
const readSettingsControlsSnapshot = () => {
  const controls = getSettingsControls();
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
const areSettingsEqual = (left, right) => {
  const a = normalizeSettings(left);
  const b = normalizeSettings(right);
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
const renderSettingsControls = (settingsInput = state.settings) => {
  const settings = normalizeSettings(settingsInput);
  const controls = getSettingsControls();

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
const readSettingsControls = () => {
  state.settings = readSettingsControlsSnapshot();
};

/** Writes a status line in the settings panel. */
const setSettingsStatus = (message, tone = '') => {
  const node = byId('settings-status');

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
  const saveButton = byId('save-settings-btn');
  const statusNode = byId('settings-status');
  if (!saveButton) return;
  const draftSettings = readSettingsControlsSnapshot();
  const promptiumGeminiKey = await getStoredGeminiKey();
  const currentKey = String(byId('setting-gemini-key')?.value || '').trim();
  const storedKey = String(promptiumGeminiKey || '').trim();
  
  const hasChanges = !areSettingsEqual(draftSettings, state.settings) || currentKey !== storedKey;
  saveButton.disabled = !hasChanges;
  if (hasChanges) {
    setSettingsStatus('Unsaved changes. Save to apply.', 'info');
    return;
  }
  if (statusNode?.classList.contains('pn-status-info')) {
    setSettingsStatus('');
  }
};

/** Replaces current form values with defaults without persisting until Save is clicked. */
const resetSettingsDraft = async () => {
  renderSettingsControls(DEFAULT_SETTINGS);
  const draftSettings = readSettingsControlsSnapshot();
  const promptiumGeminiKey = await getStoredGeminiKey();
  const currentKey = String(byId('setting-gemini-key')?.value || '').trim();
  const storedKey = String(promptiumGeminiKey || '').trim();

  const hasChanges = !areSettingsEqual(draftSettings, state.settings) || currentKey !== storedKey;
  await syncSettingsSaveState();
  if (hasChanges) {
    setSettingsStatus('Defaults loaded. Save settings to apply.', 'info');
    return;
  }
  setSettingsStatus('Settings already match defaults.', 'ok');
};

/** Applies settings defaults to export controls and state. */
const applyExportDefaultsFromSettings = () => {
  state.exportPrefs = {
    format: String(state.settings.defaultExportFormat || 'markdown'),
    includeDate: Boolean(state.settings.defaultIncludeDate),
    includePlatform: Boolean(state.settings.defaultIncludePlatform),
    includeMessageNumbers: false,
    contentMode: 'structured',
    fontStyle: 'System',
    fontSize: 14,
    background: 'dark',
    customBackground: '#18181c'
  };
  const formatNode = byId('export-format');
  const contentModeNode = byId('export-content-mode');
  const includeDateNode = byId('include-date');
  const includePlatformNode = byId('include-platform');
  const includeNumbersNode = byId('include-msg-numbers');
  const fontStyleNode = byId('export-font-style');
  const fontSizeNode = byId('export-font-size');
  const fontSizeNumberNode = byId('export-font-size-number');
  const backgroundNode = byId('export-bg-style');
  const customBgNode = byId('export-bg-custom');
  const customWrapNode = byId('export-bg-custom-wrap');
  if (formatNode) formatNode.value = state.exportPrefs.format;
  if (contentModeNode) contentModeNode.value = state.exportPrefs.contentMode;
  if (includeDateNode) includeDateNode.checked = state.exportPrefs.includeDate;
  if (includePlatformNode) includePlatformNode.checked = state.exportPrefs.includePlatform;
  if (includeNumbersNode) {
    includeNumbersNode.checked = state.exportPrefs.includeMessageNumbers;
    includeNumbersNode.disabled = state.exportPrefs.contentMode === 'combined';
  }
  if (fontStyleNode) fontStyleNode.value = state.exportPrefs.fontStyle;
  if (fontSizeNode) fontSizeNode.value = String(state.exportPrefs.fontSize);
  if (fontSizeNumberNode) fontSizeNumberNode.value = String(state.exportPrefs.fontSize);
  if (backgroundNode) backgroundNode.value = state.exportPrefs.background;
  if (customBgNode) customBgNode.value = state.exportPrefs.customBackground;
  customWrapNode?.classList.toggle('pn-hidden', state.exportPrefs.background !== 'custom');
  applyCustomExportThemeRules(state.exportPrefs.customBackground);
};

/** Refreshes AI runtime state based on current settings toggles. */
let _aiStatusHandler = null;
const syncAiState = async () => {
  if (!state.settings.enableAI) {
    await setAiDisabledBadge();
    state.aiReady = false;
    return false;
  }

  const aiBar = document.getElementById('pn-ai-bar');
  const retryButton = document.getElementById('pn-ai-retry-btn');
  if (aiBar) {
    aiBar.classList.remove('pn-ai-bar--hidden', 'pn-ai-bar--ready');
    aiBar.classList.add('pn-ai-bar--loading');
  }
  retryButton?.classList.add('pn-hidden');

  // Remove previous listener to prevent leak (H-2)
  if (_aiStatusHandler) {
    chrome.runtime.onMessage.removeListener(_aiStatusHandler);
  }
  _aiStatusHandler = (msg) => {
    if (msg?.type === 'AI_DOWNLOAD_PROGRESS') {
      const progressText = document.getElementById('ai-progress-text');
      if (progressText) progressText.textContent = `Downloading... ${msg.progress}%`;
      return;
    }

    if (msg?.type === 'AI_STATUS') {
      if (msg.status === 'loading') {
        const progressText = document.getElementById('ai-progress-text');
        if (progressText && !progressText.textContent.startsWith('Downloading')) {
          progressText.textContent = 'Initializing...';
        }
        retryButton?.classList.add('pn-hidden');
      }

      if (msg.status === 'ready') {
        state.aiReady = true;
        if (aiBar) {
          aiBar.classList.remove('pn-ai-bar--loading');
          aiBar.classList.add('pn-ai-bar--ready');
        }
        const searchInput = document.getElementById('prompt-search');
        if (searchInput) searchInput.placeholder = 'Semantic search...';

        const progressText = document.getElementById('ai-progress-text');
        if (progressText) progressText.textContent = '✦ Ready';

        const modelPill = document.getElementById('pn-model-pill');
        if (modelPill) modelPill.classList.add('pn-sv-model-pill--ready');
        retryButton?.classList.add('pn-hidden');

        const spark = document.getElementById('pn-search-spark');
        if (spark) spark.classList.remove('pn-hidden');

        const statusNode = document.getElementById('ai-status');
        if (statusNode) {
          statusNode.classList.remove('pn-ai-status--loading', 'pn-ai-status--unavailable');
          statusNode.classList.add('pn-ai-status--ready');
          statusNode.innerHTML = '<span class="pn-ai-dot"></span><span class="pn-ai-status__text">Smart</span>';
        }

        void loadSmartSuggestions();
      }
      if (msg.status === 'failed') {
        state.aiReady = false;
        if (aiBar) {
          aiBar.classList.remove('pn-ai-bar--loading');
          aiBar.classList.add('pn-ai-bar--hidden');
        }
        const progressText = document.getElementById('ai-progress-text');
        if (progressText) {
          progressText.textContent = msg.error ? `Unavailable - ${msg.error}` : 'Unavailable — using keywords';
        }

        const modelPill = document.getElementById('pn-model-pill');
        if (modelPill) modelPill.classList.remove('pn-sv-model-pill--ready');
        retryButton?.classList.remove('pn-hidden');
      }
    }
  };

  chrome.runtime.onMessage.addListener(_aiStatusHandler);

  // Request model init
  const result = await window.AIBridge.init();
  const ready = result?.status === 'ready';

  if (ready) {
    state.aiReady = true;
    _aiStatusHandler({ type: 'AI_STATUS', status: 'ready' });
  }

  return ready;
};

/** Returns readable platform label from known platform id keys. */
const getPlatformLabel = (platform) => {
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
    state.semanticResults = null;
    return prompts;
  }

  // Always start with keyword results for instant feedback
  const keywordResults = await sidepanelKeywordFilter(normalized, prompts);

  // If AI is ready and semantic search is enabled, do a semantic re-rank
  if (state.aiReady && state.settings.enableAI && state.settings.semanticSearch) {
    try {
      const response = await window.AIBridge.search(normalized);
      if (response?.results) {
        state.semanticResults = new Map(response.results.map(r => [r.id, r]));

        // Merge: keyword results first (re-ordered by semantic), then semantic-only
        const promptMap = new Map(prompts.map(p => [p.id, p]));
        const seen = new Set();
        const merged = [];

        // Ordered by semantic score
        for (const r of response.results) {
          if (promptMap.has(r.id)) {
            merged.push(promptMap.get(r.id));
            seen.add(r.id);
          }
        }

        // Add keyword-only hits that semantic missed
        for (const p of keywordResults) {
          if (!seen.has(p.id)) {
            merged.push(p);
          }
        }

        return merged;
      }
    } catch (_) {
      // Fall through to keyword results
    }
  }

  state.semanticResults = null;
  return keywordResults;
};

/** Renders one prompt card with inject and delete actions. */
const createPromptCard = async (prompt, activeFilter, canInject) => {
  const card = document.createElement('article');
  card.className = 'pn-prompt-card';

  const title = document.createElement('h3');
  title.className = 'pn-card-title';
  title.textContent = prompt.title;

  if (prompt.isTemplate) {
    const badge = document.createElement('span');
    badge.className = 'pn-template-badge';
    badge.textContent = 'TEMPLATE';
    title.appendChild(badge);
  }

  const text = document.createElement('p');
  text.className = 'pn-card-text';
  text.textContent = prompt.text;

  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'pn-tag-wrap';

  for (const tag of prompt.tags || []) {
    const pill = createTagPill(tag);
    pill.classList.add('pn-tag-pill--clickable');
    pill.title = `Filter by #${tag}`;
    pill.addEventListener('click', () => {
      const search = document.getElementById('prompt-search');
      if (search) {
        search.value = tag;
      }
      void renderPrompts(tag);
    });
    tagsWrap.appendChild(pill);
  }

  const actions = document.createElement('div');
  actions.className = 'pn-card-actions';

  const injectButton = document.createElement('button');
  injectButton.className = 'pn-btn pn-btn--ghost';
  injectButton.type = 'button';
  injectButton.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="pn-btn-icon" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3a4 4 0 0 0 4-4V4a2 2 0 0 1 4 0v5h3.6a2 2 0 0 1 1.93 2.5l-2 7a2 2 0 0 1-1.93 1.5H8"></path></svg>Use Prompt`;

  if (!canInject) {
    injectButton.disabled = true;
    injectButton.title = 'Open a supported LLM tab to inject.';
  } else {
    injectButton.addEventListener('click', () => {
      void (async () => {
        const response = await sendToActiveTab({ action: 'injectPrompt', text: prompt.text });

        if (!response?.ok) {
          await showToast(response?.error || 'Inject failed.');
          return;
        }
        await showToast('Injected. Undo in chat.');
      })();
    });
  }

  const improveButton = document.createElement('button');
  improveButton.className = 'pn-btn pn-btn--ghost';
  improveButton.type = 'button';
  improveButton.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="pn-btn-icon pn-btn-icon--accent" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v19"></path><path d="M5 10l7-7 7 7"></path></svg>Improve`;
  improveButton.title = 'Improve prompt with AI';
  improveButton.addEventListener('click', () => {
    void openImproveModal(prompt.id, prompt.text, prompt.tags || []);
  });

  const deleteButton = document.createElement('button');
  deleteButton.className = 'pn-btn pn-btn-danger';
  deleteButton.type = 'button';
  deleteButton.textContent = 'Remove';

  deleteButton.addEventListener('click', () => {
    void (async () => {
      const deleted = await window.Store.deletePrompt(prompt.id);

      if (!deleted) {
        showToast('Delete failed.');
        return;
      }

      // Remove from AI embedding cache
      if (state.aiReady) {
        void window.AIBridge.cacheRemove(prompt.id);
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

  // Semantic spark indicator
  if (state.semanticResults?.get(prompt.id)?.semanticOnly) {
    const spark = document.createElement('span');
    spark.className = 'pn-spark';
    spark.title = 'Found by meaning';
    spark.textContent = '✦';
    title.appendChild(spark);
  }

  if (prompt.isTemplate) {
    const saveButton = document.createElement('button');
    saveButton.className = 'pn-btn pn-btn-primary';
    saveButton.type = 'button';
    saveButton.textContent = 'Save to My Prompts';
    saveButton.addEventListener('click', () => {
      void (async () => {
        const saved = await window.Store.savePrompt({
          title: prompt.title,
          text: prompt.text,
          tags: prompt.tags,
          category: prompt.category
        });
        if (saved) {
          await showToast('Template saved to library.');
        } else {
          await showToast('Template save failed.');
        }
      })();
    });
    actions.appendChild(injectButton);
    actions.appendChild(saveButton);
  } else {
    actions.appendChild(injectButton);
    actions.appendChild(improveButton);
    actions.appendChild(deleteButton);
  }
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
  let templates = window.PromptTemplates ? window.PromptTemplates.getTemplates(filter) : [];

  // Filter out any templates that the user has already saved
  const savedSignatures = new Set(prompts.map(p => `${p.title.trim()}|${p.text.trim()}`));
  templates = templates.filter(t => !savedSignatures.has(`${t.title.trim()}|${t.text.trim()}`));

  container.innerHTML = '';

  if (!prompts.length && !templates.length) {
    container.appendChild(createEmptyState({
      title: 'No Prompts Available',
      message: 'Start your library by creating a prompt or saving a curated template.',
      actionLabel: 'Add Prompt',
      onAction: () => { void openModal(); }
    }));
    return;
  }

  if (!filtered.length && !templates.length) {
    container.appendChild(createEmptyState({
      title: 'No results found',
      message: 'Try a broader query or remove active filters.',
      actionLabel: 'Clear Filters',
      onAction: () => {
        const searchInput = document.getElementById('prompt-search');
        if (searchInput) {
          searchInput.value = '';
        }
        void renderPrompts('');
      }
    }));
    return;
  }

  for (const prompt of filtered) {
    container.appendChild(await createPromptCard(prompt, String(filter || '').trim(), tabContext.supported));
  }

  if (templates.length > 0) {
    const divider = document.createElement('div');
    divider.className = 'pn-template-divider';
    
    const header = document.createElement('button');
    header.className = 'pn-template-header';
    header.innerHTML = `
      <span>Curated Templates (${templates.length})</span>
      <svg class="pn-template-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;
    
    const tempsContainer = document.createElement('div');
    tempsContainer.className = 'pn-template-grid';
    const isFiltered = filter.trim().length > 0;
    if (!isFiltered) {
      tempsContainer.dataset.collapsed = "true";
      header.classList.add('collapsed');
    }

    header.addEventListener('click', () => {
      const isCollapsed = tempsContainer.dataset.collapsed === "true";
      tempsContainer.dataset.collapsed = isCollapsed ? "false" : "true";
      header.classList.toggle('collapsed', !isCollapsed);
    });

    divider.appendChild(header);
    divider.appendChild(tempsContainer);
    
    for (const tpl of templates) {
      tempsContainer.appendChild(await createPromptCard(tpl, String(filter || '').trim(), tabContext.supported));
    }
    
    container.appendChild(divider);
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
  meta.textContent = `${getPlatformLabel(entry.platform)} • ${new Date(entry.createdAt).toLocaleString()}`;

  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'pn-tag-wrap';

  for (const tag of entry.tags || []) {
    tagsWrap.appendChild(createTagPill(tag));
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
        await showToast('Delete failed.');
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
    container.appendChild(createEmptyState('No chat history yet. Export a chat to populate this section.'));
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
  const container = document.getElementById('tag-list');
  const filterBar = document.getElementById('pn-tag-filter-bar');
  const emptyState = document.getElementById('pn-tags-empty');

  if (!container) {
    return;
  }

  const prompts = await window.Store.getPrompts();
  const tags = await collectTags(prompts);

  // Clear existing rows (keep empty state node)
  container.querySelectorAll('.pn-tag-row').forEach((r) => r.remove());

  // Clear filter bar
  if (filterBar) {
    filterBar.innerHTML = '';
  }

  if (!tags.length) {
    if (emptyState) emptyState.classList.remove('pn-hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('pn-hidden');

  // Render filter chips
  if (filterBar) {
    for (const item of tags) {
      const chip = document.createElement('button');
      chip.className = 'pn-tag-filter-chip';
      chip.type = 'button';
      chip.dataset.tag = item.tag;
      chip.textContent = `${item.tag} `;
      const count = document.createElement('span');
      count.className = 'pn-tag-count';
      count.textContent = String(item.count);
      chip.appendChild(count);
      chip.addEventListener('click', () => {
        const isActive = chip.classList.contains('active');
        filterBar.querySelectorAll('.pn-tag-filter-chip').forEach((c) =>
          c.classList.remove('active')
        );
        if (!isActive) {
          chip.classList.add('active');
          void (async () => {
            const search = document.getElementById('prompt-search');
            if (search) search.value = item.tag;
            await switchTab('prompts');
            await renderPrompts(item.tag);
          })();
        } else {
          void (async () => {
            const search = document.getElementById('prompt-search');
            if (search) search.value = '';
            await switchTab('prompts');
            await renderPrompts('');
          })();
        }
      });
      filterBar.appendChild(chip);
    }
  }

  // Render tag management rows
  for (const item of tags) {
    const row = document.createElement('div');
    row.className = 'pn-tag-row';

    const left = document.createElement('div');
    left.className = 'pn-tag-row-left';

    const dot = document.createElement('span');
    dot.className = 'pn-tag-dot';

    const name = document.createElement('span');
    name.className = 'pn-tag-name';
    name.textContent = item.tag;

    const count = document.createElement('span');
    count.className = 'pn-tag-count-badge';
    count.textContent = `${item.count} prompt${item.count === 1 ? '' : 's'}`;

    left.appendChild(dot);
    left.appendChild(name);
    left.appendChild(count);

    const actions = document.createElement('div');
    actions.className = 'pn-tag-row-actions';

    const renameBtn = document.createElement('button');
    renameBtn.className = 'pn-tag-action-btn rename';
    renameBtn.type = 'button';
    renameBtn.title = 'Rename';
    renameBtn.textContent = '\u270e';
    renameBtn.addEventListener('click', () => {
      void (async () => {
        const nextValue = window.prompt(`Rename tag "${item.tag}" to:`, item.tag);
        if (nextValue === null) return;
        const normalized = String(nextValue || '').trim();
        if (!normalized) {
          await showToast('Tag name cannot be empty.');
          return;
        }
        await renameTag(item.tag, normalized);
        await renderTags();
        await renderPrompts(String(document.getElementById('prompt-search')?.value || ''));
        await showToast('Tag renamed.');
      })();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'pn-tag-action-btn delete';
    deleteBtn.type = 'button';
    deleteBtn.title = 'Remove from all prompts';
    deleteBtn.textContent = '\u2715';
    deleteBtn.addEventListener('click', () => {
      void (async () => {
        const confirmed = window.confirm(`Delete tag "${item.tag}" from all prompts?`);
        if (!confirmed) return;
        await deleteTag(item.tag);
        await renderTags();
        await renderPrompts(String(document.getElementById('prompt-search')?.value || ''));
        await showToast('Tag deleted from prompts.');
      })();
    });

    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);

    row.appendChild(left);
    row.appendChild(actions);
    container.appendChild(row);
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

  if (title) title.value = '';
  if (text) text.value = '';
  if (tags) tags.value = '';

  // Clear badge tags
  const badgeWrap = document.getElementById('tag-badges-wrap');
  if (badgeWrap) {
    badgeWrap.querySelectorAll('.pn-tag-badge').forEach(b => b.remove());
  }
  const tagInput = document.getElementById('prompt-tags-input');
  if (tagInput) tagInput.value = '';

  // Clear AI suggestion containers
  const suggestionsEl = document.getElementById('pn-tag-suggestions');
  if (suggestionsEl) suggestionsEl.innerHTML = '';
  const dupWarnEl = document.getElementById('pn-duplicate-warning');
  if (dupWarnEl) { dupWarnEl.innerHTML = ''; dupWarnEl.classList.add('pn-hidden'); }

  confirmDuplicate?.classList.add('hidden');
  modal?.classList.remove('pn-hidden');
  title?.focus();
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
  if (!state.settings.enableAI || !state.settings.autoSuggestTags || !state.aiReady) {
    return;
  }

  const textInput = await byId('prompt-text');
  const tagsHidden = await byId('prompt-tags');
  const suggestionsEl = document.getElementById('pn-tag-suggestions');

  if (!textInput || !tagsHidden) return;
  if (String(tagsHidden.value || '').trim()) return;

  const promptText = String(textInput.value || '').trim();
  if (!promptText) return;

  try {
    const response = await window.AIBridge.suggestTags(promptText);
    const tags = response?.tags ?? [];
    if (!tags.length || !suggestionsEl) return;

    suggestionsEl.innerHTML = '<span class="pn-tag-suggestions__label">Suggested</span>';
    for (const tag of tags) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pn-tag-chip--suggestion';
      chip.textContent = tag;
      chip.addEventListener('click', () => {
        addTagBadge(tag);
        chip.remove();
        if (!suggestionsEl.querySelector('.pn-tag-chip--suggestion')) {
          suggestionsEl.innerHTML = '';
        }
      });
      suggestionsEl.appendChild(chip);
    }
  } catch (_) {}
};

/** Persists one prompt and refreshes prompts/tags sections. */
const persistPrompt = async (payload) => {
  const saved = await window.Store.savePrompt({
    ...payload,
    embedding: null
  });

  if (!saved) {
    const storageError = window.Store?.getLastError?.() || '';
    if (window.Store?.isQuotaError?.(storageError)) {
      await showToast('Storage quota exceeded. Delete older prompts or chat history, then try again.');
      await switchTab('history');
    } else {
      await showToast('Save failed.');
    }
    return false;
  }

  // Add to AI embedding cache
  if (state.aiReady && saved.id) {
    void window.AIBridge.cacheAdd(saved);
  }

  await closeModal();
  await renderPrompts(String((await byId('prompt-search'))?.value || ''));
  await renderTags();
  await showToast('Prompt saved to library.');
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
  const tagsHidden = await byId('prompt-tags');

  if (!titleInput || !textInput || !tagsHidden) return;

  const titleValue = String(titleInput.value || '').trim();
  const textValue = String(textInput.value || '').trim();

  if (!titleValue || !textValue) {
    await showToast('Title and prompt text are required.');
    return;
  }

  const payload = {
    title: titleValue,
    text: textValue,
    tags: parseTags(tagsHidden.value || ''),
    category: null
  };

  // Duplicate check via AIBridge
  if (state.aiReady && state.settings.enableAI && state.settings.duplicateCheck) {
    try {
      const response = await window.AIBridge.checkDuplicate(textValue);
      if (response?.match) {
        const dupWarn = document.getElementById('pn-duplicate-warning');
        if (dupWarn) {
          dupWarn.classList.remove('pn-hidden');
          dupWarn.innerHTML = `
            <strong>Looks similar to: "${escapeHtml(response.match.prompt?.title || 'Untitled')}"</strong>
            <div class="pn-duplicate-actions">
              <button class="pn-btn-ignore" id="pn-dup-save-anyway" type="button">Save anyway</button>
            </div>
          `;
          document.getElementById('pn-dup-save-anyway')?.addEventListener('click', () => {
            dupWarn.classList.add('pn-hidden');
            void persistPrompt(payload);
          });
          return;
        }
      }
    } catch (_) {}
  }

  await persistPrompt(payload);
};

/** Normalizes session payload shape for export tab rendering. */
const normalizeExportPayload = async (rawPayload) => {
  const value = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
  const messages = Array.isArray(value.messages) ? value.messages : [];

  return {
    title: String(value.title || 'Promptium Chat').trim(),
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

/** Loads latest selected export payload from local storage. */
const loadExportPayload = async () => {
  const sessionSnapshot = await chrome.storage.session.get([SIDEPANEL_SESSION_KEY]);
  const localSnapshot = await chrome.storage.local.get([SIDEPANEL_SESSION_KEY]);
  const rawPayload = sessionSnapshot?.[SIDEPANEL_SESSION_KEY] || localSnapshot?.[SIDEPANEL_SESSION_KEY];
  state.exportPayload = await normalizeExportPayload(rawPayload);
  // Clear transport payloads immediately to avoid stale handoffs.
  await chrome.storage.session.remove([SIDEPANEL_SESSION_KEY]).catch(() => {});
  await chrome.storage.local.remove([SIDEPANEL_SESSION_KEY]).catch(() => {});
  return state.exportPayload;
};

const hasPayloadMessages = (payload) => Array.isArray(payload?.messages) && payload.messages.length > 0;

const applyLatestExportSnapshot = async () => {
  if (!state.pendingExportPayload) {
    await setExportStatus('Preview already current.');
    return;
  }
  state.exportPayload = cloneExportPayload(state.pendingExportPayload);
  state.exportSnapshotPayload = cloneExportPayload(state.pendingExportPayload);
  state.pendingExportPayload = null;
  state.hasPendingExportUpdate = false;
  await renderExportPreview();
  await setExportStatus('Latest selection loaded.');
};

const ingestIncomingExportPayload = async (rawPayload) => {
  const normalized = await normalizeExportPayload(rawPayload);
  state.exportPayload = normalized;

  // Freeze preview while user is in export view until they explicitly reload.
  if (state.activeTab === 'export' && hasPayloadMessages(state.exportSnapshotPayload)) {
    state.pendingExportPayload = cloneExportPayload(normalized);
    state.hasPendingExportUpdate = hasPayloadMessages(state.pendingExportPayload);
    await renderExportMeta();
    if (state.hasPendingExportUpdate) {
      await setExportStatus('New selection ready. Click "Reload latest selection".');
    }
    return;
  }

  state.exportSnapshotPayload = cloneExportPayload(normalized);
  state.pendingExportPayload = null;
  state.hasPendingExportUpdate = false;
  await renderExportPreview();
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

/** Converts one message row into markdown body text without role chrome. */
const toMessageContentMarkdown = async (message) => {
  const service = await getTurndownService();
  const rawHtml = String(message?.html || '').trim();
  const safeHtml = stripInlineStylesFromHtml(rawHtml);
  const template = document.createElement('template');
  template.innerHTML = safeHtml;
  template.content.querySelectorAll(
    'script, style, img, svg, figure, nav, header, footer, aside, button, input, textarea, select, [hidden], [aria-hidden="true"]'
  ).forEach((node) => node.remove());
  const exportHtml = template.innerHTML.trim();

  if (service && exportHtml) {
    const converted = service.turndown(`<div>${exportHtml}</div>`).trim();
    if (converted) return converted;
  }
  return String(message?.text || '').trim();
};

/** Converts one message row into markdown with role heading. */
const toStructuredMessageMarkdown = async (message, index) => {
  const roleLabel = message.role === 'user' ? 'You' : 'Assistant';
  const messageNumber = state.exportPrefs.includeMessageNumbers ? `${index + 1}. ` : '';
  const content = await toMessageContentMarkdown(message);
  return `### ${messageNumber}${roleLabel}\n\n${content}`;
};

/** Builds markdown output for selected export payload and options. */
const buildMarkdown = async () => {
  const payload = getActiveExportPayload();

  if (!payload || !payload.messages.length) {
    return '';
  }

  const lines = [`# ${payload.title || 'Promptium Chat'}`];

  if (state.exportPrefs.includePlatform) {
    lines.push(`Platform: ${getPlatformLabel(payload.platform)}`);
  }

  if (state.exportPrefs.includeDate) {
    lines.push(`Exported: ${new Date().toLocaleString()}`);
  }

  const sections = [];
  if (state.exportPrefs.contentMode === 'combined') {
    for (let index = 0; index < payload.messages.length; index += 1) {
      sections.push(await toMessageContentMarkdown(payload.messages[index]));
    }
    const combinedText = sections.filter(Boolean).join('\n\n').trim();
    return `${lines.join('\n')}\n\n---\n\n${combinedText}`.trim();
  }

  for (let index = 0; index < payload.messages.length; index += 1) {
    sections.push(await toStructuredMessageMarkdown(payload.messages[index], index));
  }

  return `${lines.join('\n')}\n\n---\n\n${sections.join('\n\n---\n\n')}`.trim();
};

const normalizeCodeLanguage = (lang) => {
  const value = String(lang || '').trim().toLowerCase();
  if (!value) return 'text';
  if (['js', 'javascript', 'node', 'jsx', 'mjs', 'cjs'].includes(value)) return 'javascript';
  if (['ts', 'typescript', 'tsx'].includes(value)) return 'typescript';
  if (['py', 'python'].includes(value)) return 'python';
  if (['sh', 'shell', 'bash', 'zsh'].includes(value)) return 'bash';
  if (['json', 'jsonc'].includes(value)) return 'json';
  if (['html', 'xml', 'svg'].includes(value)) return 'html';
  if (['css', 'scss', 'less'].includes(value)) return 'css';
  if (['sql'].includes(value)) return 'sql';
  if (['md', 'markdown'].includes(value)) return 'markdown';
  if (['dart', 'flutter', 'dartlang'].includes(value)) return 'dart';
  if (['kotlin', 'kt', 'kts'].includes(value)) return 'kotlin';
  if (['swift'].includes(value)) return 'swift';
  if (['java'].includes(value)) return 'java';
  if (['csharp', 'cs', '.net', 'dotnet'].includes(value)) return 'csharp';
  if (['go', 'golang'].includes(value)) return 'go';
  if (['rust', 'rs'].includes(value)) return 'rust';
  if (['php'].includes(value)) return 'php';
  if (['ruby', 'rb'].includes(value)) return 'ruby';
  if (['yaml', 'yml'].includes(value)) return 'yaml';
  if (['toml'].includes(value)) return 'toml';
  if (['powershell', 'ps1', 'pwsh'].includes(value)) return 'powershell';
  if (['cpp', 'c++', 'cc', 'cxx'].includes(value)) return 'cpp';
  if (['c'].includes(value)) return 'c';
  if (['lua'].includes(value)) return 'lua';
  if (['r'].includes(value)) return 'r';
  if (['scala'].includes(value)) return 'scala';
  if (['mermaid', 'mmd'].includes(value)) return 'mermaid';
  return value.replace(/[^a-z0-9_-]/g, '') || 'text';
};

const escapeCodeHtml = (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const escapeSvgText = (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll('\'', '&#39;');

const trimMermaidLabel = (value, maxLen = 44) => {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, maxLen - 1)}…`;
};

const splitLabelLines = (value, maxChars = 20, maxLines = 3) => {
  const words = trimMermaidLabel(value, maxChars * maxLines + 8).split(' ');
  if (!words.length) return [''];
  const lines = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if ((`${current} ${word}`).length <= maxChars) {
      current = `${current} ${word}`;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length >= maxLines - 1) break;
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  return lines.slice(0, maxLines);
};

const CODE_KEYWORDS = {
  javascript: ['as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'from', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'of', 'return', 'static', 'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield'],
  typescript: ['abstract', 'any', 'as', 'asserts', 'async', 'await', 'bigint', 'boolean', 'break', 'case', 'catch', 'class', 'const', 'constructor', 'continue', 'debugger', 'declare', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'get', 'if', 'implements', 'import', 'in', 'infer', 'instanceof', 'interface', 'is', 'keyof', 'let', 'module', 'namespace', 'never', 'new', 'null', 'number', 'object', 'of', 'override', 'private', 'protected', 'public', 'readonly', 'return', 'satisfies', 'set', 'static', 'string', 'super', 'switch', 'symbol', 'this', 'throw', 'true', 'try', 'type', 'typeof', 'undefined', 'unknown', 'var', 'void', 'while'],
  python: ['and', 'as', 'assert', 'async', 'await', 'break', 'case', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'match', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'True', 'try', 'while', 'with', 'yield'],
  bash: ['case', 'coproc', 'do', 'done', 'elif', 'else', 'esac', 'export', 'fi', 'for', 'function', 'if', 'in', 'local', 'readonly', 'return', 'select', 'then', 'time', 'until', 'while'],
  sql: ['all', 'alter', 'and', 'as', 'asc', 'between', 'by', 'case', 'create', 'delete', 'desc', 'distinct', 'drop', 'else', 'end', 'from', 'group', 'having', 'in', 'insert', 'into', 'is', 'join', 'left', 'like', 'limit', 'not', 'null', 'on', 'or', 'order', 'outer', 'right', 'select', 'set', 'table', 'then', 'union', 'update', 'values', 'when', 'where'],
  dart: ['abstract', 'as', 'assert', 'async', 'await', 'base', 'bool', 'break', 'case', 'catch', 'class', 'const', 'continue', 'covariant', 'default', 'deferred', 'do', 'dynamic', 'else', 'enum', 'export', 'extends', 'extension', 'external', 'factory', 'false', 'final', 'finally', 'for', 'Function', 'get', 'hide', 'if', 'implements', 'import', 'in', 'interface', 'is', 'late', 'library', 'mixin', 'new', 'null', 'on', 'operator', 'part', 'required', 'rethrow', 'return', 'sealed', 'set', 'show', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typedef', 'var', 'void', 'when', 'while', 'with', 'yield'],
  kotlin: ['abstract', 'annotation', 'as', 'break', 'by', 'catch', 'class', 'companion', 'const', 'constructor', 'continue', 'data', 'do', 'else', 'enum', 'false', 'final', 'for', 'fun', 'if', 'import', 'in', 'inline', 'interface', 'internal', 'is', 'lateinit', 'null', 'object', 'open', 'operator', 'out', 'override', 'package', 'private', 'protected', 'public', 'reified', 'return', 'sealed', 'super', 'suspend', 'this', 'throw', 'true', 'try', 'typealias', 'val', 'var', 'when', 'while'],
  swift: ['actor', 'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'continue', 'defer', 'do', 'else', 'enum', 'extension', 'fallthrough', 'false', 'for', 'func', 'guard', 'if', 'import', 'in', 'init', 'let', 'nil', 'private', 'protocol', 'public', 'repeat', 'return', 'self', 'struct', 'super', 'switch', 'throw', 'throws', 'true', 'try', 'var', 'where', 'while'],
  java: ['abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'false', 'final', 'finally', 'float', 'for', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'super', 'switch', 'this', 'throw', 'throws', 'true', 'try', 'var', 'void', 'while'],
  csharp: ['abstract', 'as', 'async', 'await', 'base', 'bool', 'break', 'case', 'catch', 'class', 'const', 'continue', 'decimal', 'default', 'do', 'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false', 'finally', 'fixed', 'float', 'for', 'foreach', 'get', 'if', 'implicit', 'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace', 'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private', 'protected', 'public', 'readonly', 'record', 'ref', 'return', 'sealed', 'set', 'short', 'static', 'string', 'struct', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'using', 'value', 'var', 'virtual', 'void', 'while'],
  go: ['break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough', 'false', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface', 'map', 'nil', 'package', 'range', 'return', 'select', 'struct', 'switch', 'true', 'type', 'var'],
  rust: ['as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while'],
  php: ['abstract', 'and', 'array', 'as', 'break', 'callable', 'case', 'catch', 'class', 'clone', 'const', 'continue', 'declare', 'default', 'do', 'echo', 'else', 'elseif', 'enum', 'extends', 'false', 'final', 'finally', 'for', 'foreach', 'function', 'global', 'if', 'implements', 'include', 'interface', 'match', 'namespace', 'new', 'null', 'or', 'private', 'protected', 'public', 'readonly', 'require', 'return', 'self', 'static', 'switch', 'throw', 'trait', 'true', 'try', 'use', 'var', 'while', 'yield'],
  ruby: ['BEGIN', 'END', 'alias', 'and', 'begin', 'break', 'case', 'class', 'def', 'defined?', 'do', 'else', 'elsif', 'end', 'ensure', 'false', 'for', 'if', 'in', 'module', 'next', 'nil', 'not', 'or', 'redo', 'rescue', 'retry', 'return', 'self', 'super', 'then', 'true', 'undef', 'unless', 'until', 'when', 'while', 'yield'],
  yaml: ['true', 'false', 'null', 'yes', 'no', 'on', 'off'],
  toml: ['true', 'false'],
  cpp: ['alignas', 'alignof', 'and', 'asm', 'auto', 'bool', 'break', 'case', 'catch', 'char', 'class', 'const', 'constexpr', 'continue', 'default', 'delete', 'do', 'double', 'else', 'enum', 'explicit', 'export', 'extern', 'false', 'float', 'for', 'friend', 'if', 'inline', 'int', 'long', 'namespace', 'new', 'noexcept', 'nullptr', 'operator', 'private', 'protected', 'public', 'register', 'return', 'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'template', 'this', 'throw', 'true', 'try', 'typedef', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void', 'volatile', 'while'],
  c: ['auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'inline', 'int', 'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while'],
  lua: ['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while'],
  r: ['FALSE', 'TRUE', 'NULL', 'break', 'else', 'for', 'function', 'if', 'in', 'next', 'repeat', 'return', 'while'],
  scala: ['abstract', 'case', 'catch', 'class', 'def', 'do', 'else', 'extends', 'false', 'final', 'finally', 'for', 'forSome', 'if', 'implicit', 'import', 'lazy', 'match', 'new', 'null', 'object', 'override', 'package', 'private', 'protected', 'return', 'sealed', 'super', 'this', 'throw', 'trait', 'true', 'try', 'type', 'val', 'var', 'while', 'with', 'yield'],
  powershell: ['begin', 'break', 'catch', 'class', 'continue', 'data', 'do', 'dynamicparam', 'else', 'elseif', 'end', 'enum', 'exit', 'filter', 'finally', 'for', 'foreach', 'function', 'if', 'in', 'param', 'process', 'return', 'switch', 'throw', 'trap', 'try', 'until', 'using', 'var', 'while']
};

const KEYWORD_REGEX_CACHE = new Map();

const getKeywordRegex = (lang) => {
  const key = String(lang || '').toLowerCase();
  if (KEYWORD_REGEX_CACHE.has(key)) {
    return KEYWORD_REGEX_CACHE.get(key);
  }
  const words = CODE_KEYWORDS[key] || [];
  if (!words.length) {
    KEYWORD_REGEX_CACHE.set(key, null);
    return null;
  }
  const regex = new RegExp(`\\b(${words.map(escapeRegex).join('|')})\\b`, 'g');
  KEYWORD_REGEX_CACHE.set(key, regex);
  return regex;
};

const tokenizeCodeSegments = (source, regex, className, tokenStore) =>
  source.replace(regex, (match) => {
    const token = `__pn_token_${tokenStore.length}__`;
    tokenStore.push(`<span class="${className}">${match}</span>`);
    return token;
  });

const getCommentPattern = (lang) => {
  if (['python', 'bash', 'ruby', 'yaml', 'toml', 'lua', 'r', 'powershell'].includes(lang)) {
    return /#.*$/gm;
  }
  if (lang === 'sql') {
    return /--.*$|\/\*[\s\S]*?\*\//gm;
  }
  if (lang === 'html') {
    return /<!--[\s\S]*?-->/gm;
  }
  if (lang === 'css') {
    return /\/\*[\s\S]*?\*\//gm;
  }
  return /\/\/.*$|\/\*[\s\S]*?\*\//gm;
};

const highlightCodeForPreview = (source, languageHint = '') => {
  const lang = normalizeCodeLanguage(languageHint);
  let output = escapeCodeHtml(source).replace(/\r\n/g, '\n');

  if (!output.trim() || ['text', 'plain', 'plaintext', 'markdown', 'mermaid'].includes(lang)) {
    return output;
  }

  const tokenStore = [];
  const commentPattern = getCommentPattern(lang);

  output = tokenizeCodeSegments(output, commentPattern, 'pn-code-token-comment', tokenStore);
  output = tokenizeCodeSegments(output, /`[^`\n]*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gm, 'pn-code-token-string', tokenStore);

  if (lang === 'json') {
    output = output.replace(/("(?:\\.|[^"\\])*?")(\s*:)/g, '<span class="pn-code-token-key">$1</span>$2');
    output = output.replace(/\b(true|false|null)\b/g, '<span class="pn-code-token-keyword">$1</span>');
  } else if (lang === 'yaml') {
    output = output.replace(/^(\s*[-]?\s*[A-Za-z0-9_.-]+)(\s*:)/gm, '<span class="pn-code-token-key">$1</span>$2');
    const keywordRegex = getKeywordRegex('yaml');
    if (keywordRegex) {
      output = output.replace(keywordRegex, '<span class="pn-code-token-keyword">$1</span>');
    }
  } else if (lang === 'toml') {
    output = output.replace(/^(\s*[A-Za-z0-9_.-]+)(\s*=)/gm, '<span class="pn-code-token-key">$1</span>$2');
    const keywordRegex = getKeywordRegex('toml');
    if (keywordRegex) {
      output = output.replace(keywordRegex, '<span class="pn-code-token-keyword">$1</span>');
    }
  } else {
    const keywordRegex = getKeywordRegex(lang) || getKeywordRegex('javascript');
    if (keywordRegex) {
      output = output.replace(keywordRegex, '<span class="pn-code-token-keyword">$1</span>');
    }
    output = output.replace(/\b([A-Z][A-Za-z0-9_]*)\b/g, '<span class="pn-code-token-type">$1</span>');
  }

  output = output.replace(/\b-?(?:0x[a-fA-F0-9]+|\d+(?:\.\d+)?)\b/g, '<span class="pn-code-token-number">$&</span>');

  tokenStore.forEach((tokenMarkup, index) => {
    const token = `__pn_token_${index}__`;
    output = output.split(token).join(tokenMarkup);
  });

  return output;
};

const parseMermaidNodeToken = (token) => {
  const raw = String(token || '').trim().replace(/[;,]+$/, '');
  if (!raw) return null;

  const patterns = [
    /^([A-Za-z0-9_-]+)\s*\(\(\s*"?(.+?)"?\s*\)\)$/,
    /^([A-Za-z0-9_-]+)\s*\[\s*"?(.+?)"?\s*\]$/,
    /^([A-Za-z0-9_-]+)\s*\(\s*"?(.+?)"?\s*\)$/,
    /^([A-Za-z0-9_-]+)\s*\{\s*"?(.+?)"?\s*\}$/,
    /^([A-Za-z0-9_-]+)\s*$/
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) continue;
    const id = String(match[1] || '').trim();
    if (!id) return null;
    const label = trimMermaidLabel(String(match[2] || id).replace(/^["'`]+|["'`]+$/g, '').trim(), 52);
    return { id, label: label || id };
  }

  return null;
};

const cleanMermaidEndpointToken = (value) => String(value || '')
  .replace(/^\|[^|]*\|\s*/g, '')
  .replace(/\s*\|[^|]*\|$/g, '')
  .trim();

const findMermaidEdge = (statement) => {
  const edgeOps = ['<-->', '-.->', '-->', '==>', '---', '<--', '->', '<-'];
  let best = null;
  for (const op of edgeOps) {
    const idx = statement.indexOf(op);
    if (idx <= 0) continue;
    if (!best || idx < best.index) {
      best = { op, index: idx };
    }
  }
  if (!best) return null;

  const left = cleanMermaidEndpointToken(statement.slice(0, best.index));
  const right = cleanMermaidEndpointToken(statement.slice(best.index + best.op.length));
  if (!left || !right) return null;
  return { left, right };
};

const renderMermaidFlowchart = (source, direction = 'td') => {
  const chunks = String(source || '')
    .split('\n')
    .flatMap((line) => line.split(';'))
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('%%'));

  const nodes = new Map();
  const edges = [];
  const registerNode = (token) => {
    const parsed = parseMermaidNodeToken(token);
    if (!parsed) return null;
    if (!nodes.has(parsed.id)) {
      nodes.set(parsed.id, parsed);
    } else if (parsed.label && nodes.get(parsed.id).label === parsed.id) {
      nodes.set(parsed.id, parsed);
    }
    return parsed.id;
  };

  for (const chunk of chunks) {
    if (/^(flowchart|graph)\b/i.test(chunk)) continue;
    if (/^(subgraph|end|style|classDef|class|linkStyle|click)\b/i.test(chunk)) continue;

    const edge = findMermaidEdge(chunk);
    if (edge) {
      const from = registerNode(edge.left);
      const to = registerNode(edge.right);
      if (from && to) {
        edges.push({ from, to });
      }
      continue;
    }

    registerNode(chunk);
  }

  const nodeList = Array.from(nodes.values());
  if (!nodeList.length) return null;

  const isHorizontal = ['lr', 'rl'].includes(direction);
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodeList.length)));
  const rows = Math.max(1, Math.ceil(nodeList.length / columns));
  const boxWidth = 168;
  const boxHeight = 56;
  const gapX = 44;
  const gapY = 34;
  const pad = 28;
  const width = pad * 2 + (columns * boxWidth) + ((columns - 1) * gapX);
  const height = pad * 2 + (rows * boxHeight) + ((rows - 1) * gapY);
  const positions = new Map();

  nodeList.forEach((node, index) => {
    let column = index % columns;
    let row = Math.floor(index / columns);
    if (direction === 'rl') {
      column = (columns - 1) - column;
    }
    if (direction === 'bt') {
      row = (rows - 1) - row;
    }
    if (isHorizontal && rows > 1) {
      // Keep layout compact in LR/RL while preserving order.
      column = Math.floor(index / rows);
      row = index % rows;
      if (direction === 'rl') {
        column = (Math.max(1, Math.ceil(nodeList.length / rows)) - 1) - column;
      }
    }
    const x = pad + (column * (boxWidth + gapX));
    const y = pad + (row * (boxHeight + gapY));
    positions.set(node.id, { x, y });
  });

  const edgeMarkup = edges.map((edge) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) return '';
    let x1 = from.x + (boxWidth / 2);
    let y1 = from.y + (boxHeight / 2);
    let x2 = to.x + (boxWidth / 2);
    let y2 = to.y + (boxHeight / 2);
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (Math.abs(dx) > Math.abs(dy)) {
      x1 += Math.sign(dx || 1) * (boxWidth / 2);
      x2 -= Math.sign(dx || 1) * (boxWidth / 2);
    } else {
      y1 += Math.sign(dy || 1) * (boxHeight / 2);
      y2 -= Math.sign(dy || 1) * (boxHeight / 2);
    }
    return `<line class="pn-mermaid-edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#pn-mermaid-arrow)"></line>`;
  }).join('');

  const nodeMarkup = nodeList.map((node) => {
    const pos = positions.get(node.id);
    if (!pos) return '';
    const centerX = pos.x + (boxWidth / 2);
    const centerY = pos.y + (boxHeight / 2);
    const lines = splitLabelLines(node.label, 18, 3);
    const startY = centerY - ((lines.length - 1) * 8);
    const textMarkup = lines.map((line, index) => (
      `<tspan x="${centerX}" dy="${index === 0 ? 0 : 16}">${escapeSvgText(line)}</tspan>`
    )).join('');
    return `
      <g class="pn-mermaid-node-group">
        <rect class="pn-mermaid-node" x="${pos.x}" y="${pos.y}" width="${boxWidth}" height="${boxHeight}" rx="10" ry="10"></rect>
        <text class="pn-mermaid-label" x="${centerX}" y="${startY}">${textMarkup}</text>
      </g>
    `;
  }).join('');

  return `
    <svg class="pn-mermaid-diagram" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mermaid diagram">
      <defs>
        <marker id="pn-mermaid-arrow" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L10,4 L0,8 z" class="pn-mermaid-arrow"></path>
        </marker>
      </defs>
      ${edgeMarkup}
      ${nodeMarkup}
    </svg>
  `;
};

const renderMermaidSequence = (source) => {
  const chunks = String(source || '')
    .split('\n')
    .flatMap((line) => line.split(';'))
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('%%'));

  const participantOrder = [];
  const participantLabels = new Map();
  const messages = [];

  const ensureParticipant = (id, label = '') => {
    const safeId = String(id || '').trim();
    if (!safeId) return;
    if (!participantLabels.has(safeId)) {
      participantOrder.push(safeId);
      participantLabels.set(safeId, trimMermaidLabel(label || safeId, 28));
    } else if (label) {
      participantLabels.set(safeId, trimMermaidLabel(label, 28));
    }
  };

  for (const chunk of chunks) {
    if (/^sequenceDiagram\b/i.test(chunk)) continue;
    if (/^(autonumber|activate|deactivate|note|rect|loop|alt|else|end|opt|par|critical|break)\b/i.test(chunk)) continue;

    const participantMatch = chunk.match(/^(participant|actor)\s+([A-Za-z0-9_-]+)(?:\s+as\s+(.+))?$/i);
    if (participantMatch) {
      ensureParticipant(participantMatch[2], participantMatch[3] || participantMatch[2]);
      continue;
    }

    const msgMatch = chunk.match(/^([A-Za-z0-9_-]+)\s*(->>|-->>|->|-->|=>|==>|<--|<<--|<-|<->)\s*([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (!msgMatch) continue;
    const from = msgMatch[1];
    const to = msgMatch[3];
    const text = trimMermaidLabel(msgMatch[4], 44);
    ensureParticipant(from);
    ensureParticipant(to);
    messages.push({ from, to, text });
  }

  if (!participantOrder.length || !messages.length) return null;

  const colWidth = 170;
  const headerW = 120;
  const headerH = 34;
  const pad = 28;
  const topHeader = 16;
  const lifelineStart = topHeader + headerH + 12;
  const rowH = 36;
  const width = (participantOrder.length * colWidth) + (pad * 2);
  const height = lifelineStart + (messages.length * rowH) + 32;

  const xByParticipant = new Map();
  participantOrder.forEach((id, index) => {
    xByParticipant.set(id, pad + (index * colWidth) + (colWidth / 2));
  });

  const participantMarkup = participantOrder.map((id) => {
    const x = xByParticipant.get(id);
    const rectX = x - (headerW / 2);
    const label = escapeSvgText(participantLabels.get(id) || id);
    return `
      <g class="pn-mermaid-node-group">
        <rect class="pn-mermaid-node" x="${rectX}" y="${topHeader}" width="${headerW}" height="${headerH}" rx="8" ry="8"></rect>
        <text class="pn-mermaid-label" x="${x}" y="${topHeader + 22}">
          <tspan x="${x}" dy="0">${label}</tspan>
        </text>
        <line class="pn-mermaid-lifeline" x1="${x}" y1="${lifelineStart}" x2="${x}" y2="${height - 18}"></line>
      </g>
    `;
  }).join('');

  const messageMarkup = messages.map((message, index) => {
    const x1 = xByParticipant.get(message.from);
    const x2 = xByParticipant.get(message.to);
    if (!x1 || !x2) return '';
    const y = lifelineStart + (index * rowH) + 10;
    const textX = (x1 + x2) / 2;
    const label = escapeSvgText(message.text || '');
    return `
      <g class="pn-mermaid-seq-message">
        <line class="pn-mermaid-edge" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" marker-end="url(#pn-mermaid-arrow)"></line>
        <text class="pn-mermaid-label pn-mermaid-label--small" x="${textX}" y="${y - 8}">
          <tspan x="${textX}" dy="0">${label}</tspan>
        </text>
      </g>
    `;
  }).join('');

  return `
    <svg class="pn-mermaid-diagram" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mermaid sequence diagram">
      <defs>
        <marker id="pn-mermaid-arrow" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L10,4 L0,8 z" class="pn-mermaid-arrow"></path>
        </marker>
      </defs>
      ${participantMarkup}
      ${messageMarkup}
    </svg>
  `;
};

const renderMermaidDiagram = (source) => {
  const raw = String(source || '').trim();
  if (!raw) return null;
  const firstLine = raw.split('\n').map((line) => line.trim()).find(Boolean) || '';

  try {
    if (/^sequenceDiagram\b/i.test(firstLine)) {
      return renderMermaidSequence(raw);
    }
    const flowMatch = firstLine.match(/^(?:flowchart|graph)\s+([A-Za-z]{2})/i);
    if (flowMatch) {
      return renderMermaidFlowchart(raw, String(flowMatch[1] || 'td').toLowerCase());
    }
    if (raw.includes('-->') || raw.includes('-.->') || raw.includes('==>')) {
      return renderMermaidFlowchart(raw, 'td');
    }
  } catch (_) {
    return null;
  }

  return null;
};

const buildExportSheetClassNames = () => {
  const themeClass = getExportThemeClass();
  const fontClass = getExportFontClass();
  const fontSizeClass = getExportSizeClass();

  if (themeClass === 'pn-export-sheet--theme-custom') {
    applyCustomExportThemeRules(state.exportPrefs.customBackground);
  }

  return `pn-export-sheet ${themeClass} ${fontClass} ${fontSizeClass}`;
};

const wrapExportPreviewSheet = (bodyMarkup, extraClass = '') => `
  <section id="pn-export-snapshot" class="${buildExportSheetClassNames()} ${extraClass}">
    ${bodyMarkup}
  </section>
`;

/** Gets or initializes the Markdown parser for visual previews. */
const getMarkdownParser = async () => {
  if (state.markdownParser) return state.markdownParser;
  if (!window.markdownit) return null;
  state.markdownParser = window.markdownit({
    html: false, // Disallow raw HTML in the preview to prevent XSS
    breaks: true,
    linkify: true,
    highlight: (str, lang) => {
      const normalizedLang = normalizeCodeLanguage(lang);
      if (normalizedLang === 'mermaid') {
        const diagramMarkup = renderMermaidDiagram(str);
        if (diagramMarkup) {
          return `<div class="pn-mermaid-wrap">${diagramMarkup}</div>`;
        }
        return `<pre class="pn-code-block"><code class="pn-code language-mermaid">${escapeCodeHtml(str)}</code></pre>`;
      }
      const highlighted = highlightCodeForPreview(str, normalizedLang);
      return `<pre class="pn-code-block"><code class="pn-code language-${normalizedLang}">${highlighted}</code></pre>`;
    }
  });
  return state.markdownParser;
};

/** Creates styled visual snapshot used for PDF-like preview mode. */
const buildVisualPreviewMarkup = async () => {
  const payload = getActiveExportPayload();

  if (!payload || !payload.messages.length) {
    return '<div class="pn-empty">No selected messages found. Select messages in chat and click Export Selected.</div>';
  }

  const parser = await getMarkdownParser();

  const platformTitle = state.exportPrefs.includePlatform
    ? `<h2>${escapeHtml(payload.title || getPlatformLabel(payload.platform) || 'Conversation')}</h2>`
    : '';
  const platformLine = state.exportPrefs.includePlatform
    ? `<p class="pn-export-meta-line">Platform: ${escapeHtml(getPlatformLabel(payload.platform))}</p>`
    : '';

  const dateLine = state.exportPrefs.includeDate
    ? `<p class="pn-export-meta-line">Exported: ${escapeHtml(new Date().toLocaleString())}</p>`
    : '';

  const rows = [];

  if (state.exportPrefs.contentMode === 'combined') {
    const chunks = [];
    for (let index = 0; index < payload.messages.length; index += 1) {
      chunks.push(await toMessageContentMarkdown(payload.messages[index]));
    }
    const merged = chunks.filter(Boolean).join('\n\n');
    const contentHtml = parser ? parser.render(merged) : escapeHtml(merged).replaceAll('\n', '<br />');
    rows.push(`
      <article class="pn-export-card">
        <div class="pn-export-card-content pn-markdown-body pn-export-card-content--body">${contentHtml}</div>
      </article>
    `);
  } else {
    for (let index = 0; index < payload.messages.length; index += 1) {
      const message = payload.messages[index];
      const messageNumber = state.exportPrefs.includeMessageNumbers ? `${index + 1}. ` : '';
      const roleLabel = escapeHtml(message.role === 'user' ? 'You' : 'Assistant');
      const mdText = await toMessageContentMarkdown(message);
      const contentHtml = parser ? parser.render(mdText) : escapeHtml(mdText).replaceAll('\n', '<br />');
      rows.push(`
        <article class="pn-export-card">
          <h3 class="pn-export-message-heading">${messageNumber}${roleLabel}</h3>
          <div class="pn-export-card-content pn-markdown-body pn-export-card-content--body">${contentHtml}</div>
        </article>
      `);
    }
  }

  return wrapExportPreviewSheet(`
      <header class="pn-export-head">
        ${platformTitle}
        ${platformLine}
        ${dateLine}
      </header>
      <div class="pn-export-list">${rows.join('')}</div>
    `);
};

const buildMarkdownPreviewMarkup = async () => {
  const markdown = await buildMarkdown();
  return wrapExportPreviewSheet(`
    <article class="pn-export-card pn-export-card--single">
      <pre class="pn-export-raw pn-export-raw--markdown">${escapeHtml(markdown)}</pre>
    </article>
  `);
};

const buildTextPreviewMarkup = async (format) => {
  const chat = buildExporterChatPayload();
  if (!chat) {
    return '<div class="pn-empty">No messages selected.</div>';
  }
  if (!window.Exporter?.toTXT || !window.Exporter?.toJSON) {
    return '<div class="pn-empty">Preview renderer unavailable.</div>';
  }

  const prefs = buildExporterPrefs();
  if (format === 'json') {
    const jsonText = await window.Exporter.toJSON(chat, prefs);
    return wrapExportPreviewSheet(`
      <article class="pn-export-card pn-export-card--single">
        <pre class="pn-code-block pn-code-block--json"><code class="pn-code language-json">${highlightCodeForPreview(jsonText, 'json')}</code></pre>
      </article>
    `);
  }

  const plainText = await window.Exporter.toTXT(chat, prefs);
  return wrapExportPreviewSheet(`
    <article class="pn-export-card pn-export-card--single">
      <pre class="pn-export-raw pn-export-raw--txt">${escapeHtml(plainText)}</pre>
    </article>
  `);
};

const buildFormatAwarePreviewMarkup = async () => {
  const format = String(state.exportPrefs.format || 'markdown').toLowerCase();
  if (format === 'pdf') {
    return buildVisualPreviewMarkup();
  }
  if (format === 'txt' || format === 'text') {
    return buildTextPreviewMarkup('txt');
  }
  if (format === 'json') {
    return buildTextPreviewMarkup('json');
  }
  return buildMarkdownPreviewMarkup();
};

/** Writes export status text below export controls with optional retry action. */
const setExportStatus = async (message, isError = false, options = {}) => {
  const node = await byId('export-status');

  if (!node) {
    return;
  }

  node.textContent = String(message || '').trim();
  node.classList.toggle('pn-status-error', Boolean(isError));

  if (isError) {
    const controls = document.createElement('span');
    controls.className = 'pn-export-status-controls';

    if (options.showRetry) {
      const retryButton = document.createElement('button');
      retryButton.type = 'button';
      retryButton.className = 'pn-btn pn-btn--ghost';
      retryButton.textContent = 'Retry';
      retryButton.addEventListener('click', () => {
        void runExport();
      });
      controls.appendChild(retryButton);
    }

    if (options.debugHint) {
      const hint = document.createElement('span');
      hint.className = 'pn-export-status-hint';
      hint.textContent = String(options.debugHint).trim();
      controls.appendChild(hint);
    }

    if (controls.childNodes.length > 0) {
      node.appendChild(document.createTextNode(' '));
      node.appendChild(controls);
    }
  }
};

/** Synchronizes export preference state from currently rendered controls. */
const syncExportPrefsFromControls = async () => {
  const format = byId('export-format');
  const contentMode = byId('export-content-mode');
  const includeDate = byId('include-date');
  const includePlatform = byId('include-platform');
  const includeMsgNumbers = byId('include-msg-numbers');
  const fontStyle = byId('export-font-style');
  const fontSize = byId('export-font-size');
  const fontSizeNumber = byId('export-font-size-number');
  const background = byId('export-bg-style');
  const customBackground = byId('export-bg-custom');
  const customWrap = byId('export-bg-custom-wrap');

  const sizeInput = Number(fontSize?.value || fontSizeNumber?.value || state.exportPrefs.fontSize || 14);
  const normalizedSize = Math.min(20, Math.max(12, Number.isFinite(sizeInput) ? sizeInput : 14));
  if (fontSize) fontSize.value = String(normalizedSize);
  if (fontSizeNumber) fontSizeNumber.value = String(normalizedSize);

  state.exportPrefs = {
    format: String(format?.value || state.exportPrefs.format || 'markdown'),
    contentMode: String(contentMode?.value || state.exportPrefs.contentMode || 'structured'),
    includeDate: Boolean(includeDate?.checked),
    includePlatform: Boolean(includePlatform?.checked),
    includeMessageNumbers: Boolean(includeMsgNumbers?.checked),
    fontStyle: String(fontStyle?.value || state.exportPrefs.fontStyle || 'System'),
    fontSize: normalizedSize,
    background: String(background?.value || state.exportPrefs.background || 'dark'),
    customBackground: String(customBackground?.value || state.exportPrefs.customBackground || '#18181c')
  };

  customWrap?.classList.toggle('pn-hidden', state.exportPrefs.background !== 'custom');
  applyCustomExportThemeRules(state.exportPrefs.customBackground);
  if (includeMsgNumbers instanceof HTMLInputElement) {
    includeMsgNumbers.disabled = state.exportPrefs.contentMode === 'combined';
    if (includeMsgNumbers.disabled) {
      includeMsgNumbers.checked = false;
      state.exportPrefs.includeMessageNumbers = false;
    }
  }
};

/** Updates export summary metadata and export action label. */
const renderExportMeta = async () => {
  const payload = getActiveExportPayload();
  const selectionMeta = byId('selection-meta');
  const previewLabel = byId('preview-label');
  const exportButton = byId('export-btn');
  const reloadButton = byId('export-reload-selection');
  const countsEl = byId('export-counts');
  const msgCountEl = byId('export-msg-count');
  const wordCountEl = byId('export-word-count');
  const fmt = state.exportPrefs.format;

  const formatLabels = {
    markdown: 'Markdown',
    txt: 'Plain Text',
    json: 'JSON',
    pdf: 'PDF'
  };
  const formatLabel = formatLabels[fmt] || 'Markdown';

  if (selectionMeta) {
    const count = payload?.messages?.length || 0;
    if (!count) {
      selectionMeta.textContent = 'No messages selected';
    } else {
      const base = `${count} message${count === 1 ? '' : 's'} • ${getPlatformLabel(payload.platform)}`;
      selectionMeta.textContent = state.hasPendingExportUpdate ? `${base} • New selection available` : base;
    }
  }

  // Word & message count badges
  if (countsEl && msgCountEl && wordCountEl) {
    const msgs = payload?.messages || [];
    if (msgs.length > 0) {
      const wordTotal = msgs.reduce((sum, m) => sum + (m.text || '').split(/\s+/).filter(Boolean).length, 0);
      msgCountEl.textContent = `${msgs.length} msg${msgs.length === 1 ? '' : 's'}`;
      wordCountEl.textContent = `${wordTotal.toLocaleString()} word${wordTotal === 1 ? '' : 's'}`;
      countsEl.classList.remove('pn-hidden');
    } else {
      countsEl.classList.add('pn-hidden');
    }
  }

  if (previewLabel) {
    const modeLabel = state.exportPrefs.contentMode === 'combined' ? 'combined text' : 'structured';
    previewLabel.textContent = `${formatLabel} preview • ${modeLabel}`;
  }

  if (exportButton) {
    exportButton.textContent = `Export ${formatLabel}`;
  }

  if (reloadButton) {
    reloadButton.classList.toggle('pn-hidden', !state.hasPendingExportUpdate);
  }
};

/** Asks the active page to stage selected messages, then refreshes export preview. */
const selectMessagesForExport = async () => {
  const context = await getActiveTabContext();

  if (!context.tabId) {
    await setExportStatus('No active tab available for message selection.', true);
    return;
  }

  const response = await chrome.tabs.sendMessage(context.tabId, { action: 'openSidePanelAll' }).catch(() => null);
  if (!response?.ok) {
    await setExportStatus('Selection request failed on active tab.', true);
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 220));
  const incoming = await loadExportPayload();
  await ingestIncomingExportPayload(incoming);
  await renderExportPreview();
  await setExportStatus('Selection loaded.');
};

/** Renders export preview area from current payload and selected format. */
const renderExportPreview = async () => {
  const preview = byId('preview');

  if (!preview) {
    return;
  }

  const payload = getActiveExportPayload();

  if (!payload || !payload.messages.length) {
    preview.innerHTML = '';
    preview.appendChild(createEmptyState({
      title: 'No messages selected',
      message: 'Select a message range in your chat to generate an export preview.',
      actionLabel: 'Select Messages',
      onAction: () => { void selectMessagesForExport(); }
    }));
    await renderExportMeta();
    return;
  }

  preview.innerHTML = await buildFormatAwarePreviewMarkup();
  await renderExportMeta();
};

/** Generates export filename, preferring user-supplied custom name. */
const buildExportFilename = async (extension) => {
  const customName = String(byId('export-filename')?.value || '').trim();
  if (customName) {
    // Strip any existing extension and add the correct one
    const baseName = customName.replace(/\.[^.]+$/, '');
    return `${baseName}.${extension}`;
  }
  const platform = String(getActiveExportPayload()?.platform || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const date = new Date().toISOString().slice(0, 10);
  return `promptium_${platform || 'unknown'}_${date}.${extension}`;
};

/** Downloads plain text content with blob-backed object URL. */
const downloadSidepanelText = async (content, filename, mimeType) => {
  const payload = content == null ? '' : content;
  const blob = payload instanceof Blob ? payload : new Blob([payload], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
};

/** Builds chat data compatible with Exporter functions from current state. */
const buildExporterChatPayload = () => {
  const payload = getActiveExportPayload();
  if (!payload) return null;
  return {
    title: payload.title,
    platform: payload.platform,
    createdAt: payload.createdAt,
    messages: payload.messages
  };
};

/** Builds exporter-compatible prefs from current export state. */
const buildExporterPrefs = () => ({
  includePlatformLabel: state.exportPrefs.includePlatform,
  includeTimestamps: false,
  includeExportDate: state.exportPrefs.includeDate,
  includeMessageNumbers: state.exportPrefs.includeMessageNumbers,
  headerText: '',
  contentMode: state.exportPrefs.contentMode,
  fontStyle: state.exportPrefs.fontStyle,
  fontSize: state.exportPrefs.fontSize,
  background: state.exportPrefs.background,
  customBackground: state.exportPrefs.customBackground
});

/** Executes export action for markdown, txt, json, or PDF. */
const runExport = async () => {
  await syncExportPrefsFromControls();

  const payload = getActiveExportPayload();

  if (!payload || !payload.messages.length) {
    await setExportStatus('No messages selected.', true, {
      showRetry: false,
      debugHint: 'Use "Select Messages" to choose a range before exporting.'
    });
    return;
  }

  const format = state.exportPrefs.format;

  // Markdown
  if (format === 'markdown') {
    const markdown = await buildMarkdown();
    if (!markdown) {
      await setExportStatus('Markdown build failed.', true, {
        showRetry: true,
        debugHint: 'Confirm selected messages are non-empty and try again.'
      });
      return;
    }
    await downloadSidepanelText(markdown, await buildExportFilename('md'), 'text/markdown;charset=utf-8');
    await window.Store.saveChatToHistory(payload);
    await setExportStatus('Markdown export complete.');
    return;
  }

  // Plain Text
  if (format === 'txt') {
    try {
      const chat = buildExporterChatPayload();
      const text = await window.Exporter.toTXT(chat, buildExporterPrefs());
      await downloadSidepanelText(text, await buildExportFilename('txt'), 'text/plain;charset=utf-8');
      await window.Store.saveChatToHistory(payload);
      await setExportStatus('Text export complete.');
    } catch (err) {
      await setExportStatus(err?.message || 'Text export failed.', true, {
        showRetry: true,
        debugHint: 'Retry the export. If it fails again, refresh the workspace.'
      });
    }
    return;
  }

  // JSON
  if (format === 'json') {
    try {
      const chat = buildExporterChatPayload();
      const json = await window.Exporter.toJSON(chat, buildExporterPrefs());
      await downloadSidepanelText(json, await buildExportFilename('json'), 'application/json;charset=utf-8');
      await window.Store.saveChatToHistory(payload);
      await setExportStatus('JSON export complete.');
    } catch (err) {
      await setExportStatus(err?.message || 'JSON export failed.', true, {
        showRetry: true,
        debugHint: 'Retry the export. If it fails again, refresh the workspace.'
      });
    }
    return;
  }

  // PDF (CSP-safe: jsPDF path via Exporter, no html2canvas/html2pdf)
  if (!window.Exporter?.toPDF) {
    await setExportStatus('PDF exporter unavailable.', true, {
      showRetry: true,
      debugHint: 'Ensure jsPDF is loaded, then retry.'
    });
    return;
  }

  await setExportStatus('Building PDF...');

  try {
    const chat = buildExporterChatPayload();
    const pdfData = await window.Exporter.toPDF(chat, buildExporterPrefs());
    const filename = await buildExportFilename('pdf');
    await downloadSidepanelText(pdfData, filename, 'application/pdf');
    await window.Store.saveChatToHistory(payload);
    await setExportStatus('PDF export complete.');
  } catch (error) {
    await setExportStatus(error?.message || 'PDF export failed.', true, {
      showRetry: true,
      debugHint: 'Retry export. If it keeps failing, switch format and test again.'
    });
  }
};

/** Copies export content to clipboard in the appropriate text format. */
const copyExportToClipboard = async () => {
  await syncExportPrefsFromControls();
  const payload = getActiveExportPayload();

  if (!payload || !payload.messages.length) {
    await setExportStatus('No messages selected.', true, {
      debugHint: 'Select messages first, then copy again.'
    });
    return;
  }

  try {
    const format = state.exportPrefs.format;
    let content = '';

    if (format === 'json') {
      const chat = buildExporterChatPayload();
      content = await window.Exporter.toJSON(chat, buildExporterPrefs());
    } else if (format === 'markdown') {
      content = await buildMarkdown();
    } else {
      const chat = buildExporterChatPayload();
      content = await window.Exporter.toClipboardText(chat, buildExporterPrefs());
    }

    await navigator.clipboard.writeText(content);

    const copyBtn = byId('copy-export-btn');
    if (copyBtn) {
      const origHTML = copyBtn.innerHTML;
      copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
      copyBtn.classList.add('pn-btn--copied');
      setTimeout(() => {
        copyBtn.innerHTML = origHTML;
        copyBtn.classList.remove('pn-btn--copied');
      }, UI_FEEDBACK_MS.COPY_RESET);
    }

    await setExportStatus('Copied to clipboard.');
  } catch (err) {
    await setExportStatus('Clipboard copy failed.', true, {
      showRetry: true,
      debugHint: 'Retry copy. If blocked, use file export and copy from the file.'
    });
  }
};

// ─── Improve Prompt Diff Modal ───────────────────────────────────────────────

/** State for the improve prompt diff modal. */
const improveModalState = {
  promptId: null,
  originalText: '',
  improvedText: '',
  previousText: null, // for undo
  tags: [],
  isRunning: false,
  context: 'fab', // fab | add_modal | library_edit
  sourceTabId: null
};

const normalizeImprovePayload = (value) => {
  if (value && typeof value === 'object') {
    return {
      text: String(value.text || '').trim(),
      tags: Array.isArray(value.tags) ? value.tags.map((tag) => String(tag || '').trim()).filter(Boolean) : [],
      sourceTabId: Number(value.sourceTabId || 0) || null
    };
  }
  return {
    text: String(value || '').trim(),
    tags: [],
    sourceTabId: null
  };
};

const getImproveModalContext = (promptId, explicitContext = '') => {
  if (explicitContext) return String(explicitContext);
  if (promptId) return 'library_edit';
  const addModal = document.getElementById('add-modal');
  const isAddModalVisible = Boolean(addModal && !addModal.classList.contains('pn-hidden'));
  return isAddModalVisible ? 'add_modal' : 'fab';
};

const setImproveActionLayout = async () => {
  const primaryBtn = document.getElementById('pn-improve-accept');
  const secondaryBtn = document.getElementById('pn-improve-accept-secondary');
  const saveOnlyBtn = document.getElementById('pn-improve-save-only');
  const context = improveModalState.context;

  if (!primaryBtn || !secondaryBtn || !saveOnlyBtn) return;

  secondaryBtn.classList.add('pn-hidden');
  saveOnlyBtn.classList.add('pn-hidden');

  if (context === 'library_edit') {
    primaryBtn.textContent = 'Save Update';
    return;
  }

  if (context === 'add_modal') {
    primaryBtn.textContent = 'Use Improved Text';
    return;
  }

  primaryBtn.textContent = 'Inject into Chat';
  secondaryBtn.textContent = 'Inject + Save';
  saveOnlyBtn.textContent = 'Save to Library';
  secondaryBtn.classList.remove('pn-hidden');
  saveOnlyBtn.classList.remove('pn-hidden');
};

const setImproveButtonsDisabled = (disabled) => {
  [
    'pn-improve-accept',
    'pn-improve-accept-secondary',
    'pn-improve-save-only',
    'pn-improve-retry'
  ].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.disabled = Boolean(disabled);
  });
};

const sendImprovedPromptToTab = (tabId, text) => new Promise((resolve) => {
  chrome.tabs.sendMessage(
    tabId,
    { action: 'APPLY_IMPROVED_PROMPT', text },
    () => resolve(!chrome.runtime.lastError)
  );
});

const tryInjectImprovedPrompt = async (text, preferredTabId = null) => {
  const candidateTabs = [];

  if (preferredTabId) {
    candidateTabs.push({ id: preferredTabId, url: '' });
  }

  const [lastFocusedActive, currentActive] = await Promise.all([
    chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []),
    chrome.tabs.query({ active: true, currentWindow: true }).catch(() => [])
  ]);

  for (const tab of [...lastFocusedActive, ...currentActive]) {
    if (!tab?.id) continue;
    candidateTabs.push(tab);
  }

  const visited = new Set();
  for (const tab of candidateTabs) {
    if (!tab?.id || visited.has(tab.id)) continue;
    visited.add(tab.id);
    const tabUrl = String(tab.url || '').toLowerCase();
    if (tabUrl.startsWith('chrome-extension://')) continue;
    // Ignore sidepanel/popup tabs and keep trying.
    if (await sendImprovedPromptToTab(tab.id, text)) {
      return true;
    }
  }

  return false;
};

const buildFallbackPromptTitle = (text) => {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  if (!compact) return 'Improved Prompt';
  const firstSentence = compact.split(/[.!?]/)[0]?.trim() || compact;
  return firstSentence.slice(0, 64) || 'Improved Prompt';
};

const generatePromptTitle = async (text) => {
  try {
    const response = await window.AIBridge.generatePromptTitle(text);
    const generated = String(response?.title || response?.text || '').replace(/^["']+|["']+$/g, '').trim();
    if (generated) return generated.slice(0, 80);
  } catch (_) {
    // Fall through to local fallback.
  }
  return buildFallbackPromptTitle(text);
};

const saveImprovedTextToLibrary = async (text, tags = []) => {
  const title = await generatePromptTitle(text);
  const saved = await window.Store.savePrompt({
    title,
    text,
    tags: Array.isArray(tags) ? tags : [],
    category: null,
    embedding: null
  });

  if (saved && state.aiReady && saved.id) {
    void window.AIBridge.cacheAdd(saved);
  }

  return saved;
};

/** Opens the improve diff modal in loading state and fires the AI request. */
const openImproveModal = async (promptId, originalText, tags = [], options = {}) => {
  improveModalState.promptId = promptId;
  improveModalState.originalText = originalText;
  improveModalState.improvedText = '';
  improveModalState.tags = tags;
  improveModalState.isRunning = true;
  improveModalState.context = getImproveModalContext(promptId, options?.context || '');
  improveModalState.sourceTabId = Number(options?.sourceTabId || 0) || null;

  const modal = document.getElementById('pn-improve-modal');
  const loading = document.getElementById('pn-improve-loading');
  const diff = document.getElementById('pn-improve-diff');
  const error = document.getElementById('pn-improve-error');
  const modalStyle = document.getElementById('pn-improve-modal-style');
  const addModalStyle = document.getElementById('pn-improve-style');

  if (!modal) return;

  if (improveModalState.context === 'add_modal' && modalStyle && addModalStyle) {
    modalStyle.value = addModalStyle.value || 'general';
  }

  await setImproveActionLayout();

  // Reset state
  modal.classList.remove('pn-hidden');
  loading?.classList.remove('pn-hidden');
  diff?.classList.add('pn-hidden');
  error?.classList.add('pn-hidden');
  setImproveButtonsDisabled(true);

  // Run the AI improvement
  const style = document.getElementById('pn-improve-modal-style')?.value || 'general';
  try {
    const response = await window.AIBridge.improvePrompt(originalText, tags, style);
    improveModalState.isRunning = false;

    if (response?.error) {
      showImproveError(response.error);
    } else if (response?.text) {
      improveModalState.improvedText = response.text;
      showImproveDiff();
    } else {
      showImproveError('No optimized output. Try another style.');
    }
  } catch (err) {
    improveModalState.isRunning = false;
    showImproveError(err?.message || 'Request failed. Check API key.');
  }
};

/** Displays the before/after diff in the modal. */
const showImproveDiff = () => {
  const loading = document.getElementById('pn-improve-loading');
  const diff = document.getElementById('pn-improve-diff');
  const error = document.getElementById('pn-improve-error');
  const origEl = document.getElementById('pn-improve-original');
  const newEl = document.getElementById('pn-improve-improved');
  const origCount = document.getElementById('pn-improve-orig-count');
  const newCount = document.getElementById('pn-improve-new-count');

  loading?.classList.add('pn-hidden');
  error?.classList.add('pn-hidden');
  diff?.classList.remove('pn-hidden');
  setImproveButtonsDisabled(false);

  if (origEl) origEl.textContent = improveModalState.originalText;
  if (newEl) newEl.textContent = improveModalState.improvedText;

  // Character counts with diff
  const origLen = improveModalState.originalText.length;
  const newLen = improveModalState.improvedText.length;
  const charDiff = newLen - origLen;
  const diffLabel = charDiff > 0 ? `+${charDiff}` : `${charDiff}`;

  if (origCount) origCount.textContent = `${origLen} chars`;
  if (newCount) {
    newCount.textContent = `${newLen} chars (${diffLabel})`;
    newCount.classList.toggle('pn-improve-count--positive', charDiff > 0);
    newCount.classList.toggle('pn-improve-count--negative', charDiff < 0);
  }
};

/** Shows error state in the improve modal. */
const showImproveError = (message) => {
  const loading = document.getElementById('pn-improve-loading');
  const diff = document.getElementById('pn-improve-diff');
  const error = document.getElementById('pn-improve-error');
  const errorMsg = document.getElementById('pn-improve-error-msg');
  const normalized = String(message || '').trim();
  const isMissingApiKey = /api\s*key/i.test(normalized) && /settings|missing|not\s*found|not\s*configured/i.test(normalized);

  loading?.classList.add('pn-hidden');
  diff?.classList.add('pn-hidden');
  error?.classList.remove('pn-hidden');
  if (errorMsg) {
    errorMsg.textContent = isMissingApiKey ? 'Gemini API Key Not Configured' : normalized;
  }

  const existingAction = document.getElementById('pn-improve-go-settings');
  existingAction?.remove();

  if (isMissingApiKey && error) {
    const action = document.createElement('button');
    action.id = 'pn-improve-go-settings';
    action.type = 'button';
    action.className = 'pn-btn pn-btn--primary';
    action.textContent = 'Go to Settings';
    action.addEventListener('click', () => {
      closeImproveModal();
      void switchTab('settings');
    });
    error.appendChild(action);
  }
  setImproveButtonsDisabled(false);
};

/** Closes the improve diff modal. */
const closeImproveModal = () => {
  const modal = document.getElementById('pn-improve-modal');
  modal?.classList.add('pn-hidden');
  improveModalState.isRunning = false;
};

/** Accepts the improved text based on context and selected action. */
const acceptImproveResult = async (mode = 'primary') => {
  const { promptId, originalText, improvedText, context, tags, sourceTabId } = improveModalState;
  if (!improvedText) return;

  // Save previous text for undo
  improveModalState.previousText = originalText;

  if (context === 'add_modal' && !promptId) {
    closeImproveModal();
    const textInput = document.getElementById('prompt-text');
    const addModal = document.getElementById('add-modal');
    const isAddModalVisible = Boolean(addModal && !addModal.classList.contains('pn-hidden'));
    if (textInput && isAddModalVisible) {
      textInput.value = improvedText;
      void prefillSuggestedTags();
      await showToast('Prompt optimized.');
    }
    return;
  }

  if (!promptId && context === 'fab') {
    closeImproveModal();
    const shouldInject = mode === 'primary' || mode === 'secondary';
    const shouldSave = mode === 'secondary' || mode === 'save';
    let injected = false;
    let saved = null;

    if (shouldInject) {
      injected = await tryInjectImprovedPrompt(improvedText, sourceTabId);
      if (!injected) {
        await showToast('Injection failed. Keep target tab open and retry.');
      }
    }

    if (shouldSave) {
      saved = await saveImprovedTextToLibrary(improvedText, tags);
      if (!saved) {
        await showToast('Optimized prompt save failed.');
        return;
      }
      await renderPrompts(String(byId('prompt-search')?.value || ''));
      await renderTags();
    }

    if (mode === 'primary' && injected) {
      await showToast('Prompt injected.');
      return;
    }

    if (mode === 'secondary') {
      if (injected) {
        await showToast('Injected and saved to library.');
      } else {
        await showToast('Saved to library. Injection failed.');
      }
      return;
    }

    if (mode === 'save') {
      await showToast('Optimized prompt saved.');
    }
    return;
  }

  closeImproveModal();
  const updated = await window.Store.updatePrompt(promptId, { text: improvedText });

  if (updated) {
    await renderPrompts(String(byId('prompt-search')?.value || ''));

    // Show undo toast
    const toast = document.createElement('div');
    toast.className = 'pn-toast pn-toast--undo';
    toast.innerHTML = `Prompt optimized. <button class="pn-toast-undo-btn" type="button">Undo</button>`;
    document.body.appendChild(toast);

    const undoBtn = toast.querySelector('.pn-toast-undo-btn');
    undoBtn?.addEventListener('click', async () => {
      await window.Store.updatePrompt(promptId, { text: originalText });
      await renderPrompts(String(byId('prompt-search')?.value || ''));
      toast.remove();
      showToast('Reverted to original prompt.');
    });

    setTimeout(() => toast.remove(), UI_FEEDBACK_MS.IMPROVE_UNDO);
  } else {
    showToast('Optimized prompt save failed.');
  }
};

/** Retries the improvement with the current modal style. */
const retryImprove = async () => {
  const { promptId, originalText, tags, context, sourceTabId } = improveModalState;
  await openImproveModal(promptId, originalText, tags, { context, sourceTabId });
};

/** Binds all improve modal event listeners. */
const bindImproveModalEvents = () => {
  document.getElementById('pn-improve-accept')?.addEventListener('click', () => {
    void acceptImproveResult('primary');
  });

  document.getElementById('pn-improve-accept-secondary')?.addEventListener('click', () => {
    void acceptImproveResult('secondary');
  });

  document.getElementById('pn-improve-save-only')?.addEventListener('click', () => {
    void acceptImproveResult('save');
  });

  document.getElementById('pn-improve-reject')?.addEventListener('click', closeImproveModal);

  document.getElementById('pn-improve-retry')?.addEventListener('click', () => {
    void retryImprove();
  });

  // Backdrop close
  document.querySelector('[data-close-improve]')?.addEventListener('click', closeImproveModal);

  document.getElementById('pn-improve-modal-style')?.addEventListener('change', (event) => {
    const addStyle = document.getElementById('pn-improve-style');
    if (addStyle) addStyle.value = String(event.target?.value || 'general');
  });
};

// ─── End Improve Modal ───────────────────────────────────────────────────────

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

  // Save Gemini API key separately
  const geminiKeyInput = document.getElementById('setting-gemini-key');
  if (geminiKeyInput) {
    await setStoredGeminiKey(geminiKeyInput.value);
  }

  await setSettingsStatus('Settings saved.', 'ok');
  await syncSettingsSaveState();
};

/** Loads session payload updates and keeps export tab live during FAB-triggered changes. */
const bindSessionPayloadUpdates = async () => {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    const payloadChange = changes[SIDEPANEL_SESSION_KEY];
    if (areaName !== 'session' || !payloadChange) {
      return;
    }

    void (async () => {
      await ingestIncomingExportPayload(payloadChange.newValue);
      if (hasPayloadMessages(state.exportPayload)) {
        await switchTab('export');
      }
    })();
  });

  // Hot-reload the workspace when prompts are modified from content scripts
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.prompts) {
      return;
    }

    void (async () => {
      await renderPrompts(String(document.getElementById('prompt-search')?.value || ''));
      await renderTags();
    })();
  });
};

/** Refreshes main payload panels manually. */
const performWorkspaceRefresh = async () => {
  await renderPrompts(String(document.getElementById('prompt-search')?.value || ''));
  await renderHistory();
  await renderTags();
  await showToast('Workspace synced.');
};

/** Binds side panel event handlers for tabs, modal, search, export, and settings. */
const bindEvents = async () => {
  Array.from(document.querySelectorAll('.tab')).forEach((tab) => {
    tab.addEventListener('click', () => {
      void switchTab(String(tab.dataset.tab || 'prompts'));
    });
  });

  (await byId('history-btn'))?.addEventListener('click', () => {
    void switchTab('history');
  });

  (await byId('settings-btn'))?.addEventListener('click', () => {
    void switchTab('settings');
  });

  (await byId('back-btn'))?.addEventListener('click', () => {
    void switchTab('prompts');
  });

  (await byId('add-prompt-btn'))?.addEventListener('click', () => {
    void openModal();
  });

  (await byId('refresh-btn'))?.addEventListener('click', () => {
    void performWorkspaceRefresh();
  });

  (await byId('pn-ai-retry-btn'))?.addEventListener('click', () => {
    void syncAiState();
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

  (await byId('pn-improve-prompt-btn'))?.addEventListener('click', async (e) => {
    const textInput = await byId('prompt-text');
    const tagsHidden = await byId('prompt-tags');
    
    if (!textInput || !textInput.value.trim()) {
      await showToast('Enter a prompt to optimize.');
      return;
    }

    try {
      const tags = await parseTags(tagsHidden?.value || '');
      await openImproveModal(null, textInput.value, tags, { context: 'add_modal' });
    } catch (err) {
      await showToast('Could not open optimizer.');
    }
  });

  (await byId('prompt-text'))?.addEventListener('blur', () => {
    void prefillSuggestedTags();
  });

  // Badge-style tag input
  const tagBadgeInput = document.getElementById('prompt-tags-input');
  if (tagBadgeInput) {
    tagBadgeInput.addEventListener('keydown', (e) => {
      const val = String(tagBadgeInput.value || '').trim();
      if ((e.key === ' ' || e.key === 'Enter' || e.key === ',') && val) {
        e.preventDefault();
        addTagBadge(val);
        tagBadgeInput.value = '';
      }
      if (e.key === 'Backspace' && !tagBadgeInput.value) {
        const badges = document.querySelectorAll('#tag-badges-wrap .pn-tag-badge');
        const last = badges[badges.length - 1];
        if (last) last.remove();
        syncBadgesToHidden();
      }
    });

    tagBadgeInput.addEventListener('blur', () => {
      const val = String(tagBadgeInput.value || '').trim();
      if (val) {
        addTagBadge(val);
        tagBadgeInput.value = '';
      }
    });
  }

  // Focus tag input when clicking badge container
  const badgeWrap = document.getElementById('tag-badges-wrap');
  if (badgeWrap && tagBadgeInput) {
    badgeWrap.addEventListener('click', (e) => {
      if (e.target === badgeWrap) tagBadgeInput.focus();
    });
  }

  // Smart strip close button
  document.getElementById('pn-smart-close')?.addEventListener('click', () => {
    document.getElementById('pn-smart-strip')?.classList.add('pn-hidden');
  });

  // API key visibility toggle
  document.getElementById('toggle-key-vis')?.addEventListener('click', () => {
    const keyInput = document.getElementById('setting-gemini-key');
    if (keyInput) {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    }
  });

  // Check API connection button
  document.getElementById('check-api-key')?.addEventListener('click', async () => {
    const btn = document.getElementById('check-api-key');
    const keyInput = document.getElementById('setting-gemini-key');
    const key = keyInput?.value?.trim();
    if (!key) {
      btn.textContent = 'No key';
      btn.classList.add('pn-status-error');
      setTimeout(() => { btn.textContent = 'Check'; btn.classList.remove('pn-status-error', 'pn-status-ok'); }, UI_FEEDBACK_MS.API_CHECK_RESET_SHORT);
      return;
    }
    btn.textContent = '...';
    btn.classList.remove('pn-status-error', 'pn-status-ok');
    try {
      const res = await chrome.runtime.sendMessage({ action: 'VALIDATE_GEMINI_KEY', key });
      if (res?.ok) {
        btn.textContent = '✓ Valid';
        btn.classList.add('pn-status-ok');
      } else {
        btn.textContent = '✗ Invalid';
        btn.classList.add('pn-status-error');
      }
    } catch {
      btn.textContent = '✗ Error';
      btn.classList.add('pn-status-error');
    }
    setTimeout(() => { btn.textContent = 'Check'; btn.classList.remove('pn-status-error', 'pn-status-ok'); }, UI_FEEDBACK_MS.API_CHECK_RESET_LONG);
  });

  const searchInput = document.getElementById('prompt-search');
  const clearBtn = document.getElementById('pn-search-clear');
  const searchWrap = document.getElementById('search-wrap');
  const clearSearchInput = () => {
    if (!searchInput) return;
    if (!String(searchInput.value || '').trim()) return;
    searchInput.value = '';
    clearBtn?.classList.add('pn-hidden');
    void renderPrompts('');
  };

  searchInput?.addEventListener('input', (event) => {
    const target = event.target;
    if (clearBtn) {
      clearBtn.classList.toggle('pn-hidden', !target.value.trim());
    }
    clearTimeout(state._searchDebounce);
    state._searchDebounce = setTimeout(() => {
      void renderPrompts(String(target?.value || ''));
    }, UI_FEEDBACK_MS.SEARCH_DEBOUNCE);
  });

  clearBtn?.addEventListener('click', () => {
    clearSearchInput();
    searchInput?.focus();
  });
  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && String(searchInput.value || '').trim()) {
      event.preventDefault();
      clearSearchInput();
    }
  });
  clearBtn?.classList.toggle('pn-hidden', !String(searchInput?.value || '').trim());

  const rerenderExport = async () => {
    await syncExportPrefsFromControls();
    await renderExportPreview();
  };

  const exportControlIds = [
    'export-format',
    'export-content-mode',
    'include-date',
    'include-platform',
    'include-msg-numbers',
    'export-font-style',
    'export-bg-style',
    'export-bg-custom'
  ];
  exportControlIds.forEach((id) => {
    byId(id)?.addEventListener('change', () => {
      void rerenderExport();
    });
  });
  byId('export-bg-custom')?.addEventListener('input', () => {
    void rerenderExport();
  });

  const fontSizeSlider = byId('export-font-size');
  const fontSizeNumber = byId('export-font-size-number');
  fontSizeSlider?.addEventListener('input', () => {
    if (fontSizeNumber) fontSizeNumber.value = String(fontSizeSlider.value || '14');
    void rerenderExport();
  });
  fontSizeNumber?.addEventListener('input', () => {
    const next = Math.min(20, Math.max(12, Number(fontSizeNumber.value || 14)));
    fontSizeNumber.value = String(next);
    if (fontSizeSlider) fontSizeSlider.value = String(next);
    void rerenderExport();
  });

  byId('export-reload-selection')?.addEventListener('click', () => {
    void applyLatestExportSnapshot();
  });

  (await byId('export-btn'))?.addEventListener('click', () => {
    void runExport();
  });

  byId('copy-export-btn')?.addEventListener('click', () => {
    void copyExportToClipboard();
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
    'setting-user-context',
    'setting-gemini-key'
  ];

  for (const controlId of settingsControlIds) {
    const control = document.getElementById(controlId);
    if (!control) continue;
    control.addEventListener('change', () => {
      void syncSettingsSaveState();
    });
    if (controlId === 'setting-user-context') {
      control.addEventListener('input', () => {
        void syncSettingsSaveState();
      });
    }
  }

  window.addEventListener('keydown', (event) => {
    const isFocusShortcut = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
    if (isFocusShortcut) {
      if (!searchInput || !searchWrap || searchWrap.classList.contains('hidden')) return;
      const active = document.activeElement;
      if (isEditableField(active) && active !== searchInput) return;
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    if (event.key !== 'Escape') return;
    if (!document.getElementById('pn-improve-modal')?.classList.contains('pn-hidden')) {
      closeImproveModal();
      return;
    }
    if (!document.getElementById('add-modal')?.classList.contains('pn-hidden')) {
      void closeModal();
      return;
    }
    if (document.activeElement === searchInput && String(searchInput?.value || '').trim()) {
      event.preventDefault();
      clearSearchInput();
    }
  });

  window.addEventListener('resize', () => {
    // No-op
  });
};

// addTagBadge and syncBadgesToHidden are now provided by utils/tags.js

// syncBadgesToHidden provided by Tags

/** Loads smart suggestions by fetching conversation context from active tab. */
const loadSmartSuggestions = async () => {
  if (!state.aiReady) return;

  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    // Try to get conversation snippet from content script
    let snippet = null;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONVERSATION_SNIPPET' });
      snippet = response?.text;
    } catch (_) { return; }

    if (!snippet || snippet.length < 30) return;

    const result = await window.AIBridge.getSmartSuggestions(snippet);
    if (!result?.ids?.length) return;

    const prompts = await window.Store.getPrompts();
    const promptMap = new Map(prompts.map(p => [p.id, p]));

    const strip = document.getElementById('pn-smart-strip');
    const chips = document.getElementById('pn-smart-chips');
    if (!strip || !chips) return;

    chips.innerHTML = '';

    for (const id of result.ids) {
      const prompt = promptMap.get(id);
      if (!prompt) continue;

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pn-smart-chip';
      chip.textContent = prompt.title;
      chip.title = prompt.text.slice(0, 100);
      chip.addEventListener('click', () => {
        const search = document.getElementById('prompt-search');
        if (search) search.value = prompt.title;
        void renderPrompts(prompt.title);
      });
      chips.appendChild(chip);
    }

    strip.classList.remove('pn-hidden');
  } catch (_) {}
};

/** Initializes full side panel workspace and renders all sections. */
const init = async () => {
  await bindEvents();
  bindImproveModalEvents();
  await loadSettings();
  await renderSettingsControls();
  await syncSettingsSaveState();
  await applyExportDefaultsFromSettings();
  const initialExportPayload = await loadExportPayload();
  state.exportSnapshotPayload = cloneExportPayload(initialExportPayload);
  state.pendingExportPayload = null;
  state.hasPendingExportUpdate = false;
  await bindSessionPayloadUpdates();

  // Load Gemini key & check for pending Improve prompt triggers
  try {
    const { [IMPROVE_PAYLOAD_KEY]: promptiumImprovePayload } = await chrome.storage.local.get([IMPROVE_PAYLOAD_KEY]);
    const promptiumGeminiKey = await getStoredGeminiKey();
    
    if (promptiumImprovePayload) {
      await chrome.storage.local.remove([IMPROVE_PAYLOAD_KEY]).catch(() => {});
      const normalizedImprove = normalizeImprovePayload(promptiumImprovePayload);
      if (normalizedImprove.text) {
        void openImproveModal(null, normalizedImprove.text, normalizedImprove.tags, {
          context: 'fab',
          sourceTabId: normalizedImprove.sourceTabId
        });
      }
    }

    const keyInput = document.getElementById('setting-gemini-key');
    if (keyInput && promptiumGeminiKey) keyInput.value = promptiumGeminiKey;
  } catch (_) {}

  const hasSelectionPayload = Boolean(state.exportPayload?.messages?.length);
  const route = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
  const routableTabs = new Set(['prompts', 'history', 'export', 'tags', 'settings']);
  const initialTab = routableTabs.has(route) ? route : (hasSelectionPayload ? 'export' : 'prompts');
  await switchTab(initialTab);
  await renderPrompts('');
  await renderHistory();
  await renderTags();
  await renderExportPreview();

  const onboardingInitializedAi = await maybeRunOnboarding();

  if (state.settings.enableAI) {
    if (!onboardingInitializedAi) {
      await syncAiState();
    }
  } else {
    await setAiDisabledBadge();
  }

  if (state.exportSnapshotPayload?.messages?.length) {
    await setExportStatus('Selection loaded.');
  } else {
    await setExportStatus('Select messages in chat, then click Export Selected.', false);
  }
};

// Register export navigation listener IMMEDIATELY so it's live when background sends showExport
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.action !== 'showExport') return;

  void (async () => {
    try {
      const incoming = await loadExportPayload();
      await ingestIncomingExportPayload(incoming);
      await switchTab('export');
      await renderExportPreview();
      await renderExportMeta();

      if (state.exportSnapshotPayload?.messages?.length) {
        await setExportStatus('Selection loaded.');
      }
    } catch (err) {
      console.warn('[Promptium] showExport handler error:', err);
    }
  })();

  return true;
});

// Listen for Improve Prompt payloads dropping into storage
chrome.storage.onChanged.addListener((changes) => {
  const improveChange = changes[IMPROVE_PAYLOAD_KEY];
  if (improveChange && improveChange.newValue) {
    const normalizedImprove = normalizeImprovePayload(improveChange.newValue);
    chrome.storage.local.remove([IMPROVE_PAYLOAD_KEY]).catch(() => {});
    if (normalizedImprove.text) {
      void openImproveModal(null, normalizedImprove.text, normalizedImprove.tags, {
        context: 'fab',
        sourceTabId: normalizedImprove.sourceTabId
      });
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  init().catch((err) => {
    const banner = document.createElement('div');
    banner.className = 'pn-init-error-banner';
    banner.textContent = `Initialization failed: ${err?.message || 'Unknown error.'} Open Settings and retry.`;
    document.body.appendChild(banner);
  });
});
