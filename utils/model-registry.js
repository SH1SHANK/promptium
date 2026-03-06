/**
 * File: utils/model-registry.js
 * Purpose: Provider and embedding model registry.
 */

export const PROVIDER_IDS = Object.freeze({
  GEMINI: "gemini",
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
  OPENROUTER: "openrouter",
});

export const PROVIDER_FALLBACK_CHAIN = Object.freeze([
  PROVIDER_IDS.GEMINI,
  PROVIDER_IDS.OPENAI,
  PROVIDER_IDS.ANTHROPIC,
  PROVIDER_IDS.OPENROUTER,
]);

export const MODEL_REGISTRY = Object.freeze({
  providers: {
    [PROVIDER_IDS.GEMINI]: {
      id: PROVIDER_IDS.GEMINI,
      label: "Gemini",
      keyLabel: "Gemini API Key",
      keyPlaceholder: "AIza...",
      keyStorageKey: "promptiumGeminiKey",
      docsUrl: "https://aistudio.google.com/apikey",
      models: [
        {
          id: "gemini-2.0-flash",
          label: "gemini-2.0-flash",
          default: true,
          note: "Default balanced model",
        },
        {
          id: "gemini-2.0-flash-lite",
          label: "gemini-2.0-flash-lite",
          default: false,
          note: "Lower-cost fast option",
        },
        {
          id: "gemini-1.5-pro",
          label: "gemini-1.5-pro",
          default: false,
          note: "Higher quality reasoning",
        },
        {
          id: "gemini-1.5-flash",
          label: "gemini-1.5-flash",
          default: false,
          note: "Stable fast fallback",
        },
      ],
    },
    [PROVIDER_IDS.OPENAI]: {
      id: PROVIDER_IDS.OPENAI,
      label: "OpenAI",
      keyLabel: "OpenAI API Key",
      keyPlaceholder: "sk-...",
      keyStorageKey: "promptiumOpenAIKey",
      docsUrl: "https://platform.openai.com/api-keys",
      models: [
        {
          id: "gpt-4o-mini",
          label: "gpt-4o-mini",
          default: true,
          note: "Default balanced model",
        },
        {
          id: "gpt-4o",
          label: "gpt-4o",
          default: false,
          note: "Higher quality general model",
        },
        {
          id: "gpt-4-turbo",
          label: "gpt-4-turbo",
          default: false,
          note: "Compatibility fallback",
        },
      ],
    },
    [PROVIDER_IDS.ANTHROPIC]: {
      id: PROVIDER_IDS.ANTHROPIC,
      label: "Claude",
      keyLabel: "Anthropic API Key",
      keyPlaceholder: "sk-ant-...",
      keyStorageKey: "promptiumAnthropicKey",
      docsUrl: "https://console.anthropic.com/settings/keys",
      models: [
        {
          id: "claude-haiku-4-5-20251001",
          label: "claude-haiku-4-5-20251001",
          default: true,
          note: "Default low-latency model",
        },
        {
          id: "claude-sonnet-4-6",
          label: "claude-sonnet-4-6",
          default: false,
          note: "Higher quality reasoning",
        },
      ],
    },
    [PROVIDER_IDS.OPENROUTER]: {
      id: PROVIDER_IDS.OPENROUTER,
      label: "OpenRouter",
      keyLabel: "OpenRouter API Key",
      keyPlaceholder: "sk-or-...",
      keyStorageKey: "promptiumOpenRouterKey",
      docsUrl: "https://openrouter.ai/keys",
      models: [
        {
          id: "meta-llama/llama-3.1-8b-instruct:free",
          label: "meta-llama/llama-3.1-8b-instruct:free",
          default: true,
          note: "Default free model",
        },
        {
          id: "mistralai/mistral-7b-instruct:free",
          label: "mistralai/mistral-7b-instruct:free",
          default: false,
          note: "Free fast fallback",
        },
        {
          id: "anthropic/claude-haiku",
          label: "anthropic/claude-haiku",
          default: false,
          note: "Claude via OpenRouter",
        },
        {
          id: "google/gemini-flash-1.5",
          label: "google/gemini-flash-1.5",
          default: false,
          note: "Gemini via OpenRouter",
        },
        {
          id: "openai/gpt-4o-mini",
          label: "openai/gpt-4o-mini",
          default: false,
          note: "OpenAI via OpenRouter",
        },
      ],
    },
  },
});

export const EMBEDDING_MODELS = Object.freeze([
  {
    id: "all-minilm-l6-v2",
    label: "MiniLM-L6",
    modelId: "Xenova/all-MiniLM-L6-v2",
    size: "23MB",
    note: "Fast, balanced",
    default: true,
    dims: 384,
  },
  {
    id: "all-mpnet-base-v2",
    label: "MPNet Base",
    modelId: "Xenova/all-mpnet-base-v2",
    size: "86MB",
    note: "Higher accuracy",
    default: false,
    dims: 768,
  },
  {
    id: "bge-small-en-v1.5",
    label: "BGE Small",
    modelId: "Xenova/bge-small-en-v1.5",
    size: "33MB",
    note: "Strong retrieval",
    default: false,
    dims: 384,
  },
  {
    id: "gte-small",
    label: "GTE Small",
    modelId: "Xenova/gte-small",
    size: "34MB",
    note: "Technical prompts",
    default: false,
    dims: 384,
  },
]);

const findDefaultModel = (models = []) =>
  models.find((entry) => entry?.default) || models[0] || null;

export const getProviders = () => Object.values(MODEL_REGISTRY.providers);

export const getProvider = (providerId = "") => {
  const key = String(providerId || "").trim().toLowerCase();
  return MODEL_REGISTRY.providers[key] || null;
};

export const getProviderDefaultModel = (providerId = "") => {
  const provider = getProvider(providerId);
  return findDefaultModel(provider?.models || []);
};

export const getProviderModelById = (providerId = "", modelId = "") => {
  const provider = getProvider(providerId);
  const resolvedId = String(modelId || "").trim();
  if (!provider || !resolvedId) return null;
  return (
    provider.models.find((entry) => String(entry?.id || "") === resolvedId) ||
    null
  );
};

export const getProviderKeyStorageKey = (providerId = "") => {
  const provider = getProvider(providerId);
  return String(provider?.keyStorageKey || "").trim();
};

export const normalizeProviderId = (providerId = "") =>
  getProvider(providerId)?.id || PROVIDER_IDS.GEMINI;

export const normalizeProviderModels = (providerModels = {}) => {
  const source =
    providerModels && typeof providerModels === "object" ? providerModels : {};
  const normalized = {};

  getProviders().forEach((provider) => {
    const selected = getProviderModelById(provider.id, source?.[provider.id]);
    normalized[provider.id] = String(
      selected?.id || getProviderDefaultModel(provider.id)?.id || "",
    );
  });

  return normalized;
};

export const getEmbeddingModelById = (modelId = "") => {
  const resolvedId = String(modelId || "").trim();
  if (!resolvedId) return null;
  return (
    EMBEDDING_MODELS.find((entry) => String(entry?.id || "") === resolvedId) ||
    null
  );
};

export const getDefaultEmbeddingModel = () => findDefaultModel(EMBEDDING_MODELS);
