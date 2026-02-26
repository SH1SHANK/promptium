/**
 * File: utils/storage.js
 * Purpose: Provides prompt and history CRUD operations backed by chrome.storage.local.
 * Communicates with: popup/popup.js, content/toolbar.js, content/content.js, background/service_worker.js.
 */

const PROMPTS_KEY = 'prompts';
const HISTORY_KEY = 'chatHistory';
const HISTORY_CAP = 50;

/** Returns prompts array from storage or an empty list when unavailable. */
const getPrompts = async () => {
  try {
    const state = await chrome.storage.local.get([PROMPTS_KEY]);
    return Array.isArray(state[PROMPTS_KEY]) ? state[PROMPTS_KEY] : [];
  } catch (error) {
    console.error('[PromptNest][Store] Failed to read prompts.', error);
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
    return nextPrompt;
  } catch (error) {
    console.error('[PromptNest][Store] Failed to save prompt.', error);
    return false;
  }
};

/** Deletes one prompt entry by id and returns true when complete. */
const deletePrompt = async (id) => {
  try {
    const prompts = await getPrompts();
    const nextPrompts = prompts.filter((item) => item.id !== id);
    await chrome.storage.local.set({ [PROMPTS_KEY]: nextPrompts });
    return true;
  } catch (error) {
    console.error('[PromptNest][Store] Failed to delete prompt.', error);
    return false;
  }
};

/** Returns chat history array from storage or an empty list when unavailable. */
const getChatHistory = async () => {
  try {
    const state = await chrome.storage.local.get([HISTORY_KEY]);
    return Array.isArray(state[HISTORY_KEY]) ? state[HISTORY_KEY] : [];
  } catch (error) {
    console.error('[PromptNest][Store] Failed to read chat history.', error);
    return [];
  }
};

/** Saves a chat history entry with UUID while enforcing the 50-item cap. */
const saveChatToHistory = async (chat) => {
  try {
    const history = await getChatHistory();
    const nextEntry = {
      id: crypto.randomUUID(),
      title: String(chat?.title || document.title || 'Untitled chat').trim(),
      platform: String(chat?.platform || 'unknown').trim(),
      tags: Array.isArray(chat?.tags) ? chat.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
      messages: Array.isArray(chat?.messages) ? chat.messages : [],
      createdAt: new Date().toISOString(),
      url: String(chat?.url || window.location.href || '')
    };

    const nextHistory = [...history, nextEntry];

    while (nextHistory.length > HISTORY_CAP) {
      nextHistory.shift();
    }

    await chrome.storage.local.set({ [HISTORY_KEY]: nextHistory });
    return nextEntry;
  } catch (error) {
    console.error('[PromptNest][Store] Failed to save chat history.', error);
    return false;
  }
};

/** Deletes one chat history entry by id and returns true when complete. */
const deleteChatFromHistory = async (id) => {
  try {
    const history = await getChatHistory();
    const nextHistory = history.filter((item) => item.id !== id);
    await chrome.storage.local.set({ [HISTORY_KEY]: nextHistory });
    return true;
  } catch (error) {
    console.error('[PromptNest][Store] Failed to delete chat history entry.', error);
    return false;
  }
};

const Store = {
  getPrompts,
  savePrompt,
  deletePrompt,
  getChatHistory,
  saveChatToHistory,
  deleteChatFromHistory
};

if (typeof window !== 'undefined') {
  window.Store = Store;
}

if (typeof self !== 'undefined') {
  self.Store = Store;
}
