/**
 * File: utils/gemini-client.ts
 * Purpose: Direct client interface for the Gemini API.
 */

interface ClientError extends Error {
  type: string;
}

interface ValidationResult {
  ok: boolean;
  category: string;
  message: string;
  status?: number;
}

const DEFAULT_TIMEOUT_MS = 18000;
const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';

const createClientError = (type: string, message: string): ClientError => {
  const error = new Error(String(message || 'Gemini request failed.')) as ClientError;
  error.type = type;
  return error;
};

const withTimeout = async (
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      ...options,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw createClientError('network', 'Request timed out.');
    }
    throw createClientError('network', 'Network request failed.');
  } finally {
    clearTimeout(timeoutId);
  }
};

const classifyHttpError = (
  status: number = 0,
  fallback: string = 'Gemini request failed.'
): ClientError => {
  if (status === 401 || status === 403) {
    return createClientError('invalid_key', 'Invalid API key.');
  }
  if (status === 429) {
    return createClientError('quota', 'Quota exceeded or rate limited.');
  }
  if (!status || status >= 500) {
    return createClientError('network', 'Gemini server network error.');
  }
  return createClientError('unknown', fallback);
};

export const getGeminiApiKey = async (): Promise<string> => {
  const snapshot = (await chrome.storage.session
    .get(['promptiumGeminiKey'])
    .catch(() => ({}))) as any;
  return String(snapshot?.promptiumGeminiKey || '').trim();
};

export const callGemini = async (
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  key?: string
): Promise<string> => {
  const resolvedKey = key || (await getGeminiApiKey());
  if (!resolvedKey) {
    throw createClientError('invalid_key', 'Gemini API key is missing.');
  }

  const response = await withTimeout(`${GEMINI_API_ROOT}/models/${modelId}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': resolvedKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [systemPrompt, userPrompt].filter(Boolean).join('\n\n'),
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 900,
      },
    }),
  });

  if (!response.ok) {
    throw classifyHttpError(response.status, 'Gemini request failed.');
  }

  const data = await response.json().catch(() => null);
  const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  if (!text) {
    throw createClientError('unknown', 'Gemini returned empty output.');
  }
  return text;
};

export const validateGeminiApiKey = async (apiKey: string): Promise<ValidationResult> => {
  const key = String(apiKey || '').trim();
  if (!key) {
    return { ok: false, category: 'invalid_key', message: 'Missing API key.' };
  }

  try {
    const response = await withTimeout(`${GEMINI_API_ROOT}/models`, {
      method: 'GET',
      headers: { 'x-goog-api-key': key },
    });

    if (response.ok) {
      return { ok: true, category: 'ok', message: 'Connected' };
    }
    const error = classifyHttpError(response.status, 'Gemini validation failed.');
    return {
      ok: false,
      category: error.type,
      message: error.message,
      status: response.status,
    };
  } catch (error: any) {
    return {
      ok: false,
      category: String(error?.type || 'network'),
      message: String(error?.message || 'Validation failed.'),
    };
  }
};
