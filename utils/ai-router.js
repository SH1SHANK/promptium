/**
 * File: utils/ai-router.js
 * Purpose: Unified AI routing policy for local + multi-provider cloud backends.
 */

import { PROVIDER_FALLBACK_CHAIN } from './model-registry.js';

export const AI_BACKEND_LOCAL = 'local';
export const AI_BACKEND_GEMINI = 'gemini';
export const AI_BACKEND_OPENAI = 'openai';
export const AI_BACKEND_ANTHROPIC = 'anthropic';
export const AI_BACKEND_OPENROUTER = 'openrouter';

export const AI_CLOUD_FALLBACK_CHAIN = Object.freeze([...PROVIDER_FALLBACK_CHAIN]);

export const buildRuntimePolicy = (settings = {}, feature = '') => {
  const safeSettings = settings && typeof settings === 'object' ? settings : {};
  const featureFlags = safeSettings.localFeatureFlags && typeof safeSettings.localFeatureFlags === 'object'
    ? safeSettings.localFeatureFlags
    : {};

  const legacyBackend = String(safeSettings.aiBackend || '').trim().toLowerCase();
  const preferLocal = typeof safeSettings.preferLocal === 'boolean'
    ? safeSettings.preferLocal
    : legacyBackend === AI_BACKEND_LOCAL;

  const useLocalFallback = typeof safeSettings.useLocalFallback === 'boolean'
    ? safeSettings.useLocalFallback
    : safeSettings.aiAutoFallback !== false;

  const localEnabledForFeature = feature
    ? featureFlags?.[feature] !== false
    : true;

  const activeProvider = String(safeSettings.activeProvider || AI_BACKEND_GEMINI)
    .trim()
    .toLowerCase();

  return {
    preferLocal,
    useLocalFallback,
    localEnabledForFeature,
    activeProvider,
    enableAI: safeSettings.enableAI !== false
  };
};

const normalizeError = (error, fallback = 'AI request failed.') => {
  const text = String(error?.message || error || '').trim();
  return text || fallback;
};

const asFailure = (error, backend = '') => ({
  ok: false,
  backend: backend || undefined,
  error: normalizeError(error)
});

const runAndNormalize = async (task, backend, defaultError) => {
  try {
    const result = await task();
    if (!result || typeof result !== 'object') {
      return asFailure(defaultError || `No ${backend} response.`, backend);
    }

    if (result.ok === false) {
      return {
        ok: false,
        backend,
        advisory: String(result.advisory || '').trim() || undefined,
        error: normalizeError(result.error, defaultError || `Failed using ${backend}.`)
      };
    }

    return {
      ...result,
      ok: true,
      backend,
      advisory: String(result.advisory || '').trim() || undefined,
      error: undefined
    };
  } catch (error) {
    return asFailure(normalizeError(error, defaultError || `Failed using ${backend}.`), backend);
  }
};

const buildCloudOrder = ({ activeProvider = '', forceProvider = '', fallbackChain = AI_CLOUD_FALLBACK_CHAIN } = {}) => {
  const chain = Array.isArray(fallbackChain) ? fallbackChain : AI_CLOUD_FALLBACK_CHAIN;
  const seen = new Set();
  const order = [];

  const pushUnique = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    order.push(normalized);
  };

  if (forceProvider) {
    pushUnique(forceProvider);
  } else {
    pushUnique(activeProvider);
  }

  chain.forEach((providerId) => pushUnique(providerId));
  return order;
};

/**
 * Routes an AI feature request according to Promptium runtime policy.
 */
export const routeAIRequest = async ({
  feature = '',
  settings = {},
  localTask,
  cloudTasks = {},
  activeProvider = '',
  forceProvider = '',
  fallbackChain = AI_CLOUD_FALLBACK_CHAIN,

  // Legacy compatibility
  hasGeminiKey = false,
  forceGemini = false,
  geminiTask
} = {}) => {
  const policy = buildRuntimePolicy(settings, feature);

  if (!policy.enableAI) {
    return { ok: false, error: 'AI unavailable' };
  }

  const normalizedCloudTasks = cloudTasks && typeof cloudTasks === 'object'
    ? { ...cloudTasks }
    : {};

  if (!normalizedCloudTasks[AI_BACKEND_GEMINI] && typeof geminiTask === 'function' && Boolean(hasGeminiKey)) {
    normalizedCloudTasks[AI_BACKEND_GEMINI] = geminiTask;
  }

  const canUseLocal = typeof localTask === 'function' && policy.localEnabledForFeature;
  const tryLocal = () => runAndNormalize(localTask, AI_BACKEND_LOCAL, 'Local AI unavailable.');

  const resolvedForceProvider = forceProvider || (forceGemini ? AI_BACKEND_GEMINI : '');
  const cloudOrder = buildCloudOrder({
    activeProvider: activeProvider || policy.activeProvider,
    forceProvider: resolvedForceProvider,
    fallbackChain
  });

  const runCloudChain = async () => {
    let lastFailure = null;

    for (const providerId of cloudOrder) {
      const task = normalizedCloudTasks[providerId];
      if (typeof task !== 'function') continue;

      const result = await runAndNormalize(task, providerId, `${providerId} unavailable.`);
      if (result.ok) return result;
      lastFailure = result;
    }

    return lastFailure;
  };

  const localFirst = policy.preferLocal && !resolvedForceProvider;

  if (localFirst) {
    let localResult = null;
    if (canUseLocal) {
      localResult = await tryLocal();
      if (localResult.ok) return localResult;
    }

    const cloudResult = await runCloudChain();
    if (cloudResult?.ok) return cloudResult;

    return cloudResult?.error ? cloudResult : (localResult || { ok: false, error: 'AI unavailable' });
  }

  const cloudResult = await runCloudChain();
  if (cloudResult?.ok) return cloudResult;

  if (policy.useLocalFallback && canUseLocal) {
    const localResult = await tryLocal();
    if (localResult.ok) return localResult;
    return cloudResult?.error ? cloudResult : localResult;
  }

  return cloudResult || { ok: false, error: 'AI unavailable' };
};
