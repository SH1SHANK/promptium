(() => {
  /**
   * File: sidepanel/prompts-ui.js
   * Purpose: Prompt list rendering, filtering, search controls, and smart suggestions.
   */

  const { state, UI_FEEDBACK_MS } = window.SidepanelState;

  const callbacks = {
    onOpenImprove: null,
    onPromptsMutated: null,
  };

  const TEMPLATE_FILTER_DEFAULT = "all";
  let activeTemplateFilter = TEMPLATE_FILTER_DEFAULT;
  let templateFiltersBound = false;
  let curatedExpanded = false;
  let curatedToggledByUser = false;
  let hoverTooltipNode = null;
  let hoverTimer = null;
  let hoverAnchor = null;
  let templateFilterHome = null;
  let templateFilterHomeNext = null;
  const semanticUiState = {
    mode: "idle",
    reason: "",
  };

  const PAGE_SIZE = 25;
  const currentRenderState = {
    prompts: [],
    filter: "",
    supported: false,
    nextIndex: 0,
    observer: null,
    container: null,
    sentinel: null,
  };
  let renderVersion = 0;

  const loadNextPromptPage = async () => {
    const s = currentRenderState;
    if (!s.container || s.nextIndex >= s.prompts.length) return;

    if (s.sentinel && s.sentinel.parentNode) {
      s.sentinel.remove();
    }

    const endIndex = Math.min(s.nextIndex + PAGE_SIZE, s.prompts.length);
    for (let i = s.nextIndex; i < endIndex; i++) {
      s.container.appendChild(
        await createPromptCard(s.prompts[i], s.filter, s.supported),
      );
    }
    s.nextIndex = endIndex;

    if (endIndex < s.prompts.length) {
      s.container.appendChild(s.sentinel);
      if (!s.observer) {
        s.observer = new IntersectionObserver(
          (entries) => {
            if (entries[0].isIntersecting) {
              void loadNextPromptPage();
            }
          },
          { rootMargin: "250px" },
        );
      }
      s.observer.observe(s.sentinel);
    }
  };

  const isCardMenuOpen = () =>
    Boolean(document.querySelector("details.pn-card-menu[open]"));

  const getTemplateFilterBar = () =>
    document.getElementById("pn-template-filters");

  const ensureTemplateFilterHome = () => {
    const filterBar = getTemplateFilterBar();
    if (!filterBar || templateFilterHome) return;
    templateFilterHome = filterBar.parentElement;
    templateFilterHomeNext = filterBar.nextElementSibling;
  };

  const restoreTemplateFilterHome = () => {
    const filterBar = getTemplateFilterBar();
    ensureTemplateFilterHome();
    if (!filterBar || !templateFilterHome) return;
    if (filterBar.parentElement === templateFilterHome) {
      filterBar.classList.remove("pn-template-filters--in-divider");
      return;
    }

    if (
      templateFilterHomeNext &&
      templateFilterHomeNext.parentElement === templateFilterHome
    ) {
      templateFilterHome.insertBefore(filterBar, templateFilterHomeNext);
    } else {
      templateFilterHome.appendChild(filterBar);
    }
    filterBar.classList.remove("pn-template-filters--in-divider");
  };

  const getHoverDelay = () => {
    return 400;
  };

  const hoverPreviewEnabled = () => true;

  const ensureHoverTooltip = () => {
    if (hoverTooltipNode && hoverTooltipNode.isConnected) {
      return hoverTooltipNode;
    }

    const node = document.createElement("div");
    node.id = "pn-prompt-hover-preview";
    node.className = "pn-prompt-hover-preview pn-hidden";
    node.setAttribute("role", "tooltip");
    document.body.appendChild(node);
    hoverTooltipNode = node;
    return node;
  };

  const hideHoverPreview = () => {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    hoverAnchor = null;
    hoverTooltipNode?.classList.add("pn-hidden");
  };

  const highlightTemplateVars = (text) =>
    escapeHtml(String(text || "")).replace(
      /\[([^\[\]]+)\]/g,
      '<span class="pn-preview-var">[$1]</span>',
    );

  const positionHoverPreview = (anchor, tooltip) => {
    const rect = anchor.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    const margin = 8;
    const gap = 5;

    // Place below the card by default; flip above if card is in the bottom half
    const shouldFlipUp = rect.top > window.innerHeight / 2;
    let top = shouldFlipUp
      ? rect.top - tipRect.height - gap
      : rect.bottom + gap;
    top = Math.max(
      margin,
      Math.min(window.innerHeight - tipRect.height - margin, top),
    );

    let left = rect.left;
    if (left + tipRect.width > window.innerWidth - margin) {
      left = window.innerWidth - tipRect.width - margin;
    }
    left = Math.max(margin, left);

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  };

  const showHoverPreview = (anchor) => {
    if (!hoverPreviewEnabled()) {
      return;
    }
    if (isCardMenuOpen()) {
      return;
    }

    const text = String(anchor?.dataset?.preview || "").trim();
    if (!text) {
      return;
    }

    const tooltip = ensureHoverTooltip();
    tooltip.innerHTML = `
    <div class="pn-preview-title">Prompt Preview</div>
    <div class="pn-preview-body">${highlightTemplateVars(text)}</div>
  `;
    // Pre-position off-screen so getBoundingClientRect() gives real size
    // without causing a visible flash at (0, 0)
    tooltip.style.top = "-9999px";
    tooltip.style.left = "-9999px";
    tooltip.classList.remove("pn-hidden");
    positionHoverPreview(anchor, tooltip);
  };

  const bindHoverPreview = (card) => {
    if (!(card instanceof HTMLElement)) return;

    card.addEventListener("mouseenter", () => {
      if (card.classList.contains("pn-hover-preview-paused")) return;
      if (isCardMenuOpen()) return;
      if (!hoverPreviewEnabled()) return;
      hoverAnchor = card;
      if (hoverTimer) clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        if (hoverAnchor !== card) return;
        showHoverPreview(card);
      }, getHoverDelay());
    });

    card.addEventListener("mouseleave", () => {
      hideHoverPreview();
    });
  };

  if (typeof window !== "undefined" && !window.__PN_PROMPT_PREVIEW_BOUND) {
    window.addEventListener("scroll", hideHoverPreview, { passive: true });
    document.addEventListener("scroll", hideHoverPreview, {
      passive: true,
      capture: true,
    });
    window.__PN_PROMPT_PREVIEW_BOUND = true;
  }

  const normalizePromptText = (text) => {
    if (window.TemplateParser?.normalizeLegacy) {
      return window.TemplateParser.normalizeLegacy(text);
    }
    return String(text || "");
  };

  const getTemplateVars = (text) => {
    const normalized = normalizePromptText(text);
    if (window.TemplateParser?.parse) {
      return window.TemplateParser.parse(normalized);
    }
    return [];
  };

  const sidepanelKeywordFilter = async (query, prompts) => {
    const normalized = String(query || "")
      .trim()
      .toLowerCase();

    if (!normalized) {
      return prompts;
    }

    const hashTags = [];
    let textQuery = normalized;
    const tagMatch = normalized.match(/#[^\s]+/g);
    if (tagMatch) {
      hashTags.push(...tagMatch.map((t) => t.slice(1))); // Remove the '#'
      textQuery = normalized.replace(/#[^\s]+/g, "").trim();
    }

    return prompts.filter((prompt) => {
      const promptTags = (prompt.tags || []).map((t) => t.toLowerCase());

      if (hashTags.length > 0) {
        const hasAllTags = hashTags.every((ht) =>
          promptTags.some((pt) => pt.includes(ht)),
        );
        if (!hasAllTags) return false;
        if (!textQuery) return true;
      }

      const titleMatch = String(prompt.title || "")
        .toLowerCase()
        .includes(textQuery);
      const textMatch = normalizePromptText(prompt.text)
        .toLowerCase()
        .includes(textQuery);

      if (!hashTags.length) {
        const tagsMatch = promptTags.join(" ").includes(textQuery);
        return titleMatch || textMatch || tagsMatch;
      }

      return titleMatch || textMatch;
    });
  };

  const filterPrompts = async (filter, prompts) => {
    const normalized = String(filter || "").trim();

    if (!normalized) {
      state.semanticResults = null;
      semanticUiState.mode = "idle";
      semanticUiState.reason = "";
      refreshSearchModeBadge();
      return prompts;
    }

    const keywordResults = await sidepanelKeywordFilter(normalized, prompts);
    const semanticEligible =
      state.aiReady &&
      state.settings?.enableAI &&
      state.settings?.semanticSearch;

    if (semanticEligible) {
      try {
        const response = await window.AIBridge.search(normalized);
        const mode = String(response?.mode || "keyword")
          .trim()
          .toLowerCase();
        if (response?.results) {
          state.semanticResults = new Map(
            response.results.map((r) => [r.id, r]),
          );

          semanticUiState.mode = mode === "semantic" ? "semantic" : "keyword";
          semanticUiState.reason = "";

          if (semanticUiState.mode === "keyword") {
            const status = await window.AIBridge.getEmbeddingStatus().catch(
              () => null,
            );
            const embeddingStatus = String(status?.status || "")
              .trim()
              .toLowerCase();
            const reindexRunning = Boolean(status?.reindex?.running);

            if (embeddingStatus === "downloading") {
              semanticUiState.reason = "AI model downloading...";
            } else if (reindexRunning) {
              semanticUiState.reason = "AI indexing...";
            } else if (embeddingStatus && embeddingStatus !== "ready") {
              semanticUiState.reason = "AI search not ready";
            }
          }

          refreshSearchModeBadge();

          const promptMap = new Map(prompts.map((p) => [p.id, p]));
          const seen = new Set();
          const merged = [];

          for (const result of response.results) {
            if (promptMap.has(result.id)) {
              merged.push(promptMap.get(result.id));
              seen.add(result.id);
            }
          }

          for (const prompt of keywordResults) {
            if (!seen.has(prompt.id)) {
              merged.push(prompt);
            }
          }

          return merged;
        }
      } catch (_) {
        // Fall through to keyword results.
      }
    }

    state.semanticResults = null;
    semanticUiState.mode = semanticEligible ? "keyword" : "idle";
    semanticUiState.reason = "";
    refreshSearchModeBadge();
    return keywordResults;
  };

  const ensureCardMenuDismissHandlers = () => {
    if (window.__PN_SIDEPANEL_CARD_MENU_BOUND) return;

    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      document
        .querySelectorAll("details.pn-card-menu[open]")
        .forEach((menu) => {
          if (!target || !menu.contains(target)) {
            menu.open = false;
          }
        });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      document
        .querySelectorAll("details.pn-card-menu[open]")
        .forEach((menu) => {
          menu.open = false;
        });
    });

    window.__PN_SIDEPANEL_CARD_MENU_BOUND = true;
  };

  const createCardMenu = (items = [], ownerCard = null) => {
    ensureCardMenuDismissHandlers();
    const menu = document.createElement("details");
    menu.className = "pn-card-menu";

    const summary = document.createElement("summary");
    summary.className = "pn-card-menu__trigger";
    summary.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="6" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="12" cy="18" r="1.4"></circle></svg>More';
    summary.title = "Open additional actions";
    menu.appendChild(summary);

    const list = document.createElement("div");
    list.className = "pn-card-menu__list";

    items.forEach((item) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "pn-card-menu__item";
      if (item.tone === "danger")
        row.classList.add("pn-card-menu__item--danger");
      row.textContent = String(item.label || "Action");
      row.title = String(item.title || item.label || "").trim();
      row.disabled = Boolean(item.disabled);
      row.addEventListener("click", () => {
        menu.open = false;
        if (typeof item.onSelect === "function") {
          void item.onSelect();
        }
      });
      list.appendChild(row);
    });

    menu.appendChild(list);

    menu.addEventListener("toggle", () => {
      if (menu.open) {
        hideHoverPreview();
        ownerCard?.classList.add("pn-hover-preview-paused");
        ownerCard?.classList.add("pn-card-menu-open");
        return;
      }
      ownerCard?.classList.remove("pn-hover-preview-paused");
      ownerCard?.classList.remove("pn-card-menu-open");
    });

    menu.addEventListener("pointerenter", () => {
      hideHoverPreview();
    });

    return menu;
  };

  const buildInjectActions = async ({
    actions,
    canInject,
    prompt,
    hasVars,
    doInject,
  }) => {
    const useButton = document.createElement("button");
    useButton.className = "pn-btn pn-btn--primary";
    useButton.type = "button";
    useButton.innerHTML =
      '<svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" class=\"pn-btn-icon\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M15 3h6v6\"></path><path d=\"M10 14L21 3\"></path><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"></path></svg>Use →';
    useButton.classList.add("pn-card-actions__primary");
    useButton.title = hasVars
      ? "Inject as-is, remove optional placeholders, and keep required [brackets] visible in chat."
      : "Inject this prompt into the active chat input.";

    if (!canInject) {
      useButton.disabled = true;
      useButton.title = "Open a supported LLM tab first, then inject.";
    } else {
      useButton.addEventListener("click", () => {
        void (async () => {
          if (!hasVars) {
            await doInject(prompt.text, false);
            return;
          }
          const rawText = window.TemplateParser?.fill
            ? window.TemplateParser.fill(prompt.text, {})
            : prompt.text;
          await doInject(rawText, true);
        })();
      });
    }

    actions.appendChild(useButton);

    if (!hasVars) {
      return;
    }

    const fillButton = document.createElement("button");
    fillButton.className = "pn-btn pn-btn--ghost";
    fillButton.type = "button";
    fillButton.innerHTML = "Fill in";
    fillButton.title = "Open fill form before injecting.";

    if (!canInject) {
      fillButton.disabled = true;
    } else {
      fillButton.addEventListener("click", () => {
        void (async () => {
          if (!window.TemplateFill?.showFillForm) {
            await doInject(prompt.text, false);
            return;
          }
          window.TemplateFill.showFillForm(
            { title: prompt.title, text: prompt.text },
            (filledText) => {
              void doInject(filledText, false);
            },
            () => {},
          );
        })();
      });
    }

    actions.appendChild(fillButton);
  };

  const createPromptCard = async (
    rawPrompt,
    activeFilter,
    canInject,
    options = {},
  ) => {
    const prompt = {
      ...rawPrompt,
      text: normalizePromptText(rawPrompt.text),
    };

    const card = document.createElement("article");
    card.className = "pn-prompt-card";
    if (prompt?.id) {
      card.dataset.promptId = String(prompt.id);
    }
    card.dataset.preview = prompt.text;
    if (options.isCurated) {
      card.classList.add("pn-template-card");
      card.dataset.templateCategory = String(prompt.category || "general");
    }

    const vars = getTemplateVars(prompt.text);
    const hasTemplateVars = vars.length > 0;

    const title = document.createElement("h3");
    title.className = "pn-card-title";
    title.textContent = prompt.title;

    if (prompt.isTemplate && !hasTemplateVars) {
      const badge = document.createElement("span");
      badge.className = "pn-template-var-badge";
      badge.textContent = "Fill-in";
      title.appendChild(badge);
    }

    if (hasTemplateVars) {
      const varsBadge = document.createElement("span");
      varsBadge.className = "pn-template-var-badge";
      varsBadge.textContent = "Fill-in";
      varsBadge.title = `${vars.length} fill-in blank${vars.length === 1 ? "" : "s"}. Use [name] required, [name?] optional.`;
      title.appendChild(varsBadge);
    }

    const text = document.createElement("p");
    text.className = "pn-card-text";
    text.textContent = prompt.text;

    const clarityScore = Number(prompt?.clarityScore);
    const clarityExplanation = String(prompt?.clarityExplanation || "").trim();
    const hasClarity =
      Number.isFinite(clarityScore) && clarityScore >= 0 && clarityScore <= 100;

    let clarity = null;
    if (hasClarity) {
      clarity = document.createElement("p");
      clarity.className = "pn-card-clarity";
      clarity.textContent = `Clarity ${Math.round(clarityScore)}/100${clarityExplanation ? ` • ${clarityExplanation}` : ""}`;
    }

    const tagsWrap = document.createElement("div");
    tagsWrap.className = "pn-tag-wrap";
    let tagsExpanded = false;
    const renderTags = () => {
      tagsWrap.innerHTML = "";
      const tags = Array.isArray(prompt.tags) ? prompt.tags : [];
      const visible = tagsExpanded ? tags : tags.slice(0, 8);

      visible.forEach((tag) => {
        const pill = createTagPill(tag);
        pill.classList.add("pn-tag-pill--clickable");
        pill.title = `Filter by #${tag}`;
        pill.addEventListener("click", () => {
          const search = document.getElementById("prompt-search");
          if (search) {
            search.value = tag;
          }
          void render(tag);
        });
        tagsWrap.appendChild(pill);
      });

      if (!tagsExpanded && tags.length > 8) {
        const more = document.createElement("button");
        more.type = "button";
        more.className = "pn-tag-pill pn-tag-pill--clickable";
        more.textContent = `+${tags.length - 8} more`;
        more.title = "Show all tags";
        more.addEventListener("click", () => {
          tagsExpanded = true;
          renderTags();
        });
        tagsWrap.appendChild(more);
      }
    };

    renderTags();

    const actions = document.createElement("div");
    actions.className = "pn-card-actions";

    const doInject = async (textToInject, injectedAsIs = false) => {
      const response = await sendToActiveTab({
        action: "injectPrompt",
        text: textToInject,
      });

      if (!response?.ok) {
        await showToast(response?.error || "Inject failed.");
        return;
      }

      if (injectedAsIs) {
        await showToast("Injected — fill in the [brackets] in the chat");
        return;
      }

      await showToast("Injected. Undo in chat.");
    };

    await buildInjectActions({
      actions,
      canInject,
      prompt,
      hasVars: hasTemplateVars,
      doInject,
    });

    if (options.isCurated) {
      const overflow = createCardMenu(
        [
          {
            label: "Save to Library",
            title: "Save this template to your personal prompt library.",
            onSelect: async () => {
              const saved = await window.Store.savePrompt({
                title: prompt.title,
                text: prompt.text,
                tags: prompt.tags,
                category: prompt.category,
              });
              if (saved) {
                await showToast("Template saved to library.");
              } else {
                await showToast("Template save failed.");
              }
            },
          },
        ],
        card,
      );
      actions.appendChild(overflow);
    } else {
      const overflow = createCardMenu(
        [
          {
            label: "Edit Prompt",
            title: "Edit this prompt's title, text, or tags.",
            onSelect: async () => {
              if (window.PromptForm?.openForEdit) {
                await window.PromptForm.openForEdit(prompt);
              }
            },
          },
          {
            label: "Improve Prompt",
            title:
              state.settings?.polishWithGemini === false
                ? "Enable Polish button in Settings to use this."
                : "Open AI improve mode for this prompt.",
            disabled: state.settings?.polishWithGemini === false,
            onSelect: async () => {
              if (typeof callbacks.onOpenImprove === "function") {
                await callbacks.onOpenImprove(
                  prompt.id,
                  prompt.text,
                  prompt.tags || [],
                );
              }
            },
          },
          {
            label: "Delete Prompt",
            title: "Delete this prompt from your library.",
            tone: "danger",
            onSelect: async () => {
              const deleted = await window.Store.deletePrompt(prompt.id);

              if (!deleted) {
                await showToast("Delete failed.");
                return;
              }

              if (state.aiReady) {
                void window.AIBridge.cacheRemove(prompt.id);
              }

              await render(activeFilter);
              if (typeof callbacks.onPromptsMutated === "function") {
                await callbacks.onPromptsMutated(activeFilter);
              }
            },
          },
        ],
        card,
      );
      actions.appendChild(overflow);
    }

    if (typeof prompt._semanticScore === "number") {
      const relevance = document.createElement("p");
      relevance.className = "pn-relevance";
      relevance.textContent = `Relevance: ${(prompt._semanticScore * 100).toFixed(0)}%`;
      card.appendChild(relevance);
    }

    if (state.semanticResults?.get(prompt.id)?.semanticOnly) {
      const spark = document.createElement("span");
      spark.className = "pn-spark";
      spark.title = "Found by meaning";
      spark.textContent = "✦";
      title.appendChild(spark);
    }

    card.appendChild(title);
    card.appendChild(text);
    if (clarity) card.appendChild(clarity);
    card.appendChild(tagsWrap);
    card.appendChild(actions);
    bindHoverPreview(card);
    return card;
  };

  const updateTemplateFilterVisibility = (show) => {
    const filterBar = getTemplateFilterBar();
    if (!filterBar) return;
    filterBar.classList.toggle("pn-hidden", !show);
  };

  const setActiveFilter = (filter) => {
    const targetFilter =
      String(filter || TEMPLATE_FILTER_DEFAULT).trim() ||
      TEMPLATE_FILTER_DEFAULT;
    activeTemplateFilter = targetFilter;

    const filterBar = getTemplateFilterBar();
    if (!filterBar) return;

    filterBar.querySelectorAll(".pn-filter-chip").forEach((chip) => {
      const active = chip.dataset.filter === targetFilter;
      chip.classList.toggle("active", active);
      chip.setAttribute("aria-selected", active ? "true" : "false");
    });

    const cards = document.querySelectorAll(
      ".pn-template-card[data-template-category]",
    );
    let visibleCount = 0;

    cards.forEach((card) => {
      const match =
        targetFilter === TEMPLATE_FILTER_DEFAULT ||
        card.dataset.templateCategory === targetFilter;
      card.classList.toggle("pn-hidden", !match);
      if (match) visibleCount += 1;
    });

    const countEl = document.getElementById("pn-template-count");
    if (countEl) {
      countEl.textContent =
        targetFilter === TEMPLATE_FILTER_DEFAULT
          ? ""
          : `${visibleCount} template${visibleCount === 1 ? "" : "s"}`;
    }
  };

  const resetTemplateFilter = () => {
    activeTemplateFilter = TEMPLATE_FILTER_DEFAULT;
    setActiveFilter(TEMPLATE_FILTER_DEFAULT);
  };

  const bindTemplateFilters = () => {
    if (templateFiltersBound) return;
    templateFiltersBound = true;

    const filterBar = getTemplateFilterBar();
    if (!filterBar) return;

    filterBar.addEventListener("click", (event) => {
      const chip = event.target.closest(".pn-filter-chip");
      if (!chip) return;

      const filter = chip.dataset.filter;
      if (!filter) return;

      if (
        chip.classList.contains("active") &&
        filter !== TEMPLATE_FILTER_DEFAULT
      ) {
        setActiveFilter(TEMPLATE_FILTER_DEFAULT);
        return;
      }

      setActiveFilter(filter);
    });
  };

  const createSectionHeader = ({ title, meta = "" }) => {
    const header = document.createElement("div");
    header.className = "pn-prompts-section__head";

    const titleNode = document.createElement("h3");
    titleNode.className = "pn-prompts-section__title";
    titleNode.textContent = String(title || "").trim();
    header.appendChild(titleNode);

    const cleanMeta = String(meta || "").trim();
    if (cleanMeta) {
      const metaNode = document.createElement("p");
      metaNode.className = "pn-prompts-section__meta";
      metaNode.textContent = cleanMeta;
      header.appendChild(metaNode);
    }

    return header;
  };

  const render = async (filter = "") => {
    const myRenderVersion = ++renderVersion;
    const isStale = () => myRenderVersion !== renderVersion;

    const container = byId("prompt-list");

    if (!container) {
      return;
    }

    // Show skeleton loading state
    container.innerHTML = "";
    container.classList.add("pn-prompts-layout");
    for (let i = 0; i < 5; i++) {
      const skel = document.createElement("div");
      skel.className = "pn-skeleton";
      container.appendChild(skel);
    }

    bindTemplateFilters();
    restoreTemplateFilterHome();

    const promptsRaw = await window.Store.getPrompts();
    if (isStale()) return;

    const prompts = promptsRaw.map((prompt) => ({
      ...prompt,
      text: normalizePromptText(prompt.text),
    }));

    const filtered = await filterPrompts(filter, prompts);
    if (isStale()) return;

    const tabContext = await getActiveTabContext();
    if (isStale()) return;

    let templates = window.PromptTemplates
      ? window.PromptTemplates.getTemplates(filter)
      : [];
    templates = templates.map((template) => ({
      ...template,
      text: normalizePromptText(template.text),
    }));

    const savedSignatures = new Set(
      prompts.map(
        (p) => `${String(p.title || "").trim()}|${String(p.text || "").trim()}`,
      ),
    );
    templates = templates.filter(
      (t) =>
        !savedSignatures.has(
          `${String(t.title || "").trim()}|${String(t.text || "").trim()}`,
        ),
    );
    const hasUserPrompts = prompts.length > 0;

    if (isStale()) return;

    container.innerHTML = "";
    container.classList.add("pn-prompts-layout");
    await renderBridgeStrip();
    if (isStale()) return;

    if (!hasUserPrompts) {
      container.appendChild(
        createEmptyState({
          title: "No prompts yet",
          message: templates.length
            ? "Your prompt library is empty. Add your own prompts or start from curated templates."
            : "Start your library by creating your first prompt.",
          actionLabel: "Add your first prompt",
          onAction: () => {
            if (window.PromptForm?.open) {
              void window.PromptForm.open();
            }
          },
        }),
      );
      if (!templates.length) {
        updateTemplateFilterVisibility(false);
        return;
      }
    }

    if (hasUserPrompts && !filtered.length && !templates.length) {
      container.appendChild(
        createEmptyState({
          title: "No results found",
          message: "Try a broader query or remove active filters.",
          actionLabel: "Clear Filters",
          onAction: () => {
            const searchInput = document.getElementById("prompt-search");
            if (searchInput) {
              searchInput.value = "";
            }
            void render("");
          },
        }),
      );
      updateTemplateFilterVisibility(false);
      return;
    }

    if (hasUserPrompts) {
      const librarySection = document.createElement("section");
      librarySection.className =
        "pn-prompts-section pn-prompts-section--library";
      librarySection.appendChild(
        createSectionHeader({
          title: "Prompt Library",
          meta: `${filtered.length} prompt${filtered.length === 1 ? "" : "s"}`,
        }),
      );

      const libraryList = document.createElement("div");
      libraryList.className = "pn-list pn-list--library";

      if (currentRenderState.observer) {
        currentRenderState.observer.disconnect();
        currentRenderState.observer = null;
      }

      currentRenderState.prompts = filtered;
      currentRenderState.filter = String(filter || "").trim();
      currentRenderState.supported = tabContext.supported;
      currentRenderState.nextIndex = 0;
      currentRenderState.container = libraryList;

      if (!currentRenderState.sentinel) {
        currentRenderState.sentinel = document.createElement("div");
        currentRenderState.sentinel.className = "pn-scroll-sentinel";
        currentRenderState.sentinel.style.height = "20px";
      }

      await loadNextPromptPage();

      librarySection.appendChild(libraryList);
      container.appendChild(librarySection);
    }

    if (templates.length > 0) {
      const divider = document.createElement("section");
      divider.className =
        "pn-template-divider pn-prompts-section pn-prompts-section--curated";

      const header = document.createElement("button");
      header.className = "pn-template-header";
      header.type = "button";
      header.innerHTML = `
      <span class="pn-template-header__copy">
        <span class="pn-template-header__title">Curated Templates</span>
        <span class="pn-template-header__meta">${templates.length} templates <span id="pn-template-count" class="pn-template-count"></span></span>
      </span>
      <svg class="pn-template-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;

      const tempsContainer = document.createElement("div");
      tempsContainer.className = "pn-template-grid pn-list";
      const isFiltered = String(filter || "").trim().length > 0;
      if (!isFiltered) {
        tempsContainer.dataset.collapsed = "true";
        header.classList.add("collapsed");
        curatedExpanded = false;
      } else {
        curatedExpanded = true;
      }

      header.addEventListener("click", () => {
        const isCollapsed = tempsContainer.dataset.collapsed === "true";
        tempsContainer.dataset.collapsed = isCollapsed ? "false" : "true";
        header.classList.toggle("collapsed", !isCollapsed);
        curatedExpanded = !isCollapsed;
        curatedToggledByUser = true;
        updateTemplateFilterVisibility(
          !curatedExpanded && templates.length > 0 && curatedToggledByUser,
        );
        if (curatedExpanded) {
          setActiveFilter(activeTemplateFilter);
        }
      });

      divider.appendChild(header);

      const filterBar = getTemplateFilterBar();
      if (filterBar) {
        divider.appendChild(filterBar);
        filterBar.classList.add("pn-template-filters--in-divider");
      }

      divider.appendChild(tempsContainer);

      for (const tpl of templates) {
        if (isStale()) return;
        tempsContainer.appendChild(
          await createPromptCard(
            tpl,
            String(filter || "").trim(),
            tabContext.supported,
            { isCurated: true },
          ),
        );
      }

      container.appendChild(divider);
      updateTemplateFilterVisibility(!curatedExpanded && curatedToggledByUser);
      if (curatedExpanded) {
        setActiveFilter(activeTemplateFilter);
      }
    } else {
      updateTemplateFilterVisibility(false);
    }
  };

  const getSearchInput = () => document.getElementById("prompt-search");
  const getSearchWrap = () => document.getElementById("search-wrap");
  const getSearchModeBadge = () =>
    document.getElementById("pn-search-mode-badge");

  const getSearchValue = () => String(getSearchInput()?.value || "");

  const refreshSearchModeBadge = () => {
    const badge = getSearchModeBadge();
    const query = String(getSearchValue() || "").trim();
    if (!badge) return;

    if (!query || semanticUiState.mode === "idle") {
      badge.classList.add("pn-hidden");
      badge.removeAttribute("data-tone");
      return;
    }

    if (semanticUiState.mode === "semantic") {
      badge.textContent = "Semantic search";
      badge.dataset.tone = "semantic";
      badge.classList.remove("pn-hidden");
      return;
    }

    const reason = String(semanticUiState.reason || "").trim();
    badge.textContent = reason
      ? `Keyword search active (${reason})`
      : "Keyword search";
    badge.dataset.tone = reason ? "busy" : "keyword";
    badge.classList.remove("pn-hidden");
  };

  const renderModelFeedback = (payload = {}) => {
    const wrap = document.getElementById("pn-model-feedback");
    const textNode = document.getElementById("pn-model-feedback-text");
    if (!wrap || !textNode) return;

    const enabled = payload?.enabled !== false;
    const semanticPhase = String(payload?.semanticPhase || "idle")
      .trim()
      .toLowerCase();
    const providerLabel = String(payload?.providerLabel || "Cloud").trim();

    if (!enabled) {
      textNode.textContent = "AI Off";
      wrap.dataset.tone = "disabled";
      wrap.classList.remove("pn-hidden");
      return;
    }

    const semanticCopy =
      semanticPhase === "ready"
        ? "Semantic"
        : semanticPhase === "busy"
          ? "Preparing"
          : semanticPhase === "error"
            ? "Error"
            : "Keyword";

    const trimLabel = (value, max = 12) => {
      const text = String(value || "").trim();
      if (!text) return "";
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    };

    const line = `${trimLabel(providerLabel, 10) || "Cloud"} · ${semanticCopy}`;

    textNode.textContent = line;
    wrap.dataset.tone =
      semanticPhase === "error"
        ? "error"
        : semanticPhase === "busy"
          ? "busy"
          : semanticPhase === "ready"
            ? "ready"
            : "idle";
    wrap.classList.remove("pn-hidden");
  };

  const clearSearch = () => {
    const searchInput = getSearchInput();
    const clearBtn = document.getElementById("pn-search-clear");
    if (!searchInput) return;
    if (!String(searchInput.value || "").trim()) return;
    searchInput.value = "";
    clearBtn?.classList.add("pn-hidden");
    semanticUiState.mode = "idle";
    semanticUiState.reason = "";
    refreshSearchModeBadge();
    void render("");
  };

  const bindSearchHandlers = () => {
    const searchInput = getSearchInput();
    const clearBtn = document.getElementById("pn-search-clear");

    searchInput?.addEventListener("input", (event) => {
      const target = event.target;
      if (clearBtn) {
        clearBtn.classList.toggle("pn-hidden", !target.value.trim());
      }
      clearTimeout(state._searchDebounce);
      state._searchDebounce = setTimeout(() => {
        const query = String(target?.value || "");
        void render(query);
      }, UI_FEEDBACK_MS.SEARCH_DEBOUNCE);
    });

    clearBtn?.addEventListener("click", () => {
      clearSearch();
      searchInput?.focus();
    });

    searchInput?.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && String(searchInput.value || "").trim()) {
        event.preventDefault();
        clearSearch();
      }
    });

    clearBtn?.classList.toggle(
      "pn-hidden",
      !String(searchInput?.value || "").trim(),
    );
  };

  const loadSmartSuggestions = async () => {
    if (!state.aiReady) return;

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) return;

      let snippet = null;
      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: "GET_CONVERSATION_SNIPPET",
        });
        snippet = response?.text;
      } catch (_) {
        return;
      }

      if (!snippet || snippet.length < 30) return;

      const result = await window.AIBridge.getSmartSuggestions(snippet);
      if (!result?.ids?.length) return;

      const prompts = await window.Store.getPrompts();
      const promptMap = new Map(prompts.map((p) => [p.id, p]));

      const strip = document.getElementById("pn-smart-strip");
      const chips = document.getElementById("pn-smart-chips");
      if (!strip || !chips) return;

      chips.innerHTML = "";

      for (const id of result.ids) {
        const prompt = promptMap.get(id);
        if (!prompt) continue;

        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "pn-smart-chip";
        chip.textContent = prompt.title;
        chip.title = String(prompt.text || "").slice(0, 100);
        chip.addEventListener("click", () => {
          const search = document.getElementById("prompt-search");
          if (search) search.value = prompt.title;
          void render(prompt.title);
        });
        chips.appendChild(chip);
      }

      strip.classList.remove("pn-hidden");
    } catch (_) {
      // non-fatal
    }
  };

  const setBridgeStripHidden = (hidden) => {
    const strip = document.getElementById("pn-bridge-strip");
    if (!strip) return;
    strip.classList.toggle("pn-hidden", hidden);
  };

  const getCurrentPlatform = async (tabId) => {
    if (!tabId) return "";
    const response = await chrome.tabs
      .sendMessage(tabId, { action: "getPlatform" })
      .catch(() => null);
    return String(response?.platform || "");
  };

  const bridgeFromPrompts = async (targetPlatform, label, sourcePlatform) => {
    const context = await getActiveTabContext();

    if (!context.supported || !context.tabId) {
      await showToast("Open a supported LLM tab to bridge.");
      return;
    }

    const response = await chrome.tabs
      .sendMessage(context.tabId, { action: "scrapeForBridge" })
      .catch(() => null);
    if (!response?.messages?.length) {
      await showToast("No conversation found to bridge.");
      return;
    }

    const liveSource = await getCurrentPlatform(context.tabId);
    await window.Bridge.bridgeTo(
      response.messages,
      liveSource || sourcePlatform,
      targetPlatform,
    );
    await showToast(`Opening ${label}...`);
  };

  const renderBridgeStrip = async () => {
    const strip = document.getElementById("pn-bridge-strip");

    if (!strip || !window.Bridge?.LLM_URLS) {
      setBridgeStripHidden(true);
      return;
    }

    const context = await getActiveTabContext();
    if (!context.supported || !context.tabId) {
      setBridgeStripHidden(true);
      return;
    }

    const currentPlatform = await getCurrentPlatform(context.tabId);
    if (!currentPlatform) {
      setBridgeStripHidden(true);
      return;
    }

    const targets = Object.keys(window.Bridge.LLM_URLS)
      .filter((platform) => platform !== currentPlatform)
      .filter(
        (platform) => state.settings?.enabledPlatforms?.[platform] === true,
      )
      .map((platform) => ({
        key: platform,
        label: PLATFORM_LABELS?.[platform] || platform,
      }));

    if (!targets.length) {
      setBridgeStripHidden(true);
      return;
    }

    const samePlatformLabel = String(
      PLATFORM_LABELS?.[currentPlatform] || currentPlatform || "Current LLM",
    )
      .trim()
      .replace(/\s+/g, " ");

    strip.innerHTML = "";

    const row = document.createElement("div");
    row.className = "pn-bridge-actions-row";

    const continueHereButton = document.createElement("button");
    continueHereButton.type = "button";
    continueHereButton.className =
      "pn-btn pn-btn--primary pn-bridge-action-btn";
    continueHereButton.textContent = "Continue Here";
    continueHereButton.title = `Continue in ${samePlatformLabel} as a new chat.`;
    continueHereButton.addEventListener("click", () => {
      void (async () => {
        if (continueHereButton.disabled) return;
        continueHereButton.disabled = true;
        continueHereButton.classList.add("is-loading");
        try {
          await bridgeFromPrompts(
            currentPlatform,
            samePlatformLabel,
            currentPlatform,
          );
        } catch (error) {
          console.error("[Promptium] Continue here failed.", error);
          await showToast("Could not continue in current LLM.");
        } finally {
          continueHereButton.disabled = false;
          continueHereButton.classList.remove("is-loading");
        }
      })();
    });

    const chooseButton = document.createElement("button");
    chooseButton.type = "button";
    chooseButton.className = "pn-btn pn-btn--primary pn-bridge-action-btn";
    chooseButton.textContent = "Choose LLM";
    chooseButton.title =
      "Pick one of your enabled LLMs to continue in a new chat.";

    const studioButton = document.createElement("button");
    studioButton.type = "button";
    studioButton.className = "pn-btn pn-btn--ghost pn-bridge-action-btn";
    studioButton.textContent = "Open Studio";
    studioButton.title = "Open Continue Studio";
    studioButton.addEventListener("click", () => {
      if (typeof window.ContinuationUI?.openFromActiveTab === "function") {
        void window.ContinuationUI.openFromActiveTab();
        return;
      }
      void window.AppShell?.switchTab?.("continue");
    });

    row.appendChild(continueHereButton);
    row.appendChild(chooseButton);
    row.appendChild(studioButton);
    strip.appendChild(row);

    const popup = document.createElement("div");
    popup.className = "pn-bridge-picker pn-hidden";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", "Select LLM to continue chat");

    const popupHead = document.createElement("div");
    popupHead.className = "pn-bridge-picker__head";
    popupHead.textContent = `Continue in (${targets.length})`;
    popup.appendChild(popupHead);

    const popupList = document.createElement("div");
    popupList.className = "pn-bridge-picker__list";
    targets.forEach((target) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "pn-btn pn-btn--ghost pn-bridge-picker__item";
      option.textContent = String(target.label || target.key || "LLM");
      option.addEventListener("click", () => {
        void (async () => {
          popup.classList.add("pn-hidden");
          try {
            await bridgeFromPrompts(target.key, target.label, currentPlatform);
          } catch (error) {
            console.error("[Promptium] Bridge picker action failed.", error);
            await showToast("Could not continue in selected LLM.");
          }
        })();
      });
      popupList.appendChild(option);
    });
    popup.appendChild(popupList);
    strip.appendChild(popup);

    chooseButton.addEventListener("click", () => {
      popup.classList.toggle("pn-hidden");
    });

    if (!window.__PN_BRIDGE_PICKER_DISMISS_BOUND) {
      document.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        document
          .querySelectorAll(".pn-bridge-picker:not(.pn-hidden)")
          .forEach((node) => {
            const owner =
              node.parentElement?.querySelector(
                ".pn-bridge-action-btn:nth-child(2)",
              ) || null;
            if (node.contains(target) || owner?.contains(target)) return;
            node.classList.add("pn-hidden");
          });
      });
      window.__PN_BRIDGE_PICKER_DISMISS_BOUND = true;
    }

    setBridgeStripHidden(false);
  };

  const setCallbacks = (nextCallbacks = {}) => {
    callbacks.onOpenImprove = nextCallbacks.onOpenImprove || null;
    callbacks.onPromptsMutated = nextCallbacks.onPromptsMutated || null;
  };

  const focusSearch = () => {
    const searchInput = getSearchInput();
    const searchWrap = getSearchWrap();
    if (!searchInput || !searchWrap || searchWrap.classList.contains("hidden"))
      return false;
    searchInput.focus();
    searchInput.select();
    return true;
  };

  window.PromptsUI = {
    render,
    bindSearchHandlers,
    getSearchValue,
    clearSearch,
    loadSmartSuggestions,
    renderBridgeStrip,
    setCallbacks,
    focusSearch,
    getSearchInput,
    getSearchWrap,
    bindTemplateFilters,
    setActiveFilter,
    resetTemplateFilter,
    renderModelFeedback,
  };
})();
