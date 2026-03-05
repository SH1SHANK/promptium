(() => {
  /**
   * File: sidepanel/prompt-form.js
   * Purpose: Add prompt flow for plain/template modes with AI polish, duplicate checks, and save orchestration.
   */

  const { state } = window.SidepanelState;

  const callbacks = {
    onPromptSaved: null,
    onOpenImprove: null,
  };

  const MODE_SELECTOR = "selector";
  const MODE_PLAIN = "plain";
  const MODE_TEMPLATE = "template";
  const MODE_VIEWS = {
    [MODE_SELECTOR]: "pn-add-mode-selector",
    [MODE_PLAIN]: "pn-add-plain-form",
    [MODE_TEMPLATE]: "pn-add-template-form",
  };

  const LOCAL_MODEL_LABEL = {
    smollm2_1_7b: "SmolLM2",
    phi35_mini: "Phi-3.5-mini",
    qwen3_0_6b: "Qwen3",
  };

  let activeMode = MODE_SELECTOR;
  let pendingDuplicatePayload = null;
  let pendingDuplicateMatch = null;
  let plainUndoTimer = null;
  let templateUndoTimer = null;
  let plainLastBeforePolish = "";
  let templateLastBeforePolish = "";
  let variableDetectTimer = null;
  let runtimeMessageBound = false;
  let highlightTimer = null;
  const textareaMinHeights = new Map();

  const byIdSafe = (id) => document.getElementById(id);

  const clearChildren = (node) => {
    if (node) node.replaceChildren();
  };

  const updateCounter = (counterId, inputId) => {
    const counter = byIdSafe(counterId);
    const input = byIdSafe(inputId);
    if (!counter || !input) return;

    const value = String(input.value || "");
    const max = Number(input.getAttribute("maxlength") || 0);
    counter.textContent = max > 0 ? `${value.length}/${max}` : String(value.length);
  };

  const autoGrowTextarea = (textareaId) => {
    const textarea = byIdSafe(textareaId);
    if (!(textarea instanceof HTMLTextAreaElement)) return;

    if (!textareaMinHeights.has(textareaId)) {
      textareaMinHeights.set(textareaId, textarea.offsetHeight || 0);
    }

    textarea.style.height = "auto";
    const minHeight = textareaMinHeights.get(textareaId) || 0;
    const nextHeight = Math.max(minHeight, textarea.scrollHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = nextHeight > 280 ? "auto" : "hidden";
  };

  const syncFormMetrics = () => {
    updateCounter("pn-count-prompt-title", "prompt-title");
    updateCounter("pn-count-prompt-text", "prompt-text");
    updateCounter("pn-count-template-title", "pn-template-title");
    updateCounter("pn-count-template-text", "pn-template-text");
    autoGrowTextarea("prompt-text");
    autoGrowTextarea("pn-template-text");
  };

  const normalizeTemplateText = (text) => {
    if (window.TemplateParser?.normalizeLegacy) {
      return window.TemplateParser.normalizeLegacy(text);
    }
    return String(text || "");
  };

  const hideError = (id) => {
    const node = byIdSafe(id);
    if (!node) return;
    node.textContent = "";
    node.classList.add("pn-hidden");
  };

  const showError = (id, message) => {
    const node = byIdSafe(id);
    if (!node) return;
    node.textContent = String(message || "").trim();
    node.classList.toggle("pn-hidden", !node.textContent);
  };

  const setMode = (mode) => {
    activeMode = mode;
    Object.entries(MODE_VIEWS).forEach(([key, id]) => {
      byIdSafe(id)?.classList.toggle("pn-hidden", key !== mode);
    });

    if (mode === MODE_PLAIN) byIdSafe("prompt-title")?.focus();
    if (mode === MODE_TEMPLATE) byIdSafe("pn-template-title")?.focus();
  };

  const clearTagBadges = () => {
    const badgeWrap = byIdSafe("tag-badges-wrap");
    badgeWrap
      ?.querySelectorAll(".pn-tag-badge")
      .forEach((badge) => badge.remove());
    const tagInput = byIdSafe("prompt-tags-input");
    if (tagInput) tagInput.value = "";
    const hidden = byIdSafe("prompt-tags");
    if (hidden) hidden.value = "";
  };

  const syncPlainPolishVisibility = () => {
    const textValue = String(byIdSafe("prompt-text")?.value || "").trim();
    byIdSafe("pn-polish-wrap")?.classList.toggle("pn-hidden", !textValue);
  };

  const syncTemplatePolishVisibility = () => {
    const textValue = String(byIdSafe("pn-template-text")?.value || "").trim();
    byIdSafe("pn-template-polish-wrap")?.classList.toggle(
      "pn-hidden",
      !textValue,
    );
  };

  const clearDuplicateWarning = () => {
    const node = byIdSafe("pn-duplicate-warning");
    if (!node) return;
    node.classList.add("pn-hidden");
    clearChildren(node);
    pendingDuplicatePayload = null;
    pendingDuplicateMatch = null;
  };

  const resetPlainForm = () => {
    if (plainUndoTimer) {
      clearTimeout(plainUndoTimer);
      plainUndoTimer = null;
    }
    plainLastBeforePolish = "";

    const title = byIdSafe("prompt-title");
    const text = byIdSafe("prompt-text");
    if (title) title.value = "";
    if (text) text.value = "";

    hideError("pn-error-title");
    hideError("pn-error-text");
    hideError("pn-polish-error");

    byIdSafe("pn-polish-undo")?.classList.add("pn-hidden");
    clearTagBadges();
    clearDuplicateWarning();
    clearChildren(byIdSafe("pn-tag-suggestions"));
    syncPlainPolishVisibility();
    syncFormMetrics();
  };

  const resetTemplateForm = () => {
    if (templateUndoTimer) {
      clearTimeout(templateUndoTimer);
      templateUndoTimer = null;
    }
    templateLastBeforePolish = "";

    const title = byIdSafe("pn-template-title");
    const text = byIdSafe("pn-template-text");
    const tags = byIdSafe("pn-template-tags");
    if (title) title.value = "";
    if (text) {
      text.value = "";
      text.classList.remove("pn-focus-invalid");
    }
    if (tags) tags.value = "";

    hideError("pn-template-error-title");
    hideError("pn-template-error-text");
    hideError("pn-template-polish-error");
    hideError("pn-template-polish-warning");

    byIdSafe("pn-template-polish-undo")?.classList.add("pn-hidden");

    const detected = byIdSafe("pn-detected-vars");
    if (detected) {
      clearChildren(detected);
      detected.classList.remove("pn-detected-vars--active");
    }

    syncTemplatePolishVisibility();
    syncFormMetrics();
  };

  const getLocalStatus = async () => {
    try {
      const status = await window.AIBridge.getLocalModelStatus();
      if (status && typeof status === "object") return status;
    } catch (_error) {
      return null;
    }
    return null;
  };

  const resolveAiStripText = async () => {
    if (state.settings?.enableAI === false) {
      return {
        text: "○ AI unavailable — enable in Settings",
        mode: "unavailable",
      };
    }

    const localStatus = await getLocalStatus();
    const localModelId = String(
      state.settings?.localModelId || localStatus?.modelId || "smollm2_1_7b",
    ).toLowerCase();
    const localLabel = LOCAL_MODEL_LABEL[localModelId] || "Local AI";
    const localFeatureEnabled =
      state.settings?.localFeatureFlags?.polish !== false;
    const localPreferred = state.settings?.preferLocal === true;
    const localReady =
      localStatus && String(localStatus.status || "").toLowerCase() === "ready";
    const localLoading =
      localStatus &&
      ["loading", "downloading"].includes(
        String(localStatus.status || "").toLowerCase(),
      );

    if (localPreferred && localFeatureEnabled && localLoading) {
      return { text: "⟳ AI loading...", mode: "loading" };
    }

    if (localReady && localFeatureEnabled) {
      return { text: `✦ ${localLabel} ready`, mode: "local" };
    }

    const activeProvider = String(state.settings?.activeProvider || "gemini")
      .trim()
      .toLowerCase();
    const key = window.SessionStorage.getStoredProviderKey
      ? await window.SessionStorage.getStoredProviderKey(activeProvider).catch(() => "")
      : await window.SessionStorage.getStoredGeminiKey().catch(() => "");
    if (String(key || "").trim()) {
      return { text: "✦ AI via cloud", mode: "cloud" };
    }

    if (localLoading) {
      return { text: "⟳ AI loading...", mode: "loading" };
    }

    return {
      text: "○ AI unavailable — enable in Settings",
      mode: "unavailable",
    };
  };

  const updateAiStatusStrips = async () => {
    const plain = byIdSafe("pn-form-ai-status");
    const template = byIdSafe("pn-template-ai-status");
    const status = await resolveAiStripText();

    [plain, template].forEach((node) => {
      if (!node) return;
      node.textContent = status.text;
      node.classList.toggle("pn-clickable", status.mode === "unavailable");
      node.title =
        status.mode === "unavailable" ? "Open Settings → AI Models" : "";
    });

    const canPolish = status.mode === "local" || status.mode === "cloud";
    ["pn-polish-btn", "pn-template-polish-btn"].forEach((id) => {
      const button = byIdSafe(id);
      if (!button) return;
      button.disabled = !canPolish;
      button.title = canPolish ? "" : "Enable AI in Settings";
      button.textContent = "✦ Polish";
    });
  };

  const openSettingsAiModels = async () => {
    if (window.AppShell?.switchTab) {
      await window.AppShell.switchTab("settings");
      const target = document.querySelector(
        '.pn-settings-item[data-settings-target="ai-models"]',
      );
      target?.click();
    }
  };

  const open = async () => {
    resetPlainForm();
    resetTemplateForm();

    byIdSafe("add-modal")?.classList.remove("pn-hidden");
    setMode(MODE_SELECTOR);
    syncFormMetrics();
    await updateAiStatusStrips();
  };

  const openPlainPrefilled = async (text, _sourceUrl = "") => {
    await open();
    setMode(MODE_PLAIN);

    const textInput = byIdSafe("prompt-text");
    const titleInput = byIdSafe("prompt-title");
    if (textInput) textInput.value = String(text || "").trim();

    if (titleInput && !String(titleInput.value || "").trim()) {
      const seed = String(text || "")
        .trim()
        .split(/\s+/)
        .slice(0, 6)
        .join(" ");
      titleInput.value = seed ? seed.slice(0, 48) : "Saved Snippet";
    }

    syncPlainPolishVisibility();
    syncFormMetrics();
  };

  const close = async () => {
    byIdSafe("add-modal")?.classList.add("pn-hidden");
    setMode(MODE_SELECTOR);
    clearDuplicateWarning();
  };

  const updateDetectedVarsNow = () => {
    const textarea = byIdSafe("pn-template-text");
    const container = byIdSafe("pn-detected-vars");
    if (!textarea || !container || !window.TemplateParser?.parse) return [];

    const vars = window.TemplateParser.parse(
      normalizeTemplateText(textarea.value),
    );
    if (!vars.length) {
      clearChildren(container);
      container.classList.remove("pn-detected-vars--active");
      return [];
    }

    clearChildren(container);
    container.classList.add("pn-detected-vars--active");

    vars.forEach((variable) => {
      const chip = document.createElement("span");
      chip.className = `pn-detected-var ${variable.required ? "required" : "optional"}`;
      chip.textContent = window.TemplateParser.toDisplayLabel(variable);
      container.appendChild(chip);
    });

    return vars;
  };

  const updateDetectedVarsDebounced = () => {
    if (variableDetectTimer) clearTimeout(variableDetectTimer);
    variableDetectTimer = setTimeout(() => {
      variableDetectTimer = null;
      updateDetectedVarsNow();
    }, 150);
  };

  const insertVariableSnippet = (snippet) => {
    const textarea = byIdSafe("pn-template-text");
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);

    textarea.value = `${before}${snippet}${after}`;
    const labelStart = start + 1;
    const labelEnd = start + 6;
    textarea.setSelectionRange(labelStart, labelEnd);
    textarea.focus();
    updateDetectedVarsNow();
    syncTemplatePolishVisibility();
    updateCounter("pn-count-template-text", "pn-template-text");
    autoGrowTextarea("pn-template-text");
  };

  const showTemporaryError = (id, message, ms = 4000) => {
    showError(id, message);
    setTimeout(() => hideError(id), ms);
  };

  const runPolish = async ({ isTemplate = false } = {}) => {
    const textId = isTemplate ? "pn-template-text" : "prompt-text";
    const errorId = isTemplate ? "pn-template-polish-error" : "pn-polish-error";
    const undoId = isTemplate ? "pn-template-polish-undo" : "pn-polish-undo";
    const buttonId = isTemplate ? "pn-template-polish-btn" : "pn-polish-btn";

    const textarea = byIdSafe(textId);
    const button = byIdSafe(buttonId);
    if (!textarea || !button) return;

    const original = String(textarea.value || "").trim();
    if (!original) return;

    button.disabled = true;
    button.textContent = "Polishing…";
    button.classList.add("pn-btn--loading");
    hideError(errorId);

    const beforeVars =
      isTemplate && window.TemplateParser?.parse
        ? window.TemplateParser.parse(normalizeTemplateText(original))
            .map((item) => `${item.label}:${item.required ? "r" : "o"}`)
            .join("|")
        : "";

    try {
      const response = await window.AIBridge.paraphrasePrompt(original);
      const polished = String(response?.text || "").trim();
      if (!response?.ok || !polished) {
        throw new Error(response?.error || "Polish failed — try again");
      }

      if (isTemplate) {
        templateLastBeforePolish = original;
        if (templateUndoTimer) clearTimeout(templateUndoTimer);
        templateUndoTimer = setTimeout(() => {
          byIdSafe(undoId)?.classList.add("pn-hidden");
          templateUndoTimer = null;
        }, 8000);
      } else {
        plainLastBeforePolish = original;
        if (plainUndoTimer) clearTimeout(plainUndoTimer);
        plainUndoTimer = setTimeout(() => {
          byIdSafe(undoId)?.classList.add("pn-hidden");
          plainUndoTimer = null;
        }, 8000);
      }

      textarea.value = polished;
      byIdSafe(undoId)?.classList.remove("pn-hidden");

      if (isTemplate) {
        const afterVars = window.TemplateParser?.parse
          ? window.TemplateParser.parse(normalizeTemplateText(polished))
              .map((item) => `${item.label}:${item.required ? "r" : "o"}`)
              .join("|")
          : "";
        updateDetectedVarsNow();
        if (beforeVars !== afterVars) {
          showError(
            "pn-template-polish-warning",
            "AI may have altered your blanks — review before saving.",
          );
          textarea.classList.add("pn-focus-invalid");
        } else {
          hideError("pn-template-polish-warning");
          textarea.classList.remove("pn-focus-invalid");
        }
      }
    } catch (_error) {
      showTemporaryError(errorId, "Polish failed — try again", 4000);
    } finally {
      button.disabled = false;
      button.textContent = "✦ Polish";
      button.classList.remove("pn-btn--loading");
      syncPlainPolishVisibility();
      syncTemplatePolishVisibility();
      if (isTemplate) {
        updateCounter("pn-count-template-text", "pn-template-text");
        autoGrowTextarea("pn-template-text");
      } else {
        updateCounter("pn-count-prompt-text", "prompt-text");
        autoGrowTextarea("prompt-text");
      }
    }
  };

  const undoPolish = (isTemplate = false) => {
    const textarea = byIdSafe(isTemplate ? "pn-template-text" : "prompt-text");
    const undo = byIdSafe(
      isTemplate ? "pn-template-polish-undo" : "pn-polish-undo",
    );
    if (!textarea || !undo) return;

    if (isTemplate && templateLastBeforePolish) {
      textarea.value = templateLastBeforePolish;
      updateDetectedVarsNow();
      hideError("pn-template-polish-warning");
      textarea.classList.remove("pn-focus-invalid");
    }
    if (!isTemplate && plainLastBeforePolish) {
      textarea.value = plainLastBeforePolish;
    }

    undo.classList.add("pn-hidden");
    if (isTemplate) {
      updateCounter("pn-count-template-text", "pn-template-text");
      autoGrowTextarea("pn-template-text");
    } else {
      updateCounter("pn-count-prompt-text", "prompt-text");
      autoGrowTextarea("prompt-text");
    }
  };

  const setPlainTagsFromArray = (tags) => {
    const normalized = Array.isArray(tags)
      ? tags.map((tag) => String(tag || "").trim()).filter(Boolean)
      : [];

    clearTagBadges();
    normalized.forEach((tag) => addTagBadge(tag));
    syncBadgesToHidden();
  };

  const maybeAutoSuggestTags = async ({ text, tags, isTemplate = false }) => {
    if (state.settings?.enableAI === false) return tags;
    if (state.settings?.autoSuggestTags === false) return tags;
    if (
      state.settings?.localFeatureFlags?.autoTags === false &&
      !String(
        (await (
          window.SessionStorage.getStoredProviderKey
            ? window.SessionStorage.getStoredProviderKey(String(state.settings?.activeProvider || "gemini").trim().toLowerCase())
            : window.SessionStorage.getStoredGeminiKey()
        ).catch(() => "")) ||
          "",
      ).trim()
    ) {
      return tags;
    }

    const hasUserTags = Array.isArray(tags) && tags.length > 0;
    if (hasUserTags) return tags;

    try {
      const result = await window.AIBridge.suggestTags(text);
      const nextTags = Array.isArray(result?.tags)
        ? result.tags
            .map((tag) => String(tag || "").trim())
            .filter(Boolean)
            .slice(0, 3)
        : [];

      if (!nextTags.length) return tags;

      if (isTemplate) {
        const input = byIdSafe("pn-template-tags");
        if (input && !String(input.value || "").trim()) {
          input.value = nextTags.join(", ");
        }
      } else {
        const hidden = byIdSafe("prompt-tags");
        if (hidden && !String(hidden.value || "").trim()) {
          setPlainTagsFromArray(nextTags);
          const suggestions = byIdSafe("pn-tag-suggestions");
          if (suggestions) {
            suggestions.textContent = "AI suggested these tags — keep or edit";
          }
        }
      }
      return nextTags;
    } catch (_error) {
      return tags;
    }
  };

  const findDuplicate = async ({ title, text }) => {
    const prompts = await window.Store.getPrompts();
    if (!window.PromptDuplicate?.findDuplicate) {
      return window.AI.isDuplicate({ title, text }, prompts);
    }
    return window.PromptDuplicate.findDuplicate({ title, text }, prompts, 0.85);
  };

  const highlightPromptCard = (promptId, mode = "saved") => {
    const node = document.querySelector(`[data-prompt-id="${promptId}"]`);
    if (!(node instanceof HTMLElement)) return;

    node.classList.remove("pn-card-saved-pulse", "pn-card-duplicate-pulse");
    void node.offsetWidth;
    node.classList.add(mode === "duplicate" ? "pn-card-duplicate-pulse" : "pn-card-saved-pulse");

    if (highlightTimer) {
      clearTimeout(highlightTimer);
      highlightTimer = null;
    }

    highlightTimer = setTimeout(() => {
      highlightTimer = null;
      node.classList.remove("pn-card-saved-pulse", "pn-card-duplicate-pulse");
    }, mode === "duplicate" ? 2000 : 650);
  };

  const scrollPromptIntoView = async (promptId, options = {}) => {
    if (!promptId) return;
    await window.PromptsUI?.render?.(window.PromptsUI.getSearchValue());
    setTimeout(() => {
      const node = document.querySelector(`[data-prompt-id="${promptId}"]`);
      if (!(node instanceof HTMLElement)) return;
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      highlightPromptCard(promptId, options.mode === "duplicate" ? "duplicate" : "saved");
    }, 80);
  };

  const showDuplicateWarning = ({ payload, match }) => {
    const node = byIdSafe("pn-duplicate-warning");
    if (!node) return;

    pendingDuplicatePayload = payload;
    pendingDuplicateMatch = match;

    clearChildren(node);
    node.classList.remove("pn-hidden");

    const label = document.createElement("strong");
    label.textContent = `This looks similar to "${String(match?.title || "Untitled")}"`;

    const actions = document.createElement("div");
    actions.className = "pn-duplicate-actions";

    const saveAnywayButton = document.createElement("button");
    saveAnywayButton.type = "button";
    saveAnywayButton.className = "pn-btn-ignore";
    saveAnywayButton.textContent = "Save anyway";
    saveAnywayButton.addEventListener("click", () => {
      clearDuplicateWarning();
      void persistPrompt(payload);
    });

    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "pn-btn-view";
    viewButton.textContent = "View existing";
    viewButton.addEventListener("click", () => {
      const targetId = String(match?.id || "");
      void close();
      if (targetId) {
        void scrollPromptIntoView(targetId, { mode: "duplicate" });
      }
    });

    actions.appendChild(saveAnywayButton);
    actions.appendChild(viewButton);
    node.appendChild(label);
    node.appendChild(actions);
  };

  const validatePlain = () => {
    const title = String(byIdSafe("prompt-title")?.value || "").trim();
    const text = normalizeTemplateText(
      byIdSafe("prompt-text")?.value || "",
    ).trim();

    hideError("pn-error-title");
    hideError("pn-error-text");

    let valid = true;
    if (!title) {
      showError("pn-error-title", "Title is required.");
      valid = false;
    }
    if (!text) {
      showError("pn-error-text", "Prompt text is required.");
      valid = false;
    }
    return { valid, title, text };
  };

  const validateTemplate = () => {
    const title = String(byIdSafe("pn-template-title")?.value || "").trim();
    const text = normalizeTemplateText(
      byIdSafe("pn-template-text")?.value || "",
    ).trim();

    hideError("pn-template-error-title");
    hideError("pn-template-error-text");

    let valid = true;
    if (!title) {
      showError("pn-template-error-title", "Title is required.");
      valid = false;
    }
    if (!text) {
      showError("pn-template-error-text", "Template text is required.");
      valid = false;
    }
    return { valid, title, text };
  };

  const persistPrompt = async (payload) => {
    const saved = await window.Store.savePrompt({
      ...payload,
      embedding: null,
    });
    if (!saved) {
      const storageError = window.Store?.getLastError?.() || "";
      if (window.Store?.isQuotaError?.(storageError)) {
        await showToast(
          "Storage quota exceeded. Delete older prompts or chat history, then try again.",
        );
        if (window.AppShell?.switchTab)
          await window.AppShell.switchTab("history");
      } else {
        await showToast("Save failed.");
      }
      return false;
    }

    if (state.aiReady && saved.id) {
      void window.AIBridge.cacheAdd(saved);
    }

    await close();
    if (typeof callbacks.onPromptSaved === "function") {
      await callbacks.onPromptSaved();
    }
    await scrollPromptIntoView(saved.id);
    await showToast("Prompt saved");
    return true;
  };

  const savePlainFromModal = async () => {
    const validation = validatePlain();
    if (!validation.valid) return;

    const tagsHidden = byIdSafe("prompt-tags");
    const tagInput = byIdSafe("prompt-tags-input");
    if (tagInput && String(tagInput.value || "").trim()) {
      addTagBadge(tagInput.value);
      tagInput.value = "";
    }
    syncBadgesToHidden();

    const userTags = parseTags(tagsHidden?.value || "");
    const duplicate = await findDuplicate({
      title: validation.title,
      text: validation.text,
    });
    if (duplicate?.duplicate && duplicate?.match) {
      showDuplicateWarning({
        payload: {
          title: validation.title,
          text: validation.text,
          tags: userTags,
          category: null,
        },
        match: duplicate.match,
      });
      return;
    }

    const tags = await maybeAutoSuggestTags({
      text: validation.text,
      tags: userTags,
      isTemplate: false,
    });
    await persistPrompt({
      title: validation.title,
      text: validation.text,
      tags,
      category: null,
    });
  };

  const saveTemplateFromModal = async () => {
    const validation = validateTemplate();
    if (!validation.valid) return;

    const userTags = parseTags(byIdSafe("pn-template-tags")?.value || "");
    const duplicate = await findDuplicate({
      title: validation.title,
      text: validation.text,
    });
    if (duplicate?.duplicate && duplicate?.match) {
      showDuplicateWarning({
        payload: {
          title: validation.title,
          text: validation.text,
          tags: userTags,
          category: null,
        },
        match: duplicate.match,
      });
      return;
    }

    const tags = await maybeAutoSuggestTags({
      text: validation.text,
      tags: userTags,
      isTemplate: true,
    });

    await persistPrompt({
      title: validation.title,
      text: validation.text,
      tags,
      category: null,
    });
  };

  const bindVariableToolbar = () => {
    const toolbar = byIdSafe("pn-var-toolbar");
    const textarea = byIdSafe("pn-template-text");
    if (!toolbar || !textarea) return;

    toolbar.querySelectorAll(".pn-var-btn").forEach((button) => {
      button.addEventListener("click", () => {
        insertVariableSnippet(String(button.dataset.snippet || "[label]"));
      });
    });

    textarea.addEventListener("input", () => {
      updateDetectedVarsDebounced();
      syncTemplatePolishVisibility();
    });
  };

  const bindRuntimeListener = () => {
    if (runtimeMessageBound) return;
    runtimeMessageBound = true;
    chrome.runtime.onMessage.addListener((message) => {
      const type = String(message?.type || "").trim();
      if (
        ![
          "AI_LOCAL_MODEL_STATUS",
          "AI_LOCAL_STATUS_BROADCAST",
          "AI_LOCAL_MODEL_PROGRESS",
        ].includes(type)
      ) {
        return;
      }
      void updateAiStatusStrips();
    });
  };

  const bindEvents = () => {
    bindRuntimeListener();

    byIdSafe("pn-mode-plain")?.addEventListener("click", () =>
      setMode(MODE_PLAIN),
    );
    byIdSafe("pn-mode-template")?.addEventListener("click", () => {
      setMode(MODE_TEMPLATE);
      updateDetectedVarsNow();
    });

    byIdSafe("pn-mode-cancel")?.addEventListener("click", () => {
      void close();
    });
    byIdSafe("pn-plain-back")?.addEventListener("click", () =>
      setMode(MODE_SELECTOR),
    );
    byIdSafe("pn-template-back")?.addEventListener("click", () =>
      setMode(MODE_SELECTOR),
    );

    byIdSafe("save-new-prompt")?.addEventListener("click", () => {
      void savePlainFromModal();
    });
    byIdSafe("pn-template-save")?.addEventListener("click", () => {
      void saveTemplateFromModal();
    });

    byIdSafe("confirm-duplicate")?.addEventListener("click", () => {
      if (!pendingDuplicatePayload) return;
      const payload = pendingDuplicatePayload;
      clearDuplicateWarning();
      void persistPrompt(payload);
    });

    byIdSafe("cancel-modal")?.addEventListener("click", () => {
      void close();
    });
    byIdSafe("pn-template-cancel")?.addEventListener("click", () => {
      void close();
    });
    document
      .querySelector("[data-close-modal]")
      ?.addEventListener("click", () => {
        void close();
      });

    byIdSafe("prompt-text")?.addEventListener("input", () => {
      syncPlainPolishVisibility();
      updateCounter("pn-count-prompt-text", "prompt-text");
      autoGrowTextarea("prompt-text");
      hideError("pn-error-text");
      hideError("pn-polish-error");
      clearDuplicateWarning();
    });
    byIdSafe("prompt-title")?.addEventListener("input", () => {
      updateCounter("pn-count-prompt-title", "prompt-title");
      hideError("pn-error-title");
      clearDuplicateWarning();
    });
    byIdSafe("pn-template-title")?.addEventListener("input", () => {
      updateCounter("pn-count-template-title", "pn-template-title");
      hideError("pn-template-error-title");
      clearDuplicateWarning();
    });
    byIdSafe("pn-template-text")?.addEventListener("input", () => {
      updateCounter("pn-count-template-text", "pn-template-text");
      autoGrowTextarea("pn-template-text");
      hideError("pn-template-error-text");
      hideError("pn-template-polish-error");
      hideError("pn-template-polish-warning");
      byIdSafe("pn-template-text")?.classList.remove("pn-focus-invalid");
      clearDuplicateWarning();
    });

    byIdSafe("pn-polish-btn")?.addEventListener("click", () => {
      void runPolish({ isTemplate: false });
    });
    byIdSafe("pn-template-polish-btn")?.addEventListener("click", () => {
      void runPolish({ isTemplate: true });
    });
    byIdSafe("pn-polish-undo")?.addEventListener("click", () =>
      undoPolish(false),
    );
    byIdSafe("pn-template-polish-undo")?.addEventListener("click", () =>
      undoPolish(true),
    );

    byIdSafe("pn-form-ai-status")?.addEventListener("click", () => {
      if (byIdSafe("pn-form-ai-status")?.classList.contains("pn-clickable")) {
        void openSettingsAiModels();
      }
    });
    byIdSafe("pn-template-ai-status")?.addEventListener("click", () => {
      if (
        byIdSafe("pn-template-ai-status")?.classList.contains("pn-clickable")
      ) {
        void openSettingsAiModels();
      }
    });

    const tagBadgeInput = byIdSafe("prompt-tags-input");
    if (tagBadgeInput) {
      tagBadgeInput.addEventListener("keydown", (event) => {
        const val = String(tagBadgeInput.value || "").trim();
        if (
          (event.key === " " || event.key === "Enter" || event.key === ",") &&
          val
        ) {
          event.preventDefault();
          addTagBadge(val);
          tagBadgeInput.value = "";
          syncBadgesToHidden();
        }
        if (event.key === "Backspace" && !tagBadgeInput.value) {
          const badges = document.querySelectorAll(
            "#tag-badges-wrap .pn-tag-badge",
          );
          const last = badges[badges.length - 1];
          if (last) {
            last.remove();
            syncBadgesToHidden();
          }
        }
      });

      tagBadgeInput.addEventListener("blur", () => {
        const val = String(tagBadgeInput.value || "").trim();
        if (!val) return;
        addTagBadge(val);
        tagBadgeInput.value = "";
        syncBadgesToHidden();
      });
    }

    const badgeWrap = byIdSafe("tag-badges-wrap");
    if (badgeWrap && tagBadgeInput) {
      badgeWrap.addEventListener("click", (event) => {
        if (event.target === badgeWrap) tagBadgeInput.focus();
      });
    }

    bindVariableToolbar();
    syncFormMetrics();
  };

  const setCallbacks = (nextCallbacks = {}) => {
    callbacks.onPromptSaved = nextCallbacks.onPromptSaved || null;
    callbacks.onOpenImprove = nextCallbacks.onOpenImprove || null;
  };

  window.PromptForm = {
    open,
    openPlainPrefilled,
    close,
    saveFromModal: savePlainFromModal,
    saveDuplicateAnyway: () => {
      if (!pendingDuplicatePayload) return;
      const payload = pendingDuplicatePayload;
      clearDuplicateWarning();
      void persistPrompt(payload);
    },
    prefillSuggestedTags: () => Promise.resolve(),
    bindEvents,
    setCallbacks,
    setMode,
    updateDetectedVars: updateDetectedVarsNow,
  };
})();
