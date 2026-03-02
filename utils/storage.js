(() => {
/**
 * File: utils/storage.js
 * Purpose: Provides prompt and history CRUD operations backed by chrome.storage.local.
 * Communicates with: popup/popup.js, content/toolbar.js, content/content.js, background/service_worker.js.
 */

const PROMPTS_KEY = 'prompts';
const HISTORY_KEY = 'chatHistory';
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
    const normalizedTags = Array.isArray(tags) ? tags.map((item) => String(item).trim()).filter(Boolean) : [];
    const normalizedEmbedding = Array.isArray(embedding) && embedding.length > 0 ? embedding.map((value) => Number(value) || 0) : null;
    const nextPrompt = {
      id: crypto.randomUUID(),
      title: String(title || '').trim(),
      text: String(text || '').trim(),
      tags: normalizedTags,
      category: category ? String(category).trim() : null,
      embedding: normalizedEmbedding,
      createdAt: new Date().toISOString()
    };

    const nextPrompts = [nextPrompt, ...prompts];
    await chrome.storage.local.set({ [PROMPTS_KEY]: nextPrompts });
    clearLastStorageError();
    return nextPrompt;
  } catch (error) {
    setLastStorageError(error);
    console.error('[Promptium][Store] Failed to save prompt.', error);
    return false;
  }
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
