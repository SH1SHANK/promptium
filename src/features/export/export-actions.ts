(() => {
  /**
   * File: sidepanel/export-actions-ui.js
   * Purpose: Export, bridge, and copy actions for sidepanel export tab.
   */

  const { state, UI_FEEDBACK_MS } = window.SidepanelState as any;
  const byId = (id: string) => document.getElementById(id) as any;

  /**
   * Content scripts write promptiumSidePanelPayload asynchronously after openSidePanelAll.
   * This settle delay avoids stale reads/race conditions between message response and storage write.
   * Do not reduce/remove without proving with integration test on supported platforms.
   */
  const EXPORT_SELECTION_SETTLE_MS = 220;

  const buildFilename = async (extension: string, options: any = {}) => {
    const customName = String(byId('export-filename')?.value || '').trim();
    if (customName) {
      const baseName = customName.replace(/\.[^.]+$/, '');
      return `${baseName}.${extension}`;
    }

    const payload = (window.ExportPayloadUI as any).getActivePayload();
    const selectedMessages = options.messages || payload?.messages || [];
    const fallbackMessages =
      options.fallbackMessages ||
      state.exportSnapshotPayload?.messages ||
      state.exportPayload?.messages ||
      [];
    const platform = String(options.platform || payload?.platform || 'unknown');
    if (window.SmartName?.getFilename) {
      return window.SmartName.getFilename(selectedMessages, platform, extension, fallbackMessages);
    }

    const safePlatform = platform.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'unknown';
    const date = new Date().toISOString().slice(0, 10);
    return `promptium_${safePlatform}_${date}.${extension}`;
  };

  const persistExportHistory = async (payload: any) => {};

  const downloadSidepanelText = async (content: any, filename: string, mimeType: string) => {
    const payload = content == null ? '' : content;
    const blob =
      payload instanceof Blob
        ? payload
        : new Blob([payload], {
            type: mimeType.includes('charset=') ? mimeType : `${mimeType};charset=utf-8`,
          });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
  };

  const selectMessagesForExport = async () => {
    const context = await getActiveTabContext();
    if (!context.tabId) {
      await (window.ExportPayloadUI as any).setStatus(
        'No active chat tab found. Navigate to a supported AI chat platform.',
        true
      );
      return;
    }

    await (window.ExportPayloadUI as any).setStatus('Selecting messages...');
    const response = await chrome.tabs
      .sendMessage(context.tabId, { action: 'openSidePanelAll' })
      .catch(() => null);
    if (!response?.ok) {
      await (window.ExportPayloadUI as any).setStatus(
        'Selection request failed. Reload the chat tab and try again.',
        true
      );
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, EXPORT_SELECTION_SETTLE_MS));
    const incoming = await (window.ExportPayloadUI as any).loadPayload();
    await (window.ExportPayloadUI as any).ingestIncomingPayload(incoming);
    await (window.ExportPayloadUI as any).renderPreview();
    await (window.ExportPayloadUI as any).setStatus('Selection loaded.');
  };

  const resolveExtensionForFormat = (format: string) => {
    const normalized = String(format || '').toLowerCase();
    if (normalized === 'markdown') return 'md';
    return normalized;
  };

  const runExport = async (forcedFormat = '') => {
    await (window.ExportPayloadUI as any).syncPrefsFromControls();

    const payload = (window.ExportPayloadUI as any).getActivePayload();

    if (!payload || !payload.messages.length) {
      await (window.ExportPayloadUI as any).setStatus('No messages selected.', true, {
        showRetry: false,
        debugHint: 'Use "Select Messages" to choose a range before exporting.',
      });
      return;
    }

    const format = String(forcedFormat || state.exportPrefs.format || 'markdown').toLowerCase();

    if (format === 'markdown') {
      const markdown = await (window.ExportPayloadUI as any).buildMarkdown();
      if (!markdown) {
        await (window.ExportPayloadUI as any).setStatus('Markdown build failed.', true, {
          showRetry: true,
          debugHint: 'Confirm selected messages are non-empty and try again.',
        });
        return;
      }
      await downloadSidepanelText(
        markdown,
        await buildFilename('md', {
          format,
          messages: payload.messages,
          platform: payload.platform,
        }),
        'text/markdown;charset=utf-8'
      );
      await persistExportHistory(payload);
      await (window.ExportPayloadUI as any).setStatus('Markdown export complete.');
      return;
    }

    const chat = (window.ExportPayloadUI as any).buildExporterChatPayload();
    const prefs = (window.ExportPayloadUI as any).buildExporterPrefs();

    if (format === 'json') {
      try {
        const json = await window.Exporter.toJSON(chat as any, prefs);
        await downloadSidepanelText(
          json,
          await buildFilename('json', {
            format,
            messages: chat?.messages,
            platform: chat?.platform,
          }),
          'application/json;charset=utf-8'
        );
        await persistExportHistory(payload);
        await (window.ExportPayloadUI as any).setStatus('JSON export complete.');
      } catch (err: any) {
        await (window.ExportPayloadUI as any).setStatus(err?.message || 'JSON export failed.', true, {
          showRetry: true,
          debugHint: 'Retry the export. If it fails again, refresh the workspace.',
        });
      }
      return;
    }

    if (!window.Exporter?.toPDF) {
      await (window.ExportPayloadUI as any).setStatus('PDF exporter unavailable.', true, {
        showRetry: true,
        debugHint: 'Ensure jsPDF is loaded, then retry.',
      });
      return;
    }

    await (window.ExportPayloadUI as any).setStatus('Building PDF...');

    try {
      const pdfData = await window.Exporter.toPDF(chat as any, prefs);
      const filename = await buildFilename('pdf', {
        format,
        messages: chat?.messages,
        platform: chat?.platform,
      });
      await downloadSidepanelText(pdfData, filename, 'application/pdf');
      await persistExportHistory(payload);
      await (window.ExportPayloadUI as any).setStatus('PDF export complete.');
    } catch (error: any) {
      await (window.ExportPayloadUI as any).setStatus(error?.message || 'PDF export failed.', true, {
        showRetry: true,
        debugHint: 'Retry export. If it keeps failing, switch format and test again.',
      });
    }
  };

  const copyToClipboard = async () => {
    await (window.ExportPayloadUI as any).syncPrefsFromControls();
    const payload = (window.ExportPayloadUI as any).getActivePayload();

    if (!payload || !payload.messages.length) {
      await (window.ExportPayloadUI as any).setStatus('No messages selected.', true, {
        debugHint: 'Select messages first, then copy again.',
      });
      return;
    }

    try {
      const format = String(state.exportPrefs.format || 'markdown').toLowerCase();
      if (!['markdown', 'json', 'pdf'].includes(format)) {
        await (window.ExportPayloadUI as any).setStatus('Unsupported export format.', true, {
          showRetry: false,
          debugHint: 'Switch to Markdown, JSON, or PDF.',
        });
        return;
      }

      const chat = (window.ExportPayloadUI as any).buildExporterChatPayload();
      const prefs = (window.ExportPayloadUI as any).buildExporterPrefs();
      let content = '';

      if (format === 'json') {
        content = await window.Exporter.toJSON(chat as any, prefs);
      } else if (format === 'markdown') {
        content = await (window.ExportPayloadUI as any).buildMarkdown();
      } else if (format === 'pdf') {
        content = await (window.ExportPayloadUI as any).buildMarkdown();
      } else {
        content = await window.Exporter.toClipboardText(chat as any, prefs);
      }

      await navigator.clipboard.writeText(content);

      const copyBtn = byId('copy-export-btn');
      if (copyBtn) {
        const origHTML = copyBtn.innerHTML;
        copyBtn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
        copyBtn.classList.add('pn-btn--copied');
        setTimeout(() => {
          copyBtn.innerHTML = origHTML;
          copyBtn.classList.remove('pn-btn--copied');
        }, UI_FEEDBACK_MS.COPY_RESET);
      }

      await (window.ExportPayloadUI as any).setStatus('Copied to clipboard.');
    } catch (_) {
      await (window.ExportPayloadUI as any).setStatus('Clipboard copy failed.', true, {
        showRetry: true,
        debugHint: 'Retry copy. If blocked, use file export and copy from the file.',
      });
    }
  };

  const getCurrentBridgePlatform = async () => {
    const payloadPlatform = String(
      (window.ExportPayloadUI as any).getActivePayload()?.platform || ''
    ).toLowerCase();
    if (payloadPlatform) return payloadPlatform;

    const context = await getActiveTabContext();
    if (!context.tabId) return '';
    const response = await chrome.tabs
      .sendMessage(context.tabId, { action: 'getPlatform' })
      .catch(() => null);
    return String(response?.platform || '').toLowerCase();
  };

  const getBridgeMessagesFromExport = async () => {
    const payload = (window.ExportPayloadUI as any).getActivePayload();
    if (Array.isArray(payload?.messages) && payload.messages.length > 0) {
      return payload.messages
        .map((message: any) => ({
          role: String(message?.role || 'assistant'),
          text: String(message?.text || '').trim(),
        }))
        .filter((message: any) => message.text.length > 0);
    }

    const context = await getActiveTabContext();
    if (!context.tabId) {
      return [];
    }

    const scraped = await chrome.tabs
      .sendMessage(context.tabId, { action: 'scrapeForBridge' })
      .catch(() => null);
    return Array.isArray(scraped?.messages) ? scraped.messages : [];
  };

  const renderBridgeStrip = async () => {
    const strip = document.getElementById('pn-bridge-strip-export');
    const targetsNode = document.getElementById('pn-bridge-targets-export');

    if (!strip || !targetsNode || !window.Bridge?.LLM_URLS) {
      return;
    }

    const currentPlatform = await getCurrentBridgePlatform();
    if (!currentPlatform) {
      strip.classList.add('pn-hidden');
      return;
    }

    const targets = Object.keys(window.Bridge.LLM_URLS)
      .filter((platform: string) => platform !== currentPlatform)
      .filter((platform: string) => (state.settings?.enabledPlatforms as any)?.[platform] !== false)
      .map((platform: string) => ({
        key: platform,
        label: PLATFORM_LABELS?.[platform] || platform,
      }));

    if (!targets.length) {
      strip.classList.add('pn-hidden');
      return;
    }

    targetsNode.innerHTML = '';

    targets.forEach((target) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pn-bridge-btn';
      button.textContent = target.label;

      button.addEventListener('click', () => {
        void (async () => {
          if (button.disabled) return;
          const original = button.textContent;
          button.disabled = true;
          button.textContent = 'Opening...';
          try {
            const messages = await getBridgeMessagesFromExport();
            if (!messages.length) {
              await showToast('No conversation found. Open a chat and try again.');
              return;
            }

            const sourcePlatform = await getCurrentBridgePlatform();
            await window.Bridge.bridgeTo(messages, sourcePlatform || currentPlatform, target.key);
            await showToast(`Opening ${target.label}...`);
          } catch (error) {
            console.error('[Promptium] Bridge failed from export tab.', error);
            await showToast('Bridge failed. Open a chat tab and try again.');
          } finally {
            button.disabled = false;
            button.textContent = original;
          }
        })();
      });

      targetsNode.appendChild(button);
    });

    strip.classList.remove('pn-hidden');
  };

  const bindEvents = () => {
    byId('export-btn')?.addEventListener('click', () => {
      void runExport();
    });

    byId('copy-export-btn')?.addEventListener('click', () => {
      void copyToClipboard();
    });
  };

  (window as any).ExportActionsUI = {
    selectMessagesForExport,
    runExport,
    copyToClipboard,
    bindEvents,
    buildFilename,
    renderBridgeStrip,
    resolveExtensionForFormat,
  };
})();

export {};

