import { VariableConfig } from '../types/types';

export interface PromptVersion {
  id: string;
  promptId: string;
  version: number;
  title: string;
  description: string;
  text: string;
  tags: string[];
  category: string | null;
  variables: VariableConfig[];
  updatedAt: string;
  annotation?: string;
}

const VERSIONS_KEY = 'prompt_versions';

export const PromptVersionStore = {
  async getVersions(promptId: string): Promise<PromptVersion[]> {
    try {
      const state = await chrome.storage.local.get([VERSIONS_KEY]);
      const list = state[VERSIONS_KEY];
      const allVersions: PromptVersion[] = Array.isArray(list) ? list : [];
      return allVersions
        .filter((v) => v.promptId === promptId)
        .sort((a, b) => b.version - a.version);
    } catch (err) {
      console.error('[Promptium][VersionStore] Failed to read versions.', err);
      return [];
    }
  },

  async saveVersion(
    promptId: string,
    data: {
      title: string;
      description: string;
      text: string;
      tags: string[];
      category: string | null;
      variables: VariableConfig[];
      annotation?: string;
    }
  ): Promise<PromptVersion | null> {
    try {
      const state = await chrome.storage.local.get([VERSIONS_KEY]);
      const list = state[VERSIONS_KEY];
      const allVersions: PromptVersion[] = Array.isArray(list) ? list : [];

      const existingForPrompt = allVersions.filter((v) => v.promptId === promptId);
      const nextVersionNumber =
        existingForPrompt.length > 0 ? Math.max(...existingForPrompt.map((v) => v.version)) + 1 : 1;

      const newVersion: PromptVersion = {
        id: crypto.randomUUID(),
        promptId,
        version: nextVersionNumber,
        title: data.title,
        description: data.description,
        text: data.text,
        tags: data.tags,
        category: data.category,
        variables: data.variables,
        updatedAt: new Date().toISOString(),
        annotation: data.annotation || '',
      };

      allVersions.push(newVersion);
      await chrome.storage.local.set({ [VERSIONS_KEY]: allVersions });
      return newVersion;
    } catch (err) {
      console.error('[Promptium][VersionStore] Failed to save version.', err);
      return null;
    }
  },

  async deleteVersion(versionId: string): Promise<boolean> {
    try {
      const state = await chrome.storage.local.get([VERSIONS_KEY]);
      const list = state[VERSIONS_KEY];
      const allVersions: PromptVersion[] = Array.isArray(list) ? list : [];

      const filtered = allVersions.filter((v) => v.id !== versionId);
      await chrome.storage.local.set({ [VERSIONS_KEY]: filtered });
      return true;
    } catch (err) {
      console.error('[Promptium][VersionStore] Failed to delete version.', err);
      return false;
    }
  },

  async deleteVersionsForPrompt(promptId: string): Promise<boolean> {
    try {
      const state = await chrome.storage.local.get([VERSIONS_KEY]);
      const list = state[VERSIONS_KEY];
      const allVersions: PromptVersion[] = Array.isArray(list) ? list : [];

      const filtered = allVersions.filter((v) => v.promptId !== promptId);
      await chrome.storage.local.set({ [VERSIONS_KEY]: filtered });
      return true;
    } catch (err) {
      console.error('[Promptium][VersionStore] Failed to delete versions for prompt.', err);
      return false;
    }
  },
};

if (typeof window !== 'undefined') {
  (window as any).PromptVersionStore = PromptVersionStore;
}
