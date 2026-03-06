/**
 * File: utils/ai-bridge.js
 * Purpose: Thin message wrapper for communicating with the AI layer in service_worker.js.
 * Communicates with: background/service_worker.js (via chrome.runtime.sendMessage).
 * Never call chrome.runtime.sendMessage directly from UI code - use this bridge.
 */

const AIBridge = {

  async init() {
    return this._send({ type: 'AI_INIT' });
  },

  async search(query) {
    return this._send({ type: 'AI_SEARCH', query });
  },

  async suggestTags(text) {
    return this._send({ type: 'AI_SUGGEST_TAGS', text });
  },

  async checkDuplicate(text, excludeId = null) {
    return this._send({ type: 'AI_CHECK_DUPLICATE', text, excludeId });
  },

  async getSmartSuggestions(conversationText) {
    return this._send({ type: 'AI_SMART_SUGGESTIONS', conversationText });
  },

  async cacheAdd(prompt) {
    return this._send({ type: 'AI_CACHE_ADD', prompt });
  },

  async cacheRemove(promptId) {
    return this._send({ type: 'AI_CACHE_REMOVE', promptId });
  },

  async improvePrompt(text, tags = [], style = 'general') {
    return this._send({ type: 'AI_IMPROVE_PROMPT', text, tags, style });
  },

  async paraphrasePrompt(text) {
    return this._send({ type: 'AI_PARAPHRASE_PROMPT', text });
  },

  async generatePromptTitle(text) {
    return this._send({ type: 'AI_GENERATE_PROMPT_TITLE', text });
  },

  async scoreClarity(text) {
    return this._send({ type: 'AI_SCORE_CLARITY', text });
  },

  async preparePromptForSave(payload) {
    return this._send({ type: 'AI_PREPARE_PROMPT_SAVE', payload });
  },

  async routeTask(task, payload = {}) {
    return this._send({ type: 'AI_ROUTE_TASK', task, ...payload });
  },

  async validateProviderKey(providerId, key, modelId = '') {
    return this._send({
      type: 'AI_PROVIDER_VALIDATE_KEY',
      providerId,
      key,
      modelId
    });
  },

  async getEmbeddingStatus() {
    return this._send({ type: 'AI_EMBEDDING_STATUS_CHECK' });
  },

  async downloadEmbeddingModel(modelId = '') {
    return this._send({ type: 'AI_EMBEDDING_DOWNLOAD', payload: { modelId } });
  },

  async switchEmbeddingModel(modelId = '') {
    return this._send({ type: 'AI_EMBEDDING_SWITCH', payload: { modelId } });
  },

  async getEmbeddingReindexStatus() {
    return this._send({ type: 'AI_EMBEDDING_REINDEX_STATUS' });
  },

  async startEmbeddingReindex(modelId = '') {
    return this._send({ type: 'AI_EMBEDDING_REINDEX_START', payload: { modelId } });
  },

  async getStatus() {
    return this._send({ type: 'AI_STATUS_CHECK' });
  },

  async _send(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      console.warn('[Promptium][AIBridge] Message failed:', message?.type, error?.message);
      return null;
    }
  }
};

if (typeof window !== 'undefined') {
  window.AIBridge = AIBridge;
}
