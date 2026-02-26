/**
 * File: utils/storage.js
 * Purpose: Provides CRUD helpers for prompts and chat history in chrome.storage.local.
 * Communicates with: popup/popup.js, background/service_worker.js, content/toolbar.js.
 */

const STORAGE_KEYS = {
  prompts: 'prompts',
  chatHistory: 'chatHistory'
};

const HISTORY_CAP = 50;

/** Builds a default storage object when no persisted state exists yet. */
const getDefaultState = async () => ({
  prompts: [],
  chatHistory: []
});

/** Reads all PromptNest storage values from chrome.storage.local. */
const readState = async () => {
  const defaults = await getDefaultState();
  const state = await chrome.storage.local.get(defaults);
  return {
    prompts: Array.isArray(state.prompts) ? state.prompts : [],
    chatHistory: Array.isArray(state.chatHistory) ? state.chatHistory : []
  };
};

/** Writes partial PromptNest storage updates to chrome.storage.local. */
const writeState = async (partial) => {
  await chrome.storage.local.set(partial);
  return true;
};

/** Creates a stable identifier for prompt and history records. */
const createId = async (prefix = 'pn') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/** Returns a safe document title across extension contexts. */
const getSafeDocumentTitle = async () => (typeof document !== 'undefined' ? document.title : 'Untitled chat');

/** Returns a safe location URL across extension contexts. */
const getSafeLocationHref = async () => (typeof window !== 'undefined' ? window.location.href : '');

/** Returns all saved prompt templates. */
const listPrompts = async () => {
  const state = await readState();
  return state.prompts;
};

/** Returns one prompt by id or null if not found. */
const getPromptById = async (id) => {
  const prompts = await listPrompts();
  return prompts.find((item) => item.id === id) || null;
};

/** Creates a new prompt template and persists it. */
const createPrompt = async ({ title, body, tags = [] }) => {
  const state = await readState();
  const prompt = {
    id: await createId('prompt'),
    title: (title || 'Untitled prompt').trim(),
    body: (body || '').trim(),
    tags,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await writeState({
    prompts: [prompt, ...state.prompts]
  });

  return prompt;
};

/** Updates an existing prompt template and persists changes. */
const updatePrompt = async (id, updates = {}) => {
  const state = await readState();
  const prompts = state.prompts.map((item) => {
    if (item.id !== id) {
      return item;
    }

    return {
      ...item,
      ...updates,
      updatedAt: new Date().toISOString()
    };
  });

  await writeState({ prompts });
  return prompts.find((item) => item.id === id) || null;
};

/** Deletes a prompt template by id. */
const deletePrompt = async (id) => {
  const state = await readState();
  const prompts = state.prompts.filter((item) => item.id !== id);
  await writeState({ prompts });
  return prompts;
};

/** Returns chat history records in newest-first order. */
const listChatHistory = async () => {
  const state = await readState();
  return state.chatHistory;
};

/** Returns one chat history entry by id or null if not found. */
const getChatHistoryById = async (id) => {
  const history = await listChatHistory();
  return history.find((item) => item.id === id) || null;
};

/** Creates a chat history record while enforcing a 50-item cap. */
const createChatHistory = async ({ platform, title, url, messages = [] }) => {
  const state = await readState();
  const entry = {
    id: await createId('chat'),
    platform: platform || 'unknown',
    title: title || (await getSafeDocumentTitle()),
    url: url || (await getSafeLocationHref()),
    messages,
    createdAt: new Date().toISOString()
  };

  const cappedHistory = [entry, ...state.chatHistory].slice(0, HISTORY_CAP);
  await writeState({ chatHistory: cappedHistory });
  return entry;
};

/** Updates an existing chat history record by id. */
const updateChatHistory = async (id, updates = {}) => {
  const state = await readState();
  const chatHistory = state.chatHistory.map((item) => {
    if (item.id !== id) {
      return item;
    }

    return {
      ...item,
      ...updates,
      updatedAt: new Date().toISOString()
    };
  });

  await writeState({ chatHistory });
  return chatHistory.find((item) => item.id === id) || null;
};

/** Deletes one chat history record by id. */
const deleteChatHistory = async (id) => {
  const state = await readState();
  const chatHistory = state.chatHistory.filter((item) => item.id !== id);
  await writeState({ chatHistory });
  return chatHistory;
};

/** Clears all chat history records. */
const clearChatHistory = async () => {
  await writeState({ chatHistory: [] });
  return [];
};

const Storage = {
  STORAGE_KEYS,
  HISTORY_CAP,
  getDefaultState,
  readState,
  writeState,
  listPrompts,
  getPromptById,
  createPrompt,
  updatePrompt,
  deletePrompt,
  listChatHistory,
  getChatHistoryById,
  createChatHistory,
  updateChatHistory,
  deleteChatHistory,
  clearChatHistory
};

if (typeof window !== 'undefined') {
  window.PromptNestStorage = Storage;
}

if (typeof self !== 'undefined') {
  self.PromptNestStorage = Storage;
}
