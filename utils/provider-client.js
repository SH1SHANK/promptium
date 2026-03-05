/**
 * File: utils/provider-client.js
 * Purpose: Unified cloud provider request + key validation layer.
 */

import {
  PROVIDER_IDS,
  getProvider,
  getProviderDefaultModel,
  getProviderModelById
} from './model-registry.js';

const DEFAULT_TIMEOUT_MS = 18000;
const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';
const OPENAI_API_ROOT = 'https://api.openai.com/v1';
const ANTHROPIC_API_ROOT = 'https://api.anthropic.com/v1';
const OPENROUTER_API_ROOT = 'https://openrouter.ai/api/v1';

const withTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

const normalizeMessage = (value, fallback = 'Provider request failed.') => {
  const text = String(value || '').trim();
  return text || fallback;
};

const parseJson = async (response) => {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
};

const classifyValidationError = (status = 0, error = null) => {
  if (error?.name === 'AbortError') {
    return { category: 'network_error', message: 'Validation request timed out.' };
  }

  if (status === 401 || status === 403) {
    return { category: 'invalid_key', message: 'Invalid key.' };
  }
  if (status === 429) {
    return { category: 'rate_limited', message: 'Rate limited.' };
  }
  if (!status) {
    return { category: 'network_error', message: 'Network error.' };
  }

  return { category: 'provider_error', message: `Provider error (${status}).` };
};

const readGeminiText = (data) => String(data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

const readOpenAIText = (data) => String(data?.choices?.[0]?.message?.content || '').trim();

const readAnthropicText = (data) => {
  const content = Array.isArray(data?.content) ? data.content : [];
  const firstText = content.find((entry) => String(entry?.type || '').toLowerCase() === 'text');
  return String(firstText?.text || '').trim();
};

const readOpenRouterText = (data) => String(data?.choices?.[0]?.message?.content || '').trim();

const resolveModelId = (providerId = '', selectedModelId = '') => {
  const selected = getProviderModelById(providerId, selectedModelId);
  if (selected?.id) return selected.id;
  return String(getProviderDefaultModel(providerId)?.id || '').trim();
};

const assertProviderConfig = ({ providerId = '', apiKey = '' } = {}) => {
  const provider = getProvider(providerId);
  const key = String(apiKey || '').trim();
  if (!provider) {
    throw new Error(`Unsupported provider: ${providerId || 'unknown'}`);
  }
  if (!key) {
    throw new Error('Missing API key.');
  }
  return { provider, key };
};

const callGemini = async ({ modelId, apiKey, prompt, systemPrompt }) => {
  const body = {
    contents: [{ role: 'user', parts: [{ text: [systemPrompt, prompt].filter(Boolean).join('\n\n') }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 920
    }
  };

  const response = await withTimeout(`${GEMINI_API_ROOT}/models/${modelId}:generateContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await parseJson(response);
  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}).`);
  }

  const text = readGeminiText(data);
  if (!text) {
    throw new Error('Gemini returned empty output.');
  }

  return text;
};

const callOpenAI = async ({ modelId, apiKey, prompt, systemPrompt }) => {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: String(systemPrompt) });
  }
  messages.push({ role: 'user', content: String(prompt || '') });

  const response = await withTimeout(`${OPENAI_API_ROOT}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      temperature: 0.3
    })
  });

  const data = await parseJson(response);
  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}).`);
  }

  const text = readOpenAIText(data);
  if (!text) {
    throw new Error('OpenAI returned empty output.');
  }

  return text;
};

const callAnthropic = async ({ modelId, apiKey, prompt, systemPrompt }) => {
  const response = await withTimeout(`${ANTHROPIC_API_ROOT}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 900,
      system: String(systemPrompt || '').trim() || undefined,
      messages: [{ role: 'user', content: String(prompt || '') }]
    })
  });

  const data = await parseJson(response);
  if (!response.ok) {
    throw new Error(`Anthropic request failed (${response.status}).`);
  }

  const text = readAnthropicText(data);
  if (!text) {
    throw new Error('Anthropic returned empty output.');
  }

  return text;
};

const callOpenRouter = async ({ modelId, apiKey, prompt, systemPrompt, extensionId = '' }) => {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: String(systemPrompt) });
  }
  messages.push({ role: 'user', content: String(prompt || '') });

  const referer = extensionId
    ? `chrome-extension://${extensionId}`
    : 'chrome-extension://promptium';

  const response = await withTimeout(`${OPENROUTER_API_ROOT}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': referer,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      temperature: 0.3
    })
  });

  const data = await parseJson(response);
  if (!response.ok) {
    throw new Error(`OpenRouter request failed (${response.status}).`);
  }

  const text = readOpenRouterText(data);
  if (!text) {
    throw new Error('OpenRouter returned empty output.');
  }

  return text;
};

export const callProvider = async ({
  providerId = PROVIDER_IDS.GEMINI,
  modelId = '',
  apiKey = '',
  prompt = '',
  systemPrompt = '',
  extensionId = ''
} = {}) => {
  const { key } = assertProviderConfig({ providerId, apiKey });
  const resolvedModelId = resolveModelId(providerId, modelId);
  const safePrompt = normalizeMessage(prompt, '');

  if (!safePrompt) {
    throw new Error('Missing user prompt.');
  }

  if (providerId === PROVIDER_IDS.GEMINI) {
    return callGemini({ modelId: resolvedModelId, apiKey: key, prompt: safePrompt, systemPrompt });
  }
  if (providerId === PROVIDER_IDS.OPENAI) {
    return callOpenAI({ modelId: resolvedModelId, apiKey: key, prompt: safePrompt, systemPrompt });
  }
  if (providerId === PROVIDER_IDS.ANTHROPIC) {
    return callAnthropic({ modelId: resolvedModelId, apiKey: key, prompt: safePrompt, systemPrompt });
  }
  if (providerId === PROVIDER_IDS.OPENROUTER) {
    return callOpenRouter({ modelId: resolvedModelId, apiKey: key, prompt: safePrompt, systemPrompt, extensionId });
  }

  throw new Error(`Unsupported provider: ${providerId || 'unknown'}`);
};

const validateGemini = async (apiKey) => {
  const response = await withTimeout(`${GEMINI_API_ROOT}/models`, {
    method: 'GET',
    headers: {
      'x-goog-api-key': apiKey
    }
  });

  if (response.ok) {
    return { ok: true, category: 'ok', message: 'Connected' };
  }

  const normalized = classifyValidationError(response.status);
  return { ok: false, category: normalized.category, message: normalized.message, status: response.status };
};

const validateOpenAI = async (apiKey) => {
  const response = await withTimeout(`${OPENAI_API_ROOT}/models`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (response.ok) {
    return { ok: true, category: 'ok', message: 'Connected' };
  }

  const normalized = classifyValidationError(response.status);
  return { ok: false, category: normalized.category, message: normalized.message, status: response.status };
};

const validateAnthropic = async (apiKey, modelId) => {
  const resolvedModelId = resolveModelId(PROVIDER_IDS.ANTHROPIC, modelId);
  const response = await withTimeout(`${ANTHROPIC_API_ROOT}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: resolvedModelId,
      max_tokens: 4,
      messages: [{ role: 'user', content: 'Hi' }]
    })
  });

  if (response.status === 429) {
    const normalized = classifyValidationError(response.status);
    return { ok: false, category: normalized.category, message: normalized.message, status: response.status };
  }

  if (response.status !== 401 && response.status !== 403) {
    return { ok: true, category: 'ok', message: 'Connected' };
  }

  const normalized = classifyValidationError(response.status);
  return { ok: false, category: normalized.category, message: normalized.message, status: response.status };
};

const validateOpenRouter = async (apiKey) => {
  const response = await withTimeout(`${OPENROUTER_API_ROOT}/models`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (response.ok) {
    return { ok: true, category: 'ok', message: 'Connected' };
  }

  const normalized = classifyValidationError(response.status);
  return { ok: false, category: normalized.category, message: normalized.message, status: response.status };
};

export const validateProviderKey = async ({ providerId = '', apiKey = '', modelId = '' } = {}) => {
  try {
    assertProviderConfig({ providerId, apiKey });
  } catch (error) {
    return { ok: false, category: 'invalid_key', message: normalizeMessage(error?.message, 'Invalid key.') };
  }

  const key = String(apiKey || '').trim();

  try {
    if (providerId === PROVIDER_IDS.GEMINI) {
      return await validateGemini(key);
    }
    if (providerId === PROVIDER_IDS.OPENAI) {
      return await validateOpenAI(key);
    }
    if (providerId === PROVIDER_IDS.ANTHROPIC) {
      return await validateAnthropic(key, modelId);
    }
    if (providerId === PROVIDER_IDS.OPENROUTER) {
      return await validateOpenRouter(key);
    }

    return { ok: false, category: 'provider_error', message: `Unsupported provider: ${providerId || 'unknown'}` };
  } catch (error) {
    const normalized = classifyValidationError(0, error);
    return {
      ok: false,
      category: normalized.category,
      message: normalized.message
    };
  }
};
