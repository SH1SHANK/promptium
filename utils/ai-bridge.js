/**
 * File: utils/ai-bridge.js
 * Purpose: Thin message wrapper for communicating with the AI layer in service_worker.js.
 * Communicates with: background/service_worker.js (via chrome.runtime.sendMessage).
 * Never call chrome.runtime.sendMessage directly from UI code — use this bridge.
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

  async getStatus() {
    return this._send({ type: 'AI_STATUS_CHECK' });
  },

  async _send(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (_) {
      return null;
    }
  },
};

if (typeof window !== 'undefined') {
  window.AIBridge = AIBridge;
}
