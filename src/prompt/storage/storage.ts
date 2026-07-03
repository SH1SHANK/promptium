/**
 * File: stores/prompt-store.ts
 * Purpose: Provides prompt CRUD operations backed by chrome.storage.local.
 */

import { Prompt, VariableConfig } from '../types/types';
import { PromptVersionStore } from '../versions/versions';

const PROMPTS_KEY = 'prompts';

export const PromptStore = {
  async getPrompts(): Promise<Prompt[]> {
    try {
      const state = await chrome.storage.local.get([PROMPTS_KEY]);
      const list = state[PROMPTS_KEY];
      return Array.isArray(list) ? (list as Prompt[]) : [];
    } catch (error) {
      console.error('[Promptium][Store] Failed to read prompts.', error);
      return [];
    }
  },

  async savePrompt(data: {
    title: string;
    description: string;
    text: string;
    tags: string[];
    isTemplate: boolean;
    category: string | null;
    isFavorite?: boolean;
    isPinned?: boolean;
    variables: VariableConfig[];
  }): Promise<Prompt | null> {
    try {
      const prompts = await this.getPrompts();

      const nextPrompt: Prompt = {
        id: crypto.randomUUID(),
        title: String(data.title || '').trim() || 'Untitled Prompt',
        description: String(data.description || '').trim(),
        text: String(data.text || '').trim(),
        tags: Array.isArray(data.tags) ? data.tags.map((t) => t.trim()).filter(Boolean) : [],
        isTemplate: Boolean(data.isTemplate),
        category: data.category ? String(data.category).trim() : null,
        isFavorite: Boolean(data.isFavorite),
        isPinned: Boolean(data.isPinned),
        variables: Array.isArray(data.variables) ? data.variables : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: 0,
        lastUsedAt: null,
        lastEditedAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      };

      prompts.unshift(nextPrompt);
      await chrome.storage.local.set({ [PROMPTS_KEY]: prompts });

      // Save initial version snapshot
      await PromptVersionStore.saveVersion(nextPrompt.id, {
        title: nextPrompt.title,
        description: nextPrompt.description,
        text: nextPrompt.text,
        tags: nextPrompt.tags,
        category: nextPrompt.category,
        variables: nextPrompt.variables,
        annotation: 'First save',
      });

      return nextPrompt;
    } catch (error) {
      console.error('[Promptium][Store] Failed to save prompt.', error);
      return null;
    }
  },

  async updatePrompt(
    id: string,
    updates: Partial<Omit<Prompt, 'id' | 'createdAt' | 'updatedAt'>>,
    versionAnnotation?: string
  ): Promise<Prompt | null> {
    try {
      const prompts = await this.getPrompts();
      const index = prompts.findIndex((item) => item.id === id);

      if (index === -1) {
        return null;
      }

      const existing = prompts[index]!;
      const patched = {
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
        lastEditedAt: new Date().toISOString(),
      } as Prompt;

      if (updates.tags) {
        patched.tags = updates.tags.map((t: string) => t.trim()).filter(Boolean);
      }
      if (updates.variables) {
        patched.variables = updates.variables;
      }

      prompts[index] = patched;
      await chrome.storage.local.set({ [PROMPTS_KEY]: prompts });

      // Save a version history snapshot only if a versionAnnotation is explicitly provided
      if (versionAnnotation) {
        await PromptVersionStore.saveVersion(patched.id, {
          title: patched.title,
          description: patched.description,
          text: patched.text,
          tags: patched.tags,
          category: patched.category,
          variables: patched.variables,
          annotation: versionAnnotation,
        });
      }

      return patched;
    } catch (error) {
      console.error('[Promptium][Store] Failed to update prompt.', error);
      return null;
    }
  },

  async deletePrompt(id: string): Promise<boolean> {
    try {
      const prompts = await this.getPrompts();
      const nextPrompts = prompts.filter((item) => item.id !== id);
      await chrome.storage.local.set({ [PROMPTS_KEY]: nextPrompts });

      // Clean up versions
      await PromptVersionStore.deleteVersionsForPrompt(id);
      return true;
    } catch (error) {
      console.error('[Promptium][Store] Failed to delete prompt.', error);
      return false;
    }
  },

  async duplicatePrompt(id: string): Promise<Prompt | null> {
    try {
      const prompts = await this.getPrompts();
      const source = prompts.find((item) => item.id === id);
      if (!source) return null;

      return this.savePrompt({
        title: `${source.title} Copy`,
        description: source.description,
        text: source.text,
        tags: source.tags,
        isTemplate: source.isTemplate,
        category: source.category,
        isFavorite: false,
        isPinned: false,
        variables: source.variables,
      });
    } catch (error) {
      console.error('[Promptium][Store] Failed to duplicate prompt.', error);
      return null;
    }
  },

  async setFavorite(id: string, isFavorite: boolean): Promise<Prompt | null> {
    return this.updatePrompt(
      id,
      { isFavorite },
      `Marked as ${isFavorite ? 'favorite' : 'not favorite'}`
    );
  },

  async setPinned(id: string, isPinned: boolean): Promise<Prompt | null> {
    return this.updatePrompt(id, { isPinned }, `Marked as ${isPinned ? 'pinned' : 'not pinned'}`);
  },

  async incrementUsageCount(id: string): Promise<Prompt | null> {
    try {
      const prompts = await this.getPrompts();
      const index = prompts.findIndex((item) => item.id === id);
      if (index === -1) return null;
      const existing = prompts[index];
      if (!existing) return null;
      const count = (existing.usageCount || 0) + 1;

      const patched: Prompt = {
        ...existing,
        usageCount: count,
        lastUsedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      prompts[index] = patched;
      await chrome.storage.local.set({ [PROMPTS_KEY]: prompts });
      return patched;
    } catch (error) {
      console.error('[Promptium][Store] Failed to increment usage count.', error);
      return null;
    }
  },

  async recordOpen(id: string): Promise<Prompt | null> {
    try {
      const prompts = await this.getPrompts();
      const index = prompts.findIndex((item) => item.id === id);
      if (index === -1) return null;

      const existing = prompts[index];
      if (!existing) return null;

      const patched: Prompt = {
        ...existing,
        lastOpenedAt: new Date().toISOString(),
      };

      prompts[index] = patched;
      await chrome.storage.local.set({ [PROMPTS_KEY]: prompts });
      return patched;
    } catch (error) {
      console.error('[Promptium][Store] Failed to record open.', error);
      return null;
    }
  },
};

if (typeof window !== 'undefined') {
  (window as any).Store = PromptStore;
  (window as any).PromptStore = PromptStore;
}
