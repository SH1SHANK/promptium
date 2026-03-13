(() => {
  /**
   * File: sidepanel/chains-ui.js
   * Purpose: Prompt chain creation, editing, and execution UI.
   */

  const { state } = window.SidepanelState;
  const { ChainStore } = window;

  const AUTOSAVE_DELAY_MS = 650;
  const POLL_INTERVAL_MS = 900;
  const RESPONSE_STABLE_MS = 1400;

  const localState = {
    mode: "list",
    chains: [],
    activeChain: null,
    activeRun: null,
    autosaveTimer: null,
    pollTimer: null,
    bound: false,
    searchQuery: "",
    lastRunToastAt: 0,
  };

  const byIdSafe = (id) =>
    window.byId ? window.byId(id) : document.getElementById(id);
  const showToast =
    window.showToast || (async () => {});

  const clampText = (value, limit = 12000) =>
    String(value || "")
      .trim()
      .slice(0, limit);

  const normalizeChainTitle = (value, goal = "") => {
    const title = clampText(value, 80);
    if (title) return title;
    if (ChainStore?.deriveChainTitle) {
      return ChainStore.deriveChainTitle(goal);
    }
    return "Untitled Chain";
  };

  const formatDate = (isoString) => {
    if (!isoString) return "Unknown";
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getListView = () => byIdSafe("pn-chain-list-view");
  const getEditorView = () => byIdSafe("pn-chain-editor-view");
  const getEditorRoot = () => byIdSafe("pn-chain-editor");
  const getChainList = () => byIdSafe("pn-chain-list");

  const setMode = (mode) => {
    localState.mode = mode === "editor" ? "editor" : "list";
    getListView()?.classList.toggle("pn-hidden", localState.mode !== "list");
    getEditorView()?.classList.toggle("pn-hidden", localState.mode !== "editor");
  };

  const loadChains = async () => {
    localState.chains = await ChainStore.getChains();
    return localState.chains;
  };

  const loadActiveRun = async () => {
    localState.activeRun = await ChainStore.getActiveRun();
    return localState.activeRun;
  };

  const setActiveRun = async (run) => {
    localState.activeRun = await ChainStore.setActiveRun(run);
    return localState.activeRun;
  };

  const clearActiveRun = async () => {
    await ChainStore.clearActiveRun();
    localState.activeRun = null;
    stopRunPolling();
  };

  const stopRunPolling = () => {
    if (localState.pollTimer) {
      clearInterval(localState.pollTimer);
      localState.pollTimer = null;
    }
  };

  const shouldToast = () => {
    const now = Date.now();
    if (now - localState.lastRunToastAt < 1600) return false;
    localState.lastRunToastAt = now;
    return true;
  };

  const computeFingerprint = (payload) => {
    const count = Math.max(0, Number(payload?.assistantCount) || 0);
    const text = String(payload?.lastAssistantText || "");
    const tail = text.slice(-180);
    return `${count}:${text.length}:${tail}`;
  };

  const fetchConversationFingerprint = async (tabId) => {
    if (!tabId) return null;
    const response = await chrome.tabs
      .sendMessage(tabId, { action: "getConversationFingerprint" })
      .catch(() => null);
    if (!response?.ok) return null;
    return response;
  };

  const scheduleAutosave = () => {
    if (localState.autosaveTimer) {
      clearTimeout(localState.autosaveTimer);
    }
    localState.autosaveTimer = setTimeout(() => {
      localState.autosaveTimer = null;
      void saveActiveChain();
    }, AUTOSAVE_DELAY_MS);
  };

  const saveActiveChain = async () => {
    const chain = localState.activeChain;
    if (!chain) return null;
    const hasContent = Boolean(chain.goal?.trim()) || chain.steps?.length > 0;
    if (!hasContent) return chain;
    const saved = await ChainStore.saveChain(chain);
    localState.activeChain = saved;
    await loadChains();
    return saved;
  };

  const getRunForChain = (chainId) => {
    if (!localState.activeRun || localState.activeRun.chainId !== chainId) {
      return null;
    }
    return localState.activeRun;
  };

  const getEditableGuard = (run) =>
    Boolean(run && run.status === "running");

  const filterChains = (chains, filter) => {
    const query = String(filter || "").trim().toLowerCase();
    if (!query) return chains;
    return chains.filter((chain) => {
      const titleMatch = String(chain.title || "")
        .toLowerCase()
        .includes(query);
      const goalMatch = String(chain.goal || "")
        .toLowerCase()
        .includes(query);
      const stepMatch = (chain.steps || []).some((step) =>
        String(step.prompt || "")
          .toLowerCase()
          .includes(query),
      );
      return titleMatch || goalMatch || stepMatch;
    });
  };

  const ensureCardMenuDismissHandlers = () => {
    if (window.__PN_CHAIN_MENU_BOUND) return;
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
    window.__PN_CHAIN_MENU_BOUND = true;
  };

  const createCardMenu = (items = []) => {
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
      if (item.tone === "danger") {
        row.classList.add("pn-card-menu__item--danger");
      }
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
    return menu;
  };

  const renderList = async (filter = "") => {
    const container = getChainList();
    if (!container) return;
    container.innerHTML = "";
    for (let i = 0; i < 4; i += 1) {
      const skel = document.createElement("div");
      skel.className = "pn-skeleton";
      container.appendChild(skel);
    }

    await loadChains();
    await loadActiveRun();
    localState.searchQuery = String(filter || "");

    if (localState.activeRun?.status === "running") {
      startRunPolling();
    } else {
      stopRunPolling();
    }

    container.innerHTML = "";

    const visible = filterChains(localState.chains, filter);

    if (!visible.length) {
      container.appendChild(
        window.createEmptyState?.({
          title: "No chains yet",
          message: "Create a prompt chain to guide multi-step work.",
          actionLabel: "New Chain",
          onAction: () => {
            void openNewChain();
          },
        }) ||
          document.createElement("div"),
      );
      return;
    }

    visible.forEach((chain) => {
      const run = getRunForChain(chain.id);
      const card = document.createElement("article");
      card.className = "pn-prompt-card pn-chain-card";

      const title = document.createElement("h3");
      title.className = "pn-card-title";
      title.textContent = chain.title || "Untitled Chain";

      const text = document.createElement("p");
      text.className = "pn-card-text";
      text.textContent = chain.goal || "No goal provided yet.";

      const meta = document.createElement("p");
      meta.className = "pn-card-meta";
      const stepCount = chain.steps?.length || 0;
      meta.textContent = `${stepCount} step${stepCount === 1 ? "" : "s"} • Updated ${formatDate(chain.updatedAt)}`;

      if (run) {
        const status = document.createElement("span");
        status.className = "pn-chain-status-pill";
        status.dataset.status = run.status;
        status.textContent =
          run.status === "running"
            ? "Running"
            : run.status === "paused"
              ? "Paused"
              : run.status === "completed"
                ? "Completed"
                : "Inactive";
        meta.appendChild(document.createTextNode(" "));
        meta.appendChild(status);
      }

      const actions = document.createElement("div");
      actions.className = "pn-card-actions";

      const primary = document.createElement("button");
      primary.type = "button";
      primary.className = "pn-btn pn-btn--primary pn-card-actions__primary";
      if (run?.status === "paused") {
        primary.textContent = "Resume";
        primary.addEventListener("click", () => {
          void (async () => {
            await openChain(chain.id);
            await resumeRun();
          })();
        });
      } else if (run?.status === "running") {
        primary.textContent = "View Run";
        primary.addEventListener("click", () => {
          void openChain(chain.id);
        });
      } else {
        primary.textContent = "Run";
        primary.addEventListener("click", () => {
          void (async () => {
            await openChain(chain.id);
            await startRun();
          })();
        });
      }

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "pn-btn pn-btn--ghost";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => {
        void openChain(chain.id);
      });

      actions.appendChild(primary);
      actions.appendChild(edit);

      const menu = createCardMenu([
        {
          label: "Duplicate",
          title: "Duplicate this chain",
          onSelect: async () => {
            const dup = await ChainStore.duplicateChain(chain.id);
            if (dup) {
              await renderList(localState.searchQuery);
              await showToast("Chain duplicated.");
            } else {
              await showToast("Duplicate failed. Try again.");
            }
          },
        },
        {
          label: "Delete",
          title: "Delete this chain",
          tone: "danger",
          onSelect: async () => {
            const confirmed = await (window.PnDialog || window).confirm(
              `Delete "${chain.title}"?`,
              { title: "Delete Chain", confirmLabel: "Delete", danger: true },
            );
            if (!confirmed) return;
            await ChainStore.deleteChain(chain.id);
            if (localState.activeRun?.chainId === chain.id) {
              await clearActiveRun();
            }
            await renderList(localState.searchQuery);
            await showToast("Chain deleted.");
          },
        },
      ]);

      const actionsWrap = document.createElement("div");
      actionsWrap.className = "pn-chain-card-actions";
      actionsWrap.appendChild(actions);
      actionsWrap.appendChild(menu);

      card.appendChild(title);
      card.appendChild(text);
      card.appendChild(meta);
      card.appendChild(actionsWrap);
      container.appendChild(card);
    });
  };

  const buildEmptyChain = () => ({
    id: crypto.randomUUID(),
    title: "Untitled Chain",
    goal: "",
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: [],
  });

  const openNewChain = async () => {
    localState.activeChain = buildEmptyChain();
    await loadActiveRun();
    setMode("editor");
    await renderEditor();
  };

  const openChain = async (id) => {
    const chain = await ChainStore.getChainById(id);
    if (!chain) {
      await showToast("Chain not found. Refresh and try again.");
      return;
    }
    localState.activeChain = chain;
    await loadActiveRun();
    setMode("editor");
    await renderEditor();
  };

  const updateStepInRun = (stepId, updates) => {
    const run = localState.activeRun;
    if (!run || run.status === "completed" || run.status === "failed") return;
    if (run.chainId !== localState.activeChain?.id) return;
    const step = run.steps.find((s) => s.id === stepId);
    if (!step || step.status === "completed") return;
    Object.assign(step, updates);
    void setActiveRun(run);
  };

  const rebuildRunStepsFromChain = () => {
    const run = localState.activeRun;
    const chain = localState.activeChain;
    if (!run || !chain || run.chainId !== chain.id) return;
    const map = new Map(run.steps.map((step) => [step.id, step]));
    run.steps = chain.steps.map((step, index) => {
      const existing = map.get(step.id);
      if (existing) {
        return {
          ...existing,
          title: step.title,
          prompt: step.prompt,
        };
      }
      return {
        ...ChainStore.normalizeRunStep(step, index),
        status: "pending",
      };
    });
    const nextIndex = run.steps.findIndex(
      (step) => step.status !== "completed",
    );
    run.currentStepIndex = nextIndex >= 0 ? nextIndex : run.steps.length - 1;
    void setActiveRun(run);
  };

  const renderEditor = async () => {
    const chain = localState.activeChain;
    if (!chain) return;
    const editor = getEditorRoot();
    if (!editor) return;

    const run = getRunForChain(chain.id);
    if (run?.status === "running") {
      startRunPolling();
    } else {
      stopRunPolling();
    }
    const isEditingLocked = getEditableGuard(run);

    editor.innerHTML = "";

    const toolbar = document.createElement("div");
    toolbar.className = "pn-chain-editor-toolbar";

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "pn-btn pn-btn--ghost pn-chain-back-btn";
    backBtn.textContent = "Back";
    backBtn.addEventListener("click", () => {
      setMode("list");
      void renderList(localState.searchQuery);
    });

    const actions = document.createElement("div");
    actions.className = "pn-chain-editor-actions";

    const runBtn = document.createElement("button");
    runBtn.type = "button";
    runBtn.className = "pn-btn pn-btn--primary";

    const pauseBtn = document.createElement("button");
    pauseBtn.type = "button";
    pauseBtn.className = "pn-btn pn-btn--ghost";

    const branchBtn = document.createElement("button");
    branchBtn.type = "button";
    branchBtn.className = "pn-btn pn-btn--ghost";
    branchBtn.textContent = "Branch Remaining";

    if (!run || run.status === "completed" || run.status === "failed") {
      runBtn.textContent = run ? "Run Again" : "Run Chain";
      runBtn.addEventListener("click", () => void startRun());
      pauseBtn.classList.add("pn-hidden");
      branchBtn.classList.add("pn-hidden");
    } else if (run.status === "paused") {
      runBtn.textContent = "Resume";
      runBtn.addEventListener("click", () => void resumeRun());
      pauseBtn.classList.add("pn-hidden");
      if (run.currentStepIndex < run.steps.length) {
        branchBtn.addEventListener("click", () => void branchRemainingSteps());
      } else {
        branchBtn.classList.add("pn-hidden");
      }
    } else {
      runBtn.textContent = "Running";
      runBtn.disabled = true;
      runBtn.classList.add("pn-loading-state");
      pauseBtn.textContent = run.execution?.pauseAfterStep
        ? "Pausing..."
        : "Pause";
      pauseBtn.disabled = Boolean(run.execution?.pauseAfterStep);
      pauseBtn.addEventListener("click", () => void requestPause("manual"));
      branchBtn.classList.add("pn-hidden");
    }

    actions.appendChild(runBtn);
    actions.appendChild(pauseBtn);
    actions.appendChild(branchBtn);

    toolbar.appendChild(backBtn);
    toolbar.appendChild(actions);

    const statusLine = document.createElement("p");
    statusLine.className = "pn-card-meta pn-chain-status-line";
    if (run) {
      const stepTotal = run.steps.length;
      const stepIndex = Math.min(run.currentStepIndex + 1, stepTotal || 0);
      const statusLabel =
        run.status === "running"
          ? "Running"
          : run.status === "paused"
            ? "Paused"
            : run.status === "completed"
              ? "Completed"
              : "Idle";
      statusLine.textContent = stepTotal
        ? `${statusLabel} • Step ${stepIndex} of ${stepTotal}`
        : statusLabel;
      if (run.execution?.pauseAfterStep) {
        statusLine.textContent += " • Pausing after response";
      }
    } else {
      statusLine.textContent = "Ready";
    }

    const titleField = document.createElement("label");
    titleField.className = "pn-field";
    const titleLabel = document.createElement("span");
    titleLabel.textContent = "Chain Title";
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.value = chain.title || "";
    titleInput.maxLength = 80;
    titleInput.disabled = isEditingLocked;
    titleInput.addEventListener("input", (event) => {
      chain.title = normalizeChainTitle(event.target.value, chain.goal);
      scheduleAutosave();
    });
    titleField.appendChild(titleLabel);
    titleField.appendChild(titleInput);

    const goalField = document.createElement("label");
    goalField.className = "pn-field";
    const goalLabel = document.createElement("span");
    goalLabel.textContent = "Goal";
    const goalInput = document.createElement("textarea");
    goalInput.rows = 3;
    goalInput.placeholder = "Describe the outcome you want to achieve...";
    goalInput.value = chain.goal || "";
    goalInput.disabled = isEditingLocked;
    goalInput.addEventListener("input", (event) => {
      chain.goal = clampText(event.target.value, 5000);
      const currentTitle = String(chain.title || "").trim();
      const shouldDerive =
        !currentTitle || currentTitle.toLowerCase() === "untitled chain";
      chain.title = shouldDerive
        ? normalizeChainTitle("", chain.goal)
        : normalizeChainTitle(currentTitle, chain.goal);
      scheduleAutosave();
    });
    goalField.appendChild(goalLabel);
    goalField.appendChild(goalInput);

    const goalActions = document.createElement("div");
    goalActions.className = "pn-chain-goal-actions";
    const generateBtn = document.createElement("button");
    generateBtn.type = "button";
    generateBtn.className = "pn-btn pn-btn--ghost";
    generateBtn.textContent = chain.steps?.length ? "Regenerate Steps" : "Generate Steps";
    const hasActiveRun = Boolean(run && run.status !== "completed" && run.status !== "failed");
    generateBtn.disabled = isEditingLocked || hasActiveRun;
    generateBtn.addEventListener("click", () => {
      void generateSteps();
    });
    goalActions.appendChild(generateBtn);

    const stepsWrap = document.createElement("div");
    stepsWrap.className = "pn-chain-steps-wrap";

    const stepsHeader = document.createElement("div");
    stepsHeader.className = "pn-chain-steps-header";
    const stepsTitle = document.createElement("h3");
    stepsTitle.className = "pn-section-title";
    stepsTitle.textContent = "Steps";
    stepsHeader.appendChild(stepsTitle);

    const stepsContainer = document.createElement("div");
    stepsContainer.className = "pn-list pn-chain-steps";
    stepsContainer.id = "pn-chain-steps";

    const steps = Array.isArray(chain.steps) ? chain.steps : [];
    if (!steps.length) {
      stepsContainer.appendChild(
        window.createEmptyState?.({
          title: "No steps yet",
          message:
            "Generate steps from your goal, or add them manually.",
          actionLabel: "Add Step",
          onAction: () => {
            addStepAfter(null);
          },
        }) ||
          document.createElement("div"),
      );
    } else {
      steps.forEach((step, index) => {
        const runStep = run?.steps?.find((s) => s.id === step.id) || null;
        let status =
          runStep?.status ||
          (step.statusDraft && String(step.statusDraft)) ||
          "pending";
        if (
          run &&
          run.status === "paused" &&
          run.currentStepIndex === index &&
          status === "pending"
        ) {
          status = "paused";
        }

        const card = document.createElement("article");
        card.className = "pn-prompt-card pn-chain-step-card";
        card.dataset.stepId = step.id;
        card.dataset.status = status;

        const head = document.createElement("div");
        head.className = "pn-chain-step-head";

        const drag = document.createElement("button");
        drag.type = "button";
        drag.className = "pn-chain-drag";
        drag.title = "Drag to reorder";
        drag.draggable = !isEditingLocked;
        drag.disabled = isEditingLocked;
        drag.dataset.stepId = step.id;
        drag.innerHTML =
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="17" x2="20" y2="17"></line></svg>';
        drag.addEventListener("dragstart", (event) => {
          if (isEditingLocked) return;
          event.dataTransfer?.setData("text/plain", step.id);
          event.dataTransfer.effectAllowed = "move";
          card.classList.add("pn-dragging");
        });
        drag.addEventListener("dragend", () => {
          card.classList.remove("pn-dragging");
        });

        const statusPill = document.createElement("span");
        statusPill.className = "pn-chain-step-status";
        statusPill.dataset.status = status;
        statusPill.textContent =
          status === "completed"
            ? "Done"
            : status === "active"
              ? "Active"
              : status === "paused"
                ? "Paused"
                : "Pending";

        head.appendChild(drag);
        head.appendChild(statusPill);

        const titleLabelRow = document.createElement("label");
        titleLabelRow.className = "pn-field";
        const titleSpan = document.createElement("span");
        titleSpan.textContent = `Step ${index + 1} Title`;
        const titleInput = document.createElement("input");
        titleInput.type = "text";
        titleInput.value = step.title || `Step ${index + 1}`;
        titleInput.maxLength = 80;
        titleInput.disabled = isEditingLocked;
        titleInput.addEventListener("input", (event) => {
          step.title = clampText(event.target.value, 80) || `Step ${index + 1}`;
          scheduleAutosave();
          updateStepInRun(step.id, { title: step.title });
        });
        titleLabelRow.appendChild(titleSpan);
        titleLabelRow.appendChild(titleInput);

        const promptLabelRow = document.createElement("label");
        promptLabelRow.className = "pn-field";
        const promptSpan = document.createElement("span");
        promptSpan.textContent = "Prompt";
        const promptInput = document.createElement("textarea");
        promptInput.rows = 4;
        promptInput.value = step.prompt || "";
        promptInput.placeholder = "Write the prompt for this step...";
        promptInput.disabled = isEditingLocked;
        promptInput.addEventListener("input", (event) => {
          step.prompt = clampText(event.target.value, 12000);
          scheduleAutosave();
          updateStepInRun(step.id, { prompt: step.prompt });
        });
        promptLabelRow.appendChild(promptSpan);
        promptLabelRow.appendChild(promptInput);

        const stepActions = document.createElement("div");
        stepActions.className = "pn-card-actions";

        const improveBtn = document.createElement("button");
        improveBtn.type = "button";
        improveBtn.className = "pn-btn pn-btn--ghost";
        improveBtn.textContent = "Improve";
        improveBtn.disabled = isEditingLocked;
        improveBtn.addEventListener("click", () => {
          void improveStep(step.id, improveBtn);
        });

        const addBelowBtn = document.createElement("button");
        addBelowBtn.type = "button";
        addBelowBtn.className = "pn-btn pn-btn--ghost";
        addBelowBtn.textContent = "Add below";
        addBelowBtn.disabled = isEditingLocked;
        addBelowBtn.addEventListener("click", () => {
          addStepAfter(step.id);
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "pn-btn pn-btn--ghost pn-btn-danger";
        deleteBtn.textContent = "Delete";
        deleteBtn.disabled = isEditingLocked;
        deleteBtn.addEventListener("click", () => {
          void deleteStep(step.id);
        });

        stepActions.appendChild(improveBtn);
        stepActions.appendChild(addBelowBtn);
        stepActions.appendChild(deleteBtn);

        card.appendChild(head);
        card.appendChild(titleLabelRow);
        card.appendChild(promptLabelRow);
        card.appendChild(stepActions);
        stepsContainer.appendChild(card);
      });
    }

    const addStepBtn = document.createElement("button");
    addStepBtn.type = "button";
    addStepBtn.className = "pn-btn pn-btn--ghost pn-chain-add-step";
    addStepBtn.textContent = "Add Step";
    addStepBtn.disabled = isEditingLocked;
    addStepBtn.addEventListener("click", () => {
      addStepAfter(null);
    });

    stepsWrap.appendChild(stepsHeader);
    stepsWrap.appendChild(stepsContainer);
    stepsWrap.appendChild(addStepBtn);

    editor.appendChild(toolbar);
    editor.appendChild(statusLine);
    editor.appendChild(titleField);
    editor.appendChild(goalField);
    editor.appendChild(goalActions);
    editor.appendChild(stepsWrap);

    bindStepDragHandlers(stepsContainer);
  };

  const bindStepDragHandlers = (container) => {
    if (!container || container.dataset.bound) return;
    container.dataset.bound = "1";

    container.addEventListener("dragover", (event) => {
      event.preventDefault();
      const targetCard = event.target.closest(".pn-chain-step-card");
      if (targetCard) {
        targetCard.classList.add("pn-drop-target");
      }
    });

    container.addEventListener("dragleave", (event) => {
      const leavingCard = event.target.closest(".pn-chain-step-card");
      if (!leavingCard) return;
      if (!leavingCard.contains(event.relatedTarget)) {
        leavingCard.classList.remove("pn-drop-target");
      }
    });

    container.addEventListener("drop", (event) => {
      event.preventDefault();
      container
        .querySelectorAll(".pn-chain-step-card.pn-drop-target")
        .forEach((node) => node.classList.remove("pn-drop-target"));
      const fromId = event.dataTransfer?.getData("text/plain");
      const targetCard = event.target.closest(".pn-chain-step-card");
      const toId = targetCard?.dataset?.stepId;
      if (!fromId || !toId || fromId === toId) return;
      const currentRun = getRunForChain(localState.activeChain?.id || "");
      reorderSteps(fromId, toId, currentRun);
    });
  };

  const reorderSteps = (fromId, toId, run) => {
    const chain = localState.activeChain;
    if (!chain) return;
    if (run?.status === "running") {
      void showToast("Pause the chain to reorder steps.");
      return;
    }
    const steps = Array.isArray(chain.steps) ? chain.steps : [];
    const fromIndex = steps.findIndex((s) => s.id === fromId);
    const toIndex = steps.findIndex((s) => s.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;

    if (run?.status === "paused" && fromIndex < run.currentStepIndex) {
      void showToast("Completed steps can’t be reordered.");
      return;
    }
    if (run?.status === "paused" && toIndex < run.currentStepIndex) {
      void showToast("Move steps within the remaining queue.");
      return;
    }

    const [moved] = steps.splice(fromIndex, 1);
    steps.splice(toIndex, 0, moved);
    chain.steps = steps;
    rebuildRunStepsFromChain();
    scheduleAutosave();
    void renderEditor();
  };

  const addStepAfter = (stepId) => {
    const chain = localState.activeChain;
    if (!chain) return;
    const steps = Array.isArray(chain.steps) ? chain.steps : [];
    const newStep = {
      id: crypto.randomUUID(),
      title: `Step ${steps.length + 1}`,
      prompt: "",
      statusDraft: "pending",
    };

    if (!stepId) {
      steps.push(newStep);
    } else {
      const index = steps.findIndex((step) => step.id === stepId);
      if (index >= 0) {
        steps.splice(index + 1, 0, newStep);
      } else {
        steps.push(newStep);
      }
    }

    chain.steps = steps;
    scheduleAutosave();
    void renderEditor();
  };

  const deleteStep = async (stepId) => {
    const chain = localState.activeChain;
    if (!chain) return;
    const steps = Array.isArray(chain.steps) ? chain.steps : [];
    const step = steps.find((s) => s.id === stepId);
    if (!step) return;
    const confirmed = await (window.PnDialog || window).confirm(
      `Delete "${step.title}"?`,
      { title: "Delete Step", confirmLabel: "Delete", danger: true },
    );
    if (!confirmed) return;
    chain.steps = steps.filter((s) => s.id !== stepId);
    rebuildRunStepsFromChain();
    scheduleAutosave();
    void renderEditor();
  };

  const improveStep = async (stepId, button) => {
    const chain = localState.activeChain;
    if (!chain) return;
    if (!state.settings?.enableAI) {
      await showToast("Enable AI in Settings to improve steps.");
      return;
    }
    const step = chain.steps.find((s) => s.id === stepId);
    if (!step || !step.prompt) {
      await showToast("Add a prompt before improving.");
      return;
    }
    if (!window.AIBridge?.improvePrompt) {
      await showToast("AI not available. Check Settings and try again.");
      return;
    }

    if (button) {
      button.disabled = true;
      button.classList.add("pn-loading-state");
    }

    try {
      const response = await window.AIBridge.improvePrompt(step.prompt, [], "general");
      if (response?.ok && response.text) {
        step.prompt = clampText(response.text, 12000);
        scheduleAutosave();
        updateStepInRun(stepId, { prompt: step.prompt });
        await showToast("Step improved.");
        await renderEditor();
      } else {
        await showToast(response?.error || "Improve failed. Try again.");
      }
    } catch (error) {
      await showToast(error?.message || "Improve failed. Try again.");
    } finally {
      if (button) {
        button.disabled = false;
        button.classList.remove("pn-loading-state");
      }
    }
  };

  const generateSteps = async () => {
    const chain = localState.activeChain;
    if (!chain) return;
    const run = getRunForChain(chain.id);
    if (run && run.status !== "completed" && run.status !== "failed") {
      await showToast("Finish or reset the run before regenerating steps.");
      return;
    }
    if (!state.settings?.enableAI) {
      await showToast("Enable AI in Settings to generate steps.");
      return;
    }
    if (!window.AIBridge?.generatePromptChain) {
      await showToast("AI not available. Check Settings and try again.");
      return;
    }
    const goal = String(chain.goal || "").trim();
    if (!goal) {
      await showToast("Add a goal first.");
      return;
    }

    if (chain.steps?.length) {
      const confirmed = await (window.PnDialog || window).confirm(
        "Replace existing steps with a new AI-generated sequence?",
        { title: "Regenerate Steps", confirmLabel: "Replace", danger: true },
      );
      if (!confirmed) return;
    }

    const button = document.querySelector(".pn-chain-goal-actions .pn-btn");
    if (button) {
      button.disabled = true;
      button.classList.add("pn-loading-state");
    }

    try {
      const response = await window.AIBridge.generatePromptChain(goal, "", "full");
      if (!response?.ok || !Array.isArray(response.steps)) {
        await showToast(response?.error || "Step generation failed. Try again.");
        return;
      }

      const nextSteps = response.steps.map((step, index) => ({
        id: crypto.randomUUID(),
        title:
          clampText(step.title || "", 80) ||
          `Step ${index + 1}`,
        prompt: clampText(step.prompt || "", 12000),
        statusDraft: "pending",
      }));

      chain.title = normalizeChainTitle(response.title || chain.title, goal);
      const filtered = nextSteps.filter((step) => step.prompt);
      if (!filtered.length) {
        await showToast("No usable steps returned. Refine the goal and try again.");
        return;
      }
      chain.steps = filtered;
      scheduleAutosave();
      await renderEditor();
      await showToast("Steps generated.");
    } catch (error) {
      await showToast(error?.message || "Step generation failed. Try again.");
    } finally {
      if (button) {
        button.disabled = false;
        button.classList.remove("pn-loading-state");
      }
    }
  };

  const prepareRunContext = async () => {
    const context = await window.getActiveTabContext?.();
    if (!context?.tabId) {
      await showToast("No active tab found. Open a supported LLM tab and retry.");
      return null;
    }
    if (!context.supported) {
      await showToast("Open a supported LLM tab first.");
      return null;
    }

    const platformResp = await chrome.tabs
      .sendMessage(context.tabId, { action: "getPlatform" })
      .catch(() => null);

    return {
      tabId: context.tabId,
      platform: String(platformResp?.platform || "unknown").trim(),
    };
  };

  const startRun = async () => {
    const chain = localState.activeChain;
    if (!chain) return;
    const hasSteps = Array.isArray(chain.steps) && chain.steps.length > 0;
    if (!hasSteps) {
      await showToast("Add steps before running.");
      return;
    }
    const incomplete = chain.steps.some((s) => !String(s.prompt || "").trim());
    if (incomplete) {
      await showToast("Fill in all step prompts before running.");
      return;
    }

    const active = await loadActiveRun();
    if (active && active.status !== "completed") {
      const isSame = active.chainId === chain.id;
      const confirmed = await (window.PnDialog || window).confirm(
        isSame
          ? "Restart this chain from step 1?"
          : "Another chain is active. Replace it with this run?",
        {
          title: isSame ? "Restart Chain" : "Replace Active Run",
          confirmLabel: isSame ? "Restart" : "Replace",
          danger: true,
        },
      );
      if (!confirmed) return;
      await clearActiveRun();
    }

    const context = await prepareRunContext();
    if (!context) return;

    const run = ChainStore.createRunFromChain(chain, context);
    run.status = "running";
    run.currentStepIndex = 0;
    if (run.steps[0]) {
      run.steps[0].status = "active";
    }
    run.execution.waitPhase = "idle";
    run.execution.pauseAfterStep = false;
    await setActiveRun(run);

    await saveActiveChain();
    await dispatchStep(run, 0);
  };

  const resumeRun = async () => {
    const run = localState.activeRun;
    const chain = localState.activeChain;
    if (!run || !chain || run.chainId !== chain.id) return;
    if (run.status !== "paused") return;

    const context = await prepareRunContext();
    if (!context) return;
    run.tabId = context.tabId;
    run.platform = context.platform;

    run.status = "running";
    run.execution.pauseAfterStep = false;
    run.execution.waitPhase = "idle";
    if (run.steps[run.currentStepIndex]) {
      run.steps[run.currentStepIndex].status = "active";
    }
    await setActiveRun(run);
    await dispatchStep(run, run.currentStepIndex);
  };

  const requestPause = async (_reason = "") => {
    const run = localState.activeRun;
    if (!run || run.status !== "running") return;
    if (run.execution?.waitPhase === "awaiting" || run.execution?.waitPhase === "streaming") {
      run.execution.pauseAfterStep = true;
      await setActiveRun(run);
      await renderEditor();
      if (shouldToast()) {
        await showToast("Pausing after this response.");
      }
      return;
    }
    run.status = "paused";
    run.execution.pauseAfterStep = false;
    run.execution.waitPhase = "idle";
    if (run.steps[run.currentStepIndex]) {
      run.steps[run.currentStepIndex].status = "paused";
    }
    await setActiveRun(run);
    stopRunPolling();
    await renderEditor();
    if (shouldToast()) {
      await showToast("Chain paused.");
    }
  };

  const completeStep = async (run, index) => {
    if (!run.steps[index]) return;
    run.steps[index].status = "completed";
    run.steps[index].completedAt = Date.now();
    run.execution.waitPhase = "idle";
    await setActiveRun(run);
  };

  const advanceRun = async (run) => {
    const nextIndex = run.currentStepIndex + 1;
    if (!run.steps[nextIndex]) {
      run.status = "completed";
      run.execution.waitPhase = "idle";
      await setActiveRun(run);
      stopRunPolling();
      await renderEditor();
      await showToast("Chain completed.");
      return;
    }

    if (run.execution?.pauseAfterStep) {
      run.status = "paused";
      run.execution.pauseAfterStep = false;
      run.execution.waitPhase = "idle";
      run.currentStepIndex = nextIndex;
      if (run.steps[nextIndex]) {
        run.steps[nextIndex].status = "paused";
      }
      await setActiveRun(run);
      stopRunPolling();
      await renderEditor();
      return;
    }

    run.currentStepIndex = nextIndex;
    run.steps[nextIndex].status = "active";
    await setActiveRun(run);
    await dispatchStep(run, nextIndex);
  };

  const dispatchStep = async (run, index) => {
    const step = run.steps[index];
    if (!step) return;
    const baseline = await fetchConversationFingerprint(run.tabId);
    if (baseline) {
      run.execution.lastFingerprint = computeFingerprint(baseline);
      run.execution.assistantCount = Number(baseline.assistantCount) || 0;
    } else {
      run.execution.lastFingerprint = "";
      run.execution.assistantCount = 0;
    }

    const response = await chrome.tabs
      .sendMessage(run.tabId, { action: "injectPrompt", text: step.prompt })
      .catch(() => null);
    if (!response?.ok) {
      run.status = "paused";
      run.execution.waitPhase = "idle";
      step.status = "paused";
      await setActiveRun(run);
      stopRunPolling();
      await renderEditor();
      await showToast(
        response?.error ||
          "Injection failed. Check the active tab and try again.",
      );
      return;
    }

    step.sentAt = Date.now();
    run.execution.waitPhase = "awaiting";
    await setActiveRun(run);
    await renderEditor();
    startRunPolling();
  };

  const startRunPolling = () => {
    stopRunPolling();
    localState.pollTimer = setInterval(() => {
      void checkRunProgress();
    }, POLL_INTERVAL_MS);
  };

  const checkRunProgress = async () => {
    const run = localState.activeRun;
    if (!run || run.status !== "running") return;
    if (!run.steps[run.currentStepIndex]) return;
    if (run.execution?.waitPhase !== "awaiting" && run.execution?.waitPhase !== "streaming") return;

    const fingerprint = await fetchConversationFingerprint(run.tabId);
    if (!fingerprint) {
      run.status = "paused";
      run.execution.waitPhase = "idle";
      await setActiveRun(run);
      stopRunPolling();
      await renderEditor();
      if (shouldToast()) {
        await showToast(
          "Chain paused — open a supported LLM tab to resume.",
        );
      }
      return;
    }

    const nextFingerprint = computeFingerprint(fingerprint);
    if (nextFingerprint !== run.execution.lastFingerprint) {
      run.execution.lastFingerprint = nextFingerprint;
      run.execution.lastEventAt = Date.now();
      run.execution.assistantCount = Number(fingerprint.assistantCount) || 0;
      run.execution.waitPhase = "streaming";
      await setActiveRun(run);
      return;
    }

    if (
      run.execution.waitPhase === "streaming" &&
      Date.now() - (run.execution.lastEventAt || 0) >= RESPONSE_STABLE_MS
    ) {
      await completeStep(run, run.currentStepIndex);
      await advanceRun(run);
    }
  };

  const branchRemainingSteps = async () => {
    const run = localState.activeRun;
    const chain = localState.activeChain;
    if (!run || !chain || run.chainId !== chain.id) return;
    if (run.status !== "paused") {
      await showToast("Pause the chain before branching.");
      return;
    }
    if (!run.tabId) {
      await showToast("No active tab found. Open a supported LLM tab and retry.");
      return;
    }

    if (!state.settings?.enableAI) {
      await showToast("Enable AI in Settings to branch steps.");
      return;
    }
    if (!window.AIBridge?.generatePromptChain) {
      await showToast("AI not available. Check Settings and try again.");
      return;
    }

    const note = await (window.PnDialog || window).prompt(
      "Add any new direction for the remaining steps (optional).",
      "",
      { title: "Branch Chain", placeholder: "Focus on… (optional)" },
    );
    if (note === null) return;

    const response = await chrome.tabs
      .sendMessage(run.tabId, { action: "scrapeForContinuation" })
      .catch(() => null);
    const messages = Array.isArray(response?.messages) ? response.messages : [];
    const contextSnippet = messages
      .slice(-6)
      .map((m) => `${m.role}: ${m.text}`.trim())
      .filter(Boolean)
      .join("\n\n");

    const branchContext = [contextSnippet, String(note || "").trim()]
      .filter(Boolean)
      .join("\n\n");

    const ai = await window.AIBridge.generatePromptChain(
      chain.goal,
      branchContext,
      "branch",
    );
    if (!ai?.ok || !Array.isArray(ai.steps)) {
      await showToast(ai?.error || "Branching failed. Try again.");
      return;
    }

    const completed = chain.steps.slice(0, run.currentStepIndex);
    const nextSteps = ai.steps.map((step, index) => ({
      id: crypto.randomUUID(),
      title: clampText(step.title || "", 80) || `Step ${completed.length + index + 1}`,
      prompt: clampText(step.prompt || "", 12000),
      statusDraft: "pending",
    }));

    const merged = [...completed, ...nextSteps].filter((step) => step.prompt);
    if (merged.length === completed.length) {
      await showToast("No new steps generated. Refine the branch request and try again.");
      return;
    }
    chain.steps = merged;
    chain.title = normalizeChainTitle(ai.title || chain.title, chain.goal);

    rebuildRunStepsFromChain();
    scheduleAutosave();
    await renderEditor();
    await showToast("Remaining steps updated.");
  };

  const render = async (filter = "") => {
    if (state.activeTab !== "chains") {
      return;
    }
    if (localState.mode === "editor") {
      await renderEditor();
    } else {
      await renderList(filter);
    }
  };

  const bindEvents = () => {
    if (localState.bound) return;
    localState.bound = true;

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        void requestPause();
      }
    });
    window.addEventListener("beforeunload", () => {
      void requestPause();
    });
  };

  window.ChainsUI = {
    render,
    openNewChain,
    openChain,
    bindEvents,
    startRun,
    resumeRun,
    requestPause,
  };
})();
