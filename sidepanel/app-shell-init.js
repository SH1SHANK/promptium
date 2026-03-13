(() => {
  /**
   * File: sidepanel/app-shell-init.js
   * Purpose: Sidepanel bootstrapping, shell navigation, onboarding, and early listener queue.
   */

  const { KEYS, ONBOARDING_CARDS, state, isEditableField } =
    window.SidepanelState;
  const MODAL_SCROLL_LOCK_CLASS = "pn-modal-open";
  let modalLockObserver = null;

  const getOnboardingIconClass = (card) =>
    String(card?.iconClass || "pn-card-icon--violet");

  const renderOnboardingCard = async (card, index) => `
  <section class="pn-onboarding-card" data-onboard-index="${index}">
    <div class="pn-ob-visual">
      <span class="pn-card-icon ${getOnboardingIconClass(card)}">${card.icon}</span>
    </div>
    <p class="pn-card-sub">${card.subheadline}</p>
    <h2 class="pn-ob-headline" data-text="${card.headline}">${card.headline}</h2>
    <p class="pn-ob-subline">${card.body}</p>
    ${
      card.isLaunch
        ? `<div class="pn-onboard-actions">
            <button class="pn-onboarding-primary" type="button" data-action="onboard-get-started">Get Started</button>
            <button class="pn-onboard-btn" type="button" data-action="onboard-open-library">Open Library</button>
            <button class="pn-onboard-btn" type="button" data-action="onboard-go-settings">Go to Settings</button>
          </div>`
        : `<div class="pn-onboard-actions">
            <button class="pn-onboarding-primary" type="button" data-action="onboard-next">Continue</button>
            <a class="pn-ob-skip" href="#" data-action="onboard-skip">Skip intro</a>
          </div>`
    }
  </section>
`;

  const updateOnboardingPositions = async () => {
    const cards = Array.from(
      document.querySelectorAll("#pn-onboarding .pn-onboarding-card"),
    );
    const dots = Array.from(
      document.querySelectorAll("#pn-onboarding .pn-ob-dot"),
    );

    cards.forEach((card, index) => {
      card.classList.remove("active", "exit");
      if (index === state.onboardingIndex) {
        card.classList.add("active");
      }
    });

    dots.forEach((dot, index) => {
      dot.classList.remove("active", "visited");
      if (index < state.onboardingIndex) {
        dot.classList.add("visited");
      }
      if (index === state.onboardingIndex) {
        dot.classList.add("active");
      }
    });

    /* Animate headline char-by-char for the active card */
    const activeCard = cards[state.onboardingIndex];
    if (activeCard) {
      const headlineEl = activeCard.querySelector(".pn-ob-headline");
      if (headlineEl) {
        const text =
          headlineEl.getAttribute("data-text") || headlineEl.textContent;
        headlineEl.setAttribute("data-text", text);
        headlineEl.textContent = text;
        /* Trigger charReveal using inline span injection */
        setTimeout(() => {
          headlineEl.innerHTML = "";
          text.split("").forEach((ch, i) => {
            if (ch === " ") {
              headlineEl.appendChild(document.createTextNode("\u00A0"));
            } else {
              const span = document.createElement("span");
              span.className = "char";
              span.textContent = ch;
              span.style.animationDelay = `${160 + i * 28}ms`;
              headlineEl.appendChild(span);
            }
          });
        }, 0);
      }

      /* Animate icon */
      const iconEl = activeCard.querySelector(".pn-card-icon");
      if (iconEl) {
        iconEl.style.animation = "none";
        iconEl.style.opacity = "0";
        iconEl.style.transform = "scale(0.7)";
        setTimeout(() => {
          iconEl.style.transition =
            "opacity 0.35s ease 80ms, transform 0.45s cubic-bezier(0.34,1.56,0.64,1) 80ms";
          iconEl.style.opacity = "1";
          iconEl.style.transform = "scale(1)";
        }, 10);
      }

      /* Move glow orbs */
      const glowPositions = [
        { top: "25%", left: "35%", top2: "70%", left2: "65%" },
        { top: "60%", left: "50%", top2: "28%", left2: "22%" },
        { top: "30%", left: "20%", top2: "72%", left2: "62%" },
        { top: "65%", left: "55%", top2: "22%", left2: "35%" },
        { top: "22%", left: "60%", top2: "68%", left2: "28%" },
        { top: "55%", left: "30%", top2: "25%", left2: "65%" },
        { top: "40%", left: "40%", top2: "50%", left2: "55%" },
      ];
      const gp = glowPositions[state.onboardingIndex] || glowPositions[0];
      const glow = document.querySelector("#pn-onboarding .pn-onboarding-glow");
      const glow2 = document.querySelector(
        "#pn-onboarding .pn-onboarding-glow-2",
      );
      if (glow) {
        glow.style.top = gp.top;
        glow.style.left = gp.left;
      }
      if (glow2) {
        glow2.style.top = gp.top2;
        glow2.style.left = gp.left2;
      }
    }
  };

  const completeOnboarding = async () => {
    await chrome.storage.local.set({ [KEYS.ONBOARDING_KEY]: true });
    const overlay = document.getElementById("pn-onboarding");
    if (overlay) {
      overlay.classList.add("pn-ob-exit");
      await new Promise((r) => setTimeout(r, 350));
      overlay.remove();
    }
  };

  const onOnboardingNext = async () => {
    if (state.onboardingIndex < ONBOARDING_CARDS.length - 1) {
      /* Animate current card out */
      const cards = Array.from(
        document.querySelectorAll("#pn-onboarding .pn-onboarding-card"),
      );
      const currentCard = cards[state.onboardingIndex];
      if (currentCard) {
        currentCard.classList.remove("active");
        currentCard.classList.add("exit");
        await new Promise((r) => setTimeout(r, 220));
        currentCard.classList.remove("exit");
      }
      state.onboardingIndex += 1;
      await updateOnboardingPositions();
      return false;
    }
    await completeOnboarding();
    return state.settings.enableAI;
  };

  const onOnboardingSkip = async () => {
    /* Animate current card out */
    const cards = Array.from(
      document.querySelectorAll("#pn-onboarding .pn-onboarding-card"),
    );
    const currentCard = cards[state.onboardingIndex];
    if (currentCard) {
      currentCard.classList.remove("active");
      currentCard.classList.add("exit");
      await new Promise((r) => setTimeout(r, 220));
      currentCard.classList.remove("exit");
    }
    state.onboardingIndex = ONBOARDING_CARDS.length - 1;
    await updateOnboardingPositions();
  };

  const maybeRunOnboarding = async () => {
    const onboardingState = await chrome.storage.local.get([
      KEYS.ONBOARDING_KEY,
    ]);

    if (Boolean(onboardingState?.[KEYS.ONBOARDING_KEY])) {
      return false;
    }

    state.onboardingIndex = 0;
    const overlay = document.createElement("div");
    overlay.id = "pn-onboarding";

    const cardsMarkup = await Promise.all(
      ONBOARDING_CARDS.map((card, index) => renderOnboardingCard(card, index)),
    );
    const dotsMarkup = ONBOARDING_CARDS.map(
      (_, index) =>
        `<span class="pn-ob-dot visible${index === 0 ? " active" : ""}"></span>`,
    ).join("");

    overlay.innerHTML = `
    <div class="pn-ob-deck">${cardsMarkup.join("")}</div>
    <div class="pn-ob-dots">${dotsMarkup}</div>
  `;

    /* Dual ambient glow orbs */
    const glow = document.createElement("div");
    glow.className = "pn-onboarding-glow";
    glow.style.top = "25%";
    glow.style.left = "35%";
    overlay.appendChild(glow);

    const glow2 = document.createElement("div");
    glow2.className = "pn-onboarding-glow-2";
    glow2.style.top = "70%";
    glow2.style.left = "65%";
    overlay.appendChild(glow2);

    document.body.appendChild(overlay);
    await updateOnboardingPositions();

    let aiInitialized = false;

    overlay.addEventListener("click", (event) => {
      void (async () => {
        const action = String(event.target?.dataset?.action || "");

        if (action === "onboard-skip") {
          event.preventDefault();
          await onOnboardingSkip();
          return;
        }

        if (action === "onboard-next") {
          event.preventDefault();
          aiInitialized = await onOnboardingNext();
          return;
        }

        if (action === "onboard-get-started") {
          event.preventDefault();
          await completeOnboarding();
          return;
        }

        if (action === "onboard-open-library") {
          event.preventDefault();
          await completeOnboarding();
          await switchTab("prompts");
          return;
        }

        if (action === "onboard-go-settings") {
          event.preventDefault();
          await completeOnboarding();
          await switchTab("settings");
        }
      })();
    });

    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (!document.getElementById("pn-onboarding")) {
          clearInterval(interval);
          resolve(aiInitialized);
        }
      }, 120);
    });
  };

  const refreshHeaderControls = () => {
    const addPromptButton = byId("add-prompt-btn");
    const searchWrap = byId("search-wrap");
    const historyBtn = byId("history-btn");
    const visibleTabs = state.settings?.visibleTabs || {};
    const isPromptTab = state.activeTab === "prompts";
    if (addPromptButton)
      addPromptButton.classList.toggle(
        "hidden",
        !isPromptTab || visibleTabs.prompts === false,
      );
    if (searchWrap) {
      const isSearchTab =
        (isPromptTab && visibleTabs.prompts !== false) ||
        (state.activeTab === "tags" && visibleTabs.tags !== false) ||
        (state.activeTab === "chains" && visibleTabs.chains !== false);
      searchWrap.classList.toggle("hidden", !isSearchTab);
    }
    if (historyBtn) {
      const standalone = ["history", "settings", "export", "continue"].includes(
        state.activeTab,
      );
      historyBtn.classList.toggle(
        "hidden",
        standalone || visibleTabs.history === false,
      );
    }
  };

  const isPopupMode = async () => {
    if (typeof chrome?.sidePanel === "undefined") {
      return true;
    }

    try {
      const snapshot = await chrome.storage.session.get([KEYS.PANEL_MODE_KEY]);
      return snapshot?.[KEYS.PANEL_MODE_KEY] === "popup";
    } catch (_error) {
      return false;
    }
  };

  const syncPopupCloseButton = async () => {
    const closeBtn = byId("panel-close-btn");
    if (!closeBtn) return;
    closeBtn.classList.toggle("hidden", !(await isPopupMode()));
  };

  const isTabEnabledBySettings = (tabName) => {
    const tabs = state.settings?.visibleTabs || {};
    if (tabName === "prompts") return tabs.prompts !== false;
    if (tabName === "chains") return tabs.chains !== false;
    if (tabName === "export") return tabs.export !== false;
    if (tabName === "history") return tabs.history !== false;
    if (tabName === "tags") return tabs.tags !== false;
    return true;
  };

  const switchTab = async (tabName) => {
    const requested = String(tabName || "prompts");
    if (!isTabEnabledBySettings(requested)) {
      tabName =
        state.settings?.visibleTabs?.prompts !== false ? "prompts" : "settings";
    }

    const tabs = Array.from(document.querySelectorAll(".tab"));
    const panes = Array.from(document.querySelectorAll(".tab-content"));

    const isStandaloneView = [
      "history",
      "settings",
      "export",
      "continue",
    ].includes(tabName);

    state.activeTab = String(tabName || "prompts");

    tabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === state.activeTab);
    });

    panes.forEach((pane) => {
      pane.classList.toggle("active", pane.dataset.tab === state.activeTab);
    });

    const tabBar = document.querySelector(".pn-tab-bar");
    const searchWrap = document.getElementById("search-wrap");
    const backBtn = document.getElementById("back-btn");
    const headerPageTitle = document.getElementById("header-page-title");
    const addPromptBtn = document.getElementById("add-prompt-btn");
    const historyBtn = document.getElementById("history-btn");
    const settingsBtn = document.getElementById("settings-btn");
    const refreshBtn = document.getElementById("refresh-btn");

    if (tabBar) tabBar.classList.toggle("hidden", isStandaloneView);
    if (searchWrap) {
      searchWrap.classList.toggle("hidden", isStandaloneView);
    }

    if (backBtn) backBtn.classList.toggle("hidden", !isStandaloneView);
    if (addPromptBtn) addPromptBtn.classList.toggle("hidden", isStandaloneView);
    if (historyBtn) historyBtn.classList.toggle("hidden", isStandaloneView);
    if (settingsBtn) settingsBtn.classList.toggle("hidden", isStandaloneView);
    if (refreshBtn) refreshBtn.classList.toggle("hidden", isStandaloneView);

    if (headerPageTitle) {
      headerPageTitle.classList.toggle("hidden", !isStandaloneView);
      const pageTitles = { history: "History", settings: "Settings", export: "Export", continue: "Continue" };
      headerPageTitle.textContent = pageTitles[tabName] || "";
    }

    refreshHeaderControls();

    const searchInput = document.getElementById("prompt-search");
    if (searchInput) {
      searchInput.placeholder =
        state.activeTab === "chains"
          ? "Search chains by title, goal, or steps"
          : "Search prompts by title, text, or tags";
    }

    const searchBadge = document.getElementById("pn-search-mode-badge");
    const searchSpark = document.getElementById("pn-search-spark");
    const modelFeedback = document.getElementById("pn-model-feedback");
    const hideSearchMeta = state.activeTab === "chains";
    [searchBadge, searchSpark, modelFeedback].forEach((node) => {
      if (!node) return;
      if (hideSearchMeta) {
        node.dataset.pnPrevHidden = node.classList.contains("pn-hidden")
          ? "1"
          : "0";
        node.classList.add("pn-hidden");
        return;
      }
      if (!node.dataset.pnPrevHidden) return;
      node.classList.toggle("pn-hidden", node.dataset.pnPrevHidden === "1");
      delete node.dataset.pnPrevHidden;
    });

    if (
      state.activeTab === "prompts" &&
      window.PromptsUI?.resetTemplateFilter
    ) {
      window.PromptsUI.resetTemplateFilter();
    }

    if (state.activeTab === "chains") {
      await window.ChainsUI?.render?.(window.PromptsUI?.getSearchValue?.() || "");
    }

    if (state.activeTab === "export") {
      if (!state.exportSnapshotPayload) {
        state.exportSnapshotPayload = window.SessionStorage.cloneExportPayload(
          state.exportPayload,
        );
      }
      await window.ExportPayloadUI.renderMeta();
    }
  };

  const performWorkspaceRefresh = async () => {
    await window.PromptsUI.render(window.PromptsUI.getSearchValue());
    await window.ChainsUI?.render?.(window.PromptsUI.getSearchValue());
    await window.HistoryUI.render();
    await window.TagsUI.render();
    await showToast("Workspace synced.");
  };

  const bindSessionPayloadUpdates = async () => {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      const payloadChange = changes[KEYS.SIDEPANEL_SESSION_KEY];
      if (areaName !== "session" || !payloadChange) {
        return;
      }

      void (async () => {
        await window.ExportPayloadUI.ingestIncomingPayload(
          payloadChange.newValue,
        );
        if (window.ExportPayloadUI.hasPayloadMessages(state.exportPayload)) {
          await switchTab("export");
        }
      })();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes.prompts) {
        return;
      }

      void (async () => {
        await window.PromptsUI.render(window.PromptsUI.getSearchValue());
        await window.TagsUI.render();
      })();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes.promptChains) {
        return;
      }

      void (async () => {
        await window.ChainsUI?.render?.(window.PromptsUI?.getSearchValue?.() || "");
      })();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[KEYS.PENDING_SNIPPET_KEY]) {
        return;
      }

      if (!state.initialized) {
        state.pendingActions.push({ type: "pendingSnippet" });
        return;
      }

      void consumePendingSnippet();
    });
  };

  const bindShellEvents = async () => {
    Array.from(document.querySelectorAll(".tab")).forEach((tab) => {
      tab.addEventListener("click", () => {
        void switchTab(String(tab.dataset.tab || "prompts"));
      });
    });

    byId("history-btn")?.addEventListener("click", () => {
      void switchTab("history");
    });

    byId("settings-btn")?.addEventListener("click", () => {
      void switchTab("settings");
    });

    byId("back-btn")?.addEventListener("click", () => {
      void switchTab("prompts");
    });

    byId("add-prompt-btn")?.addEventListener("click", () => {
      void window.PromptForm.open();
    });

    byId("refresh-btn")?.addEventListener("click", () => {
      void performWorkspaceRefresh();
    });
    byId("panel-close-btn")?.addEventListener("click", () => {
      window.close();
    });

    document.getElementById("pn-smart-close")?.addEventListener("click", () => {
      document.getElementById("pn-smart-strip")?.classList.add("pn-hidden");
    });

    byId("pn-prompts-continue-chat")?.addEventListener("click", () => {
      void handleShowContinuation();
    });

    byId("pn-prompts-new-chain")?.addEventListener("click", () => {
      void (async () => {
        if (window.ChainsUI?.openNewChain) {
          await window.ChainsUI.openNewChain();
          await switchTab("chains");
        }
      })();
    });

    byId("pn-chains-new")?.addEventListener("click", () => {
      void (async () => {
        if (window.ChainsUI?.openNewChain) {
          await window.ChainsUI.openNewChain();
          await switchTab("chains");
        }
      })();
    });

    window.addEventListener("keydown", (event) => {
      const isFocusShortcut =
        event.key.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey;
      if (isFocusShortcut) {
        const searchInput = window.PromptsUI.getSearchInput();
        const searchWrap = window.PromptsUI.getSearchWrap();
        if (
          !searchInput ||
          !searchWrap ||
          searchWrap.classList.contains("hidden")
        )
          return;
        const active = document.activeElement;
        if (isEditableField(active) && active !== searchInput) return;
        event.preventDefault();
        window.PromptsUI.focusSearch();
        return;
      }

      if (event.key !== "Escape") return;
      if (window.TemplateFill?.isOpen?.()) {
        event.preventDefault();
        window.TemplateFill.closeActiveForm?.();
        return;
      }
      if (
        !document
          .getElementById("pn-improve-modal")
          ?.classList.contains("pn-hidden")
      ) {
        window.ImproveUI.close();
        return;
      }
      if (
        !document.getElementById("add-modal")?.classList.contains("pn-hidden")
      ) {
        void window.PromptForm.close();
        return;
      }
      const searchInput = window.PromptsUI.getSearchInput();
      if (
        document.activeElement === searchInput &&
        String(searchInput?.value || "").trim()
      ) {
        event.preventDefault();
        window.PromptsUI.clearSearch();
      }
    });

    window.addEventListener("resize", () => {
      // no-op
    });
  };

  const syncModalScrollLock = () => {
    const hasOpenModal = Array.from(
      document.querySelectorAll(".pn-modal"),
    ).some((node) => !node.classList.contains("pn-hidden"));
    document.body.classList.toggle(MODAL_SCROLL_LOCK_CLASS, hasOpenModal);
  };

  const bindModalScrollLock = () => {
    if (modalLockObserver) return;

    const modals = Array.from(document.querySelectorAll(".pn-modal"));
    if (!modals.length) {
      syncModalScrollLock();
      return;
    }

    modalLockObserver = new MutationObserver(() => {
      syncModalScrollLock();
    });

    modals.forEach((modal) => {
      modalLockObserver.observe(modal, {
        attributes: true,
        attributeFilter: ["class"],
      });
    });

    syncModalScrollLock();
  };

  const handleShowExport = async () => {
    const incoming = await window.ExportPayloadUI.loadPayload();
    await window.ExportPayloadUI.ingestIncomingPayload(incoming);
    await switchTab("export");
    await window.ExportPayloadUI.renderPreview();
    await window.ExportPayloadUI.renderMeta();

    if (state.exportSnapshotPayload?.messages?.length) {
      await window.ExportPayloadUI.setStatus("Selection loaded.");
    }
  };

  const handleShowContinuation = async () => {
    if (!window.ContinuationUI?.openFromActiveTab) {
      return;
    }
    const opened = await window.ContinuationUI.openFromActiveTab();
    if (!opened) {
      await switchTab("prompts");
    }
  };

  const consumePendingSnippet = async () => {
    try {
      const snapshot = await chrome.storage.local.get([
        KEYS.PENDING_SNIPPET_KEY,
      ]);
      const snippet = snapshot?.[KEYS.PENDING_SNIPPET_KEY];
      const text = String(snippet?.text || "").trim();
      if (!text) {
        return false;
      }

      await chrome.storage.local
        .remove([KEYS.PENDING_SNIPPET_KEY])
        .catch(() => {});
      await switchTab("prompts");
      await window.PromptForm.openPlainPrefilled(
        text,
        snippet?.sourceUrl || "",
      );
      await showToast("Saved to Promptium");
      return true;
    } catch (_error) {
      return false;
    }
  };

  const consumePendingPanelAction = async () => {
    try {
      const snapshot = await chrome.storage.session.get([
        KEYS.PENDING_PANEL_ACTION_KEY,
      ]);
      const rawAction = snapshot?.[KEYS.PENDING_PANEL_ACTION_KEY];
      if (!rawAction) {
        return null;
      }
      await chrome.storage.session
        .remove([KEYS.PENDING_PANEL_ACTION_KEY])
        .catch(() => {});

      const normalized =
        typeof rawAction === "string" ? { type: rawAction } : rawAction;
      if (!normalized?.type) {
        return null;
      }
      state.pendingActions.push(normalized);
      return normalized;
    } catch (_error) {
      return null;
    }
  };

  const handleImprovePayload = async (payload) => {
    const normalizedImprove = window.ImproveUI.normalizePayload(payload);
    chrome.storage.local.remove([KEYS.IMPROVE_PAYLOAD_KEY]).catch(() => {});
    if (normalizedImprove.text) {
      void window.ImproveUI.open(
        null,
        normalizedImprove.text,
        normalizedImprove.tags,
        {
          context: "fab",
          sourceTabId: normalizedImprove.sourceTabId,
        },
      );
    }
  };

  const registerEarlyListeners = () => {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.action !== "showExport") return;

      if (!state.initialized) {
        state.pendingActions.push({ type: "showExport" });
        return true;
      }

      void handleShowExport().catch((err) => {
        console.warn("[Promptium] showExport handler error:", err);
      });

      return true;
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.action !== "showContinuation") return;

      if (!state.initialized) {
        state.pendingActions.push({ type: "showContinuation" });
        return true;
      }

      void handleShowContinuation().catch((err) => {
        console.warn("[Promptium] showContinuation handler error:", err);
      });

      return true;
    });

    chrome.storage.onChanged.addListener((changes) => {
      const improveChange = changes[KEYS.IMPROVE_PAYLOAD_KEY];
      if (!improveChange?.newValue) {
        return;
      }

      if (!state.initialized) {
        state.pendingActions.push({
          type: "improvePayload",
          payload: improveChange.newValue,
        });
        return;
      }

      void handleImprovePayload(improveChange.newValue);
    });
  };

  const flushPendingActions = async () => {
    const queue = Array.from(state.pendingActions);
    state.pendingActions = [];

    for (const action of queue) {
      if (action.type === "showExport") {
        await handleShowExport();
        continue;
      }
      if (action.type === "improvePayload") {
        await handleImprovePayload(action.payload);
        continue;
      }
      if (action.type === "showContinuation") {
        await handleShowContinuation();
        continue;
      }
      if (action.type === "pendingSnippet") {
        await consumePendingSnippet();
      }
    }
  };

  const init = async () => {
    // Detect if running in popup mode (Arc or browsers without side panel support)
    const isPopupMode = !chrome.sidePanel || typeof chrome.sidePanel.open !== "function";

    // Add close button for popup mode
    if (isPopupMode) {
      const header = document.querySelector(".pn-header-actions");
      if (header) {
        const closeBtn = document.createElement("button");
        closeBtn.id = "popup-close-btn";
        closeBtn.className = "pn-btn pn-btn--ghost pn-icon-btn pn-popup-close";
        closeBtn.type = "button";
        closeBtn.title = "Close";
        closeBtn.setAttribute("aria-label", "Close");
        closeBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        `;
        closeBtn.addEventListener("click", () => {
          window.close();
        });
        header.appendChild(closeBtn);
      }
    }

    window.PromptsUI.setCallbacks({
      onOpenImprove: (promptId, text, tags, options = {}) =>
        window.ImproveUI.open(promptId, text, tags, options),
      onPromptsMutated: () => window.TagsUI.render(),
    });

    window.PromptForm.setCallbacks({
      onPromptSaved: async () => {
        await window.PromptsUI.render(window.PromptsUI.getSearchValue());
        await window.TagsUI.render();
      },
      onOpenImprove: (promptId, text, tags, options = {}) =>
        window.ImproveUI.open(promptId, text, tags, options),
    });

    window.TagsUI.setCallbacks({
      onApplyTagFilter: async (filterValue) => {
        const search = document.getElementById("prompt-search");
        if (search) search.value = filterValue;
        await switchTab("prompts");
        await window.PromptsUI.render(filterValue);
      },
      onTagsMutated: async () => {
        await window.PromptsUI.render(window.PromptsUI.getSearchValue());
      },
    });

    window.SettingsAI.setCallbacks({
      onApplyExportDefaults: (settings) =>
        window.ExportPayloadUI.applyDefaultsFromSettings(settings),
      onRenderExportPreview: () => window.ExportPayloadUI.renderPreview(),
      onLoadSmartSuggestions: () => window.PromptsUI.loadSmartSuggestions(),
    });

    window.ExportPayloadUI.setCallbacks({
      onRunExport: () => window.ExportActionsUI.runExport(),
      onSelectMessages: () => window.ExportActionsUI.selectMessagesForExport(),
    });

    window.ImproveUI.setCallbacks({
      onLibraryChanged: async () => {
        await window.PromptsUI.render(window.PromptsUI.getSearchValue());
        await window.TagsUI.render();
      },
      onPromptTextReplaced: () => window.PromptForm.prefillSuggestedTags(),
      onSwitchTab: (tabName) => switchTab(tabName),
    });

    await bindShellEvents();
    await syncPopupCloseButton();
    bindModalScrollLock();
    window.PromptsUI.bindSearchHandlers();
    window.PromptForm.bindEvents();
    window.SettingsAI.bindEvents();
    window.ExportPayloadUI.bindEvents();
    window.ExportActionsUI.bindEvents();
    window.ContinuationUI?.bindEvents?.();
    window.ImproveUI.bindEvents();
    window.ChainsUI?.bindEvents?.();

    await window.SettingsAI.load();
    window.SettingsAI.renderControls();
    await window.SettingsUI?.init?.();
    await window.SettingsAI.syncSaveState();
    window.ExportPayloadUI.applyDefaultsFromSettings(state.settings);
    const initialExportPayload = await window.ExportPayloadUI.loadPayload();
    state.exportSnapshotPayload =
      window.SessionStorage.cloneExportPayload(initialExportPayload);
    state.pendingExportPayload = null;
    state.hasPendingExportUpdate = false;
    await bindSessionPayloadUpdates();

    try {
      const snapshot = await chrome.storage.local.get([
        KEYS.IMPROVE_PAYLOAD_KEY,
      ]);
      const promptiumImprovePayload = snapshot?.[KEYS.IMPROVE_PAYLOAD_KEY];
      const settingsSnap = await chrome.storage.local
        .get([KEYS.SETTINGS_KEY])
        .catch(() => ({}));
      const activeProvider = String(
        settingsSnap?.[KEYS.SETTINGS_KEY]?.activeProvider || "gemini",
      )
        .trim()
        .toLowerCase();
      const providerKey = window.SessionStorage?.getStoredProviderKey
        ? await window.SessionStorage.getStoredProviderKey(
            activeProvider,
          ).catch(() => "")
        : await window.SessionStorage.getStoredGeminiKey().catch(() => "");

      if (promptiumImprovePayload) {
        await chrome.storage.local
          .remove([KEYS.IMPROVE_PAYLOAD_KEY])
          .catch(() => {});
        const normalizedImprove = window.ImproveUI.normalizePayload(
          promptiumImprovePayload,
        );
        if (normalizedImprove.text) {
          void window.ImproveUI.open(
            null,
            normalizedImprove.text,
            normalizedImprove.tags,
            {
              context: "fab",
              sourceTabId: normalizedImprove.sourceTabId,
            },
          );
        }
      }

      const keyInput = document.getElementById("pn-provider-key");
      if (keyInput && providerKey) keyInput.value = providerKey;
    } catch (_) {
      // non-fatal
    }

    const pendingPanelAction = await consumePendingPanelAction();
    const hasSelectionPayload = Boolean(state.exportPayload?.messages?.length);
    const route = String(window.location.hash || "")
      .replace(/^#/, "")
      .trim()
      .toLowerCase();
    const routableTabs = new Set([
      "prompts",
      "chains",
      "history",
      "export",
      "tags",
      "settings",
      "continue",
    ]);
    const initialTab = routableTabs.has(route)
      ? route
      : pendingPanelAction?.type === "showExport"
        ? "export"
        : pendingPanelAction?.type === "showContinuation"
          ? "continue"
          : hasSelectionPayload
            ? "export"
            : "prompts";
    await switchTab(initialTab);

    await window.PromptsUI.render("");
    await window.ChainsUI?.render?.("");
    await window.HistoryUI.render();
    await window.TagsUI.render();
    await window.ExportPayloadUI.renderPreview();
    await consumePendingSnippet();

    const onboardingInitializedAi = await maybeRunOnboarding();

    if (state.settings.enableAI) {
      if (!onboardingInitializedAi) {
        const embStatus = await window.SettingsAI.syncAiState();
        state.aiReady = embStatus?.status === "ready";
      }
    } else {
      await window.SettingsAI.setAiDisabledBadge();
    }

    if (state.exportSnapshotPayload?.messages?.length) {
      await window.ExportPayloadUI.setStatus("Selection loaded.");
    } else {
      await window.ExportPayloadUI.setStatus(
        "Select messages in chat, then click Export Selected.",
        false,
      );
    }

    state.initialized = true;
    await flushPendingActions();

    window.addEventListener("focus", () => {
      void consumePendingSnippet();
    });
  };

  window.AppShell = {
    switchTab,
    refreshHeaderControls,
  };

  window.SidepanelInit = {
    registerEarlyListeners,
    init,
  };

  registerEarlyListeners();

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((err) => {
      const banner = document.createElement("div");
      banner.className = "pn-init-error-banner";
      banner.textContent = `Initialization failed: ${err?.message || "Unknown error."} Open Settings and retry.`;
      document.body.appendChild(banner);
    });
  });
})();
