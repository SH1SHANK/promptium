(() => {
  /**
   * File: sidepanel/improve-ui.js
   * Purpose: Improve modal state machine and injection/save/undo flows.
   */

  const { state, UI_FEEDBACK_MS } = window.SidepanelState;

  const callbacks = {
    onLibraryChanged: null,
    onPromptTextReplaced: null,
    onSwitchTab: null,
  };

  const improveModalState = {
    promptId: null,
    originalText: "",
    improvedText: "",
    previousText: null,
    tags: [],
    isRunning: false,
    context: "fab",
    sourceTabId: null,
    runtimeBackend: "",
  };

  const formatBackendLabel = (value) => {
    const backend = String(value || "")
      .trim()
      .toLowerCase();
    if (backend === "local") return "Local Model";
    if (backend === "gemini") return "Gemini";
    if (backend === "openai") return "OpenAI";
    if (backend === "anthropic") return "Claude";
    if (backend === "openrouter") return "OpenRouter";
    if (backend === "fallback") return "Fallback model";
    return "AI";
  };

  const setRuntimeNote = (message) => {
    const node = document.getElementById("pn-improve-runtime-note");
    if (!node) return;
    node.textContent = String(message || "").trim();
  };

  const normalizeImproveError = (rawMessage = "") => {
    const normalized = String(rawMessage || "").trim();
    const lower = normalized.toLowerCase();
    if (!lower) return "Could not improve prompt. Try again.";
    if (lower === "no_provider_available") {
      return "Add an API key in Settings to continue.";
    }
    if (lower === "feature_disabled") {
      return "Enable Improve Prompt in Settings.";
    }
    if (
      /provider api key is missing|no cloud api key|invalid api key/.test(lower)
    ) {
      return "Add an API key in Settings to continue.";
    }
    if (/network request failed|provider network error|timed out/.test(lower)) {
      return "Network issue contacting AI provider. Try again.";
    }
    return normalized;
  };

  const pushInlineImproveError = (context, message) => {
    if (context !== "add_modal") return;
    if (!window.PromptForm?.showImproveInlineError) return;
    window.PromptForm.showImproveInlineError(message);
  };

  const clearInlineImproveError = () => {
    window.PromptForm?.clearImproveInlineErrors?.();
  };

  const normalizePayload = (value) => {
    if (value && typeof value === "object") {
      return {
        text: String(value.text || "").trim(),
        tags: Array.isArray(value.tags)
          ? value.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
          : [],
        sourceTabId: Number(value.sourceTabId || 0) || null,
      };
    }
    return {
      text: String(value || "").trim(),
      tags: [],
      sourceTabId: null,
    };
  };

  const getContext = (promptId, explicitContext = "") => {
    if (explicitContext) return String(explicitContext);
    if (promptId) return "library_edit";
    const addModal = document.getElementById("add-modal");
    const isAddModalVisible = Boolean(
      addModal && !addModal.classList.contains("pn-hidden"),
    );
    return isAddModalVisible ? "add_modal" : "fab";
  };

  const setActionLayout = async () => {
    const primaryBtn = document.getElementById("pn-improve-accept");
    const secondaryBtn = document.getElementById("pn-improve-accept-secondary");
    const saveOnlyBtn = document.getElementById("pn-improve-save-only");
    const context = improveModalState.context;

    if (!primaryBtn || !secondaryBtn || !saveOnlyBtn) return;

    secondaryBtn.classList.add("pn-hidden");
    saveOnlyBtn.classList.add("pn-hidden");

    if (context === "library_edit") {
      primaryBtn.textContent = "Save Update";
      return;
    }

    if (context === "add_modal") {
      primaryBtn.textContent = "Use Improved Text";
      return;
    }

    primaryBtn.textContent = "Inject into Chat";
    secondaryBtn.textContent = "Inject + Save";
    saveOnlyBtn.textContent = "Save to Library";
    secondaryBtn.classList.remove("pn-hidden");
    saveOnlyBtn.classList.remove("pn-hidden");
  };

  const setButtonsDisabled = (disabled, loadingLabel = "") => {
    [
      "pn-improve-accept",
      "pn-improve-accept-secondary",
      "pn-improve-save-only",
      "pn-improve-retry",
    ].forEach((id) => {
      const button = document.getElementById(id);
      if (!button) return;
      button.disabled = Boolean(disabled);
      if (disabled && loadingLabel) {
        if (!button.dataset.originalText) {
          button.dataset.originalText = button.textContent || "";
        }
        button.textContent = loadingLabel;
        button.classList.add("pn-btn--loading");
        return;
      }
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
      button.classList.remove("pn-btn--loading");
    });
  };

  const sendImprovedPromptToTab = (tabId, text) =>
    new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        { action: "APPLY_IMPROVED_PROMPT", text },
        () => resolve(!chrome.runtime.lastError),
      );
    });

  const tryInjectImprovedPrompt = async (text, preferredTabId = null) => {
    const candidateTabs = [];

    if (preferredTabId) {
      candidateTabs.push({ id: preferredTabId, url: "" });
    }

    const [lastFocusedActive, currentActive] = await Promise.all([
      chrome.tabs
        .query({ active: true, lastFocusedWindow: true })
        .catch(() => []),
      chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []),
    ]);

    for (const tab of [...lastFocusedActive, ...currentActive]) {
      if (!tab?.id) continue;
      candidateTabs.push(tab);
    }

    const visited = new Set();
    for (const tab of candidateTabs) {
      if (!tab?.id || visited.has(tab.id)) continue;
      visited.add(tab.id);
      const tabUrl = String(tab.url || "").toLowerCase();
      if (tabUrl.startsWith("chrome-extension://")) continue;
      if (await sendImprovedPromptToTab(tab.id, text)) {
        return true;
      }
    }

    return false;
  };

  const buildFallbackPromptTitle = (text) => {
    const compact = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!compact) return "Improved Prompt";
    const firstSentence = compact.split(/[.!?]/)[0]?.trim() || compact;
    return firstSentence.slice(0, 64) || "Improved Prompt";
  };

  const generatePromptTitle = async (text) => {
    try {
      const response = await window.AIBridge.generatePromptTitle(text);
      const generated = String(response?.title || response?.text || "")
        .replace(/^["']+|["']+$/g, "")
        .trim();
      if (generated) return generated.slice(0, 80);
    } catch (_) {
      // Fall through.
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
      embedding: null,
    });

    if (saved && state.aiReady && saved.id) {
      void window.AIBridge.cacheAdd(saved);
    }

    return saved;
  };

  const open = async (promptId, originalText, tags = [], options = {}) => {
    improveModalState.promptId = promptId;
    improveModalState.originalText = originalText;
    improveModalState.improvedText = "";
    improveModalState.tags = tags;
    improveModalState.isRunning = true;
    improveModalState.context = getContext(promptId, options?.context || "");
    improveModalState.sourceTabId = Number(options?.sourceTabId || 0) || null;
    improveModalState.runtimeBackend = "";
    clearInlineImproveError();

    const modal = document.getElementById("pn-improve-modal");
    const loading = document.getElementById("pn-improve-loading");
    const diff = document.getElementById("pn-improve-diff");
    const error = document.getElementById("pn-improve-error");
    const modalStyle = document.getElementById("pn-improve-modal-style");
    const addModalStyle = document.getElementById("pn-improve-style");

    if (!modal) return;

    if (
      improveModalState.context === "add_modal" &&
      modalStyle &&
      addModalStyle
    ) {
      modalStyle.value = addModalStyle.value || "general";
    }

    await setActionLayout();

    modal.classList.remove("pn-hidden");
    loading?.classList.remove("pn-hidden");
    diff?.classList.add("pn-hidden");
    error?.classList.add("pn-hidden");
    setButtonsDisabled(true, "Working…");
    const providerLabels = {
      gemini: "Gemini",
      openai: "OpenAI",
      anthropic: "Claude",
      openrouter: "OpenRouter",
    };
    const cloudLabel =
      providerLabels[
        String(state.settings?.activeProvider || "gemini").toLowerCase()
      ] || "Cloud AI";
    setRuntimeNote(`Running with ${cloudLabel}…`);

    const style =
      document.getElementById("pn-improve-modal-style")?.value || "general";
    try {
      const response = await window.AIBridge.improvePrompt(
        originalText,
        tags,
        style,
      );
      improveModalState.isRunning = false;

      if (response?.error) {
        const normalizedError = normalizeImproveError(response.error);
        showError(normalizedError);
        pushInlineImproveError(improveModalState.context, normalizedError);
      } else if (response?.text) {
        improveModalState.improvedText = response.text;
        improveModalState.runtimeBackend = String(response?.backend || "")
          .trim()
          .toLowerCase();
        showDiff();
      } else {
        showError("No optimized output. Try another style.");
      }
    } catch (err) {
      improveModalState.isRunning = false;
      const normalizedError = normalizeImproveError(
        err?.message || "Request failed. Check API key.",
      );
      showError(normalizedError);
      pushInlineImproveError(improveModalState.context, normalizedError);
    }
  };

  // ── Word-level diff (LCS) ─────────────────────────────────────────────────

  const DIFF_TOKEN_LIMIT = 750;

  const diffTokenize = (text) =>
    String(text || "").match(/\S+|\s+/g) || [];

  /**
   * Returns an array of ops: { type: "eq"|"add"|"del", val: string }.
   * "add" = present only in newText, "del" = present only in origText.
   * Returns null if inputs are too long to diff efficiently.
   */
  const computeWordDiff = (origText, newText) => {
    const a = diffTokenize(origText);
    const b = diffTokenize(newText);
    if (a.length > DIFF_TOKEN_LIMIT || b.length > DIFF_TOKEN_LIMIT) return null;

    const m = a.length;
    const n = b.length;
    const W = n + 1;
    // Uint16 safe because values ≤ DIFF_TOKEN_LIMIT ≤ 65535
    const dp = new Uint16Array((m + 1) * W);
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i * W + j] = dp[(i - 1) * W + (j - 1)] + 1;
        } else {
          const up = dp[(i - 1) * W + j];
          const lf = dp[i * W + (j - 1)];
          dp[i * W + j] = up > lf ? up : lf;
        }
      }
    }

    const ops = [];
    let i = m;
    let j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
        ops.push({ type: "eq", val: a[i - 1] });
        i--;
        j--;
      } else if (
        j > 0 &&
        (i === 0 || dp[i * W + (j - 1)] >= dp[(i - 1) * W + j])
      ) {
        ops.push({ type: "add", val: b[j - 1] });
        j--;
      } else {
        ops.push({ type: "del", val: a[i - 1] });
        i--;
      }
    }
    ops.reverse();
    return ops;
  };

  /**
   * Renders one side of the diff into a DocumentFragment.
   * side="del" → left/original pane: shows equal + deleted tokens.
   * side="add" → right/improved pane: shows equal + added tokens.
   */
  const renderDiffSide = (ops, side) => {
    const frag = document.createDocumentFragment();
    for (const op of ops) {
      if (op.type === "eq") {
        frag.appendChild(document.createTextNode(op.val));
      } else if (op.type === side) {
        const el = document.createElement(side === "add" ? "ins" : "del");
        el.className = side === "add" ? "pn-diff-add" : "pn-diff-del";
        el.textContent = op.val;
        frag.appendChild(el);
      }
    }
    return frag;
  };

  // ─────────────────────────────────────────────────────────────────────────

  const showDiff = () => {
    const loading = document.getElementById("pn-improve-loading");
    const diff = document.getElementById("pn-improve-diff");
    const error = document.getElementById("pn-improve-error");
    const origEl = document.getElementById("pn-improve-original");
    const newEl = document.getElementById("pn-improve-improved");
    const origCount = document.getElementById("pn-improve-orig-count");
    const newCount = document.getElementById("pn-improve-new-count");

    loading?.classList.add("pn-hidden");
    error?.classList.add("pn-hidden");
    diff?.classList.remove("pn-hidden");
    setButtonsDisabled(false);

    const diffOps = computeWordDiff(
      improveModalState.originalText,
      improveModalState.improvedText,
    );
    if (origEl) {
      origEl.textContent = "";
      origEl.appendChild(
        diffOps
          ? renderDiffSide(diffOps, "del")
          : document.createTextNode(improveModalState.originalText),
      );
    }
    if (newEl) {
      newEl.textContent = "";
      newEl.appendChild(
        diffOps
          ? renderDiffSide(diffOps, "add")
          : document.createTextNode(improveModalState.improvedText),
      );
    }

    const origLen = improveModalState.originalText.length;
    const newLen = improveModalState.improvedText.length;
    const charDiff = newLen - origLen;
    const diffLabel = charDiff > 0 ? `+${charDiff}` : `${charDiff}`;

    const provider = String(state.settings?.activeProvider || "").toLowerCase();
    const tcOrig = window.TokenCounter?.count(improveModalState.originalText, provider);
    const tcNew = window.TokenCounter?.count(improveModalState.improvedText, provider);

    if (origCount) {
      if (tcOrig && window.TokenCounter) {
        origCount.textContent = window.TokenCounter.format(tcOrig.count, tcOrig.isExact);
        origCount.title = window.TokenCounter.tooltip(tcOrig.isExact);
      } else {
        origCount.textContent = `${origLen} chars`;
      }
    }
    if (newCount) {
      if (tcOrig && tcNew && window.TokenCounter) {
        const tokenDiff = tcNew.count - tcOrig.count;
        const tokenDiffLabel = tokenDiff >= 0 ? `+${tokenDiff}` : `${tokenDiff}`;
        newCount.textContent = `${window.TokenCounter.format(tcNew.count, tcNew.isExact)} (${tokenDiffLabel})`;
        newCount.classList.toggle("pn-improve-count--positive", tokenDiff > 0);
        newCount.classList.toggle("pn-improve-count--negative", tokenDiff < 0);
        newCount.title = window.TokenCounter.tooltip(tcNew.isExact);
      } else {
        newCount.textContent = `${newLen} chars (${diffLabel})`;
        newCount.classList.toggle("pn-improve-count--positive", charDiff > 0);
        newCount.classList.toggle("pn-improve-count--negative", charDiff < 0);
      }
    }

    const backendLabel = formatBackendLabel(improveModalState.runtimeBackend);
    setRuntimeNote(`Generated by ${backendLabel}.`);
  };

  const showError = (message) => {
    const loading = document.getElementById("pn-improve-loading");
    const diff = document.getElementById("pn-improve-diff");
    const error = document.getElementById("pn-improve-error");
    const errorMsg = document.getElementById("pn-improve-error-msg");
    const normalized = normalizeImproveError(message);
    const isMissingApiKey =
      /api\s*key/i.test(normalized) &&
      /settings|missing|not\s*found|not\s*configured/i.test(normalized);

    loading?.classList.add("pn-hidden");
    diff?.classList.add("pn-hidden");
    error?.classList.remove("pn-hidden");
    if (errorMsg) {
      errorMsg.textContent = isMissingApiKey
        ? "Cloud API key not configured"
        : normalized;
    }
    if (isMissingApiKey && state.settings?.aiAutoFallback !== false) {
      setRuntimeNote(
        "Cloud AI unavailable. Local fallback is enabled in Settings.",
      );
    } else if (normalized) {
      setRuntimeNote(normalized);
    }

    const existingAction = document.getElementById("pn-improve-go-settings");
    existingAction?.remove();

    if (isMissingApiKey && error) {
      const action = document.createElement("button");
      action.id = "pn-improve-go-settings";
      action.type = "button";
      action.className = "pn-btn pn-btn--primary";
      action.textContent = "Go to Settings";
      action.addEventListener("click", () => {
        close();
        if (typeof callbacks.onSwitchTab === "function") {
          void callbacks.onSwitchTab("settings");
        }
      });
      error.appendChild(action);
    }
    setButtonsDisabled(false);
  };

  const close = () => {
    const modal = document.getElementById("pn-improve-modal");
    modal?.classList.add("pn-hidden");
    improveModalState.isRunning = false;
    improveModalState.runtimeBackend = "";
    setRuntimeNote("Preparing model…");
  };

  const accept = async (mode = "primary") => {
    const { promptId, originalText, improvedText, context, tags, sourceTabId } =
      improveModalState;

    if (!improvedText) return;

    improveModalState.previousText = originalText;

    if (context === "add_modal" && !promptId) {
      close();
      const textInput = document.getElementById("prompt-text");
      const addModal = document.getElementById("add-modal");
      const isAddModalVisible = Boolean(
        addModal && !addModal.classList.contains("pn-hidden"),
      );
      if (textInput && isAddModalVisible) {
        textInput.value = improvedText;
        if (typeof callbacks.onPromptTextReplaced === "function") {
          await callbacks.onPromptTextReplaced();
        }
        const backendLabel = formatBackendLabel(
          improveModalState.runtimeBackend,
        );
        await showToast(`Prompt optimized with ${backendLabel}.`);
      }
      return;
    }

    if (!promptId && context === "fab") {
      close();
      const shouldInject = mode === "primary" || mode === "secondary";
      const shouldSave = mode === "secondary" || mode === "save";
      let injected = false;

      if (shouldInject) {
        injected = await tryInjectImprovedPrompt(improvedText, sourceTabId);
        if (!injected) {
          await showToast("Injection failed. Keep target tab open and retry.");
        }
      }

      if (shouldSave) {
        const saved = await saveImprovedTextToLibrary(improvedText, tags);
        if (!saved) {
          await showToast("Save failed. Try again.");
          return;
        }
        if (typeof callbacks.onLibraryChanged === "function") {
          await callbacks.onLibraryChanged();
        }
      }

      if (mode === "primary" && injected) {
        const backendLabel = formatBackendLabel(
          improveModalState.runtimeBackend,
        );
        await showToast(`Prompt injected (${backendLabel}).`);
        return;
      }

      if (mode === "secondary") {
        if (injected) {
          await showToast("Injected and saved to library.");
        } else {
          await showToast(
            "Saved to library. Keep the target tab open and retry injection.",
          );
        }
        return;
      }

      if (mode === "save") {
        await showToast("Optimized prompt saved.");
      }
      return;
    }

    close();
    const updated = await window.Store.updatePrompt(promptId, {
      text: improvedText,
    });

    if (updated) {
      if (typeof callbacks.onLibraryChanged === "function") {
        await callbacks.onLibraryChanged();
      }

      document.querySelectorAll(".pn-toast").forEach((node) => node.remove());
      const toast = document.createElement("div");
      toast.className = "pn-toast pn-toast--undo";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");

      const message = document.createElement("span");
      message.textContent = "Prompt optimized.";

      const undoBtn = document.createElement("button");
      undoBtn.className = "pn-toast-undo-btn";
      undoBtn.type = "button";
      undoBtn.textContent = "Undo";

      toast.appendChild(message);
      toast.appendChild(document.createTextNode(" "));
      toast.appendChild(undoBtn);
      document.body.appendChild(toast);

      undoBtn.addEventListener("click", async () => {
        await window.Store.updatePrompt(promptId, { text: originalText });
        if (typeof callbacks.onLibraryChanged === "function") {
          await callbacks.onLibraryChanged();
        }
        toast.remove();
        showToast("Reverted to original prompt.");
      });

      setTimeout(() => toast.remove(), UI_FEEDBACK_MS.IMPROVE_UNDO);
    } else {
      showToast("Save failed. Try again.");
    }
  };

  const retry = async () => {
    const { promptId, originalText, tags, context, sourceTabId } =
      improveModalState;
    await open(promptId, originalText, tags, { context, sourceTabId });
  };

  const bindEvents = () => {
    document
      .getElementById("pn-improve-accept")
      ?.addEventListener("click", () => {
        void accept("primary");
      });

    document
      .getElementById("pn-improve-accept-secondary")
      ?.addEventListener("click", () => {
        void accept("secondary");
      });

    document
      .getElementById("pn-improve-save-only")
      ?.addEventListener("click", () => {
        void accept("save");
      });

    document
      .getElementById("pn-improve-reject")
      ?.addEventListener("click", close);

    document
      .getElementById("pn-improve-retry")
      ?.addEventListener("click", () => {
        void retry();
      });

    document
      .querySelector("[data-close-improve]")
      ?.addEventListener("click", close);

    document
      .getElementById("pn-improve-modal-style")
      ?.addEventListener("change", (event) => {
        const addStyle = document.getElementById("pn-improve-style");
        if (addStyle) addStyle.value = String(event.target?.value || "general");
      });
  };

  const setCallbacks = (nextCallbacks = {}) => {
    callbacks.onLibraryChanged = nextCallbacks.onLibraryChanged || null;
    callbacks.onPromptTextReplaced = nextCallbacks.onPromptTextReplaced || null;
    callbacks.onSwitchTab = nextCallbacks.onSwitchTab || null;
  };

  window.ImproveUI = {
    normalizePayload,
    open,
    close,
    retry,
    accept,
    bindEvents,
    setCallbacks,
  };
})();
