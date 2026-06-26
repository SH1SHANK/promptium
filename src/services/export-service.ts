(() => {
  /**
   * File: utils/exporter.js
   * Purpose: Converts chat data into multiple export formats with optional presentation preferences.
   */

  const DEFAULT_PREFS = {
    fontStyle: 'System',
    fontSize: 15,
    background: 'dark',
    customBackground: '#18181c',
    contentMode: 'structured',
    includeTimestamps: false,
    includeExportDate: true,
    includePlatformLabel: true,
    includeMessageNumbers: false,
    includeThinking: false,
    trimFollowUps: true,
    metadataPosition: 'footer',
    headerText: '',
    bookmarkedIndices: new Set(),
    fallbackMessages: [],
  };

  /** Returns a safe merged preferences object with normalized values. */
  const normalizePrefs = (prefs = {}) => {
    const merged = { ...DEFAULT_PREFS, ...(prefs || {}) };
    const numericFontSize = Number(merged.fontSize);
    const inputBookmarked = merged.bookmarkedIndices;
    const bookmarkedIndices =
      inputBookmarked instanceof Set
        ? inputBookmarked
        : new Set(Array.isArray(inputBookmarked) ? inputBookmarked : []);

    return {
      fontStyle: String(merged.fontStyle || DEFAULT_PREFS.fontStyle),
      fontSize: Number.isFinite(numericFontSize)
        ? Math.min(20, Math.max(12, numericFontSize))
        : DEFAULT_PREFS.fontSize,
      background: String(merged.background || DEFAULT_PREFS.background).toLowerCase(),
      customBackground: String(merged.customBackground || DEFAULT_PREFS.customBackground),
      contentMode: String(merged.contentMode || DEFAULT_PREFS.contentMode).toLowerCase(),
      includeTimestamps: Boolean(merged.includeTimestamps),
      includeExportDate: Boolean(merged.includeExportDate),
      includePlatformLabel: Boolean(merged.includePlatformLabel),
      includeMessageNumbers: Boolean(merged.includeMessageNumbers),
      includeThinking: Boolean(merged.includeThinking),
      trimFollowUps:
        merged.trimFollowUps !== undefined
          ? Boolean(merged.trimFollowUps)
          : DEFAULT_PREFS.trimFollowUps,
      metadataPosition: ['header', 'footer', 'none'].includes(
        String(merged.metadataPosition).toLowerCase()
      )
        ? String(merged.metadataPosition).toLowerCase()
        : DEFAULT_PREFS.metadataPosition,
      headerText: String(merged.headerText || '').trim(),
      bookmarkedIndices,
      fallbackMessages: Array.isArray(merged.fallbackMessages) ? merged.fallbackMessages : [],
    };
  };

  /**
   * Strips common AI follow-up offer patterns from the end of assistant messages.
   */
  function stripTrailingFollowUps(text: any) {
    const patterns = [
      /\n+(?:if you want|would you like|let me know if|feel free to ask|i can also explain)[^\n]*/gi,
    ];
    let cleaned = String(text || '').trim();
    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, '');
    }
    return cleaned.trimEnd();
  }

  /**
   * Detects ASCII flow patterns and wraps them in code blocks.
   */
  function wrapAsciiFlows(text: any) {
    return String(text || '').replace(
      /((?:.*(?:→|←|↑|↓|⇒|⟶).*\n){2,})/g,
      (match) => `\n\`\`\`\n${match.trim()}\n\`\`\`\n`
    );
  }

  /** Builds a safe export chat object from unknown input. */
  const normalizeChat = (chat: any, options: any = {}) => {
    const value = chat && typeof chat === 'object' ? chat : {};
    const messages = Array.isArray(value.messages) ? value.messages : [];

    return {
      title: String(value.title || 'Promptium Chat').trim(),
      platform: String(value.platform || 'unknown').trim(),
      createdAt: String(value.createdAt || new Date().toISOString()),
      messages: messages.map((message: any, index: number) => {
        const indexCandidate = Number(message?.index);
        const role = String(message?.role || 'assistant')
          .trim()
          .toLowerCase();
        let text = String(message?.text || '').trim();
        text = wrapAsciiFlows(text);

        if (options.trimFollowUps && role === 'assistant') {
          text = stripTrailingFollowUps(text);
        }

        return {
          role,
          text,
          thinking: String(message?.thinking || '').trim(),
          html: String(message?.html || '').trim(),
          index: Number.isFinite(indexCandidate) ? indexCandidate : index,
          bookmarkMeta:
            message?.bookmarkMeta && typeof message.bookmarkMeta === 'object'
              ? { ...message.bookmarkMeta }
              : { isBookmarked: false },
        };
      }),
    };
  };

  /** Returns a human-readable role label for exported message rows. */
  const formatRole = (role: any) => {
    const safeRole = String(role || 'unknown')
      .trim()
      .toLowerCase();
    if (safeRole === 'user' || safeRole === 'human' || safeRole === 'you') return 'You';
    if (safeRole === 'assistant' || safeRole === 'model' || safeRole === 'bot') return 'Assistant';
    return safeRole.charAt(0).toUpperCase() + safeRole.slice(1);
  };

  /** Returns a timestamp prefix when enabled by preferences. */
  const buildTimestampPrefix = (message: any, prefs: any) => {
    if (!prefs.includeTimestamps) {
      return '';
    }

    const base = message?.timestamp || message?.createdAt || new Date().toISOString();
    const stamp = new Date(base);

    if (Number.isNaN(stamp.getTime())) {
      return '';
    }

    return `[${stamp.toLocaleTimeString()}] `;
  };

  const isMessageBookmarked = (message: any, index: any, prefs: any) => {
    if (message?.bookmarkMeta?.isBookmarked) {
      return true;
    }
    const messageIndex = Number(message?.index);
    if (Number.isFinite(messageIndex) && prefs.bookmarkedIndices.has(messageIndex)) {
      return true;
    }
    return prefs.bookmarkedIndices.has(index);
  };

  const bookmarkTag = (message: any, index: any, prefs: any) =>
    isMessageBookmarked(message, index, prefs) ? ' ⭐' : '';
  const bookmarkPrefix = (message: any, index: any, prefs: any) =>
    isMessageBookmarked(message, index, prefs) ? '⭐ ' : '';
  const getRoleIcon = (role: any) => {
    const safeRole = String(role || 'unknown')
      .trim()
      .toLowerCase();
    if (safeRole === 'user' || safeRole === 'human' || safeRole === 'you') return '👤 ';
    if (safeRole === 'assistant' || safeRole === 'model' || safeRole === 'bot') return '🤖 ';
    return '💬 ';
  };

  /** Returns plain message text rows in original order. */
  const getMessageTextRows = (chat: any, prefs: any) =>
    (chat.messages || [])
      .map((message: any, index: any) =>
        `${bookmarkPrefix(message, index, prefs)}${String(message?.text || '').trim()}`.trim()
      )
      .filter(Boolean);

  /** Returns one merged text block for combined export mode. */
  const getCombinedText = (chat: any, prefs: any) =>
    getMessageTextRows(chat, prefs).join('\n\n').trim();

  /** Maps user-facing font selection to an available jsPDF font family. */
  const resolvePdfFont = (fontStyle: any) => {
    const normalized = String(fontStyle || '').toLowerCase();

    if (normalized.includes('jetbrains')) {
      return 'courier';
    }

    if (normalized.includes('georgia') || normalized.includes('merriweather')) {
      return 'times';
    }

    return 'helvetica';
  };

  /** Converts background preference into export-ready hex color and text color values. */
  const resolveBackgroundColors = (prefs: any) => {
    const choice = String(prefs.background || 'dark').toLowerCase();

    if (choice === 'light') {
      return { page: '#ffffff', text: '#111111' };
    }

    if (choice === 'sepia') {
      return { page: '#f4ecd8', text: '#2f2417' };
    }

    if (choice === 'custom' && /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(prefs.customBackground || '')) {
      let raw = String(prefs.customBackground || '')
        .trim()
        .toLowerCase();
      if (raw.length === 4) {
        raw = `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
      }
      const rgb = hexToRgb(raw);
      const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
      return { page: raw, text: luminance > 0.6 ? '#111111' : '#f5f5f5' };
    }

    return { page: '#18181c', text: '#f5f5f5' };
  };

  const resolveImageColors = (prefs: any) => {
    const base = resolveBackgroundColors(prefs);
    const background = String(base.page || '#18181c');
    const text = String(base.text || '#f5f5f5');
    const rgb = hexToRgb(background);
    const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    const isLight = luminance > 0.6;

    if (isLight) {
      return {
        page: background,
        text,
        muted: '#5b6474',
        card: 'rgba(17, 17, 17, 0.05)',
        border: 'rgba(17, 17, 17, 0.16)',
      };
    }

    return {
      page: background,
      text,
      muted: 'rgba(245, 245, 245, 0.78)',
      card: 'rgba(255, 255, 255, 0.06)',
      border: 'rgba(255, 255, 255, 0.18)',
    };
  };

  /** Converts a hex color string into RGB tuple values for jsPDF drawing APIs. */
  const hexToRgb = (hexColor: any): [number, number, number] => {
    const hex = String(hexColor || '#000000').replace('#', '');

    if (hex.length === 3) {
      const r = hex[0] || '0';
      const g = hex[1] || '0';
      const b = hex[2] || '0';
      return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
    }

    return [
      parseInt(hex.slice(0, 2), 16) || 0,
      parseInt(hex.slice(2, 4), 16) || 0,
      parseInt(hex.slice(4, 6), 16) || 0,
    ];
  };

  const normalizeFileExtension = (extension: any) => {
    const raw = String(extension || '')
      .toLowerCase()
      .replace(/^\./, '');
    if (raw === 'markdown' || raw === 'notion' || raw === 'obsidian') return 'md';
    if (raw === 'text') return 'txt';
    return raw || 'txt';
  };

  /** Builds a human-readable export filename from content and platform/date values. */
  const buildFilename = (chat: any, extension: any, prefs: any = {}) => {
    const ext = normalizeFileExtension(extension);
    if (window.SmartName?.getFilename) {
      return window.SmartName.getFilename(
        chat?.messages || [],
        chat?.platform || 'unknown',
        ext,
        prefs?.fallbackMessages || []
      );
    }

    const rawPlatform = String(chat?.platform || 'unknown').toLowerCase();
    const platform = rawPlatform.replace(/[^a-z0-9]+/g, '') || 'unknown';
    const date = new Date().toISOString().slice(0, 10);
    return `promptium_${platform}_${date}.${ext}`;
  };

  /** Builds a YAML-style metadata block for text exports. */
  const buildYamlMetadata = (chat: any, options: any) => {
    if (options.metadataPosition === 'none') return '';
    const lines = ['---'];
    if (options.includePlatformLabel) lines.push(`platform: ${chat.platform}`);
    if (options.includeExportDate) lines.push(`exported: ${new Date().toISOString()}`);
    if (options.headerText) lines.push(`notes: ${options.headerText}`);
    lines.push('---', '');

    if (lines.length === 3) return ''; // Only --- and empty string
    return lines.join('\n');
  };

  /** Converts chat data to markdown with optional metadata controls from prefs. */
  const toMarkdown = async (chat: any, prefs: any = {}) => {
    const options = normalizePrefs(prefs);
    const normalizedChat = normalizeChat(chat, options);
    const metadataBlock = buildYamlMetadata(normalizedChat, options);
    const headerLines = [];

    if (options.metadataPosition === 'header' && metadataBlock) {
      headerLines.push(metadataBlock.trim());
      headerLines.push('');
    }

    headerLines.push(`# 💬 ${normalizedChat.title}`, '');

    const rows = [];

    if (options.contentMode === 'combined') {
      rows.push(getCombinedText(normalizedChat, options));
    } else {
      for (let index = 0; index < normalizedChat.messages.length; index += 1) {
        const message = normalizedChat.messages[index];
        const role = formatRole(message.role);
        const icon = getRoleIcon(message.role);
        const prefix = buildTimestampPrefix(message, options);
        const messageNumber = options.includeMessageNumbers ? `${index + 1}. ` : '';
        const text = String(message.text || '').trim();
        const star = bookmarkTag(message, index, options);
        const thinking = String(message.thinking || '').trim();
        const thinkingBlock =
          options.includeThinking && thinking
            ? `\n\n<details>\n<summary>💭 <i>Thinking Process</i></summary>\n\n${thinking}\n</details>`
            : '';

        const timeTag = prefix ? ` \`${prefix.trim()}\`` : '';
        rows.push(`### ${messageNumber}${icon}${role}${star}${timeTag}\n\n${text}${thinkingBlock}`);
      }
    }

    const body = rows.join('\n\n---\n\n');
    return `${headerLines.join('\n')}\n\n---\n\n${body}`.trim() + '\n';
  };

  /** Converts chat data to plain text with optional metadata controls from prefs. */
  const toTXT = async (chat: any, prefs: any = {}) => {
    const options = normalizePrefs(prefs);
    const normalizedChat = normalizeChat(chat, options);
    const metadataBlock = buildYamlMetadata(normalizedChat, options);

    const divider =
      '--------------------------------------------------------------------------------';
    const heavyDivider =
      '================================================================================';
    const header = [];

    if (options.metadataPosition === 'header' && metadataBlock) {
      header.push(metadataBlock.trim(), '');
    }

    header.push(heavyDivider, `  ${normalizedChat.title}`, heavyDivider, '');

    const rows = [];

    if (options.contentMode === 'combined') {
      rows.push(getCombinedText(normalizedChat, options));
    } else {
      for (let index = 0; index < normalizedChat.messages.length; index += 1) {
        const message = normalizedChat.messages[index];
        const role = formatRole(message.role);
        const prefix = buildTimestampPrefix(message, options);
        const messageNumber = options.includeMessageNumbers ? `${index + 1}. ` : '';
        const text = String(message.text || '').trim();
        const star = bookmarkTag(message, index, options);
        const thinking = String(message.thinking || '').trim();
        const thinkingBlock =
          options.includeThinking && thinking
            ? `\n\n[[ Thinking Process ]]\n${thinking}\n[[ /Thinking Process ]]`
            : '';

        const timeTag = prefix ? ` (Time: ${prefix.replace(/[[\]]/g, '').trim()})` : '';
        rows.push(`[ ${messageNumber}${role} ]${star}${timeTag}\n\n${text}${thinkingBlock}`);
      }
    }

    if (options.metadataPosition === 'footer' && metadataBlock) {
      rows.push(metadataBlock.trim());
    }

    return (
      `${header.join('\n')}\n\n${divider}\n\n${rows.join(`\n\n${divider}\n\n`)}\n\n${divider}\n`.trim() +
      '\n'
    );
  };

  /** Converts chat data to Notion-compatible markdown. */
  const toNotion = async (chat: any, prefs: any = {}) => {
    const options = normalizePrefs(prefs);
    const normalizedChat = normalizeChat(chat, options);
    const metadataBlock = buildYamlMetadata(normalizedChat, options);
    const title = options.headerText || normalizedChat.title;
    const header = [];

    if (options.metadataPosition === 'header' && metadataBlock) {
      header.push(metadataBlock.trim(), '');
    }

    header.push(`# 💬 ${title}`, '', '---', '');

    if (options.contentMode === 'combined') {
      header.push(getCombinedText(normalizedChat, options));
      return header.join('\n').trim() + '\n';
    }

    for (let index = 0; index < normalizedChat.messages.length; index += 1) {
      const message = normalizedChat.messages[index];
      const isUser = formatRole(message.role) === 'You';
      const icon = getRoleIcon(message.role);
      const star = bookmarkTag(message, index, options);
      const timePref = buildTimestampPrefix(message, options);
      const timeTag = timePref ? ` \`${timePref.trim()}\`` : '';
      const thinking = String(message.thinking || '').trim();
      const thinkingBlock =
        options.includeThinking && thinking
          ? `\n\n<details>\n<summary>💭 <i>Thinking</i></summary>\n\n${thinking}\n</details>`
          : '';

      if (isUser) {
        header.push(
          `### ${icon} **You${star}**${timeTag}`,
          '',
          String(message.text || '').trim(),
          '',
          '---',
          ''
        );
      } else {
        header.push(`### ${icon} **Assistant${star}**${timeTag}`, '');
        String(message.text || '')
          .split('\n')
          .forEach((line) => {
            header.push(`${line}`);
          });
        if (thinkingBlock) header.push(thinkingBlock);
        header.push('', '---', '');
      }
    }

    if (options.metadataPosition === 'footer' && metadataBlock) {
      header.push(metadataBlock.trim(), '');
    }

    return header.join('\n').trim() + '\n';
  };

  /** Converts chat data to Obsidian-compatible markdown. */
  const toObsidian = async (chat: any, prefs: any = {}) => {
    const options = normalizePrefs(prefs);
    const normalizedChat = normalizeChat(chat, options);
    const title = options.headerText || normalizedChat.title;
    const date = new Date().toISOString().slice(0, 10);

    const lines = [
      '---',
      `title: "${title.replaceAll('"', '\\"')}"`,
      `date: ${date}`,
      `platform: ${normalizedChat.platform}`,
      'tags:',
      `  - ${normalizedChat.platform || 'chat'}`,
      '  - ai-chat',
      '---',
      '',
      `# 💬 ${title}`,
      '',
    ];

    if (options.contentMode === 'combined') {
      lines.push(getCombinedText(normalizedChat, options));
      lines.push('', '---', `*Exported from [[Promptium]] · ${normalizedChat.platform} · ${date}*`);
      return lines.join('\n').trim() + '\n';
    }

    for (let index = 0; index < normalizedChat.messages.length; index += 1) {
      const message = normalizedChat.messages[index];
      const isUser = formatRole(message.role) === 'You';
      const icon = getRoleIcon(message.role);
      const star = bookmarkTag(message, index, options);
      const thinking = String(message.thinking || '').trim();
      const timePref = buildTimestampPrefix(message, options);
      const timeTag = timePref ? ` \`${timePref.trim()}\`` : '';

      // Callouts in Obsidian format
      const thinkingBlock =
        options.includeThinking && thinking
          ? `> [!quote]- 💭 Thinking Process\n${thinking
              .split('\n')
              .map((line) => `> ${line}`)
              .join('\n')}\n`
          : '';

      if (isUser) {
        lines.push(`## ${icon} You${star}${timeTag}`, '', String(message.text || '').trim(), '');
      } else {
        lines.push(`## ${icon} Assistant${star}${timeTag}`, '');
        if (thinkingBlock) lines.push(thinkingBlock);
        lines.push(String(message.text || '').trim(), '');
      }

      // Add distinct separation between messages
      lines.push('---', '');
    }

    lines.push(`*Exported from [[Promptium]] · ${normalizedChat.platform} · ${date}*`);
    return lines.join('\n').trim() + '\n';
  };

  /** Ensures there is enough vertical space on the current PDF page before writing text. */
  const ensurePdfSpace = async (
    doc: any,
    y: any,
    lineHeight: any,
    margin: any,
    pageHeight: any,
    backgroundRgb: any
  ) => {
    if (y <= pageHeight - margin) {
      return y;
    }

    doc.addPage();
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(backgroundRgb[0], backgroundRgb[1], backgroundRgb[2]);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    return margin + lineHeight;
  };

  /** Writes wrapped text into a PDF and returns the next y position with overflow handling. */
  const writePdfLine = async (
    doc: any,
    text: any,
    y: any,
    pageHeight: any,
    margin: any,
    maxWidth: any,
    lineHeight: any,
    backgroundRgb: any
  ) => {
    const wrappedLines = doc.splitTextToSize(String(text || ''), maxWidth);
    let nextY = y;

    for (const line of wrappedLines) {
      nextY = await ensurePdfSpace(doc, nextY, lineHeight, margin, pageHeight, backgroundRgb);
      if (line.trim()) {
        doc.text(line, margin, nextY);
      }
      nextY += line.trim() ? lineHeight : Math.round(lineHeight * 0.5);
    }

    return nextY;
  };

  const resolveCanvasFontFamily = (fontStyle: any) => {
    const normalized = String(fontStyle || '').toLowerCase();
    if (normalized.includes('jetbrains'))
      return "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace";
    if (normalized.includes('georgia') || normalized.includes('merriweather'))
      return "Georgia, 'Times New Roman', serif";
    if (normalized.includes('inter'))
      return "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    return "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  };

  const wrapTextByWidth = (ctx: any, text: any, maxWidth: any) => {
    const source = String(text || '').replace(/\r\n/g, '\n');
    const paragraphs = source.split('\n');
    const lines: string[] = [];

    const splitLongWord = (word: any) => {
      const chunks = [];
      let current = '';
      for (const ch of word) {
        const test = `${current}${ch}`;
        if (!current || ctx.measureText(test).width <= maxWidth) {
          current = test;
        } else {
          chunks.push(current);
          current = ch;
        }
      }
      if (current) chunks.push(current);
      return chunks;
    };

    paragraphs.forEach((paragraph, paragraphIndex) => {
      const content = String(paragraph || '').trim();
      if (!content) {
        lines.push('');
        return;
      }

      const words = content.split(/\s+/);
      let current = '';

      words.forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;
        if (!current || ctx.measureText(candidate).width <= maxWidth) {
          current = candidate;
          return;
        }

        lines.push(current);
        if (ctx.measureText(word).width <= maxWidth) {
          current = word;
          return;
        }

        const chunks = splitLongWord(word);
        if (!chunks.length) {
          current = '';
          return;
        }

        lines.push(...chunks.slice(0, -1));
        current = chunks[chunks.length - 1] || '';
      });

      if (current) lines.push(current);
      if (paragraphIndex < paragraphs.length - 1) lines.push('');
    });

    return lines;
  };

  const drawRoundedRect = (
    ctx: any,
    x: any,
    y: any,
    width: any,
    height: any,
    radius: any,
    fillStyle: any,
    strokeStyle: any
  ) => {
    const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.stroke();
    }
  };

  const toImage = async (chat: any, prefs: any = {}, imageFormat = 'png') => {
    if (typeof document === 'undefined') {
      throw new Error('Image export requires a document context.');
    }

    const options = normalizePrefs(prefs);
    const normalizedChat = normalizeChat(chat, options);
    const imageKind = String(imageFormat || 'png').toLowerCase() === 'jpeg' ? 'jpeg' : 'png';
    const mimeType = imageKind === 'jpeg' ? 'image/jpeg' : 'image/png';
    const colors = resolveImageColors(options);
    const fontFamily = resolveCanvasFontFamily(options.fontStyle);

    const canvasWidth = 1365;
    const horizontalPadding = 56;
    const verticalPadding = 56;
    const cardPadding = 20;
    const messageGap = 16;
    const titleSize = Math.max(28, Math.round(options.fontSize * 2.1));
    const bodySize = Math.max(16, Math.round(options.fontSize * 1.2));
    const metaSize = Math.max(13, Math.round(options.fontSize * 0.95));
    const headingSize = Math.max(16, Math.round(options.fontSize * 1.15));
    const maxCanvasHeight = 16384;
    const maxTextWidth = canvasWidth - horizontalPadding * 2 - cardPadding * 2;

    const measurementCanvas = document.createElement('canvas');
    const measure = measurementCanvas.getContext('2d');
    if (!measure) {
      throw new Error('Canvas rendering context unavailable.');
    }

    const titleLineHeight = Math.round(titleSize * 1.3);
    const bodyLineHeight = Math.round(bodySize * 1.5);
    const headingLineHeight = Math.round(headingSize * 1.35);
    const metaLineHeight = Math.round(metaSize * 1.4);

    const cards = [];
    let estimatedHeight = verticalPadding;

    measure.font = `600 ${titleSize}px ${fontFamily}`;
    const titleLines = wrapTextByWidth(
      measure,
      normalizedChat.title,
      canvasWidth - horizontalPadding * 2
    );
    estimatedHeight += Math.max(1, titleLines.length) * titleLineHeight;
    estimatedHeight += 12;

    const metaLines = [];
    if (options.includePlatformLabel)
      metaLines.push(`Platform: ${normalizedChat.platform.toUpperCase()}`);
    if (options.includeExportDate) metaLines.push(`Exported: ${new Date().toLocaleString()}`);
    if (options.headerText) metaLines.push(options.headerText);
    estimatedHeight += metaLines.length * metaLineHeight;
    estimatedHeight += 22;

    if (options.contentMode === 'combined') {
      measure.font = `${bodySize}px ${fontFamily}`;
      const bodyLines = wrapTextByWidth(
        measure,
        getCombinedText(normalizedChat, options),
        maxTextWidth
      );
      const combinedBodyHeight = bodyLines.reduce(
        (sum, l) => sum + (l ? bodyLineHeight : Math.round(bodyLineHeight * 0.5)),
        0
      );
      const cardHeight = cardPadding * 2 + Math.max(bodyLineHeight, combinedBodyHeight);
      cards.push({
        heading: '',
        headingLines: [],
        bodyLines,
        cardHeight,
      });
      estimatedHeight += cardHeight;
    } else {
      for (let index = 0; index < normalizedChat.messages.length; index += 1) {
        const message = normalizedChat.messages[index];
        const role = formatRole(message.role);
        const prefix = buildTimestampPrefix(message, options);
        const messageNumber = options.includeMessageNumbers ? `${index + 1}. ` : '';
        const star = bookmarkTag(message, index, options);
        const heading = `${messageNumber}${role}${star}: ${prefix}`.trim();

        measure.font = `600 ${headingSize}px ${fontFamily}`;
        const headingLines = wrapTextByWidth(measure, heading, maxTextWidth);
        measure.font = `${bodySize}px ${fontFamily}`;
        const bodyLines = wrapTextByWidth(measure, String(message.text || '').trim(), maxTextWidth);

        const msgBodyHeight = bodyLines.reduce(
          (sum, l) => sum + (l ? bodyLineHeight : Math.round(bodyLineHeight * 0.5)),
          0
        );
        const cardHeight =
          cardPadding * 2 +
          Math.max(1, headingLines.length) * headingLineHeight +
          8 +
          Math.max(bodyLineHeight, msgBodyHeight);

        cards.push({
          heading,
          headingLines,
          bodyLines,
          cardHeight,
        });
        estimatedHeight += cardHeight + messageGap;
      }
    }

    estimatedHeight += verticalPadding;
    const canvasHeight = Math.max(720, Math.min(maxCanvasHeight, estimatedHeight));
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas rendering context unavailable.');
    }

    ctx.fillStyle = colors.page;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.textBaseline = 'top';
    ctx.fillStyle = colors.text;

    let y = verticalPadding;
    ctx.font = `600 ${titleSize}px ${fontFamily}`;
    titleLines.forEach((line) => {
      ctx.fillText(line, horizontalPadding, y);
      y += titleLineHeight;
    });

    y += 12;
    ctx.font = `${metaSize}px ${fontFamily}`;
    ctx.fillStyle = colors.muted;
    metaLines.forEach((line) => {
      ctx.fillText(line, horizontalPadding, y);
      y += metaLineHeight;
    });

    y += 18;
    let truncated = false;

    for (const card of cards) {
      if (y + card.cardHeight + verticalPadding > canvasHeight) {
        truncated = true;
        break;
      }

      drawRoundedRect(
        ctx,
        horizontalPadding,
        y,
        canvasWidth - horizontalPadding * 2,
        card.cardHeight,
        14,
        colors.card,
        colors.border
      );

      let innerY = y + cardPadding;
      const innerX = horizontalPadding + cardPadding;

      if (card.headingLines.length) {
        ctx.font = `600 ${headingSize}px ${fontFamily}`;
        ctx.fillStyle = colors.text;
        card.headingLines.forEach((line) => {
          ctx.fillText(line, innerX, innerY);
          innerY += headingLineHeight;
        });
        innerY += 8;
      }

      ctx.font = `${bodySize}px ${fontFamily}`;
      ctx.fillStyle = colors.text;
      card.bodyLines.forEach((line) => {
        if (line) {
          ctx.fillText(line, innerX, innerY);
        }
        innerY += line ? bodyLineHeight : Math.round(bodyLineHeight * 0.5);
      });

      y += card.cardHeight + messageGap;
    }

    if (truncated) {
      ctx.fillStyle = colors.muted;
      ctx.font = `${metaSize}px ${fontFamily}`;
      const note = `Conversation truncated for image height limit (${maxCanvasHeight}px). Use PDF/Markdown for full export.`;
      const lines = wrapTextByWidth(ctx, note, canvasWidth - horizontalPadding * 2);
      lines.forEach((line) => {
        if (y + metaLineHeight > canvasHeight - verticalPadding) return;
        ctx.fillText(line, horizontalPadding, y);
        y += metaLineHeight;
      });
    }

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
            return;
          }
          reject(new Error('Failed to generate image export.'));
        },
        mimeType,
        imageKind === 'jpeg' ? 0.92 : undefined
      );
    });

    return blob;
  };

  /** Converts chat data into a paginated PDF ArrayBuffer using jsPDF with style prefs. */
  const toPDF = async (chat: any, prefs: any = {}) => {
    const options = normalizePrefs(prefs);
    const normalizedChat = normalizeChat(chat, options);

    if (!(window as any).jspdf || !(window as any).jspdf.jsPDF) {
      const url = chrome.runtime.getURL('lib/jspdf.min.js');
      await import(url as any);
    }

    if (!(window as any).jspdf || !(window as any).jspdf.jsPDF) {
      throw new Error('jsPDF is not loaded in the current context.');
    }

    const doc = new (window as any).jspdf.jsPDF({
      unit: 'pt',
      format: 'a4',
      putOnlyUsedFonts: true,
    });
    const margin = 40;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const maxWidth = pageWidth - margin * 2;
    const lineHeight = Math.max(16, Math.round(options.fontSize * 1.35));
    const fontFamily = resolvePdfFont(options.fontStyle);
    const colors = resolveBackgroundColors(options);
    const backgroundRgb = hexToRgb(colors.page);
    const textRgb = hexToRgb(colors.text);

    doc.setFillColor(backgroundRgb[0], backgroundRgb[1], backgroundRgb[2]);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(options.fontSize);

    let y = margin;
    y = await writePdfLine(
      doc,
      normalizedChat.title,
      y,
      pageHeight,
      margin,
      maxWidth,
      lineHeight,
      backgroundRgb
    );

    if (options.metadataPosition === 'header') {
      if (options.includePlatformLabel) {
        y = await writePdfLine(
          doc,
          `Platform: ${normalizedChat.platform.toUpperCase()}`,
          y,
          pageHeight,
          margin,
          maxWidth,
          lineHeight,
          backgroundRgb
        );
      }

      if (options.includeExportDate) {
        y = await writePdfLine(
          doc,
          `Exported: ${new Date().toLocaleString()}`,
          y,
          pageHeight,
          margin,
          maxWidth,
          lineHeight,
          backgroundRgb
        );
      }

      if (options.headerText) {
        y = await writePdfLine(
          doc,
          options.headerText,
          y,
          pageHeight,
          margin,
          maxWidth,
          lineHeight,
          backgroundRgb
        );
      }
    }

    y += lineHeight;

    if (options.contentMode === 'combined') {
      const combinedText = getCombinedText(normalizedChat, options);
      y = await writePdfLine(
        doc,
        combinedText,
        y,
        pageHeight,
        margin,
        maxWidth,
        lineHeight,
        backgroundRgb
      );
    } else {
      for (let index = 0; index < normalizedChat.messages.length; index += 1) {
        const message = normalizedChat.messages[index];
        const role = formatRole(message.role);
        const prefix = buildTimestampPrefix(message, options);
        const messageNumber = options.includeMessageNumbers ? `${index + 1}. ` : '';
        const text = String(message.text || '').trim();
        const star = bookmarkTag(message, index, options);
        y = await writePdfLine(
          doc,
          `${messageNumber}${role}${star}: ${prefix}${text}`,
          y,
          pageHeight,
          margin,
          maxWidth,
          lineHeight,
          backgroundRgb
        );
        y += Math.round(lineHeight * 0.55);
      }
    }

    if (options.metadataPosition === 'footer') {
      const pageCount = doc.internal.getNumberOfPages();
      const footerLines = [];
      if (options.includePlatformLabel)
        footerLines.push(`Platform: ${normalizedChat.platform.toUpperCase()}`);
      if (options.includeExportDate) footerLines.push(`Exported: ${new Date().toLocaleString()}`);
      if (options.headerText) footerLines.push(`Notes: ${options.headerText}`);

      if (footerLines.length > 0) {
        const footerText = footerLines.join(' | ');
        doc.setFontSize(10);
        doc.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.text(footerText, margin, pageHeight - 20);
        }
      }
    }

    return doc.output('arraybuffer');
  };

  /** Downloads content as a file via a Blob-backed temporary anchor. */
  const downloadBlob = (content: any, filename: any, mimeType: any) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /** Routes chat export to supported formats and returns operation status. */
  const exportChat = async (chat: any, format = 'md', prefs: any = {}) => {
    try {
      const normalized = String(format || 'md').toLowerCase();
      const options = normalizePrefs(prefs);

      if (normalized === 'md' || normalized === 'markdown') {
        const markdown = await toMarkdown(chat, options);
        downloadBlob(markdown, buildFilename(chat, 'md', options), 'text/markdown;charset=utf-8');
        return { ok: true };
      }

      if (normalized === 'txt' || normalized === 'text') {
        const text = await toTXT(chat, options);
        downloadBlob(text, buildFilename(chat, 'txt', options), 'text/plain;charset=utf-8');
        return { ok: true };
      }

      if (normalized === 'json') {
        const json = await toJSON(chat, options);
        downloadBlob(json, buildFilename(chat, 'json', options), 'application/json;charset=utf-8');
        return { ok: true };
      }

      if (normalized === 'pdf') {
        const pdfData = await toPDF(chat, options);
        downloadBlob(pdfData, buildFilename(chat, 'pdf', options), 'application/pdf');
        return { ok: true };
      }

      if (
        normalized === 'png' ||
        normalized === 'jpeg' ||
        normalized === 'jpg' ||
        normalized === 'image'
      ) {
        const target = normalized === 'jpg' ? 'jpeg' : normalized === 'image' ? 'png' : normalized;
        const image = await toImage(chat, options, target);
        const extension = target === 'jpeg' ? 'jpg' : target;
        const mime = target === 'jpeg' ? 'image/jpeg' : 'image/png';
        downloadBlob(image, buildFilename(chat, extension, options), mime);
        return { ok: true };
      }

      if (normalized === 'notion') {
        const notion = await toNotion(chat, options);
        downloadBlob(notion, buildFilename(chat, 'md', options), 'text/markdown;charset=utf-8');
        return { ok: true };
      }

      if (normalized === 'obsidian') {
        const obsidian = await toObsidian(chat, options);
        downloadBlob(obsidian, buildFilename(chat, 'md', options), 'text/markdown;charset=utf-8');
        return { ok: true };
      }

      return { ok: false, error: `Unsupported export format: ${format}` };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  };

  /** Converts chat data to a clean structured JSON string for export. */
  const toJSON = async (chat: any, prefs: any = {}) => {
    const normalizedChat = normalizeChat(chat);
    const options = normalizePrefs(prefs);
    const output: {
      title: string;
      exportedAt?: string | null;
      messageCount: number;
      combinedText?: string;
      messages?: any[];
      platform?: string;
    } = {
      title: normalizedChat.title,
      exportedAt: options.includeExportDate ? new Date().toISOString() : null,
      messageCount: normalizedChat.messages.length,
    };

    if (options.contentMode === 'combined') {
      output.combinedText = getCombinedText(normalizedChat, options);
    } else {
      output.messages = normalizedChat.messages.map((message: any, index: any) => {
        const entry: any = {
          role: String(message.role || 'unknown').trim(),
          text: String(message.text || '').trim(),
          bookmarked: isMessageBookmarked(message, index, options),
        };
        if (entry.bookmarked) {
          entry.marker = '⭐';
        }
        if (options.includeMessageNumbers) entry.number = index + 1;
        const thinking = String(message.thinking || '').trim();
        if (options.includeThinking && thinking) {
          entry.thinking = thinking;
        }
        return entry;
      });
    }

    if (options.includePlatformLabel) output.platform = normalizedChat.platform;
    if (!options.includeExportDate) delete output.exportedAt;
    if (!options.includePlatformLabel) delete output.platform;
    return JSON.stringify(output, null, 2);
  };

  /** Converts chat data into clipboard-optimized plain text without dividers. */
  const toClipboardText = async (chat: any, prefs: any = {}) => {
    const options = normalizePrefs(prefs);
    const normalizedChat = normalizeChat(chat, options);
    const lines = [`💬 ${normalizedChat.title}`];

    if (options.includePlatformLabel) {
      lines.push(`Platform: ${normalizedChat.platform.toUpperCase()}`);
    }
    if (options.includeExportDate) {
      lines.push(`Exported: ${new Date().toLocaleString()}`);
    }
    lines.push('');

    if (options.contentMode === 'combined') {
      lines.push(getCombinedText(normalizedChat, options));
      lines.push('');
    } else {
      for (let index = 0; index < normalizedChat.messages.length; index += 1) {
        const message = normalizedChat.messages[index];
        const role = formatRole(message.role);
        const prefix = buildTimestampPrefix(message, options);
        const messageNumber = options.includeMessageNumbers ? `${index + 1}. ` : '';
        const star = bookmarkTag(message, index, options);
        const text = String(message.text || '').trim();

        lines.push(`[${messageNumber}${role}${star}] ${prefix}`);
        lines.push(text);

        const thinking = String(message.thinking || '').trim();
        if (options.includeThinking && thinking) {
          lines.push('');
          lines.push('[[ Thinking Process ]]');
          lines.push(thinking);
          lines.push('[[ /Thinking Process ]]');
        }

        lines.push('');
      }
    }

    return lines.join('\n').trim() + '\n';
  };

  const Exporter = {
    toMarkdown,
    toTXT,
    toJSON,
    toPDF,
    toImage,
    toNotion,
    toObsidian,
    toClipboardText,
    downloadBlob,
    exportChat,
    buildFilename,
  };

  if (typeof window !== 'undefined') {
    Object.assign(window, Exporter);
    window.Exporter = Exporter;
  }
})();

export {};
