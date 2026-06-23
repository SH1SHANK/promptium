/**
 * File: utils/ai-bridge.ts
 * Purpose: Thin message wrapper for communicating with the AI layer in service_worker.js.
 * Communicates with: background/service_worker.js (via chrome.runtime.sendMessage).
 * Never call chrome.runtime.sendMessage directly from UI code - use this bridge.
 */

import { Prompt } from '../types/domain/prompt';

export const AIBridge = {
  async init(): Promise<any> {
    return this._send({ type: 'AI_INIT' });
  },

  async search(query: string): Promise<any> {
    return this._send({ type: 'AI_SEARCH', query });
  },

  async suggestTags(text: string): Promise<string[]> {
    return this._send({ type: 'AI_SUGGEST_TAGS', text });
  },

  async checkDuplicate(text: string, excludeId: string | null = null): Promise<{ match: boolean }> {
    return this._send({ type: 'AI_CHECK_DUPLICATE', text, excludeId });
  },

  async getSmartSuggestions(conversationText: string): Promise<{ ids: string[] }> {
    return this._send({ type: 'AI_SMART_SUGGESTIONS', conversationText });
  },

  async cacheAdd(prompt: Prompt): Promise<{ ok: boolean }> {
    return this._send({ type: 'AI_CACHE_ADD', prompt });
  },

  async cacheRemove(promptId: string): Promise<{ ok: boolean }> {
    return this._send({ type: 'AI_CACHE_REMOVE', promptId });
  },

  async improvePrompt(text: string, tags: string[] = [], style = 'general'): Promise<any> {
    return this._send({ type: 'AI_IMPROVE_PROMPT', text, tags, style });
  },

  async paraphrasePrompt(text: string): Promise<any> {
    return this._send({ type: 'AI_PARAPHRASE_PROMPT', text });
  },

  async generatePromptTitle(text: string): Promise<any> {
    return this._send({ type: 'AI_GENERATE_PROMPT_TITLE', text });
  },

  async scoreClarity(text: string): Promise<any> {
    return this._send({ type: 'AI_SCORE_CLARITY', text });
  },

  async preparePromptForSave(payload: any): Promise<any> {
    return this._send({ type: 'AI_PREPARE_PROMPT_SAVE', payload });
  },

  async generatePromptChain(goal: string, context = '', mode = 'full'): Promise<any> {
    return this._send({ type: 'AI_GENERATE_CHAIN', goal, context, mode });
  },

  async routeTask(task: string, payload: Record<string, any> = {}): Promise<any> {
    return this._send({ type: 'AI_ROUTE_TASK', task, ...payload });
  },

  async validateProviderKey(providerId: string, key: string, modelId = ''): Promise<any> {
    return this._send({
      type: 'AI_PROVIDER_VALIDATE_KEY',
      providerId,
      key,
      modelId,
    });
  },

  async getEmbeddingStatus(): Promise<any> {
    return this._send({ type: 'AI_EMBEDDING_STATUS_CHECK' });
  },

  async downloadEmbeddingModel(modelId = ''): Promise<any> {
    return this._send({ type: 'AI_EMBEDDING_DOWNLOAD', payload: { modelId } });
  },

  async switchEmbeddingModel(modelId = ''): Promise<any> {
    return this._send({ type: 'AI_EMBEDDING_SWITCH', payload: { modelId } });
  },

  async getEmbeddingReindexStatus(): Promise<any> {
    return this._send({ type: 'AI_EMBEDDING_REINDEX_STATUS' });
  },

  async startEmbeddingReindex(modelId = ''): Promise<any> {
    return this._send({ type: 'AI_EMBEDDING_REINDEX_START', payload: { modelId } });
  },

  async getStatus(): Promise<any> {
    return this._send({ type: 'AI_STATUS_CHECK' });
  },

  async _send(message: any): Promise<any> {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error: any) {
      console.warn('[Promptium][AIBridge] Message failed:', message?.type, error?.message);
      return null;
    }
  },
};

if (typeof window !== 'undefined') {
  (window as any).AIBridge = AIBridge;
}
