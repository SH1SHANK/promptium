(() => {
  /**
   * File: utils/chains-storage.js
   * Purpose: Chain CRUD and active-run storage helpers shared across extension contexts.
   */

  const CHAINS_KEY = "promptChains";
  const ACTIVE_RUN_KEY = "promptiumActiveChainRun";
  const CHAIN_STATUSES = Object.freeze([
    "idle",
    "running",
    "paused",
    "completed",
    "failed",
  ]);
  const STEP_STATUSES = Object.freeze([
    "pending",
    "active",
    "completed",
    "paused",
    "failed",
  ]);

  const asObject = (value) =>
    value && typeof value === "object" ? value : {};

  const clampText = (value, limit = 6000) =>
    String(value || "")
      .trim()
      .slice(0, limit);

  const normalizeTags = (value) =>
    Array.isArray(value)
      ? value.map((tag) => String(tag || "").trim()).filter(Boolean)
      : [];

  const deriveChainTitle = (goal = "") => {
    const compact = clampText(goal, 240).replace(/\s+/g, " ").trim();
    if (!compact) return "Untitled Chain";
    const first = compact.split(/[.!?]/)[0]?.trim() || compact;
    return first.slice(0, 80) || "Untitled Chain";
  };

  const normalizeSavedStep = (step = {}, index = 0) => {
    const source = asObject(step);
    const stepId = String(source.id || "").trim() || crypto.randomUUID();
    return {
      id: stepId,
      title:
        clampText(source.title || "", 80) || `Step ${Math.max(1, index + 1)}`,
      prompt: clampText(source.prompt || source.text || "", 12000),
      statusDraft:
        STEP_STATUSES.includes(String(source.statusDraft || "").trim())
          ? String(source.statusDraft || "").trim()
          : "pending",
    };
  };

  const normalizeRunStep = (step = {}, index = 0) => {
    const source = normalizeSavedStep(step, index);
    const status = String(step?.status || "").trim();
    return {
      ...source,
      status: STEP_STATUSES.includes(status) ? status : "pending",
      sentAt: Number(step?.sentAt) || 0,
      completedAt: Number(step?.completedAt) || 0,
      pauseReason: clampText(step?.pauseReason || "", 240),
    };
  };

  const normalizeChain = (chain = {}) => {
    const source = asObject(chain);
    const steps = Array.isArray(source.steps)
      ? source.steps.map((step, index) => normalizeSavedStep(step, index))
      : [];
    const createdAt =
      String(source.createdAt || "").trim() || new Date().toISOString();
    return {
      id: String(source.id || "").trim() || crypto.randomUUID(),
      title: clampText(source.title || "", 80) || deriveChainTitle(source.goal),
      goal: clampText(source.goal || "", 5000),
      tags: normalizeTags(source.tags),
      createdAt,
      updatedAt:
        String(source.updatedAt || "").trim() || new Date().toISOString(),
      steps,
    };
  };

  const normalizeChainList = (chains) =>
    (Array.isArray(chains) ? chains : [])
      .map((chain) => normalizeChain(chain))
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      );

  const normalizeRunState = (run = {}) => {
    const source = asObject(run);
    const steps = Array.isArray(source.steps)
      ? source.steps.map((step, index) => normalizeRunStep(step, index))
      : [];
    const currentStepIndex = Math.max(0, Number(source.currentStepIndex) || 0);
    const runStatus = String(source.status || "").trim();
    return {
      chainId: String(source.chainId || "").trim(),
      tabId: Number(source.tabId) || 0,
      platform: String(source.platform || "").trim().toLowerCase(),
      startedAt: Number(source.startedAt) || Date.now(),
      updatedAt: Number(source.updatedAt) || Date.now(),
      status: CHAIN_STATUSES.includes(runStatus) ? runStatus : "idle",
      currentStepIndex: Math.min(
        steps.length ? steps.length - 1 : 0,
        currentStepIndex,
      ),
      steps,
      execution: {
        lastFingerprint: clampText(source.execution?.lastFingerprint || "", 400),
        assistantCount: Math.max(0, Number(source.execution?.assistantCount) || 0),
        waitPhase: clampText(source.execution?.waitPhase || "", 80),
        lastEventAt: Number(source.execution?.lastEventAt) || 0,
        pauseAfterStep: Boolean(source.execution?.pauseAfterStep),
      },
    };
  };

  const readKey = async (area, key) => {
    try {
      const snapshot = await chrome.storage[area].get([key]);
      return snapshot?.[key];
    } catch (_error) {
      return area === "session" ? null : [];
    }
  };

  const writeKey = async (area, key, value) => {
    await chrome.storage[area].set({ [key]: value });
    return value;
  };

  const getChains = async () => normalizeChainList(await readKey("local", CHAINS_KEY));

  const getChainById = async (id) => {
    const targetId = String(id || "").trim();
    if (!targetId) return null;
    const chains = await getChains();
    return chains.find((chain) => chain.id === targetId) || null;
  };

  const saveChain = async (payload = {}) => {
    const chains = await getChains();
    const source = normalizeChain(payload);
    const index = chains.findIndex((item) => item.id === source.id);
    const existing = index >= 0 ? chains[index] : null;
    const next = {
      ...source,
      createdAt: existing?.createdAt || source.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const nextChains =
      index >= 0
        ? chains.map((item) => (item.id === next.id ? next : item))
        : [next, ...chains];
    await writeKey("local", CHAINS_KEY, normalizeChainList(nextChains));
    return next;
  };

  const deleteChain = async (id) => {
    const targetId = String(id || "").trim();
    if (!targetId) return false;
    const chains = await getChains();
    await writeKey(
      "local",
      CHAINS_KEY,
      chains.filter((chain) => chain.id !== targetId),
    );
    return true;
  };

  const duplicateChain = async (id) => {
    const source = await getChainById(id);
    if (!source) return null;
    return saveChain({
      ...source,
      id: crypto.randomUUID(),
      title: `${source.title} Copy`.slice(0, 80),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: source.steps.map((step) => ({
        ...step,
        id: crypto.randomUUID(),
      })),
    });
  };

  const createRunFromChain = (chain = {}, context = {}) => {
    const normalizedChain = normalizeChain(chain);
    const steps = normalizedChain.steps.map((step, index) =>
      normalizeRunStep(
        {
          ...step,
          status: index === 0 ? "pending" : "pending",
          sentAt: 0,
          completedAt: 0,
          pauseReason: "",
        },
        index,
      ),
    );
    return normalizeRunState({
      chainId: normalizedChain.id,
      tabId: Number(context.tabId) || 0,
      platform: String(context.platform || "").trim().toLowerCase(),
      startedAt: Date.now(),
      updatedAt: Date.now(),
      status: "idle",
      currentStepIndex: Math.min(steps.length ? steps.length - 1 : 0, 0),
      steps,
      execution: {
        lastFingerprint: "",
        assistantCount: 0,
        waitPhase: "idle",
        lastEventAt: 0,
        pauseAfterStep: false,
      },
    });
  };

  const getActiveRun = async () => {
    const value = await readKey("session", ACTIVE_RUN_KEY);
    return value ? normalizeRunState(value) : null;
  };

  const setActiveRun = async (run) => {
    if (!run) {
      await chrome.storage.session.remove([ACTIVE_RUN_KEY]).catch(() => {});
      return null;
    }
    const normalized = normalizeRunState(run);
    await writeKey("session", ACTIVE_RUN_KEY, normalized);
    return normalized;
  };

  const clearActiveRun = async () => {
    await chrome.storage.session.remove([ACTIVE_RUN_KEY]).catch(() => {});
    return true;
  };

  const ChainStore = {
    CHAINS_KEY,
    ACTIVE_RUN_KEY,
    CHAIN_STATUSES,
    STEP_STATUSES,
    deriveChainTitle,
    normalizeSavedStep,
    normalizeRunStep,
    normalizeChain,
    normalizeChainList,
    normalizeRunState,
    getChains,
    getChainById,
    saveChain,
    deleteChain,
    duplicateChain,
    createRunFromChain,
    getActiveRun,
    setActiveRun,
    clearActiveRun,
  };

  if (typeof window !== "undefined") {
    Object.assign(window, { ChainStore });
  }
  if (typeof self !== "undefined") {
    self.ChainStore = ChainStore;
  }
})();
