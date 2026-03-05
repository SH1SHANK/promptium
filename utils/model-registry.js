/**
 * File: utils/model-registry.js
 * Purpose: Single source of truth for cloud providers, inference models, and embedding models.
 */

export const PROVIDER_IDS = Object.freeze({
  GEMINI: 'gemini',
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  OPENROUTER: 'openrouter'
});

export const PROVIDER_FALLBACK_CHAIN = Object.freeze([
  PROVIDER_IDS.GEMINI,
  PROVIDER_IDS.OPENAI,
  PROVIDER_IDS.ANTHROPIC,
  PROVIDER_IDS.OPENROUTER
]);

export const MODEL_REGISTRY = Object.freeze({
  providers: {
    [PROVIDER_IDS.GEMINI]: {
      id: PROVIDER_IDS.GEMINI,
      label: 'Google Gemini',
      keyLabel: 'Gemini API Key',
      keyPlaceholder: 'AIza...',
      keyStorageKey: 'promptiumGeminiKey',
      docsUrl: 'https://aistudio.google.com/apikey',
      models: [
        { id: 'gemini-3.0-flash-preview', label: 'Gemini 3.0 Flash (Preview)', default: true, speed: 'fast', note: 'Latest balanced model' },
        { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', default: false, speed: 'medium', note: 'Best reasoning quality' },
        { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', default: false, speed: 'blazing-fast', note: 'Lowest latency / cost' },
        { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', default: false, speed: 'fast', note: 'Stable fast option' },
        { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', default: false, speed: 'medium', note: 'Stable quality option' }
      ]
    },

    [PROVIDER_IDS.OPENAI]: {
      id: PROVIDER_IDS.OPENAI,
      label: 'OpenAI',
      keyLabel: 'OpenAI API Key',
      keyPlaceholder: 'sk-...',
      keyStorageKey: 'promptiumOpenAIKey',
      docsUrl: 'https://platform.openai.com/api-keys',
      models: [
        { id: 'gpt-5.2-mini', label: 'GPT-5.2 Mini', default: true, speed: 'fast', note: 'Best default balance' },
        { id: 'gpt-5.2', label: 'GPT-5.2', default: false, speed: 'medium', note: 'Highest quality' },
        { id: 'gpt-5.2-nano', label: 'GPT-5.2 Nano', default: false, speed: 'blazing-fast', note: 'Fastest / cheapest' },
        { id: 'gpt-4.1', label: 'GPT-4.1', default: false, speed: 'medium', note: 'Stable compatibility fallback' }
      ]
    },

    [PROVIDER_IDS.ANTHROPIC]: {
      id: PROVIDER_IDS.ANTHROPIC,
      label: 'Anthropic Claude',
      keyLabel: 'Anthropic API Key',
      keyPlaceholder: 'sk-ant-...',
      keyStorageKey: 'promptiumAnthropicKey',
      docsUrl: 'https://console.anthropic.com/settings/keys',
      models: [
        { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', default: true, speed: 'fast', note: 'Best balance' },
        { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', default: false, speed: 'medium', note: 'Highest quality' },
        { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', default: false, speed: 'blazing-fast', note: 'Fastest' }
      ]
    },

    [PROVIDER_IDS.OPENROUTER]: {
      id: PROVIDER_IDS.OPENROUTER,
      label: 'OpenRouter',
      keyLabel: 'OpenRouter API Key',
      keyPlaceholder: 'sk-or-...',
      keyStorageKey: 'promptiumOpenRouterKey',
      docsUrl: 'https://openrouter.ai/keys',
      models: [
        { id: 'openrouter/auto', label: 'Auto Router (Recommended)', default: true, speed: 'adaptive', note: 'Best available model automatically' },
        { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', default: false, speed: 'fast', note: 'Strong quality / cost' },
        { id: 'openai/gpt-5.2', label: 'GPT-5.2', default: false, speed: 'medium', note: 'Latest OpenAI quality' },
        { id: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro (Preview)', default: false, speed: 'medium', note: 'Latest Gemini quality' },
        { id: 'anthropic/claude-opus-4.5', label: 'Claude Opus 4.5', default: false, speed: 'medium', note: 'Top-tier Anthropic via OR' }
      ]
    }
  }
});

export const EMBEDDING_MODELS = Object.freeze([
  {
    id: 'all-minilm-l6-v2',
    label: 'MiniLM-L6',
    modelId: 'Xenova/all-MiniLM-L6-v2',
    size: '23MB',
    note: 'Default - fast, balanced',
    default: true,
    dims: 384
  },
  {
    id: 'all-mpnet-base-v2',
    label: 'MPNet Base',
    modelId: 'Xenova/all-mpnet-base-v2',
    size: '86MB',
    note: 'Higher accuracy',
    default: false,
    dims: 768
  },
  {
    id: 'bge-small-en-v1.5',
    label: 'BGE Small',
    modelId: 'Xenova/bge-small-en-v1.5',
    size: '33MB',
    note: 'Strong retrieval quality',
    default: false,
    dims: 384
  },
  {
    id: 'gte-small',
    label: 'GTE Small',
    modelId: 'Xenova/gte-small',
    size: '34MB',
    note: 'Good for technical prompts',
    default: false,
    dims: 384
  }
]);

const findDefaultModel = (models = []) => models.find((entry) => entry?.default) || models[0] || null;

export const getProvider = (providerId = '') => {
  const key = String(providerId || '').trim().toLowerCase();
  return MODEL_REGISTRY.providers[key] || null;
};

export const getProviders = () => Object.values(MODEL_REGISTRY.providers);

export const getProviderDefaultModel = (providerId = '') => {
  const provider = getProvider(providerId);
  return findDefaultModel(provider?.models || []);
};

export const getProviderModelById = (providerId = '', modelId = '') => {
  const provider = getProvider(providerId);
  const normalized = String(modelId || '').trim();
  if (!provider || !normalized) return null;
  return (provider.models || []).find((entry) => String(entry?.id || '') === normalized) || null;
};

export const getEmbeddingModelById = (modelId = '') => {
  const normalized = String(modelId || '').trim();
  if (!normalized) return null;
  return EMBEDDING_MODELS.find((entry) => String(entry?.id || '') === normalized) || null;
};

export const getDefaultEmbeddingModel = () => findDefaultModel(EMBEDDING_MODELS);

export const normalizeProviderModels = (providerModels = {}) => {
  const source = providerModels && typeof providerModels === 'object' ? providerModels : {};
  const normalized = {};

  getProviders().forEach((provider) => {
    const preferred = String(source?.[provider.id] || '').trim();
    const chosen = getProviderModelById(provider.id, preferred) || getProviderDefaultModel(provider.id);
    normalized[provider.id] = String(chosen?.id || '');
  });

  return normalized;
};

export const getProviderKeyStorageKey = (providerId = '') => {
  const provider = getProvider(providerId);
  return String(provider?.keyStorageKey || '').trim();
};
