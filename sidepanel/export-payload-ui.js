(() => {
/**
 * File: sidepanel/export-payload-ui.js
 * Purpose: Export payload lifecycle, preview rendering, metadata, and preferences.
 */

const { KEYS, state } = window.SidepanelState;
const STYLE_RULE_TYPE = typeof CSSRule === 'undefined' ? 1 : CSSRule.STYLE_RULE;

const callbacks = {
  onRunExport: null,
  onSelectMessages: null
};
const EXPORT_PREFS_KEY = 'exportPrefs';
let exportPrefsHydrated = false;

const EXPORT_FORMAT_ALIASES = Object.freeze({
  text: 'txt',
  jpg: 'jpeg',
  image: 'png'
});

const SUPPORTED_EXPORT_FORMATS = new Set([
  'markdown',
  'txt',
  'json',
  'pdf',
  'png',
  'jpeg',
  'notion',
  'obsidian'
]);

const normalizeExportFormat = (value, fallback = 'markdown') => {
  const raw = String(value || '').toLowerCase().trim();
  const aliased = EXPORT_FORMAT_ALIASES[raw] || raw;
  if (SUPPORTED_EXPORT_FORMATS.has(aliased)) {
    return aliased;
  }
  return fallback;
};

const normalizeExportPrefs = (raw, fallback = state.exportPrefs || {}) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  return {
    format: normalizeExportFormat(source.format || base.format || 'markdown'),
    includeDate: source.includeDate !== undefined ? Boolean(source.includeDate) : Boolean(base.includeDate),
    includePlatform: source.includePlatform !== undefined ? Boolean(source.includePlatform) : Boolean(base.includePlatform),
    includeMessageNumbers: source.includeMessageNumbers !== undefined ? Boolean(source.includeMessageNumbers) : Boolean(base.includeMessageNumbers),
    contentMode: String(source.contentMode || base.contentMode || 'structured') === 'combined' ? 'combined' : 'structured',
    fontStyle: String(source.fontStyle || base.fontStyle || 'System'),
    fontSize: Math.min(20, Math.max(12, Number(source.fontSize || base.fontSize || 14) || 14)),
    background: ['dark', 'light', 'sepia', 'custom'].includes(String(source.background || '').toLowerCase())
      ? String(source.background).toLowerCase()
      : String(base.background || 'dark').toLowerCase(),
    customBackground: String(source.customBackground || base.customBackground || '#18181c')
  };
};

const persistExportPrefs = async () => {
  await chrome.storage.local.set({ [EXPORT_PREFS_KEY]: state.exportPrefs }).catch(() => {});
};

const hydrateExportPrefsFromStorage = async () => {
  if (exportPrefsHydrated) return;

  const snapshot = await chrome.storage.local.get([EXPORT_PREFS_KEY]).catch(() => ({}));
  const storedPrefs = snapshot?.[EXPORT_PREFS_KEY];
  state.exportPrefs = normalizeExportPrefs(storedPrefs, state.exportPrefs);
  exportPrefsHydrated = true;

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

  if (formatNode) formatNode.value = normalizeExportFormat(state.exportPrefs.format);
  if (contentModeNode) contentModeNode.value = state.exportPrefs.contentMode;
  if (includeDateNode) includeDateNode.checked = Boolean(state.exportPrefs.includeDate);
  if (includePlatformNode) includePlatformNode.checked = Boolean(state.exportPrefs.includePlatform);
  if (includeNumbersNode) {
    includeNumbersNode.checked = Boolean(state.exportPrefs.includeMessageNumbers);
    includeNumbersNode.disabled = state.exportPrefs.contentMode === 'combined';
    if (includeNumbersNode.disabled) {
      includeNumbersNode.checked = false;
      state.exportPrefs.includeMessageNumbers = false;
    }
  }
  if (fontStyleNode) fontStyleNode.value = state.exportPrefs.fontStyle;
  if (fontSizeNode) fontSizeNode.value = String(state.exportPrefs.fontSize);
  if (fontSizeNumberNode) fontSizeNumberNode.value = String(state.exportPrefs.fontSize);
  if (backgroundNode) backgroundNode.value = state.exportPrefs.background;
  if (customBgNode) customBgNode.value = state.exportPrefs.customBackground;
  customWrapNode?.classList.toggle('pn-hidden', state.exportPrefs.background !== 'custom');
  applyCustomExportThemeRules(state.exportPrefs.customBackground);
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

const getPlatformLabel = (platform) => {
  const key = String(platform || '').toLowerCase();
  return PLATFORM_LABELS[key] || String(platform || 'Unknown');
};

const BOOKMARKS_KEY = 'bookmarks';
const BOOKMARK_PREVIEW_LEN = 140;

const stripInlineStylesFromHtml = (rawHtml) => String(rawHtml || '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/\sstyle\s*=\s*"[^"]*"/gi, '')
  .replace(/\sstyle\s*=\s*'[^']*'/gi, '')
  .replace(/\sstyle\s*=\s*[^\s>]+/gi, '')
  .trim();

const URL_LIKE_ATTRS = new Set(['href', 'src', 'xlink:href', 'formaction']);
const URL_PROTOCOL_ALLOWLIST = new Set(['http:', 'https:', 'mailto:', 'tel:']);

const isSafeUrlValue = (rawValue) => {
  const value = String(rawValue || '').trim();
  if (!value) return false;

  // Keep internal/relative references.
  if (value.startsWith('#') || value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) {
    return true;
  }

  if (value.startsWith('//')) {
    try {
      const parsed = new URL(`https:${value}`);
      return URL_PROTOCOL_ALLOWLIST.has(parsed.protocol);
    } catch (_) {
      return false;
    }
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) {
    try {
      const parsed = new URL(value);
      return URL_PROTOCOL_ALLOWLIST.has(parsed.protocol);
    } catch (_) {
      return false;
    }
  }

  return true;
};

const sanitizeFragmentAttributes = (root) => {
  root.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const attrName = String(attribute.name || '').toLowerCase();
      const attrValue = String(attribute.value || '').trim();

      if (attrName.startsWith('on') || attrName === 'style') {
        element.removeAttribute(attribute.name);
        return;
      }

      if (URL_LIKE_ATTRS.has(attrName) && !isSafeUrlValue(attrValue)) {
        element.removeAttribute(attribute.name);
        return;
      }

      if (attrName === 'target' && attrValue.toLowerCase() === '_blank') {
        element.setAttribute('rel', 'noopener noreferrer');
      }
    });
  });
};

const sanitizeConversationUrl = (value) => {
  try {
    const parsed = new URL(String(value || '').trim());
    return `${parsed.origin}${parsed.pathname}`;
  } catch (_) {
    return '';
  }
};

const normalizeMessageText = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

const computeMessageHash = (value) => {
  const source = normalizeMessageText(value);
  let hash = 5381;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) + hash) ^ source.charCodeAt(index);
  }
  return `h${(hash >>> 0).toString(36)}`;
};

const getActivePayload = () => window.SessionStorage.getActiveExportPayload(state);

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
    }
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

const normalizePayload = async (rawPayload) => {
  const value = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
  const messages = Array.isArray(value.messages) ? value.messages : [];
  const url = String(value.url || '').trim();
  const urlKey = sanitizeConversationUrl(url);
  let bookmarkEntries = [];

  if (urlKey) {
    const bookmarkState = await chrome.storage.local.get([BOOKMARKS_KEY]).catch(() => ({}));
    const allBookmarks = bookmarkState?.[BOOKMARKS_KEY] && typeof bookmarkState[BOOKMARKS_KEY] === 'object'
      ? bookmarkState[BOOKMARKS_KEY]
      : {};
    bookmarkEntries = Array.isArray(allBookmarks?.[urlKey]) ? allBookmarks[urlKey] : [];
  }

  const normalizedMessages = messages
    .map((message, fallbackIndex) => {
      const indexCandidate = Number(message?.index);
      const sourceIndex = Number.isFinite(indexCandidate) ? indexCandidate : fallbackIndex;
      const text = String(message?.text || '').trim();
      const preview = text.slice(0, BOOKMARK_PREVIEW_LEN);
      const messageHash = computeMessageHash(preview);

      const bookmarkMatch = bookmarkEntries.find((entry) => {
        const sameIndex = Number(entry?.messageIndex) === sourceIndex;
        if (!sameIndex) return false;
        const entryHash = String(entry?.messageHash || '').trim();
        if (entryHash) return entryHash === messageHash;
        return normalizeMessageText(entry?.messagePreview || '') === normalizeMessageText(preview);
      });

      return {
        role: String(message?.role || 'assistant').toLowerCase(),
        text,
        html: String(message?.html || '').trim(),
        index: sourceIndex,
        bookmarkMeta: {
          isBookmarked: Boolean(bookmarkMatch),
          messageHash
        }
      };
    })
    .filter((message) => message.text.length > 0);

  return {
    title: String(value.title || 'Promptium Chat').trim(),
    platform: String(value.platform || 'unknown').trim(),
    url,
    createdAt: String(value.createdAt || new Date().toISOString()),
    messages: normalizedMessages
  };
};

const loadPayload = async () => {
  const sessionSnapshot = await chrome.storage.session.get([KEYS.SIDEPANEL_SESSION_KEY]);
  const localSnapshot = await chrome.storage.local.get([KEYS.SIDEPANEL_SESSION_KEY]);
  const rawPayload = sessionSnapshot?.[KEYS.SIDEPANEL_SESSION_KEY] || localSnapshot?.[KEYS.SIDEPANEL_SESSION_KEY];
  state.exportPayload = await normalizePayload(rawPayload);
  await chrome.storage.session.remove([KEYS.SIDEPANEL_SESSION_KEY]).catch(() => {});
  await chrome.storage.local.remove([KEYS.SIDEPANEL_SESSION_KEY]).catch(() => {});
  return state.exportPayload;
};

const hasPayloadMessages = (payload) => Array.isArray(payload?.messages) && payload.messages.length > 0;

const applyLatestSnapshot = async () => {
  if (!state.pendingExportPayload) {
    await setStatus('Preview already current.');
    return;
  }
  state.exportPayload = window.SessionStorage.cloneExportPayload(state.pendingExportPayload);
  state.exportSnapshotPayload = window.SessionStorage.cloneExportPayload(state.pendingExportPayload);
  state.pendingExportPayload = null;
  state.hasPendingExportUpdate = false;
  await renderPreview();
  await setStatus('Latest selection loaded.');
};

const ingestIncomingPayload = async (rawPayload) => {
  const normalized = await normalizePayload(rawPayload);
  state.exportPayload = normalized;

  if (state.activeTab === 'export' && hasPayloadMessages(state.exportSnapshotPayload)) {
    state.pendingExportPayload = window.SessionStorage.cloneExportPayload(normalized);
    state.hasPendingExportUpdate = hasPayloadMessages(state.pendingExportPayload);
    await renderMeta();
    if (state.hasPendingExportUpdate) {
      await setStatus('New selection ready. Click "Reload latest selection".');
    }
    return;
  }

  state.exportSnapshotPayload = window.SessionStorage.cloneExportPayload(normalized);
  state.pendingExportPayload = null;
  state.hasPendingExportUpdate = false;
  await renderPreview();
};

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

const toMessageContentMarkdown = async (message) => {
  const service = await getTurndownService();
  const rawHtml = String(message?.html || '').trim();
  const safeHtml = stripInlineStylesFromHtml(rawHtml);
  const template = document.createElement('template');
  template.innerHTML = safeHtml;
  template.content.querySelectorAll(
    'script, style, iframe, object, embed, link, meta, img, svg, figure, picture, source, video, audio, canvas, nav, header, footer, aside, button, input, textarea, select, [hidden], [aria-hidden="true"]'
  ).forEach((node) => node.remove());
  sanitizeFragmentAttributes(template.content);
  const exportHtml = template.innerHTML.trim();

  if (service && exportHtml) {
    const converted = service.turndown(`<div>${exportHtml}</div>`).trim();
    if (converted) return converted;
  }
  return String(message?.text || '').trim();
};

const toStructuredMessageMarkdown = async (message, index) => {
  const roleLabel = message.role === 'user' ? 'You' : 'Assistant';
  const messageNumber = state.exportPrefs.includeMessageNumbers ? `${index + 1}. ` : '';
  const bookmarkTag = message?.bookmarkMeta?.isBookmarked ? ' ⭐' : '';
  const content = await toMessageContentMarkdown(message);
  return `### ${messageNumber}${roleLabel}${bookmarkTag}\n\n${content}`;
};

const buildMarkdown = async () => {
  const payload = getActivePayload();

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
      const message = payload.messages[index];
      const body = await toMessageContentMarkdown(message);
      const bookmarkPrefix = message?.bookmarkMeta?.isBookmarked ? '⭐ ' : '';
      sections.push(`${bookmarkPrefix}${body}`);
    }
    const combinedText = sections.filter(Boolean).join('\n\n').trim();
    return `${lines.join('\n')}\n\n---\n\n${combinedText}`.trim();
  }

  for (let index = 0; index < payload.messages.length; index += 1) {
    sections.push(await toStructuredMessageMarkdown(payload.messages[index], index));
  }

  return `${lines.join('\n')}\n\n---\n\n${sections.join('\n\n---\n\n')}`.trim();
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

const getMarkdownParser = async () => {
  if (state.markdownParser) return state.markdownParser;
  state.markdownParser = window.ExportPreviewRenderer.createMarkdownParser(window.markdownit);
  return state.markdownParser;
};

const buildVisualPreviewMarkup = async () => {
  const payload = getActivePayload();

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
      const message = payload.messages[index];
      const prefix = message?.bookmarkMeta?.isBookmarked ? '⭐ ' : '';
      chunks.push(`${prefix}${await toMessageContentMarkdown(message)}`);
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
      const bookmarkTag = message?.bookmarkMeta?.isBookmarked ? ' ⭐' : '';
      const mdText = await toMessageContentMarkdown(message);
      const contentHtml = parser ? parser.render(mdText) : escapeHtml(mdText).replaceAll('\n', '<br />');
      rows.push(`
        <article class="pn-export-card">
          <h3 class="pn-export-message-heading">${messageNumber}${roleLabel}${bookmarkTag}</h3>
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

const buildExporterChatPayload = () => {
  const payload = getActivePayload();
  if (!payload) return null;
  return {
    title: payload.title,
    platform: payload.platform,
    createdAt: payload.createdAt,
    messages: payload.messages.map((message) => ({
      role: message.role,
      text: message.text,
      html: message.html,
      index: message.index,
      bookmarkMeta: message.bookmarkMeta
    }))
  };
};

const buildExporterPrefs = () => {
  const payload = getActivePayload();
  const bookmarkedIndices = new Set(
    (payload?.messages || [])
      .filter((message) => message?.bookmarkMeta?.isBookmarked)
      .map((message, idx) => Number.isFinite(Number(message?.index)) ? Number(message.index) : idx)
  );

  return {
    includePlatformLabel: state.exportPrefs.includePlatform,
    includeTimestamps: false,
    includeExportDate: state.exportPrefs.includeDate,
    includeMessageNumbers: state.exportPrefs.includeMessageNumbers,
    headerText: '',
    contentMode: state.exportPrefs.contentMode,
    fontStyle: state.exportPrefs.fontStyle,
    fontSize: state.exportPrefs.fontSize,
    background: state.exportPrefs.background,
    customBackground: state.exportPrefs.customBackground,
    bookmarkedIndices
  };
};

const buildTextPreviewMarkup = async (format) => {
  const chat = buildExporterChatPayload();
  if (!chat) {
    return '<div class="pn-empty">No messages selected.</div>';
  }
  if (!window.Exporter?.toTXT || !window.Exporter?.toJSON || !window.Exporter?.toNotion || !window.Exporter?.toObsidian) {
    return '<div class="pn-empty">Preview renderer unavailable.</div>';
  }

  const prefs = buildExporterPrefs();
  const parser = await getMarkdownParser();
  if (format === 'json') {
    const jsonText = await window.Exporter.toJSON(chat, prefs);
    return wrapExportPreviewSheet(`
      <article class="pn-export-card pn-export-card--single">
        <pre class="pn-code-block pn-code-block--json"><code class="pn-code language-json">${window.ExportPreviewRenderer.highlightCodeForPreview(jsonText, 'json')}</code></pre>
      </article>
    `);
  }

  if (format === 'notion' || format === 'obsidian') {
    const markdownText = format === 'notion'
      ? await window.Exporter.toNotion(chat, prefs)
      : await window.Exporter.toObsidian(chat, prefs);
    const html = window.ExportPreviewRenderer?.renderMarkdownDocument
      ? window.ExportPreviewRenderer.renderMarkdownDocument(parser, markdownText)
      : escapeHtml(markdownText).replaceAll('\n', '<br />');
    return wrapExportPreviewSheet(`
      <article class="pn-export-card pn-export-card--single pn-markdown-body">
        ${html}
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
  const format = normalizeExportFormat(state.exportPrefs.format);
  if (format === 'pdf' || format === 'png' || format === 'jpeg') {
    return buildVisualPreviewMarkup();
  }
  if (format === 'txt' || format === 'text') {
    return buildTextPreviewMarkup('txt');
  }
  if (format === 'json') {
    return buildTextPreviewMarkup('json');
  }
  if (format === 'notion') {
    return buildTextPreviewMarkup('notion');
  }
  if (format === 'obsidian') {
    return buildTextPreviewMarkup('obsidian');
  }
  return buildMarkdownPreviewMarkup();
};

const setStatus = async (message, isError = false, options = {}) => {
  const node = byId('export-status');

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
        if (typeof callbacks.onRunExport === 'function') {
          void callbacks.onRunExport();
        }
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

const syncPrefsFromControls = async () => {
  await hydrateExportPrefsFromStorage();

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
    format: normalizeExportFormat(format?.value || state.exportPrefs.format || 'markdown'),
    contentMode: String(contentMode?.value || state.exportPrefs.contentMode || 'structured'),
    includeDate: Boolean(includeDate?.checked),
    includePlatform: Boolean(includePlatform?.checked),
    includeMessageNumbers: Boolean(includeMsgNumbers?.checked),
    fontStyle: String(fontStyle?.value || state.exportPrefs.fontStyle || 'System'),
    fontSize: normalizedSize,
    background: String(background?.value || state.exportPrefs.background || 'dark'),
    customBackground: String(customBackground?.value || state.exportPrefs.customBackground || '#18181c')
  };
  await persistExportPrefs();

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

const renderMeta = async () => {
  await hydrateExportPrefsFromStorage();

  const payload = getActivePayload();
  const selectionMeta = byId('selection-meta');
  const previewLabel = byId('preview-label');
  const exportButton = byId('export-btn');
  const reloadButton = byId('export-reload-selection');
  const countsEl = byId('export-counts');
  const msgCountEl = byId('export-msg-count');
  const wordCountEl = byId('export-word-count');
  const fmt = normalizeExportFormat(state.exportPrefs.format);

  const formatLabels = {
    markdown: 'Markdown',
    txt: 'Plain Text',
    json: 'JSON',
    pdf: 'PDF',
    png: 'PNG Image',
    jpeg: 'JPEG Image',
    notion: 'Notion',
    obsidian: 'Obsidian'
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

  if (typeof window.ExportActionsUI?.renderBridgeStrip === 'function') {
    void window.ExportActionsUI.renderBridgeStrip();
  }

  if (reloadButton) {
    reloadButton.classList.toggle('pn-hidden', !state.hasPendingExportUpdate);
  }
};

const renderPreview = async () => {
  await hydrateExportPrefsFromStorage();

  const preview = byId('preview');

  if (!preview) {
    return;
  }

  const payload = getActivePayload();

  if (!payload || !payload.messages.length) {
    preview.innerHTML = '';
    preview.appendChild(createEmptyState({
      title: 'No messages selected',
      message: 'Select a message range in your chat to generate an export preview.',
      actionLabel: 'Select Messages',
      onAction: () => {
        if (typeof callbacks.onSelectMessages === 'function') {
          void callbacks.onSelectMessages();
        }
      }
    }));
    await renderMeta();
    return;
  }

  preview.innerHTML = await buildFormatAwarePreviewMarkup();
  await renderMeta();
};

const applyDefaultsFromSettings = (settings) => {
  const input = settings || state.settings || {};
  state.exportPrefs = {
    format: normalizeExportFormat(input.defaultExportFormat || 'markdown'),
    includeDate: Boolean(input.defaultIncludeDate),
    includePlatform: Boolean(input.defaultIncludePlatform),
    includeMessageNumbers: false,
    contentMode: 'structured',
    fontStyle: 'System',
    fontSize: 14,
    background: 'dark',
    customBackground: '#18181c'
  };
  exportPrefsHydrated = false;

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

  if (formatNode) {
    const nextFormat = normalizeExportFormat(state.exportPrefs.format);
    const hasOption = Array.from(formatNode.options).some((option) => option.value === nextFormat);
    formatNode.value = hasOption ? nextFormat : 'markdown';
    state.exportPrefs.format = formatNode.value;
  }
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

const bindEvents = () => {
  const rerenderExport = async () => {
    await syncPrefsFromControls();
    await renderPreview();
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
    void applyLatestSnapshot();
  });
};

const setCallbacks = (nextCallbacks = {}) => {
  callbacks.onRunExport = nextCallbacks.onRunExport || null;
  callbacks.onSelectMessages = nextCallbacks.onSelectMessages || null;
};

window.ExportPayloadUI = {
  loadPayload,
  normalizePayload,
  hasPayloadMessages,
  applyLatestSnapshot,
  ingestIncomingPayload,
  buildMarkdown,
  setStatus,
  syncPrefsFromControls,
  renderMeta,
  renderPreview,
  applyDefaultsFromSettings,
  resolveExportThemeColors,
  buildExporterChatPayload,
  buildExporterPrefs,
  bindEvents,
  setCallbacks,
  getActivePayload,
  getPlatformLabel
};
})();
