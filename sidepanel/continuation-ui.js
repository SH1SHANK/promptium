(() => {
  /**
   * File: sidepanel/continuation-ui.js
   * Purpose: Continue Chat view orchestration for sidepanel and export-triggered continuation.
   */

  const { state } = window.SidepanelState;

  const localState = {
    payload: null,
    busy: false,
    advisory: "",
    pendingHandoff: null,
  };
  let continueNoteMinHeight = 0;

  const normalizeMessages = (messages) =>
    (Array.isArray(messages) ? messages : [])
      .map((message) => ({
        role: String(message?.role || "assistant")
          .trim()
          .toLowerCase(),
        text: String(message?.text || "").trim(),
      }))
      .filter((message) => message.text.length > 0);

  const getEnabledPlatformMap = () => {
    const source =
      state.settings?.enabledPlatforms &&
      typeof state.settings.enabledPlatforms === "object"
        ? state.settings.enabledPlatforms
        : {};
    return source;
  };

  const getEligibleTargets = (sourcePlatform = "") => {
    const bridgeUrls = window.Bridge?.LLM_URLS || {};
    const enabledMap = getEnabledPlatformMap();
    const all = Object.keys(bridgeUrls).filter((platform) => enabledMap[platform] === true);

    if (!all.length) {
      return [];
    }

    const source = String(sourcePlatform || "")
      .toLowerCase()
      .trim();
    if (!source || !all.includes(source)) {
      return all;
    }

    return [source, ...all.filter((platform) => platform !== source)];
  };

  const setBusy = (busy) => {
    localState.busy = Boolean(busy);
    const run = byId("pn-continue-run");
    const cancel = byId("pn-continue-cancel");
    const summary = byId("pn-continue-summary");
    if (run) {
      run.disabled = localState.busy;
      run.textContent = localState.busy ? "Summarizing..." : "Continue →";
    }
    if (cancel) {
      cancel.disabled = localState.busy;
    }
    if (summary) {
      summary.classList.toggle("pn-loading-state", localState.busy);
      if (localState.busy) {
        summary.textContent = "Summarizing conversation for handoff…";
      } else {
        renderSummary();
      }
    }
  };

  const clearPreview = () => {
    localState.pendingHandoff = null;
    byId("pn-continue-preview") && (byId("pn-continue-preview").value = "");
    byId("pn-continue-preview-wrap")?.classList.add("pn-hidden");
  };

  const showPreview = ({ text, target, llmUrl, sourcePlatform }) => {
    localState.pendingHandoff = {
      text: String(text || "").trim(),
      target: String(target || "")
        .trim()
        .toLowerCase(),
      llmUrl: String(llmUrl || "").trim(),
      sourcePlatform: String(sourcePlatform || "")
        .trim()
        .toLowerCase(),
    };

    const preview = byId("pn-continue-preview");
    if (preview) {
      preview.value = localState.pendingHandoff.text;
      preview.scrollTop = 0;
    }
    byId("pn-continue-preview-wrap")?.classList.remove("pn-hidden");
  };

  const mapContinuationFailure = (value = "") => {
    const code = String(value || "")
      .trim()
      .toLowerCase();
    if (code === "no_ai_available") return "No AI available";
    if (code.includes("quota") || code.includes("429"))
      return "Cloud provider rate limited";
    if (
      code.includes("model_not_loaded") ||
      code.includes("model not loaded") ||
      code.includes("local model")
    )
      return "Model not loaded";
    return "Continue Chat failed";
  };

  const setAdvisory = (value = "") => {
    localState.advisory = String(value || "").trim();
    const node = byId("pn-continue-advisory");
    if (!node) return;
    node.textContent = localState.advisory;
    node.classList.toggle("pn-hidden", !localState.advisory);
  };

  const renderSummary = () => {
    const summary = byId("pn-continue-summary");
    if (!summary) return;

    const payload = localState.payload;
    const messages = normalizeMessages(payload?.messages);

    if (!messages.length) {
      summary.textContent = "No conversation loaded yet.";
      setAdvisory("");
      return;
    }

    const preview = messages
      .slice(-2)
      .map(
        (message) =>
          `${message.role === "user" ? "You" : "Assistant"}: ${message.text}`,
      )
      .join("\n")
      .slice(0, 320);

    const platform =
      window.PLATFORM_LABELS?.[payload?.platform] ||
      String(payload?.platform || "Unknown");
    summary.textContent = `${messages.length} messages from ${platform}\n\n${preview}`;
  };

  const renderTargetOptions = () => {
    const select = byId("pn-continue-target");
    const meta = byId("pn-continue-target-meta");
    if (!select) return;

    const sourcePlatform = String(
      localState.payload?.platform || "",
    ).toLowerCase();
    const targets = getEligibleTargets(sourcePlatform);

    select.innerHTML = "";
    if (!targets.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No enabled targets";
      select.appendChild(option);
      select.disabled = true;
      if (meta) meta.textContent = "Enable at least one platform in Settings → LLM Platforms.";
      return;
    }

    targets.forEach((platform) => {
      const option = document.createElement("option");
      option.value = platform;
      option.textContent = window.PLATFORM_LABELS?.[platform] || platform;
      select.appendChild(option);
    });

    select.disabled = false;
    select.value = targets[0];
    if (meta) meta.textContent = `${targets.length} enabled target${targets.length === 1 ? "" : "s"}`;
  };

  const syncDefaults = () => {
    const mode = byId("pn-continue-mode");
    const note = byId("pn-continue-note");
    if (mode) {
      const preferred = String(
        state.settings?.continueDefaultMode || "FULL_SUMMARY",
      )
        .trim()
        .toUpperCase();
      mode.value = ["FULL_SUMMARY", "KEY_POINTS", "RECENT_ONLY"].includes(
        preferred,
      )
        ? preferred
        : "FULL_SUMMARY";
    }
    if (note) {
      note.value = "";
    }
    syncContinueNoteMetrics();
  };

  const syncContinueNoteMetrics = () => {
    const note = byId("pn-continue-note");
    if (!(note instanceof HTMLTextAreaElement)) return;

    const counter = byId("pn-count-continue-note");
    if (counter) {
      counter.textContent = String(note.value.length);
    }

    if (!continueNoteMinHeight) {
      continueNoteMinHeight = note.offsetHeight || 0;
    }
    note.style.height = "auto";
    const nextHeight = Math.max(continueNoteMinHeight, note.scrollHeight);
    note.style.height = `${nextHeight}px`;
    note.style.overflowY = nextHeight > 220 ? "auto" : "hidden";
  };

  const loadFromActiveTab = async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) {
      return null;
    }

    const response = await chrome.tabs
      .sendMessage(tab.id, { action: "scrapeForContinuation" })
      .catch(() => null);
    const messages = normalizeMessages(response?.messages);
    if (!messages.length) {
      return null;
    }

    return {
      platform: String(response?.platform || "").toLowerCase(),
      url: String(tab.url || ""),
      messages,
    };
  };

  const openFromPayload = async (payload) => {
    const messages = normalizeMessages(payload?.messages);
    localState.payload = {
      platform: String(payload?.platform || "").toLowerCase(),
      url: String(payload?.url || ""),
      messages,
    };

    renderSummary();
    clearPreview();
    setAdvisory("");
    renderTargetOptions();
    syncDefaults();
    if (window.AppShell?.switchTab) {
      await window.AppShell.switchTab("continue");
    }
  };

  const openFromActiveTab = async () => {
    const payload = await loadFromActiveTab();
    if (!payload) {
      await showToast("No conversation found to continue.");
      return false;
    }
    await openFromPayload(payload);
    return true;
  };

  const openFromExportSelection = async () => {
    const exportPayload = window.ExportPayloadUI?.getActivePayload?.();
    if (
      Array.isArray(exportPayload?.messages) &&
      exportPayload.messages.length > 0
    ) {
      await openFromPayload(exportPayload);
      return true;
    }
    return openFromActiveTab();
  };

  const runContinuation = async () => {
    if (localState.busy) {
      return;
    }

    let payload = localState.payload;
    if (!payload?.messages?.length) {
      payload = await loadFromActiveTab();
      if (!payload) {
        await showToast("No conversation found to continue.");
        return;
      }
      localState.payload = payload;
      renderSummary();
      renderTargetOptions();
    }

    const targetNode = byId("pn-continue-target");
    const modeNode = byId("pn-continue-mode");
    const noteNode = byId("pn-continue-note");
    const target = String(targetNode?.value || "")
      .trim()
      .toLowerCase();
    const mode = String(modeNode?.value || "FULL_SUMMARY").trim();
    const note = String(noteNode?.value || "").trim();

    if (!target) {
      await showToast("Select a target platform.");
      return;
    }

    const llmUrl = window.Bridge?.LLM_URLS?.[target];
    if (!llmUrl) {
      await showToast("Unsupported continuation target.");
      return;
    }

    setBusy(true);
    setAdvisory("");
    clearPreview();
    try {
      const handoff = await window.Continuation.buildHandoff(
        payload.messages,
        mode,
        note,
      );
      if (handoff && typeof handoff === "object" && handoff.ok === false) {
        throw new Error(mapContinuationFailure(handoff.error || ""));
      }
      const handoffText =
        typeof handoff === "string"
          ? handoff
          : String(handoff?.text || "").trim();
      if (!handoffText) {
        throw new Error("Continue Chat failed");
      }
      if (typeof handoff === "object" && handoff?.advisory)
        setAdvisory(handoff.advisory);

      showPreview({
        text: handoffText,
        target,
        llmUrl,
        sourcePlatform: payload.platform,
      });
      await showToast("Review handoff, then open target");
    } catch (error) {
      await showToast(mapContinuationFailure(error?.message || ""));
    } finally {
      setBusy(false);
    }
  };

  const openPendingContinuation = async () => {
    const pending = localState.pendingHandoff;
    if (!pending?.text || !pending?.target || !pending?.llmUrl) {
      await showToast("No handoff preview available.");
      return;
    }

    await window.Continuation.store(
      pending.text,
      pending.target,
      pending.sourcePlatform || localState.payload?.platform || "unknown",
    );
    const opened = await chrome.runtime
      .sendMessage({ action: "openLlmTab", url: pending.llmUrl })
      .catch(() => null);
    if (!opened?.ok) {
      await showToast(opened?.error || "Could not open target platform.");
      return;
    }

    await showToast(
      `Opening ${window.PLATFORM_LABELS?.[pending.target] || pending.target}`,
    );
    if (window.AppShell?.switchTab) {
      await window.AppShell.switchTab("prompts");
    }
  };

  const copyPendingContinuation = async () => {
    const pending = localState.pendingHandoff;
    const text = String(pending?.text || "").trim();
    if (!text) {
      await showToast("No handoff text to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      await showToast("Handoff copied");
    } catch (_error) {
      await showToast("Copy failed");
    }
  };

  const bindEvents = () => {
    byId("pn-open-continue-chat")?.addEventListener("click", () => {
      void openFromExportSelection();
    });

    byId("pn-continue-run")?.addEventListener("click", () => {
      void runContinuation();
    });

    byId("pn-continue-open")?.addEventListener("click", () => {
      void openPendingContinuation();
    });

    byId("pn-continue-copy")?.addEventListener("click", () => {
      void copyPendingContinuation();
    });

    byId("pn-continue-cancel")?.addEventListener("click", () => {
      clearPreview();
      if (window.AppShell?.switchTab) {
        void window.AppShell.switchTab("prompts");
      }
    });

    byId("pn-continue-note")?.addEventListener("input", () => {
      syncContinueNoteMetrics();
    });

    syncContinueNoteMetrics();
  };

  window.ContinuationUI = {
    openFromPayload,
    openFromActiveTab,
    openFromExportSelection,
    refreshTargets: renderTargetOptions,
    bindEvents,
    runContinuation,
  };
})();
