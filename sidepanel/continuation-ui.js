(() => {
  /**
   * File: sidepanel/continuation-ui.js
   * Purpose: Continue Chat — quick-launch grid to carry conversation context to another LLM.
   */

  const { state } = window.SidepanelState;

  /* ——— Icons for each platform ——— */
  const PLATFORM_ICONS = {
    chatgpt: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M22.28 10.87c.3-1.45.13-2.97-.51-4.3a5.86 5.86 0 0 0-6.4-3.13A5.87 5.87 0 0 0 4.1 5.66a5.86 5.86 0 0 0-3.93 2.84 5.88 5.88 0 0 0 .73 6.88 5.86 5.86 0 0 0 .5 4.3 5.87 5.87 0 0 0 6.41 3.14A5.87 5.87 0 0 0 12.2 24a5.86 5.86 0 0 0 5.5-3.88 5.87 5.87 0 0 0 3.93-2.84 5.88 5.88 0 0 0-.73-6.88l-.62.47Z"/></svg>`,
    claude: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>`,
    gemini: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 3c1.66 0 3 2.69 3 6s-1.34 6-3 6-3-2.69-3-6 1.34-6 3-6Z"/></svg>`,
    perplexity: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16v16H4V4Zm2 2v12h12V6H6Z"/></svg>`,
    copilot: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 14H8v-2h3v2Zm5 0h-3v-2h3v2Z"/></svg>`,
  };

  const localState = {
    payload: null,
    busy: false,
    advisory: "",
    pendingHandoff: null,
    activeTarget: null,
  };

  /* ——— Helpers ——— */

  const normalizeMessages = (messages) =>
    (Array.isArray(messages) ? messages : [])
      .map((m) => ({
        role: String(m?.role || "assistant").trim().toLowerCase(),
        text: String(m?.text || "").trim(),
      }))
      .filter((m) => m.text.length > 0);

  const getEnabledPlatformMap = () => {
    const source =
      state.settings?.enabledPlatforms &&
      typeof state.settings.enabledPlatforms === "object"
        ? state.settings.enabledPlatforms
        : null;
    if (source) return source;
    return Object.fromEntries(
      Object.keys(window.Bridge?.LLM_URLS || {}).map((p) => [p, true]),
    );
  };

  const getEligibleTargets = (sourcePlatform = "") => {
    const bridgeUrls = window.Bridge?.LLM_URLS || {};
    const enabledMap = getEnabledPlatformMap();
    const all = Object.keys(bridgeUrls).filter(
      (p) => enabledMap[p] !== false,
    );
    if (!all.length) return [];
    const source = String(sourcePlatform || "").toLowerCase().trim();
    if (!source || !all.includes(source)) return all;
    return [source, ...all.filter((p) => p !== source)];
  };

  const mapContinuationFailure = (v = "") => {
    const code = String(v || "").trim().toLowerCase();
    if (code === "no_ai_available") return "No AI available";
    if (code.includes("quota") || code.includes("429")) return "Rate limited — try again shortly";
    if (code.includes("model_not_loaded") || code.includes("embedding model")) return "Model not loaded";
    return "Continue Chat failed";
  };

  /* ——— UI Updates ——— */

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

    const platform =
      window.PLATFORM_LABELS?.[payload?.platform] ||
      String(payload?.platform || "Unknown");
    const last = messages[messages.length - 1];
    const preview = `"${last.text.slice(0, 120)}${last.text.length > 120 ? "…" : ""}"`;
    summary.textContent = `${messages.length} messages from ${platform} · ${preview}`;
  };

  const clearPreview = () => {
    localState.pendingHandoff = null;
    const p = byId("pn-continue-preview");
    if (p) p.value = "";
    byId("pn-continue-preview-wrap")?.classList.add("pn-hidden");
  };

  const showPreview = ({ text, target, llmUrl, sourcePlatform }) => {
    localState.pendingHandoff = {
      text: String(text || "").trim(),
      target: String(target || "").trim().toLowerCase(),
      llmUrl: String(llmUrl || "").trim(),
      sourcePlatform: String(sourcePlatform || "").trim().toLowerCase(),
    };
    const preview = byId("pn-continue-preview");
    if (preview) {
      preview.value = localState.pendingHandoff.text;
      preview.scrollTop = 0;
    }
    byId("pn-continue-preview-wrap")?.classList.remove("pn-hidden");
  };

  /* ——— Quick-Launch Grid ——— */

  const renderTargetGrid = () => {
    const container = byId("pn-continue-targets");
    if (!container) return;

    const sourcePlatform = String(localState.payload?.platform || "").toLowerCase();
    const targets = getEligibleTargets(sourcePlatform);
    container.innerHTML = "";

    if (!targets.length) {
      container.innerHTML = `<p class="pn-sv-api-hint">No platforms enabled. Check Settings → LLM Platforms.</p>`;
      return;
    }

    targets.forEach((platform) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pn-continue-target-btn";
      btn.dataset.platform = platform;
      btn.title = `Continue on ${window.PLATFORM_LABELS?.[platform] || platform}`;
      btn.innerHTML = `
        <span class="pn-continue-target-icon">${PLATFORM_ICONS[platform] || "🔗"}</span>
        <span class="pn-continue-target-name">${window.PLATFORM_LABELS?.[platform] || platform}</span>
      `;
      btn.addEventListener("click", () => void quickContinue(platform));
      container.appendChild(btn);
    });
  };

  /* ——— Core Flow ——— */

  const setBusy = (target, busy) => {
    localState.busy = Boolean(busy);
    localState.activeTarget = busy ? target : null;

    // Update button states
    const container = byId("pn-continue-targets");
    if (!container) return;
    container.querySelectorAll(".pn-continue-target-btn").forEach((btn) => {
      const p = btn.dataset.platform;
      btn.disabled = busy;
      if (busy && p === target) {
        btn.classList.add("pn-loading-state");
        const nameEl = btn.querySelector(".pn-continue-target-name");
        if (nameEl) nameEl.textContent = "Summarizing…";
      } else if (!busy) {
        btn.classList.remove("pn-loading-state");
        const nameEl = btn.querySelector(".pn-continue-target-name");
        if (nameEl) nameEl.textContent = window.PLATFORM_LABELS?.[p] || p;
      }
    });
  };

  const quickContinue = async (target) => {
    if (localState.busy) return;

    let payload = localState.payload;
    if (!payload?.messages?.length) {
      payload = await loadFromActiveTab();
      if (!payload) {
        await showToast("No conversation found to continue.");
        return;
      }
      localState.payload = payload;
      renderSummary();
      renderTargetGrid();
    }

    const llmUrl = window.Bridge?.LLM_URLS?.[target];
    if (!llmUrl) {
      await showToast("Unsupported platform.");
      return;
    }

    const modeNode = byId("pn-continue-mode");
    const noteNode = byId("pn-continue-note");
    const mode = String(modeNode?.value || "FULL_SUMMARY").trim();
    const note = String(noteNode?.value || "").trim();

    setBusy(target, true);
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

      if (typeof handoff === "object" && handoff?.advisory) {
        setAdvisory(handoff.advisory);
      }

      // Store and open immediately (no intermediate preview step)
      await window.Continuation.store(
        handoffText,
        target,
        payload.platform || "unknown",
      );

      const opened = await chrome.runtime
        .sendMessage({ action: "openLlmTab", url: llmUrl })
        .catch(() => null);

      if (!opened?.ok) {
        // If opening fails, show preview as fallback
        showPreview({
          text: handoffText,
          target,
          llmUrl,
          sourcePlatform: payload.platform,
        });
        await showToast(opened?.error || "Could not open — use Copy instead");
      } else {
        await showToast(
          `Opening ${window.PLATFORM_LABELS?.[target] || target}`,
        );
        if (window.AppShell?.switchTab) {
          await window.AppShell.switchTab("prompts");
        }
      }
    } catch (error) {
      await showToast(mapContinuationFailure(error?.message || ""));
    } finally {
      setBusy(target, false);
    }
  };

  /* ——— Data loading ——— */

  const loadFromActiveTab = async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) return null;

    const response = await chrome.tabs
      .sendMessage(tab.id, { action: "scrapeForContinuation" })
      .catch(() => null);
    const messages = normalizeMessages(response?.messages);
    if (!messages.length) return null;

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
    renderTargetGrid();

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

  /* ——— Preview actions (fallback when open fails) ——— */

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
    const text = String(localState.pendingHandoff?.text || "").trim();
    if (!text) {
      await showToast("No handoff text to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      await showToast("Handoff copied ✓");
    } catch (_) {
      await showToast("Copy failed");
    }
  };

  /* ——— Events ——— */

  const bindEvents = () => {
    byId("pn-open-continue-chat")?.addEventListener("click", () => {
      void openFromExportSelection();
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
  };

  window.ContinuationUI = {
    openFromPayload,
    openFromActiveTab,
    openFromExportSelection,
    refreshTargets: renderTargetGrid,
    bindEvents,
    runContinuation: quickContinue,
  };
})();
