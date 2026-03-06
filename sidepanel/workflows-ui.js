(() => {
  /**
   * File: sidepanel/workflows-ui.js
   * Purpose: Workflows tab list rendering and basic chain CRUD actions.
   */

  const callbacks = {
    onOpenPrompts: null,
  };

  const getStepLabel = (count) => {
    const total = Number.isFinite(Number(count))
      ? Math.max(0, Number(count))
      : 0;
    return `${total} step${total === 1 ? "" : "s"}`;
  };

  const getDateLabel = (value) => {
    const stamp = String(value || "").trim();
    if (!stamp) return "Just now";
    try {
      return new Date(stamp).toLocaleString();
    } catch (_error) {
      return "Just now";
    }
  };

  const createWorkflowCard = async (workflow) => {
    const card = document.createElement("article");
    card.className = "pn-history-card";

    const title = document.createElement("h3");
    title.className = "pn-card-title";
    title.textContent =
      String(workflow?.name || "Untitled chain").trim() || "Untitled chain";

    const meta = document.createElement("p");
    meta.className = "pn-card-meta";
    meta.textContent = `${getStepLabel(workflow?.steps?.length || 0)} • Updated ${getDateLabel(workflow?.updatedAt)}`;

    const description = document.createElement("p");
    description.className = "pn-card-text";
    description.textContent =
      String(workflow?.description || "No description yet.").trim() ||
      "No description yet.";

    const actions = document.createElement("div");
    actions.className = "pn-card-actions";

    const renameButton = document.createElement("button");
    renameButton.className = "pn-btn pn-btn--ghost";
    renameButton.type = "button";
    renameButton.textContent = "Rename";
    renameButton.addEventListener("click", () => {
      void (async () => {
        const nextName = await (window.PnDialog || window).prompt(
          "Rename chain:",
          workflow.name || "Untitled chain",
          { title: "Rename Chain" },
        );
        if (nextName === null) {
          return;
        }
        const normalized = String(nextName || "").trim();
        if (!normalized) {
          await showToast("Chain name cannot be empty.");
          return;
        }
        const updated = await window.Store.updateWorkflow(workflow.id, {
          name: normalized,
        });
        if (!updated) {
          await showToast("Rename failed.");
          return;
        }
        await render();
        await showToast("Chain renamed.");
      })();
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "pn-btn pn-btn-danger";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      void (async () => {
        const confirmed = await (window.PnDialog || window).confirm(
          `Delete chain "${workflow.name || "Untitled chain"}"?`,
          { title: "Delete Chain", confirmLabel: "Delete", danger: true },
        );
        if (!confirmed) {
          return;
        }
        const deleted = await window.Store.deleteWorkflow(workflow.id);
        if (!deleted) {
          await showToast("Delete failed.");
          return;
        }
        await render();
        await showToast("Chain deleted.");
      })();
    });

    actions.appendChild(renameButton);
    actions.appendChild(deleteButton);

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(description);
    card.appendChild(actions);

    return card;
  };

  const render = async () => {
    const list = document.getElementById("pn-workflow-list");
    if (!list) {
      return;
    }

    const workflows = await window.Store.getWorkflows();
    list.innerHTML = "";

    if (!workflows.length) {
      list.appendChild(
        createEmptyState({
          title: "No chains yet",
          message: "Create a chain to group prompts into a reusable workflow.",
          actionLabel: "Create your first chain",
          onAction: () => {
            const button = document.getElementById("pn-workflow-create");
            button?.click();
          },
        }),
      );
      return;
    }

    for (const workflow of workflows) {
      list.appendChild(await createWorkflowCard(workflow));
    }
  };

  const createWorkflow = async () => {
    const name = await (window.PnDialog || window).prompt(
      "Name your chain:",
      "",
      { title: "Create Chain" },
    );
    if (name === null) {
      return;
    }

    const normalized = String(name || "").trim();
    if (!normalized) {
      await showToast("Chain name cannot be empty.");
      return;
    }

    const saved = await window.Store.saveWorkflow({
      name: normalized,
      description: "",
      steps: [],
    });

    if (!saved) {
      await showToast("Could not create chain.");
      return;
    }

    await render();
    await showToast("Chain created. Add steps next.");
  };

  const bindEvents = () => {
    const createButton = document.getElementById("pn-workflow-create");
    if (!createButton || createButton.dataset.bound === "1") {
      return;
    }

    createButton.dataset.bound = "1";
    createButton.addEventListener("click", () => {
      void createWorkflow();
    });
  };

  const setCallbacks = (nextCallbacks = {}) => {
    callbacks.onOpenPrompts = nextCallbacks.onOpenPrompts || null;
  };

  window.WorkflowsUI = {
    bindEvents,
    render,
    setCallbacks,
  };
})();
