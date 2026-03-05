/**
 * File: utils/ai-router.js
 * Purpose: Unified AI routing policy for local + Gemini backends.
 */

export const AI_BACKEND_LOCAL = 'local';
export const AI_BACKEND_GEMINI = 'gemini';

const toBool = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  return fallback;
};

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

  return {
    preferLocal,
    useLocalFallback,
    localEnabledForFeature,
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
      ok: true,
      backend,
      ...result,
      ok: true,
      advisory: String(result.advisory || '').trim() || undefined,
      error: undefined
    };
  } catch (error) {
    return asFailure(normalizeError(error, defaultError || `Failed using ${backend}.`), backend);
  }
};

/**
 * Routes an AI feature request according to Promptium runtime policy.
 */
export const routeAIRequest = async ({
  feature = '',
  settings = {},
  hasGeminiKey = false,
  forceGemini = false,
  localTask,
  geminiTask
} = {}) => {
  const policy = buildRuntimePolicy(settings, feature);

  if (!policy.enableAI) {
    return { ok: false, error: 'AI unavailable' };
  }

  const canUseLocal = typeof localTask === 'function' && policy.localEnabledForFeature;
  const canUseGemini = typeof geminiTask === 'function' && Boolean(hasGeminiKey);

  const tryLocal = () => runAndNormalize(localTask, AI_BACKEND_LOCAL, 'Local AI unavailable.');
  const tryGemini = () => runAndNormalize(geminiTask, AI_BACKEND_GEMINI, 'Gemini unavailable.');

  const localFirst = !forceGemini && policy.preferLocal;

  if (localFirst) {
    let localResult = null;
    if (canUseLocal) {
      localResult = await tryLocal();
      if (localResult.ok) return localResult;
    }

    // Gemini fallback remains enabled even when local fallback is disabled.
    if (canUseGemini) {
      const geminiResult = await tryGemini();
      if (geminiResult.ok) return geminiResult;
      return geminiResult.error ? geminiResult : (localResult || { ok: false, error: 'AI unavailable' });
    }

    return localResult || { ok: false, error: 'AI unavailable' };
  }

  let geminiResult = null;
  if (canUseGemini) {
    geminiResult = await tryGemini();
    if (geminiResult.ok) return geminiResult;
  }

  // When Gemini is preferred, local runs only as fallback if explicitly enabled.
  if (policy.useLocalFallback && canUseLocal) {
    const localResult = await tryLocal();
    if (localResult.ok) return localResult;
    return geminiResult?.error ? geminiResult : localResult;
  }

  return geminiResult || { ok: false, error: 'AI unavailable' };
};
