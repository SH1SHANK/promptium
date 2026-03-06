(() => {
/**
 * File: utils/storage.js
 * Purpose: Provides prompt and history CRUD operations backed by chrome.storage.local.
 * Communicates with: popup/popup.js, content/toolbar.js, content/content.js, background/service_worker.js.
 */

const PROMPTS_KEY = 'prompts';
const HISTORY_KEY = 'chatHistory';
const WORKFLOWS_KEY = 'promptiumWorkflows';
const HISTORY_CAP = 50;
let lastStorageError = '';

const setLastStorageError = (error) => {
  lastStorageError = String(error?.message || error || '').trim();
};

const clearLastStorageError = () => {
  lastStorageError = '';
};

const isStorageQuotaError = (value) => /quota|QUOTA_BYTES|MAX_WRITE_OPERATIONS|MAX_ITEMS/i.test(String(value || ''));

/** Strips query/hash fragments from URLs before local persistence. */
const sanitizeStoredUrl = (value) => {
  try {
    const parsed = new URL(String(value || '').trim());
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch (_error) {
    return '';
  }
};

/** Stores only minimal, text-first message fields in history payloads. */
const normalizeHistoryMessages = (messages) => {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.map((message) => ({
    role: String(message?.role || 'assistant').trim().toLowerCase(),
    text: String(message?.text || '').trim().slice(0, 30000),
    timestamp: message?.timestamp ? String(message.timestamp) : undefined
  }));
};

const buildFallbackPromptSavePayload = ({ title, text, tags = [], category = null }) => ({
  title: String(title || '').trim(),
  text: String(text || '').trim(),
  tags: Array.isArray(tags) ? tags.map((item) => String(item || '').trim()).filter(Boolean) : [],
  category: category ? String(category).trim() : null,
  clarityScore: null,
  clarityExplanation: '',
  aiMeta: {
    paraphrase: null,
    title: null,
    clarity: null
  }
});

const preprocessPromptForSave = async (payload) => {
  const fallback = buildFallbackPromptSavePayload(payload || {});
  if (!fallback.text) {
    return fallback;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AI_PREPARE_PROMPT_SAVE',
      payload: fallback
    });

    if (response?.ok && response?.prompt && typeof response.prompt === 'object') {
      const prompt = response.prompt;
      return {
        title: String(prompt.title || fallback.title).trim() || fallback.title,
        text: String(prompt.text || fallback.text).trim() || fallback.text,
        tags: Array.isArray(prompt.tags) ? prompt.tags.map((item) => String(item || '').trim()).filter(Boolean) : fallback.tags,
        category: prompt.category ? String(prompt.category).trim() : fallback.category,
        clarityScore: Number.isFinite(Number(prompt.clarityScore)) ? Math.max(0, Math.min(100, Math.round(Number(prompt.clarityScore)))) : null,
        clarityExplanation: String(prompt.clarityExplanation || '').trim(),
        aiMeta: {
          paraphrase: String(response?.backend?.paraphrase || '').trim() || null,
          title: String(response?.backend?.title || '').trim() || null,
          clarity: String(response?.backend?.clarity || '').trim() || null
        }
      };
    }
  } catch (_error) {
    // Non-fatal: save should still succeed even when AI preprocessing is unavailable.
  }

  return fallback;
};

const detectTemplatePrompt = (text) => {
  try {
    if (window.TemplateParser?.hasVariables) {
      return Boolean(window.TemplateParser.hasVariables(String(text || '')));
    }
  } catch (_error) {
    return false;
  }
  return false;
};

const normalizeWorkflowStep = (step, index) => {
  const source = step && typeof step === 'object' ? step : {};
  const promptId = String(source.promptId || '').trim();
  const note = String(source.note || '').trim();
  return {
    id: String(source.id || crypto.randomUUID()),
    promptId,
    note,
    position: Number.isFinite(Number(source.position))
      ? Math.max(0, Math.floor(Number(source.position)))
      : index,
    advanceMode: String(source.advanceMode || 'manual').trim().toLowerCase() === 'auto'
      ? 'auto'
      : 'manual'
  };
};

const normalizeWorkflow = (workflow, existing = null) => {
  const source = workflow && typeof workflow === 'object' ? workflow : {};
  const createdAt = String(existing?.createdAt || source.createdAt || new Date().toISOString());
  const rawSteps = Array.isArray(source.steps) ? source.steps : [];
  const normalizedSteps = rawSteps.map((step, index) => normalizeWorkflowStep(step, index));

  return {
    id: String(existing?.id || source.id || crypto.randomUUID()),
    name: String(source.name || source.title || existing?.name || 'Untitled chain').trim() || 'Untitled chain',
    description: String(source.description || existing?.description || '').trim(),
    triggerMode: String(source.triggerMode || existing?.triggerMode || 'manual').trim().toLowerCase() === 'auto'
      ? 'auto'
      : 'manual',
    steps: normalizedSteps,
    createdAt,
    updatedAt: new Date().toISOString()
  };
};

/** Returns prompts array from storage or an empty list when unavailable. */
const getPrompts = async () => {
  try {
    const state = await chrome.storage.local.get([PROMPTS_KEY]);
    clearLastStorageError();
    return Array.isArray(state[PROMPTS_KEY]) ? state[PROMPTS_KEY] : [];
  } catch (error) {
    setLastStorageError(error);
    console.error('[Promptium][Store] Failed to read prompts.', error);
    return [];
  }
};

/** Saves a new prompt entry with UUID and optional embedding payload. */
const savePrompt = async ({ title, text, tags = [], category = null, embedding = null }) => {
  try {
    const prompts = await getPrompts();
    const preprocessed = await preprocessPromptForSave({ title, text, tags, category });
    const normalizedTags = Array.isArray(preprocessed.tags) ? preprocessed.tags : [];
    const inputText = String(preprocessed.text || '').trim();
    const normalizedEmbedding = Array.isArray(embedding) && embedding.length > 0
      ? embedding.map((value) => Number(value) || 0)
      : null;
    const isTemplate = detectTemplatePrompt(inputText);
    const nextPrompt = {
      id: crypto.randomUUID(),
      title: String(preprocessed.title || '').trim() || derivePromptTitle(inputText),
      text: inputText,
      tags: normalizedTags,
      isTemplate,
      category: preprocessed.category ? String(preprocessed.category).trim() : null,
      embedding: normalizedEmbedding,
      clarityScore: Number.isFinite(Number(preprocessed.clarityScore))
        ? Math.max(0, Math.min(100, Math.round(Number(preprocessed.clarityScore))))
        : null,
      clarityExplanation: String(preprocessed.clarityExplanation || '').trim(),
      createdAt: new Date().toISOString()
    };

    const nextPrompts = [nextPrompt, ...prompts];
    await chrome.storage.local.set({ [PROMPTS_KEY]: nextPrompts });
    clearLastStorageError();
    return {
      ...nextPrompt,
      _aiMeta: preprocessed.aiMeta || null
    };
  } catch (error) {
    setLastStorageError(error);
    console.error('[Promptium][Store] Failed to save prompt.', error);
    return false;
  }
};

const derivePromptTitle = (text) => {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  if (!compact) return 'Untitled Prompt';
  const first = compact.split(/[.!?]/)[0]?.trim() || compact;
  return first.slice(0, 80) || 'Untitled Prompt';
};

/** Updates an existing prompt entry by id and returns the updated prompt or false. */
const updatePrompt = async (id, updates) => {
  try {
    const prompts = await getPrompts();
    const index = prompts.findIndex((item) => item.id === id);

    if (index === -1) {
      return false;
    }

    const existing = prompts[index];
    const patched = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt
    };

    if (updates.tags) {
      patched.tags = Array.isArray(updates.tags)
        ? updates.tags.map((t) => String(t).trim()).filter(Boolean)
        : existing.tags;
    }
    if (Object.prototype.hasOwnProperty.call(updates || {}, 'text')) {
      patched.isTemplate = detectTemplatePrompt(patched.text);
    }

    prompts[index] = patched;
    await chrome.storage.local.set({ [PROMPTS_KEY]: prompts });
    clearLastStorageError();
    return patched;
  } catch (error) {
    setLastStorageError(error);
    console.error('[Promptium][Store] Failed to update prompt.', error);
    return false;
  }
};

/** Deletes one prompt entry by id and returns true when complete. */
const deletePrompt = async (id) => {
  try {
    const prompts = await getPrompts();
    const nextPrompts = prompts.filter((item) => item.id !== id);
    await chrome.storage.local.set({ [PROMPTS_KEY]: nextPrompts });
    clearLastStorageError();
    return true;
  } catch (error) {
    setLastStorageError(error);
    console.error('[Promptium][Store] Failed to delete prompt.', error);
    return false;
  }
};

/** Returns chat history array from storage or an empty list when unavailable. */
const getChatHistory = async () => {
  try {
    const state = await chrome.storage.local.get([HISTORY_KEY]);
    clearLastStorageError();
    return Array.isArray(state[HISTORY_KEY]) ? state[HISTORY_KEY] : [];
  } catch (error) {
    setLastStorageError(error);
    console.error('[Promptium][Store] Failed to read chat history.', error);
    return [];
  }
};

/** Returns workflow definitions from storage or an empty list when unavailable. */
const getWorkflows = async () => {
  try {
    const snapshot = await chrome.storage.local.get([WORKFLOWS_KEY]);
    clearLastStorageError();
    const workflows = Array.isArray(snapshot[WORKFLOWS_KEY])
      ? snapshot[WORKFLOWS_KEY]
      : [];
    return workflows
      .map((workflow) => normalizeWorkflow(workflow))
      .sort((left, right) =>
        String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')),
      );
  } catch (error) {
    setLastStorageError(error);
    console.error('[Promptium][Store] Failed to read workflows.', error);
    return [];
  }
};

/** Saves a new workflow definition and returns the stored record or false. */
const saveWorkflow = async (workflow) => {
  try {
    const workflows = await getWorkflows();
    const nextWorkflow = normalizeWorkflow(workflow);
    await chrome.storage.local.set({
      [WORKFLOWS_KEY]: [nextWorkflow, ...workflows]
    });
    clearLastStorageError();
    return nextWorkflow;
  } catch (error) {
    setLastStorageError(error);
    console.error('[Promptium][Store] Failed to save workflow.', error);
    return false;
  }
};

/** Updates one workflow by id and returns the updated record or false. */
const updateWorkflow = async (id, updates = {}) => {
  try {
    const workflows = await getWorkflows();
    const index = workflows.findIndex((item) => item.id === id);
    if (index < 0) {
      return false;
    }
    const current = workflows[index];
    const next = normalizeWorkflow({ ...current, ...updates }, current);
    workflows[index] = next;
    await chrome.storage.local.set({ [WORKFLOWS_KEY]: workflows });
    clearLastStorageError();
    return next;
  } catch (error) {
    setLastStorageError(error);
    console.error('[Promptium][Store] Failed to update workflow.', error);
    return false;
  }
};

/** Deletes one workflow by id and returns true when complete. */
const deleteWorkflow = async (id) => {
  try {
    const workflows = await getWorkflows();
    const nextWorkflows = workflows.filter((item) => item.id !== id);
    await chrome.storage.local.set({ [WORKFLOWS_KEY]: nextWorkflows });
    clearLastStorageError();
    return true;
  } catch (error) {
    setLastStorageError(error);
    console.error('[Promptium][Store] Failed to delete workflow.', error);
    return false;
  }
};

/** Saves a chat history entry with UUID while enforcing the 50-item cap. */
const saveChatToHistory = async (chat) => {
  try {
    const history = await getChatHistory();
    const nextEntry = {
      id: crypto.randomUUID(),
      title: String(chat?.title || 'Untitled chat').trim(),
      platform: String(chat?.platform || 'unknown').trim(),
      tags: Array.isArray(chat?.tags) ? chat.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
      messages: normalizeHistoryMessages(chat?.messages),
      createdAt: new Date().toISOString(),
      url: sanitizeStoredUrl(chat?.url)
    };

    const nextHistory = [...history, nextEntry];

    while (nextHistory.length > HISTORY_CAP) {
      nextHistory.shift();
    }

    await chrome.storage.local.set({ [HISTORY_KEY]: nextHistory });
    clearLastStorageError();
    return nextEntry;
  } catch (error) {
    setLastStorageError(error);
    console.error('[Promptium][Store] Failed to save chat history.', error);
    return false;
  }
};

/** Deletes one chat history entry by id and returns true when complete. */
const deleteChatFromHistory = async (id) => {
  try {
    const history = await getChatHistory();
    const nextHistory = history.filter((item) => item.id !== id);
    await chrome.storage.local.set({ [HISTORY_KEY]: nextHistory });
    clearLastStorageError();
    return true;
  } catch (error) {
    setLastStorageError(error);
    console.error('[Promptium][Store] Failed to delete chat history entry.', error);
    return false;
  }
};

const Store = {
  getPrompts,
  savePrompt,
  updatePrompt,
  deletePrompt,
  getWorkflows,
  saveWorkflow,
  updateWorkflow,
  deleteWorkflow,
  getChatHistory,
  saveChatToHistory,
  deleteChatFromHistory,
  getLastError: () => lastStorageError,
  isQuotaError: isStorageQuotaError
};

if (typeof window !== 'undefined') {
  Object.assign(window, Store);
  window.Store = Store;
}

if (typeof self !== 'undefined') {
  self.Store = Store;
}

})();
