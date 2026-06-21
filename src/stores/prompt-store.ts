/**
 * File: stores/prompt-store.ts
 * Purpose: Provides prompt CRUD operations backed by chrome.storage.local.
 */

const PROMPTS_KEY = 'prompts';
let lastStorageError = '';

const setLastStorageError = (error: any) => {
  lastStorageError = String(error?.message || error || '').trim();
};

const clearLastStorageError = () => {
  lastStorageError = '';
};

const isStorageQuotaError = (value: any) =>
  /quota|QUOTA_BYTES|MAX_WRITE_OPERATIONS|MAX_ITEMS/i.test(String(value || ''));

const buildFallbackPromptSavePayload = ({ title, text, tags = [], category = null }: any) => ({
  title: String(title || '').trim(),
  text: String(text || '').trim(),
  tags: Array.isArray(tags) ? tags.map((item) => String(item || '').trim()).filter(Boolean) : [],
  category: category ? String(category).trim() : null,
  clarityScore: null as number | null,
  clarityExplanation: '',
  aiMeta: {
    paraphrase: null as string | null,
    title: null as string | null,
    clarity: null as string | null,
  },
});

const preprocessPromptForSave = async (payload: any) => {
  const fallback = buildFallbackPromptSavePayload(payload || {});
  if (!fallback.text) {
    return fallback;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AI_PREPARE_PROMPT_SAVE',
      payload: fallback,
    });

    if (response?.ok && response?.prompt && typeof response.prompt === 'object') {
      const prompt = response.prompt;
      return {
        title: String(prompt.title || fallback.title).trim() || fallback.title,
        text: String(prompt.text || fallback.text).trim() || fallback.text,
        tags: Array.isArray(prompt.tags)
          ? prompt.tags.map((item: any) => String(item || '').trim()).filter(Boolean)
          : fallback.tags,
        category: prompt.category ? String(prompt.category).trim() : fallback.category,
        clarityScore: Number.isFinite(Number(prompt.clarityScore))
          ? Math.max(0, Math.min(100, Math.round(Number(prompt.clarityScore))))
          : null,
        clarityExplanation: String(prompt.clarityExplanation || '').trim(),
        aiMeta: {
          paraphrase: String(response?.backend?.paraphrase || '').trim() || null,
          title: String(response?.backend?.title || '').trim() || null,
          clarity: String(response?.backend?.clarity || '').trim() || null,
        },
      };
    }
  } catch (_error) {
    // Non-fatal: save should still succeed even when AI preprocessing is unavailable.
  }

  return fallback;
};

const detectTemplatePrompt = (text: string) => {
  try {
    if ((window as any).TemplateParser?.hasVariables) {
      return Boolean((window as any).TemplateParser.hasVariables(String(text || '')));
    }
  } catch (_error) {
    return false;
  }
  return false;
};

const derivePromptTitle = (text: string) => {
  const compact = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return 'Untitled Prompt';
  const first = compact.split(/[.!?]/)[0]?.trim() || compact;
  return first.slice(0, 80) || 'Untitled Prompt';
};

/** Returns prompts array from storage or an empty list when unavailable. */
const getPrompts = async (): Promise<any[]> => {
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
const savePrompt = async ({ title, text, tags = [], category = null, embedding = null }: any) => {
  try {
    const prompts = await getPrompts();
    const preprocessed = await preprocessPromptForSave({
      title,
      text,
      tags,
      category,
    });
    const normalizedTags = Array.isArray(preprocessed.tags) ? preprocessed.tags : [];
    const inputText = String(preprocessed.text || '').trim();
    const normalizedEmbedding =
      Array.isArray(embedding) && embedding.length > 0
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
      isFavorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const nextPrompts = [nextPrompt, ...prompts];
    await chrome.storage.local.set({ [PROMPTS_KEY]: nextPrompts });
    clearLastStorageError();
    return {
      ...nextPrompt,
      _aiMeta: preprocessed.aiMeta || null,
    };
  } catch (error) {
    setLastStorageError(error);
    console.error('[Promptium][Store] Failed to save prompt.', error);
    return false;
  }
};

/** Updates an existing prompt entry by id and returns the updated prompt or false. */
const updatePrompt = async (id: string, updates: any) => {
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
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
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
const deletePrompt = async (id: string) => {
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

const Store = {
  getPrompts,
  savePrompt,
  updatePrompt,
  deletePrompt,
  getLastError: () => lastStorageError,
  isQuotaError: isStorageQuotaError,
};

export const PromptStore = {
  ...Store,
  async duplicatePrompt(id: string) {
    const prompts = await getPrompts();
    const source = prompts.find((item) => item.id === id);
    if (!source) return false;
    return savePrompt({
      title: `${String(source.title || 'Untitled Prompt').trim()} Copy`,
      text: source.text,
      tags: source.tags || [],
      category: source.category || null,
      embedding: null,
    });
  },
  async setFavorite(id: string, isFavorite: boolean) {
    return updatePrompt(id, { isFavorite: Boolean(isFavorite) });
  },
  buildSearchText(prompt: any) {
    return [
      prompt?.title,
      prompt?.text,
      Array.isArray(prompt?.tags) ? prompt.tags.join(' ') : '',
      prompt?.category,
    ]
      .map((part) => String(part || '').toLowerCase())
      .join(' ');
  },
  benchmarkSearch(prompts: any[] = [], query = '') {
    const started = performance.now();
    const needle = String(query || '')
      .trim()
      .toLowerCase();
    const results = !needle
      ? prompts
      : prompts.filter((prompt) => PromptStore.buildSearchText(prompt).includes(needle));
    return {
      count: Array.isArray(prompts) ? prompts.length : 0,
      resultCount: results.length,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
    };
  },
};

if (typeof window !== 'undefined') {
  (window as any).Store = Store;
  (window as any).PromptStore = PromptStore;
}
