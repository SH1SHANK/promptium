(() => {
  /**
   * File: sidepanel/export-actions-ui.js
   * Purpose: Export, bridge, and copy actions for sidepanel export tab.
   */

  const { state, UI_FEEDBACK_MS } = window.SidepanelState;

  /**
   * Content scripts write promptiumSidePanelPayload asynchronously after openSidePanelAll.
   * This settle delay avoids stale reads/race conditions between message response and storage write.
   * Do not reduce/remove without proving with integration test on supported platforms.
   */
  const EXPORT_SELECTION_SETTLE_MS = 220;

  const buildFilename = async (extension, options = {}) => {
    const customName = String(byId("export-filename")?.value || "").trim();
    if (customName) {
      const baseName = customName.replace(/\.[^.]+$/, "");
      return `${baseName}.${extension}`;
    }

    const payload = window.ExportPayloadUI.getActivePayload();
    const selectedMessages = options.messages || payload?.messages || [];
    const fallbackMessages =
      options.fallbackMessages ||
      state.exportSnapshotPayload?.messages ||
      state.exportPayload?.messages ||
      [];
    const platform = String(options.platform || payload?.platform || "unknown");
    if (window.SmartName?.getFilename) {
      return window.SmartName.getFilename(
        selectedMessages,
        platform,
        extension,
        fallbackMessages,
      );
    }

    const safePlatform =
      platform.toLowerCase().replace(/[^a-z0-9]+/g, "") || "unknown";
    const date = new Date().toISOString().slice(0, 10);
    return `promptium_${safePlatform}_${date}.${extension}`;
  };

  const persistExportHistory = async (payload) => {
    if (state.settings?.autoSaveHistory === false) {
      return;
    }
    await window.Store.saveChatToHistory(payload);
  };

  const downloadSidepanelText = async (content, filename, mimeType) => {
    const payload = content == null ? "" : content;
    const blob =
      payload instanceof Blob
        ? payload
        : new Blob([payload], { type: mimeType.includes('charset=') ? mimeType : `${mimeType};charset=utf-8` });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const selectMessagesForExport = async () => {
    const context = await getActiveTabContext();

    if (!context.tabId) {
      await window.ExportPayloadUI.setStatus(
        "No active tab available for message selection.",
        true,
      );
      return;
    }

    const response = await chrome.tabs
      .sendMessage(context.tabId, { action: "openSidePanelAll" })
      .catch(() => null);
    if (!response?.ok) {
      await window.ExportPayloadUI.setStatus(
        "Selection request failed on active tab.",
        true,
      );
      return;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, EXPORT_SELECTION_SETTLE_MS),
    );
    const incoming = await window.ExportPayloadUI.loadPayload();
    await window.ExportPayloadUI.ingestIncomingPayload(incoming);
    await window.ExportPayloadUI.renderPreview();
    await window.ExportPayloadUI.setStatus("Selection loaded.");
  };

  const resolveExtensionForFormat = (format) => {
    const normalized = String(format || "").toLowerCase();
    if (normalized === "markdown") return "md";
    if (normalized === "notion" || normalized === "obsidian") return "md";
    if (normalized === "text") return "txt";
    if (normalized === "jpeg") return "jpg";
    if (normalized === "image") return "png";
    return normalized;
  };

  const runExport = async (forcedFormat = "") => {
    await window.ExportPayloadUI.syncPrefsFromControls();

    const payload = window.ExportPayloadUI.getActivePayload();

    if (!payload || !payload.messages.length) {
      await window.ExportPayloadUI.setStatus("No messages selected.", true, {
        showRetry: false,
        debugHint: 'Use "Select Messages" to choose a range before exporting.',
      });
      return;
    }

    const format = String(
      forcedFormat || state.exportPrefs.format || "markdown",
    ).toLowerCase();

    if (format === "markdown") {
      const markdown = await window.ExportPayloadUI.buildMarkdown();
      if (!markdown) {
        await window.ExportPayloadUI.setStatus("Markdown build failed.", true, {
          showRetry: true,
          debugHint: "Confirm selected messages are non-empty and try again.",
        });
        return;
      }
      await downloadSidepanelText(
        markdown,
        await buildFilename("md", {
          format,
          messages: payload.messages,
          platform: payload.platform,
        }),
        "text/markdown;charset=utf-8",
      );
      await persistExportHistory(payload);
      await window.ExportPayloadUI.setStatus("Markdown export complete.");
      return;
    }

    const chat = window.ExportPayloadUI.buildExporterChatPayload();
    const prefs = window.ExportPayloadUI.buildExporterPrefs();

    if (format === "txt") {
      try {
        const text = await window.Exporter.toTXT(chat, prefs);
        await downloadSidepanelText(
          text,
          await buildFilename("txt", {
            format,
            messages: chat?.messages,
            platform: chat?.platform,
          }),
          "text/plain;charset=utf-8",
        );
        await persistExportHistory(payload);
        await window.ExportPayloadUI.setStatus("Text export complete.");
      } catch (err) {
        await window.ExportPayloadUI.setStatus(
          err?.message || "Text export failed.",
          true,
          {
            showRetry: true,
            debugHint:
              "Retry the export. If it fails again, refresh the workspace.",
          },
        );
      }
      return;
    }

    if (format === "json") {
      try {
        const json = await window.Exporter.toJSON(chat, prefs);
        await downloadSidepanelText(
          json,
          await buildFilename("json", {
            format,
            messages: chat?.messages,
            platform: chat?.platform,
          }),
          "application/json;charset=utf-8",
        );
        await persistExportHistory(payload);
        await window.ExportPayloadUI.setStatus("JSON export complete.");
      } catch (err) {
        await window.ExportPayloadUI.setStatus(
          err?.message || "JSON export failed.",
          true,
          {
            showRetry: true,
            debugHint:
              "Retry the export. If it fails again, refresh the workspace.",
          },
        );
      }
      return;
    }

    if (format === "notion") {
      try {
        const notion = await window.Exporter.toNotion(chat, prefs);
        await downloadSidepanelText(
          notion,
          await buildFilename("md", {
            format,
            messages: chat?.messages,
            platform: chat?.platform,
          }),
          "text/markdown;charset=utf-8",
        );
        await persistExportHistory(payload);
        await window.ExportPayloadUI.setStatus("Notion export complete.");
      } catch (err) {
        await window.ExportPayloadUI.setStatus(
          err?.message || "Notion export failed.",
          true,
          {
            showRetry: true,
            debugHint:
              "Retry the export. If it fails again, refresh the workspace.",
          },
        );
      }
      return;
    }

    if (format === "obsidian") {
      try {
        const obsidian = await window.Exporter.toObsidian(chat, prefs);
        await downloadSidepanelText(
          obsidian,
          await buildFilename("md", {
            format,
            messages: chat?.messages,
            platform: chat?.platform,
          }),
          "text/markdown;charset=utf-8",
        );
        await persistExportHistory(payload);
        await window.ExportPayloadUI.setStatus("Obsidian export complete.");
      } catch (err) {
        await window.ExportPayloadUI.setStatus(
          err?.message || "Obsidian export failed.",
          true,
          {
            showRetry: true,
            debugHint:
              "Retry the export. If it fails again, refresh the workspace.",
          },
        );
      }
      return;
    }

    if (
      format === "png" ||
      format === "jpg" ||
      format === "jpeg" ||
      format === "image"
    ) {
      if (!window.Exporter?.toImage) {
        await window.ExportPayloadUI.setStatus(
          "Image exporter unavailable.",
          true,
          {
            showRetry: true,
            debugHint: "Reload the sidepanel and retry.",
          },
        );
        return;
      }

      await window.ExportPayloadUI.setStatus("Building image...");

      try {
        const imageFormat =
          format === "jpg" ? "jpeg" : format === "image" ? "png" : format;
        const imageBlob = await window.Exporter.toImage(
          chat,
          prefs,
          imageFormat,
        );
        const extension = imageFormat === "jpeg" ? "jpg" : imageFormat;
        const mimeType = imageFormat === "jpeg" ? "image/jpeg" : "image/png";
        await downloadSidepanelText(
          imageBlob,
          await buildFilename(extension, {
            format,
            messages: chat?.messages,
            platform: chat?.platform,
          }),
          mimeType,
        );
        await persistExportHistory(payload);
        await window.ExportPayloadUI.setStatus("Image export complete.");
      } catch (error) {
        await window.ExportPayloadUI.setStatus(
          error?.message || "Image export failed.",
          true,
          {
            showRetry: true,
            debugHint:
              "Retry export. If it keeps failing, reduce selected content or switch to PDF.",
          },
        );
      }
      return;
    }

    if (!window.Exporter?.toPDF) {
      await window.ExportPayloadUI.setStatus(
        "PDF exporter unavailable.",
        true,
        {
          showRetry: true,
          debugHint: "Ensure jsPDF is loaded, then retry.",
        },
      );
      return;
    }

    await window.ExportPayloadUI.setStatus("Building PDF...");

    try {
      const pdfData = await window.Exporter.toPDF(chat, prefs);
      const filename = await buildFilename("pdf", {
        format,
        messages: chat?.messages,
        platform: chat?.platform,
      });
      await downloadSidepanelText(pdfData, filename, "application/pdf");
      await persistExportHistory(payload);
      await window.ExportPayloadUI.setStatus("PDF export complete.");
    } catch (error) {
      await window.ExportPayloadUI.setStatus(
        error?.message || "PDF export failed.",
        true,
        {
          showRetry: true,
          debugHint:
            "Retry export. If it keeps failing, switch format and test again.",
        },
      );
    }
  };

  const copyToClipboard = async () => {
    await window.ExportPayloadUI.syncPrefsFromControls();
    const payload = window.ExportPayloadUI.getActivePayload();

    if (!payload || !payload.messages.length) {
      await window.ExportPayloadUI.setStatus("No messages selected.", true, {
        debugHint: "Select messages first, then copy again.",
      });
      return;
    }

    try {
      const format = String(
        state.exportPrefs.format || "markdown",
      ).toLowerCase();
      if (
        format === "png" ||
        format === "jpg" ||
        format === "jpeg" ||
        format === "image"
      ) {
        await window.ExportPayloadUI.setStatus(
          "Image format cannot be copied as text. Use Export.",
          true,
          {
            showRetry: false,
            debugHint: "Switch to Markdown/TXT/JSON for clipboard copy.",
          },
        );
        return;
      }

      const chat = window.ExportPayloadUI.buildExporterChatPayload();
      const prefs = window.ExportPayloadUI.buildExporterPrefs();
      let content = "";

      if (format === "json") {
        content = await window.Exporter.toJSON(chat, prefs);
      } else if (format === "markdown") {
        content = await window.ExportPayloadUI.buildMarkdown();
      } else if (format === "notion") {
        content = await window.Exporter.toNotion(chat, prefs);
      } else if (format === "obsidian") {
        content = await window.Exporter.toObsidian(chat, prefs);
      } else {
        content = await window.Exporter.toClipboardText(chat, prefs);
      }

      await navigator.clipboard.writeText(content);

      const copyBtn = byId("copy-export-btn");
      if (copyBtn) {
        const origHTML = copyBtn.innerHTML;
        copyBtn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
        copyBtn.classList.add("pn-btn--copied");
        setTimeout(() => {
          copyBtn.innerHTML = origHTML;
          copyBtn.classList.remove("pn-btn--copied");
        }, UI_FEEDBACK_MS.COPY_RESET);
      }

      await window.ExportPayloadUI.setStatus("Copied to clipboard.");
    } catch (_) {
      await window.ExportPayloadUI.setStatus("Clipboard copy failed.", true, {
        showRetry: true,
        debugHint:
          "Retry copy. If blocked, use file export and copy from the file.",
      });
    }
  };

  const getCurrentBridgePlatform = async () => {
    const payloadPlatform = String(
      window.ExportPayloadUI.getActivePayload()?.platform || "",
    ).toLowerCase();
    if (payloadPlatform) return payloadPlatform;

    const context = await getActiveTabContext();
    if (!context.tabId) return "";
    const response = await chrome.tabs
      .sendMessage(context.tabId, { action: "getPlatform" })
      .catch(() => null);
    return String(response?.platform || "").toLowerCase();
  };

  const getBridgeMessagesFromExport = async () => {
    const payload = window.ExportPayloadUI.getActivePayload();
    if (Array.isArray(payload?.messages) && payload.messages.length > 0) {
      return payload.messages
        .map((message) => ({
          role: String(message?.role || "assistant"),
          text: String(message?.text || "").trim(),
        }))
        .filter((message) => message.text.length > 0);
    }

    const context = await getActiveTabContext();
    if (!context.tabId) {
      return [];
    }

    const scraped = await chrome.tabs
      .sendMessage(context.tabId, { action: "scrapeForBridge" })
      .catch(() => null);
    return Array.isArray(scraped?.messages) ? scraped.messages : [];
  };

  const renderBridgeStrip = async () => {
    const strip = document.getElementById("pn-bridge-strip-export");
    const targetsNode = document.getElementById("pn-bridge-targets-export");

    if (!strip || !targetsNode || !window.Bridge?.LLM_URLS) {
      return;
    }

    const currentPlatform = await getCurrentBridgePlatform();
    if (!currentPlatform) {
      strip.classList.add("pn-hidden");
      return;
    }

    const targets = Object.keys(window.Bridge.LLM_URLS)
      .filter((platform) => platform !== currentPlatform)
      .filter(
        (platform) => state.settings?.enabledPlatforms?.[platform] !== false,
      )
      .map((platform) => ({
        key: platform,
        label: PLATFORM_LABELS?.[platform] || platform,
      }));

    if (!targets.length) {
      strip.classList.add("pn-hidden");
      return;
    }

    targetsNode.innerHTML = "";

    targets.forEach((target) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pn-bridge-btn";
      button.textContent = target.label;

      button.addEventListener("click", () => {
        void (async () => {
          if (button.disabled) return;
          const original = button.textContent;
          button.disabled = true;
          button.textContent = "Opening...";
          try {
            const messages = await getBridgeMessagesFromExport();
            if (!messages.length) {
              await showToast("No conversation found to bridge.");
              return;
            }

            const sourcePlatform = await getCurrentBridgePlatform();
            await window.Bridge.bridgeTo(
              messages,
              sourcePlatform || currentPlatform,
              target.key,
            );
            await showToast(`Opening ${target.label}...`);
          } catch (error) {
            console.error("[Promptium] Bridge failed from export tab.", error);
            await showToast("Could not bridge conversation.");
          } finally {
            button.disabled = false;
            button.textContent = original;
          }
        })();
      });

      targetsNode.appendChild(button);
    });

    strip.classList.remove("pn-hidden");
  };

  const bindEvents = () => {
    byId("export-btn")?.addEventListener("click", () => {
      void runExport();
    });

    byId("copy-export-btn")?.addEventListener("click", () => {
      void copyToClipboard();
    });

    byId("pn-export-notion-btn")?.addEventListener("click", () => {
      void runExport("notion");
    });

    byId("pn-export-obsidian-btn")?.addEventListener("click", () => {
      void runExport("obsidian");
    });

    byId("pn-export-png-btn")?.addEventListener("click", () => {
      void runExport("png");
    });

    byId("pn-export-jpeg-btn")?.addEventListener("click", () => {
      void runExport("jpeg");
    });
  };

  window.ExportActionsUI = {
    selectMessagesForExport,
    runExport,
    copyToClipboard,
    bindEvents,
    buildFilename,
    renderBridgeStrip,
    resolveExtensionForFormat,
  };
})();
