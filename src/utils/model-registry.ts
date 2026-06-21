/**
 * File: utils/model-registry.js
 * Purpose: Gemini models registry.
 */

export const PROVIDER_IDS = Object.freeze({
  GEMINI: 'gemini',
});

export const MODEL_REGISTRY = Object.freeze({
  models: [
    {
      id: 'gemini-2.0-flash',
      label: 'gemini-2.0-flash',
      default: true,
      note: 'Default balanced model',
    },
    {
      id: 'gemini-2.0-flash-lite',
      label: 'gemini-2.0-flash-lite',
      default: false,
      note: 'Lower-cost fast option',
    },
    {
      id: 'gemini-1.5-pro',
      label: 'gemini-1.5-pro',
      default: false,
      note: 'Higher quality reasoning',
    },
    {
      id: 'gemini-1.5-flash',
      label: 'gemini-1.5-flash',
      default: false,
      note: 'Stable fast fallback',
    },
  ],
});

export const getGeminiModels = () => MODEL_REGISTRY.models;

export const getGeminiDefaultModel = () =>
  MODEL_REGISTRY.models.find((entry) => entry?.default) || MODEL_REGISTRY.models[0];

export const getGeminiModelById = (modelId = '') => {
  const resolvedId = String(modelId || '').trim();
  if (!resolvedId) return null;
  return MODEL_REGISTRY.models.find((entry) => String(entry?.id || '') === resolvedId) || null;
};
