/**
 * File: utils/ai-router.js
 * Purpose: Cloud-only provider routing with ordered fallback.
 */

import {
  PROVIDER_FALLBACK_CHAIN,
  normalizeProviderId,
  normalizeProviderModels,
} from "./model-registry.js";

const asFailure = (error, advisory = "") => ({
  ok: false,
  error: String(error || "no_provider_available").trim() || "no_provider_available",
  advisory: String(advisory || "").trim() || undefined,
});

const normalizeFeatureFlags = (value = {}) => {
  const source = value && typeof value === "object" ? value : {};
  return {
    polish: source.polish !== false,
    autoTags: source.autoTags !== false,
    improvePrompt: source.improvePrompt !== false,
    continueSummary: source.continueSummary !== false,
  };
};

export const buildRuntimePolicy = (settings = {}, feature = "") => {
  const source = settings && typeof settings === "object" ? settings : {};
  const featureFlags = normalizeFeatureFlags(source.featureFlags);
  const activeProvider = normalizeProviderId(source.activeProvider);
  const providerModels = normalizeProviderModels(source.providerModels || {});

  return {
    activeProvider,
    providerModels,
    featureEnabled: feature ? featureFlags?.[feature] !== false : true,
  };
};

export const buildProviderAttemptOrder = (settings = {}, forceProvider = "") => {
  const policy = buildRuntimePolicy(settings);
  const seen = new Set();
  const order = [];

  const push = (providerId) => {
    const resolved = normalizeProviderId(providerId);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    order.push(resolved);
  };

  if (forceProvider) {
    push(forceProvider);
  } else {
    push(policy.activeProvider);
  }

  PROVIDER_FALLBACK_CHAIN.forEach(push);
  return order;
};

export const routeAIRequest = async ({
  settings = {},
  feature = "",
  forceProvider = "",
  hasProviderKey = async () => false,
  task = async () => asFailure("no_provider_available"),
} = {}) => {
  const policy = buildRuntimePolicy(settings, feature);
  if (!policy.featureEnabled) {
    return asFailure("feature_disabled");
  }

  const order = buildProviderAttemptOrder(settings, forceProvider);
  let attempted = false;

  for (const providerId of order) {
    const hasKey = await hasProviderKey(providerId);
    if (!hasKey) continue;
    attempted = true;

    try {
      const result = await task({
        providerId,
        modelId: policy.providerModels?.[providerId] || "",
      });
      if (result?.ok) {
        const { ok: _ok, ...rest } = result;
        return {
          ok: true,
          ...rest,
          text: String(result.text || "").trim() || undefined,
          backend: providerId,
          advisory: String(result.advisory || "").trim() || undefined,
        };
      }
    } catch (error) {
      console.warn(
        "[Promptium][AIRouter] Provider attempt failed.",
        providerId,
        error?.message || error,
      );
    }
  }

  if (!attempted) {
    return asFailure("no_provider_available");
  }

  return asFailure("no_provider_available");
};
