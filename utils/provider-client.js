/**
 * File: utils/provider-client.js
 * Purpose: Unified cloud provider client.
 */

import {
  PROVIDER_IDS,
  getProviderDefaultModel,
  getProviderKeyStorageKey,
  normalizeProviderId,
  normalizeProviderModels,
} from "./model-registry.js";

const DEFAULT_TIMEOUT_MS = 18000;
const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta";
const OPENAI_API_ROOT = "https://api.openai.com/v1";
const ANTHROPIC_API_ROOT = "https://api.anthropic.com/v1";
const OPENROUTER_API_ROOT = "https://openrouter.ai/api/v1";

const createProviderError = (type, message) => {
  const error = new Error(String(message || "Provider request failed."));
  error.type = type;
  return error;
};

const withTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createProviderError("network", "Request timed out.");
    }
    throw createProviderError("network", "Network request failed.");
  } finally {
    clearTimeout(timeoutId);
  }
};

const parseJson = async (response) => {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
};

const classifyHttpError = (status = 0, fallback = "Provider request failed.") => {
  if (status === 401 || status === 403) {
    return createProviderError("invalid_key", "Invalid API key.");
  }
  if (status === 429) {
    return createProviderError("quota", "Quota exceeded or rate limited.");
  }
  if (!status || status >= 500) {
    return createProviderError("network", "Provider network error.");
  }
  return createProviderError("unknown", fallback);
};

const resolveModelId = (providerId = "", providerModels = {}) =>
  String(
    providerModels?.[providerId] || getProviderDefaultModel(providerId)?.id || "",
  ).trim();

export const getProviderKey = async (providerId = "") => {
  const storageKey = getProviderKeyStorageKey(providerId);
  if (!storageKey) return "";
  const snapshot = await chrome.storage.session.get([storageKey]).catch(() => ({}));
  return String(snapshot?.[storageKey] || "").trim();
};

const readGeminiText = (data) =>
  String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();

const readOpenAIText = (data) =>
  String(data?.choices?.[0]?.message?.content || "").trim();

const readAnthropicText = (data) => {
  const content = Array.isArray(data?.content) ? data.content : [];
  const firstText = content.find((entry) => String(entry?.type || "").toLowerCase() === "text");
  return String(firstText?.text || "").trim();
};

const readOpenRouterText = (data) =>
  String(data?.choices?.[0]?.message?.content || "").trim();

const throwIfEmptyText = (text, providerLabel) => {
  if (!String(text || "").trim()) {
    throw createProviderError("unknown", `${providerLabel} returned empty output.`);
  }
  return String(text || "").trim();
};

async function callGemini(systemPrompt, userPrompt, modelId, key) {
  const response = await withTimeout(
    `${GEMINI_API_ROOT}/models/${modelId}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [systemPrompt, userPrompt].filter(Boolean).join("\n\n"),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 900,
        },
      }),
    },
  );

  const data = await parseJson(response);
  if (!response.ok) {
    throw classifyHttpError(response.status, "Gemini request failed.");
  }

  return throwIfEmptyText(readGeminiText(data), "Gemini");
}

async function callOpenAI(systemPrompt, userPrompt, modelId, key) {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: String(systemPrompt) });
  }
  messages.push({ role: "user", content: String(userPrompt || "") });

  const response = await withTimeout(`${OPENAI_API_ROOT}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      temperature: 0.3,
    }),
  });

  const data = await parseJson(response);
  if (!response.ok) {
    throw classifyHttpError(response.status, "OpenAI request failed.");
  }

  return throwIfEmptyText(readOpenAIText(data), "OpenAI");
}

async function callAnthropic(systemPrompt, userPrompt, modelId, key) {
  const response = await withTimeout(`${ANTHROPIC_API_ROOT}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": key,
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 900,
      system: String(systemPrompt || "").trim() || undefined,
      messages: [{ role: "user", content: String(userPrompt || "") }],
    }),
  });

  const data = await parseJson(response);
  if (!response.ok) {
    throw classifyHttpError(response.status, "Anthropic request failed.");
  }

  return throwIfEmptyText(readAnthropicText(data), "Anthropic");
}

async function callOpenRouter(systemPrompt, userPrompt, modelId, key) {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: String(systemPrompt) });
  }
  messages.push({ role: "user", content: String(userPrompt || "") });

  const response = await withTimeout(`${OPENROUTER_API_ROOT}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": chrome.runtime?.id
        ? `chrome-extension://${chrome.runtime.id}`
        : "chrome-extension://promptium",
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      temperature: 0.3,
    }),
  });

  const data = await parseJson(response);
  if (!response.ok) {
    throw classifyHttpError(response.status, "OpenRouter request failed.");
  }

  return throwIfEmptyText(readOpenRouterText(data), "OpenRouter");
}

export async function callProvider(systemPrompt, userPrompt, settings = {}) {
  const providerId = normalizeProviderId(
    settings.providerId || settings.activeProvider || PROVIDER_IDS.GEMINI,
  );
  const providerModels = normalizeProviderModels(settings.providerModels || {});
  const modelId = resolveModelId(providerId, providerModels);
  const key = String(settings.apiKey || (await getProviderKey(providerId)) || "").trim();

  if (!key) {
    throw createProviderError("invalid_key", "Provider API key is missing.");
  }

  switch (providerId) {
    case PROVIDER_IDS.GEMINI:
      return callGemini(systemPrompt, userPrompt, modelId, key);
    case PROVIDER_IDS.OPENAI:
      return callOpenAI(systemPrompt, userPrompt, modelId, key);
    case PROVIDER_IDS.ANTHROPIC:
      return callAnthropic(systemPrompt, userPrompt, modelId, key);
    case PROVIDER_IDS.OPENROUTER:
      return callOpenRouter(systemPrompt, userPrompt, modelId, key);
    default:
      throw createProviderError("unknown", `Unknown provider: ${providerId}`);
  }
}

const validateGemini = async (apiKey) => {
  const response = await withTimeout(`${GEMINI_API_ROOT}/models`, {
    method: "GET",
    headers: { "x-goog-api-key": apiKey },
  });
  if (response.ok) return { ok: true, category: "ok", message: "Connected" };
  const error = classifyHttpError(response.status, "Gemini validation failed.");
  return { ok: false, category: error.type, message: error.message, status: response.status };
};

const validateOpenAI = async (apiKey) => {
  const response = await withTimeout(`${OPENAI_API_ROOT}/models`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (response.ok) return { ok: true, category: "ok", message: "Connected" };
  const error = classifyHttpError(response.status, "OpenAI validation failed.");
  return { ok: false, category: error.type, message: error.message, status: response.status };
};

const validateAnthropic = async (apiKey, modelId) => {
  const response = await withTimeout(`${ANTHROPIC_API_ROOT}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 4,
      messages: [{ role: "user", content: "Hi" }],
    }),
  });

  if (response.status !== 401 && response.status !== 403 && response.status !== 429) {
    return { ok: true, category: "ok", message: "Connected" };
  }

  const error = classifyHttpError(response.status, "Anthropic validation failed.");
  return { ok: false, category: error.type, message: error.message, status: response.status };
};

const validateOpenRouter = async (apiKey) => {
  const response = await withTimeout(`${OPENROUTER_API_ROOT}/models`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (response.ok) return { ok: true, category: "ok", message: "Connected" };
  const error = classifyHttpError(response.status, "OpenRouter validation failed.");
  return { ok: false, category: error.type, message: error.message, status: response.status };
};

export const validateProviderKey = async ({
  providerId = "",
  apiKey = "",
  modelId = "",
} = {}) => {
  const resolvedProviderId = normalizeProviderId(providerId);
  const key = String(apiKey || "").trim();
  if (!key) {
    return { ok: false, category: "invalid_key", message: "Missing API key." };
  }

  const resolvedModels = normalizeProviderModels({
    [resolvedProviderId]: modelId,
  });
  const resolvedModelId = resolveModelId(resolvedProviderId, resolvedModels);

  try {
    switch (resolvedProviderId) {
      case PROVIDER_IDS.GEMINI:
        return await validateGemini(key);
      case PROVIDER_IDS.OPENAI:
        return await validateOpenAI(key);
      case PROVIDER_IDS.ANTHROPIC:
        return await validateAnthropic(key, resolvedModelId);
      case PROVIDER_IDS.OPENROUTER:
        return await validateOpenRouter(key);
      default:
        return {
          ok: false,
          category: "unknown",
          message: `Unknown provider: ${resolvedProviderId}`,
        };
    }
  } catch (error) {
    return {
      ok: false,
      category: String(error?.type || "network"),
      message: String(error?.message || "Validation failed."),
    };
  }
};
