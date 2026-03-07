(() => {
  /**
   * File: sidepanel/template-fill.js
   * Purpose: Variable extraction and fill-in flow for prompt templates.
   */

  const PANEL_ID = "pn-template-fill-panel";
  const PREVIEW_ID = "pn-template-fill-preview";
  const ERROR_ID = "pn-template-fill-error";

  let previousSmartHidden = true;
  let previousBridgeHidden = true;
  let previousFilterHidden = true;
  let activeCloseHandler = null;
  let previousPromptListScrollTop = 0;

  const normalizeText = (text) => {
    if (window.TemplateParser?.normalizeLegacy) {
      return window.TemplateParser.normalizeLegacy(text);
    }
    return String(text || "");
  };

  const parseVariables = (text) => {
    const normalized = normalizeText(text);
    if (!window.TemplateParser?.parse) return [];
    return window.TemplateParser.parse(normalized).map((variable) => ({
      name: variable.label,
      label: variable.label,
      optional: !variable.required,
      required: variable.required,
      raw: variable.raw,
    }));
  };

  const hasVariables = (text) => parseVariables(text).length > 0;

  const fillTemplate = (text, values = {}) => {
    const normalized = normalizeText(text);
    if (!window.TemplateParser?.fill) return normalized;

    const lowered = {};
    Object.entries(values || {}).forEach(([key, value]) => {
      lowered[String(key || "").toLowerCase()] = String(value || "").trim();
    });

    return window.TemplateParser.fill(normalized, lowered);
  };

  const escapeHtml = (value) =>
    String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const collectValues = (container) => {
    const values = {};
    container.querySelectorAll(".pn-fill-input").forEach((input) => {
      values[String(input.dataset.label || "").toLowerCase()] = String(
        input.value || "",
      ).trim();
    });
    return values;
  };

  const hasMissingRequired = (container) => {
    const required = Array.from(
      container.querySelectorAll('.pn-fill-input[data-required="true"]'),
    );
    return required.some((input) => !String(input.value || "").trim());
  };

  const setPromptListVisibility = (visible) => {
    const list = document.getElementById("prompt-list");
    const smart = document.getElementById("pn-smart-strip");
    const bridge = document.getElementById("pn-bridge-strip");
    const filterBar = document.getElementById("pn-template-filters");
    const panel = document.getElementById(PANEL_ID);

    if (list) {
      if (!visible) {
        previousPromptListScrollTop = list.scrollTop;
        list.classList.add("pn-hidden");
      } else {
        list.classList.remove("pn-hidden");
        list.scrollTop = previousPromptListScrollTop;
      }
    }

    if (smart) {
      if (!visible) {
        previousSmartHidden = smart.classList.contains("pn-hidden");
        smart.classList.add("pn-hidden");
      } else {
        smart.classList.toggle("pn-hidden", previousSmartHidden);
      }
    }

    if (bridge) {
      if (!visible) {
        previousBridgeHidden = bridge.classList.contains("pn-hidden");
        bridge.classList.add("pn-hidden");
      } else {
        bridge.classList.toggle("pn-hidden", previousBridgeHidden);
      }
    }

    if (filterBar) {
      if (!visible) {
        previousFilterHidden = filterBar.classList.contains("pn-hidden");
        filterBar.classList.add("pn-hidden");
      } else {
        filterBar.classList.toggle("pn-hidden", previousFilterHidden);
      }
    }

    if (panel) panel.classList.toggle("pn-hidden", visible);
  };

  const buildPreviewText = (originalText, values) => {
    const source = normalizeText(originalText);

    const preview = source.replace(
      /\[([^\[\]]+?)\]/g,
      (match, inner, offset, full) => {
        if (full[offset - 1] === "[" || full[offset + match.length] === "]")
          return match;

        const token = String(inner || "").trim();
        if (!token || token.startsWith("?")) return match;

        const optional = token.endsWith("?");
        const label = optional ? token.slice(0, -1).trim() : token;
        if (!label) return match;

        const value = String(values[label.toLowerCase()] || "").trim();
        if (value) return `【${value}】`;
        if (optional) return "";
        return `[${label}]`;
      },
    );

    return preview
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const updatePreview = (promptText, container) => {
    const preview = container.querySelector(`#${PREVIEW_ID}`);
    const error = container.querySelector(`#${ERROR_ID}`);
    const injectButton = container.querySelector(".pn-fill-inject");

    if (!preview || !error || !injectButton) {
      return;
    }

    const values = collectValues(container);
    const display = buildPreviewText(promptText, values);
    const clipped =
      display.length > 320 ? `${display.slice(0, 320)}…` : display;

    preview.textContent = clipped;

    const missing = hasMissingRequired(container);
    injectButton.disabled = missing;
    error.textContent = missing ? "Fill all required blanks to continue." : "";
  };

  const resolvePromptArgs = (
    promptOrText,
    maybeTitle,
    maybeOnInject,
    maybeOnCancel,
  ) => {
    if (typeof promptOrText === "object" && promptOrText !== null) {
      return {
        prompt: {
          title: String(promptOrText.title || "Template"),
          text: normalizeText(promptOrText.text || ""),
        },
        onInject: typeof maybeTitle === "function" ? maybeTitle : null,
        onCancel: typeof maybeOnInject === "function" ? maybeOnInject : null,
      };
    }

    return {
      prompt: {
        title: String(maybeTitle || "Template"),
        text: normalizeText(promptOrText || ""),
      },
      onInject: typeof maybeOnInject === "function" ? maybeOnInject : null,
      onCancel: typeof maybeOnCancel === "function" ? maybeOnCancel : null,
    };
  };

  const showFillForm = (
    promptOrText,
    maybeTitle,
    maybeOnInject,
    maybeOnCancel,
  ) => {
    const resolved = resolvePromptArgs(
      promptOrText,
      maybeTitle,
      maybeOnInject,
      maybeOnCancel,
    );
    const prompt = resolved.prompt;
    const onInject = resolved.onInject;
    const onCancel = resolved.onCancel;

    const variables = parseVariables(prompt.text);
    if (!variables.length) {
      if (typeof onInject === "function") onInject(prompt.text);
      return;
    }

    const panel = document.getElementById(PANEL_ID);
    if (!panel) {
      if (typeof onInject === "function") onInject(prompt.text);
      return;
    }

    panel.innerHTML = `
    <div class="pn-fill-header">
      <button class="pn-back-btn" id="pn-fill-back" type="button">← Back</button>
      <span class="pn-fill-title">${escapeHtml(prompt.title)}</span>
      <span class="pn-fill-subtitle">Fill required blanks. Optional blanks can be skipped.</span>
    </div>

    <div class="pn-fill-preview-wrap">
      <span class="pn-fill-preview-label">Preview</span>
      <div class="pn-fill-preview" id="${PREVIEW_ID}">${escapeHtml(String(prompt.text).slice(0, 320))}</div>
    </div>

    <div class="pn-fill-fields">
      ${variables
        .map(
          (variable, index) => `
        <label class="pn-fill-field" for="pn-fill-input-${index}">
          <span class="pn-fill-label">${escapeHtml(window.TemplateParser?.toDisplayLabel ? window.TemplateParser.toDisplayLabel({ label: variable.label, required: variable.required }) : variable.label)}</span>
          <input
            id="pn-fill-input-${index}"
            type="text"
            class="pn-fill-input"
            data-label="${escapeHtml(String(variable.label).toLowerCase())}"
            data-required="${variable.required ? "true" : "false"}"
            placeholder="${variable.required ? "Required" : "Optional — leave blank to skip"}"
            autocomplete="off"
          />
        </label>
      `,
        )
        .join("")}
    </div>

    <p id="${ERROR_ID}" class="pn-fill-error" role="alert" aria-live="polite"></p>

    <div class="pn-fill-actions">
      <button class="pn-fill-cancel" id="pn-fill-cancel" type="button">Cancel</button>
      <button class="pn-fill-inject" id="pn-fill-inject" type="button" disabled>Inject →</button>
    </div>
  `;

    setPromptListVisibility(false);

    const inputs = Array.from(panel.querySelectorAll(".pn-fill-input"));
    const injectButton = panel.querySelector("#pn-fill-inject");

    const closePanel = () => {
      document.removeEventListener("keydown", onPanelKeydown);
      activeCloseHandler = null;
      panel.innerHTML = "";
      setPromptListVisibility(true);
    };

    const onPanelKeydown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePanel();
      if (typeof onCancel === "function") onCancel();
    };

    activeCloseHandler = closePanel;
    document.addEventListener("keydown", onPanelKeydown);

    const doInject = () => {
      if (hasMissingRequired(panel)) {
        updatePreview(prompt.text, panel);
        return;
      }

      const values = collectValues(panel);
      const filled = fillTemplate(prompt.text, values);
      closePanel();
      if (typeof onInject === "function") onInject(filled);
    };

    inputs.forEach((input) => {
      input.addEventListener("input", () => updatePreview(prompt.text, panel));
    });

    inputs.forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        if (!injectButton?.disabled) doInject();
      });
    });

    panel.querySelector("#pn-fill-back")?.addEventListener("click", () => {
      closePanel();
      if (typeof onCancel === "function") onCancel();
    });

    panel.querySelector("#pn-fill-cancel")?.addEventListener("click", () => {
      closePanel();
      if (typeof onCancel === "function") onCancel();
    });

    injectButton?.addEventListener("click", doInject);

    inputs[0]?.focus();
    updatePreview(prompt.text, panel);
  };

  const closeActiveForm = () => {
    if (typeof activeCloseHandler === "function") {
      activeCloseHandler();
    }
  };

  const isOpen = () => {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return false;
    return (
      !panel.classList.contains("pn-hidden") && panel.childElementCount > 0
    );
  };

  const TemplateFill = {
    parseVariables,
    hasVariables,
    fillTemplate,
    showFillForm,
    closeActiveForm,
    isOpen,
  };

  if (typeof window !== "undefined") {
    window.TemplateFill = TemplateFill;
  }
})();
