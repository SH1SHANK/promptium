/**
 * File: background/service_worker.js
 * Purpose: Initializes storage, configures side panel behavior, handles extension-level
 *          runtime actions, and owns the on-device Transformers.js AI model.
 * Communicates with: utils/storage.js, popup/popup.js, content/content.js, utils/ai-bridge.js.
 */

import { pipeline, env } from '../libs/transformers.min.js';
import { routeAIRequest, AI_BACKEND_GEMINI, AI_BACKEND_LOCAL } from '../utils/ai-router.js';

// ─── Transformers.js Environment ─────────────────────────────────────────────

env.allowRemoteModels = true;
env.localModelPath = '../models/';
env.backends.onnx.wasm.numThreads = 1;

// ─── AI State ────────────────────────────────────────────────────────────────

const AI = {
  pipe: null,
  status: 'idle',          // idle | loading | ready | failed
  embeddingCache: {},      // promptId → Float32Array
};

const BRAND_KEYS = {
  geminiKey: 'promptiumGeminiKey',
  settingsKey: 'promptiumSettings',
  sidePanelPayload: 'promptiumSidePanelPayload',
  improvePayload: 'promptiumImprovePayload',
  pendingSnippet: 'pendingSnippet'
};

const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL = 'gemini-2.0-flash-lite';
const GEMINI_TIMEOUT_MS = 15000;
const CONTINUATION_WORD_LIMIT = 300;
const CONTINUATION_LONG_THRESHOLD = 20;
const CONTEXT_MENU_SAVE_ID = 'promptium-save-selection';
const LOCAL_MODEL_TASK_TIMEOUT_MS = 120000;
const LOCAL_IDLE_RELEASE_MS = 5 * 60 * 1000;
const OFFSCREEN_LOCAL_TARGET = 'promptium-offscreen-local-ai';
const OFFSCREEN_LOCAL_URL = 'offscreen/local-model-worker.html';
const LOCAL_MODEL_LABELS = Object.freeze({
  smollm2_1_7b: 'SmolLM2',
  phi35_mini: 'Phi-3.5-mini',
  qwen3_0_6b: 'Qwen3'
});

const LOCAL_MODEL = {
  modelId: 'smollm2_1_7b',
  status: 'not_downloaded',
  progress: 0,
  backend: 'webgpu',
  error: '',
  cpuMode: false
};

let offscreenLocalReady = false;
let offscreenLocalInitPromise = null;
let localIdleReleaseTimer = null;

/** Executes fetch with strict defaults to reduce accidental data leakage and hangs. */
const safeFetch = async (url, options = {}, timeoutMs = GEMINI_TIMEOUT_MS) => {
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

/** Builds Gemini request headers without exposing key in URL/query strings. */
const buildGeminiHeaders = (apiKey, includeJsonContentType = true) => {
  const headers = {
    'x-goog-api-key': String(apiKey || '').trim()
  };
  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
};

/** Redacts obvious secret-like and PII patterns before external API calls. */
const redactSensitiveText = (value) => String(value || '')
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
  .replace(/\b(?:sk|ghp_|AIzaSy)[A-Za-z0-9_\-]{12,}\b/g, '[redacted-token]')
  .replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, '[redacted-ssn]');

const normalizeContinuationRole = (role) => {
  const value = String(role || '').trim().toLowerCase();
  if (['user', 'you', 'human'].includes(value)) return 'Human';
  if (['assistant', 'model', 'bot', 'ai'].includes(value)) return 'Assistant';
  return value.includes('user') ? 'Human' : 'Assistant';
};

const limitWords = (value, maxWords) => {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return words.join(' ').trim();
  }
  return `${words.slice(0, maxWords).join(' ').trim()}…`;
};

const buildContinuationPrompt = (messages, mode, userNote = '') => {
  const transcript = (Array.isArray(messages) ? messages : [])
    .slice(-24)
    .map((message) => `${normalizeContinuationRole(message?.role)}: ${redactSensitiveText(message?.text || '')}`.trim())
    .filter(Boolean)
    .join('\n\n');

  return [
    'You are helping a user continue a conversation in a new chat window.',
    'Summarize the following conversation as a clear handoff context.',
    `Mode: ${String(mode || 'FULL_SUMMARY')}`,
    `Additional note from user: ${String(userNote || '').trim() || 'none'}`,
    '',
    'Write in second person. Start with "We were working on...".',
    `Keep it under ${CONTINUATION_WORD_LIMIT} words. End with "Continue from here:".`,
    '',
    'Conversation:',
    transcript
  ].join('\n');
};

const clampText = (value, limit = 5000) => String(value || '').trim().slice(0, limit);

const deriveFallbackTitle = (value) => {
  const compact = clampText(value || '', 240).replace(/\s+/g, ' ').trim();
  if (!compact) return 'Untitled Prompt';
  const firstSentence = compact.split(/[.!?]/)[0]?.trim() || compact;
  return firstSentence.slice(0, 80) || 'Untitled Prompt';
};

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
};

const parseClarityFromText = (rawText, sourceText = '') => {
  const text = String(rawText || '').trim();
  const direct = safeJsonParse(text);
  const parsed = direct && typeof direct === 'object'
    ? direct
    : safeJsonParse(text.match(/\{[\s\S]*\}/)?.[0] || '');

  const fallback = (() => {
    const source = clampText(sourceText, 4800);
    if (!source) {
      return { score: 0, explanation: 'No prompt content provided.' };
    }
    const hasGoal = /(write|create|generate|explain|summarize|analyze|compare|build|draft|optimize)/i.test(source);
    const hasConstraints = /(format|tone|style|length|max|min|steps|table|json|markdown|audience)/i.test(source);
    let score = 40 + (hasGoal ? 20 : 0) + (hasConstraints ? 20 : 0);
    if (source.length > 110) score += 12;
    if (/\[[^\]]+\]/.test(source)) score += 8;
    if (source.length > 520) score -= 6;
    score = Math.max(0, Math.min(100, Math.round(score)));
    const explanation = score >= 75
      ? 'Clear goal with useful constraints.'
      : score >= 55
        ? 'Reasonably clear, but can use more concrete constraints.'
        : 'Needs clearer goal, context, and output constraints.';
    return { score, explanation };
  })();

  const scoreRaw = Number(parsed?.score);
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : fallback.score;
  const explanation = String(parsed?.explanation || '').trim() || fallback.explanation;

  return { score, explanation };
};

const getAiRuntimeSettings = async () => {
  try {
    const snapshot = await chrome.storage.local.get([BRAND_KEYS.settingsKey]);
    const settings = snapshot?.[BRAND_KEYS.settingsKey] || {};

    const legacyBackend = String(settings?.aiBackend || AI_BACKEND_GEMINI).trim().toLowerCase();
    const preferLocal = typeof settings?.preferLocal === 'boolean'
      ? settings.preferLocal
      : legacyBackend === AI_BACKEND_LOCAL;

    const useLocalFallback = typeof settings?.useLocalFallback === 'boolean'
      ? settings.useLocalFallback
      : settings?.aiAutoFallback !== false;

    const localFeatureFlags = settings?.localFeatureFlags && typeof settings.localFeatureFlags === 'object'
      ? settings.localFeatureFlags
      : {
          polish: true,
          autoTags: true,
          improvePrompt: true,
          continueSummary: true,
          smartExportTitle: false
        };

    const localModelId = String(settings?.localModelId || 'smollm2_1_7b').trim().toLowerCase();
    const hasLegacySignals = Object.prototype.hasOwnProperty.call(settings, 'aiBackend')
      || Object.prototype.hasOwnProperty.call(settings, 'aiAutoFallback')
      || Object.prototype.hasOwnProperty.call(settings, 'polishWithGemini');
    const legacyAutoRewriteOnSave = typeof settings?.legacyAutoRewriteOnSave === 'boolean'
      ? settings.legacyAutoRewriteOnSave
      : (settings?.settingsMigratedV2 ? false : hasLegacySignals);

    return {
      enableAI: settings?.enableAI !== false,
      preferLocal,
      useLocalFallback,
      localModelId: localModelId || 'smollm2_1_7b',
      localFeatureFlags,
      legacyAutoRewriteOnSave
    };
  } catch (_error) {
    return {
      enableAI: true,
      preferLocal: false,
      useLocalFallback: true,
      localModelId: 'smollm2_1_7b',
      localFeatureFlags: {
        polish: true,
        autoTags: true,
        improvePrompt: true,
        continueSummary: true,
        smartExportTitle: false
      },
      legacyAutoRewriteOnSave: false
    };
  }
};

const clearLocalIdleReleaseTimer = () => {
  if (!localIdleReleaseTimer) return;
  clearTimeout(localIdleReleaseTimer);
  localIdleReleaseTimer = null;
};

const scheduleLocalIdleRelease = () => {
  clearLocalIdleReleaseTimer();
  localIdleReleaseTimer = setTimeout(() => {
    void (async () => {
      try {
        await chrome.runtime.sendMessage({
          target: OFFSCREEN_LOCAL_TARGET,
          type: 'AI_LOCAL_MODEL_RELEASE_IDLE',
          payload: { modelId: LOCAL_MODEL.modelId }
        });
      } catch (_error) {
        // ignore relay failure
      }

      try {
        await chrome.offscreen?.closeDocument?.();
      } catch (_error) {
        // ignore if already closed
      }

      offscreenLocalReady = false;
      if (LOCAL_MODEL.status === 'ready' || LOCAL_MODEL.status === 'loading') {
        LOCAL_MODEL.status = 'cached';
      }
      LOCAL_MODEL.progress = LOCAL_MODEL.status === 'not_downloaded' ? 0 : 100;
      broadcast({
        type: 'AI_LOCAL_MODEL_STATUS',
        modelId: LOCAL_MODEL.modelId,
        status: LOCAL_MODEL.status,
        backend: LOCAL_MODEL.backend,
        progress: LOCAL_MODEL.progress,
        error: LOCAL_MODEL.error || '',
        cpuMode: LOCAL_MODEL.cpuMode
      });
    })();
  }, LOCAL_IDLE_RELEASE_MS);
};

const updateLocalStatusFromEvent = (message = {}) => {
  const status = String(message?.status || '').trim().toLowerCase();
  const backend = String(message?.backend || '').trim().toLowerCase();
  const modelId = String(message?.modelId || '').trim().toLowerCase();
  const progressRaw = Number(message?.progress);
  const progress = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, Math.round(progressRaw))) : null;
  const error = String(message?.error || '').trim();
  const cpuMode = Boolean(message?.cpuMode) || backend === 'wasm';

  if (status) LOCAL_MODEL.status = status;
  if (backend) LOCAL_MODEL.backend = backend;
  if (modelId) LOCAL_MODEL.modelId = modelId;
  if (Number.isFinite(progress)) LOCAL_MODEL.progress = progress;
  if (Object.prototype.hasOwnProperty.call(message || {}, 'error')) {
    LOCAL_MODEL.error = error;
  } else if (status && status !== 'error') {
    LOCAL_MODEL.error = '';
  }
  LOCAL_MODEL.cpuMode = cpuMode;

  if (status === 'ready' || status === 'loading' || status === 'cached' || status === 'downloading') {
    scheduleLocalIdleRelease();
  }

  const payload = {
    modelId: LOCAL_MODEL.modelId,
    modelLabel: LOCAL_MODEL_LABELS[LOCAL_MODEL.modelId] || LOCAL_MODEL.modelId,
    status: LOCAL_MODEL.status,
    progress: LOCAL_MODEL.progress,
    backend: LOCAL_MODEL.backend,
    error: LOCAL_MODEL.error || '',
    cpuMode: LOCAL_MODEL.cpuMode
  };

  broadcast({
    type: 'AI_LOCAL_MODEL_STATUS',
    ...payload
  });
  broadcast({
    type: 'AI_LOCAL_STATUS_BROADCAST',
    ...payload
  });
};

const ensureOffscreenLocalHost = async () => {
  if (offscreenLocalReady) {
    return true;
  }

  if (offscreenLocalInitPromise) {
    return offscreenLocalInitPromise;
  }

  offscreenLocalInitPromise = (async () => {
    if (!chrome.offscreen?.createDocument || !chrome.runtime?.getContexts) {
      throw new Error('Offscreen API unavailable for local model host.');
    }

    const absoluteUrl = chrome.runtime.getURL(OFFSCREEN_LOCAL_URL);
    const existing = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [absoluteUrl]
    });

    if (!existing.length) {
      try {
        await chrome.offscreen.createDocument({
          url: OFFSCREEN_LOCAL_URL,
          reasons: ['WORKERS'],
          justification: 'Run local model inference in a Web Worker without blocking UI.'
        });
      } catch (_error) {
        await chrome.offscreen.createDocument({
          url: OFFSCREEN_LOCAL_URL,
          reasons: ['DOM_PARSER'],
          justification: 'Run local model inference in a Web Worker without blocking UI.'
        });
      }
    }

    offscreenLocalReady = true;
    return true;
  })();

  try {
    return await offscreenLocalInitPromise;
  } finally {
    offscreenLocalInitPromise = null;
  }
};

const runLocalTaskViaOffscreen = async (type, task = '', payload = {}, timeoutMs = LOCAL_MODEL_TASK_TIMEOUT_MS) => {
  await ensureOffscreenLocalHost();

  const requestPromise = chrome.runtime.sendMessage({
    target: OFFSCREEN_LOCAL_TARGET,
    type,
    task,
    payload
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Local model request timed out.')), timeoutMs);
  });

  const response = await Promise.race([requestPromise, timeoutPromise]);
  if (!response?.ok) {
    throw new Error(String(response?.error || 'Local model request failed.'));
  }
  return response?.result || {};
};

const runLocalWorkerTask = async (type, task = '', payload = {}, timeoutMs = LOCAL_MODEL_TASK_TIMEOUT_MS) => {
  LOCAL_MODEL.modelId = String(payload?.modelId || LOCAL_MODEL.modelId || 'smollm2_1_7b').toLowerCase();
  scheduleLocalIdleRelease();
  return runLocalTaskViaOffscreen(type, task, payload, timeoutMs);
};

const initLocalModel = async () => {
  try {
    const runtime = await getAiRuntimeSettings();
    const modelId = String(runtime?.localModelId || LOCAL_MODEL.modelId || 'smollm2_1_7b').toLowerCase();
    LOCAL_MODEL.modelId = modelId;
    const result = await runLocalWorkerTask('AI_LOCAL_MODEL_INIT', '', { modelId }, 180000);
    LOCAL_MODEL.status = String(result?.status || 'ready');
    if (result?.backend) {
      LOCAL_MODEL.backend = String(result.backend);
    }
    LOCAL_MODEL.cpuMode = Boolean(result?.cpuMode) || LOCAL_MODEL.backend === 'wasm';
    LOCAL_MODEL.progress = LOCAL_MODEL.status === 'not_downloaded' ? 0 : 100;
    scheduleLocalIdleRelease();
    return { ok: true, ...result };
  } catch (error) {
    LOCAL_MODEL.status = 'error';
    LOCAL_MODEL.error = String(error?.message || 'Local model initialization failed.');
    return { ok: false, error: LOCAL_MODEL.error };
  }
};

const runLocalTextTask = async (task, payload) => {
  const runtime = await getAiRuntimeSettings();
  const modelId = String(runtime?.localModelId || LOCAL_MODEL.modelId || 'smollm2_1_7b').toLowerCase();
  LOCAL_MODEL.modelId = modelId;

  if (LOCAL_MODEL.status === 'not_downloaded') {
    const cacheSnapshot = await chrome.storage.local.get(['localModelCacheIndex']).catch(() => ({}));
    const index = cacheSnapshot?.localModelCacheIndex && typeof cacheSnapshot.localModelCacheIndex === 'object'
      ? cacheSnapshot.localModelCacheIndex
      : {};
    const entry = index?.[modelId] || {};
    const hasCachedArtifacts = (Array.isArray(entry?.urlPatterns) && entry.urlPatterns.length > 0)
      || (Array.isArray(entry?.cacheNames) && entry.cacheNames.length > 0);
    if (!hasCachedArtifacts) {
      throw new Error('Local model not downloaded. Download it in Settings first.');
    }
    LOCAL_MODEL.status = 'cached';
    LOCAL_MODEL.progress = 100;
  }

  const init = await initLocalModel();
  if (!init.ok) {
    throw new Error(init.error || 'Local model unavailable.');
  }
  const result = await runLocalWorkerTask('RUN_LOCAL_TASK', task, { ...(payload || {}), modelId }, LOCAL_MODEL_TASK_TIMEOUT_MS);
  scheduleLocalIdleRelease();
  return result;
};

const getLocalStatusPayload = () => ({
  modelId: LOCAL_MODEL.modelId,
  modelLabel: LOCAL_MODEL_LABELS[LOCAL_MODEL.modelId] || LOCAL_MODEL.modelId,
  status: LOCAL_MODEL.status,
  progress: LOCAL_MODEL.progress,
  backend: LOCAL_MODEL.backend,
  error: LOCAL_MODEL.error || '',
  cpuMode: LOCAL_MODEL.cpuMode
});

const downloadLocalModel = async (modelId = '') => {
  const resolved = String(modelId || LOCAL_MODEL.modelId || 'smollm2_1_7b').trim().toLowerCase();
  LOCAL_MODEL.modelId = resolved || 'smollm2_1_7b';
  const result = await runLocalWorkerTask('AI_LOCAL_MODEL_DOWNLOAD', '', { modelId: LOCAL_MODEL.modelId }, 240000);
  updateLocalStatusFromEvent(result || {});
  scheduleLocalIdleRelease();
  return { ok: true, ...getLocalStatusPayload() };
};

const cancelLocalModelDownload = async (modelId = '') => {
  const resolved = String(modelId || LOCAL_MODEL.modelId || 'smollm2_1_7b').trim().toLowerCase();
  LOCAL_MODEL.modelId = resolved || 'smollm2_1_7b';
  const result = await runLocalWorkerTask('AI_LOCAL_MODEL_CANCEL_DOWNLOAD', '', { modelId: LOCAL_MODEL.modelId }, 45000);
  updateLocalStatusFromEvent(result || {});
  scheduleLocalIdleRelease();
  return { ok: true, ...getLocalStatusPayload() };
};

const clearLocalModelCache = async (modelId = '') => {
  const resolved = String(modelId || LOCAL_MODEL.modelId || 'smollm2_1_7b').trim().toLowerCase();
  LOCAL_MODEL.modelId = resolved || 'smollm2_1_7b';
  try {
    const result = await runLocalWorkerTask('AI_LOCAL_MODEL_REMOVE_CACHE', '', { modelId: LOCAL_MODEL.modelId }, 120000);
    updateLocalStatusFromEvent(result || {});
    scheduleLocalIdleRelease();
    return {
      ok: Boolean(result?.ok),
      deletedRequests: Number(result?.deletedRequests || 0),
      error: String(result?.error || '').trim() || undefined,
      ...getLocalStatusPayload()
    };
  } catch (error) {
    LOCAL_MODEL.status = 'error';
    LOCAL_MODEL.error = String(error?.message || 'Failed to clear cached model data.');
    broadcast({ type: 'AI_LOCAL_STATUS_BROADCAST', ...getLocalStatusPayload() });
    return { ok: false, deletedRequests: 0, error: LOCAL_MODEL.error, ...getLocalStatusPayload() };
  }
};

const runWithConfiguredBackend = async ({
  feature = '',
  geminiTask,
  localTask,
  forceGemini = false,
  geminiApiKey = '',
  noGeminiMessage = 'Gemini API key is not configured.'
}) => {
  const runtime = await getAiRuntimeSettings();
  const apiKey = String(geminiApiKey || '').trim() || await getGeminiApiKey();
  const hasGeminiKey = Boolean(apiKey);

  const routed = await routeAIRequest({
    feature,
    settings: runtime,
    hasGeminiKey,
    forceGemini,
    localTask: typeof localTask === 'function'
      ? async () => {
          const localResult = await localTask();
          return {
            ok: true,
            ...localResult
          };
        }
      : null,
    geminiTask: typeof geminiTask === 'function'
      ? async () => {
          if (!apiKey) {
            return { ok: false, error: noGeminiMessage };
          }
          const geminiResult = await geminiTask(apiKey);
          return {
            ok: true,
            ...geminiResult
          };
        }
      : null
  });

  if (!routed?.ok) {
    throw new Error(String(routed?.error || noGeminiMessage));
  }

  return {
    backend: String(routed.backend || '').trim().toLowerCase() || (forceGemini ? AI_BACKEND_GEMINI : AI_BACKEND_LOCAL),
    advisory: String(routed?.advisory || '').trim() || undefined,
    ...routed
  };
};

/** Returns the configured Promptium Gemini API key. */
const getGeminiApiKey = async () => {
  const sessionSnapshot = await chrome.storage.session.get([BRAND_KEYS.geminiKey]);
  const sessionKey = String(sessionSnapshot?.[BRAND_KEYS.geminiKey] || '').trim();
  if (sessionKey) {
    return sessionKey;
  }

  // Backward compatibility: read legacy local key once, promote to session, then clear persistent copy.
  const localSnapshot = await chrome.storage.local.get([BRAND_KEYS.geminiKey]);
  const localKey = String(localSnapshot?.[BRAND_KEYS.geminiKey] || '').trim();
  if (localKey) {
    await chrome.storage.session.set({ [BRAND_KEYS.geminiKey]: localKey });
    await chrome.storage.local.remove([BRAND_KEYS.geminiKey]).catch(() => {});
  }
  return localKey;
};

/** Calls Gemini generateContent endpoint with secure request defaults. */
const callGeminiGenerateContent = async (apiKey, payload) => safeFetch(
  `${GEMINI_API_ROOT}/models/${GEMINI_MODEL}:generateContent`,
  {
    method: 'POST',
    headers: buildGeminiHeaders(apiKey, true),
    body: JSON.stringify(payload)
  }
);

/** Validates a Gemini API key without exposing it in URL query parameters. */
const validateGeminiApiKey = async (rawKey) => {
  const key = String(rawKey || '').trim();
  if (!key) {
    return { ok: false, error: 'Missing API key.' };
  }

  try {
    const response = await safeFetch(`${GEMINI_API_ROOT}/models`, {
      method: 'GET',
      headers: buildGeminiHeaders(key, false)
    });
    if (!response.ok) {
      return { ok: false, error: `Gemini API key validation failed (${response.status}).` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.name === 'AbortError' ? 'Gemini key validation timed out.' : 'Gemini key validation failed.' };
  }
};

// ─── AI Bootstrap ────────────────────────────────────────────────────────────

async function loadModel() {
  if (AI.status === 'ready' || AI.status === 'loading') return;

  AI.status = 'loading';
  broadcast({ type: 'AI_STATUS', status: 'loading' });

  try {
    AI.pipe = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      {
        progress_callback: (data) => {
          if (data.status === 'progress') {
            broadcast({
              type: 'AI_DOWNLOAD_PROGRESS',
              progress: Math.round(data.progress ?? 0),
            });
          }
        },
      }
    );

    // Warm up with a dummy inference so first real call is instant
    await embed('warmup');

    // Rebuild embedding cache from stored prompts
    await rebuildCache();

    AI.status = 'ready';
    broadcast({ type: 'AI_STATUS', status: 'ready' });
  } catch (err) {
    AI.status = 'failed';
    broadcast({ type: 'AI_STATUS', status: 'failed', error: err.message });
    console.warn('[Promptium AI] Model failed to load:', err.message);
  }
}

// ─── AI Core Utilities ───────────────────────────────────────────────────────

async function embed(text) {
  if (!AI.pipe) throw new Error('Model not ready');
  const output = await AI.pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function broadcast(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel may be closed — ignore silently
  });
}

// ─── Embedding Cache ─────────────────────────────────────────────────────────

let _cacheSaveTimer = null;
const CACHE_SAVE_DELAY_MS = 5000;

/** Debounced write of embedding cache to storage — coalesces rapid mutations. */
function scheduleCacheSave() {
  if (_cacheSaveTimer) clearTimeout(_cacheSaveTimer);
  _cacheSaveTimer = setTimeout(() => {
    _cacheSaveTimer = null;
    chrome.storage.local.set({ embeddingCache: AI.embeddingCache }).catch(() => {});
  }, CACHE_SAVE_DELAY_MS);
}

async function rebuildCache() {
  const { prompts = [] } = await chrome.storage.local.get('prompts');
  const stored = await chrome.storage.local.get('embeddingCache');
  AI.embeddingCache = stored.embeddingCache ?? {};

  const toEmbed = prompts.filter(p => !AI.embeddingCache[p.id]);

  for (const prompt of toEmbed) {
    try {
      const text = `${prompt.title} ${prompt.text} ${(prompt.tags ?? []).join(' ')}`;
      AI.embeddingCache[prompt.id] = await embed(text);
    } catch (_) {
      // Skip if individual embed fails
    }
  }

  // Flush immediately after full rebuild
  await chrome.storage.local.set({ embeddingCache: AI.embeddingCache });
}

async function addToCache(prompt) {
  try {
    const text = `${prompt.title} ${prompt.text} ${(prompt.tags ?? []).join(' ')}`;
    AI.embeddingCache[prompt.id] = await embed(text);
    scheduleCacheSave();
  } catch (_) {}
}

async function removeFromCache(promptId) {
  delete AI.embeddingCache[promptId];
  scheduleCacheSave();
}

// ─── AI Feature: Semantic Search ─────────────────────────────────────────────

async function semanticSearch(query) {
  if (AI.status !== 'ready' || !AI.pipe) return null;

  const queryEmbed = await embed(query);
  const { prompts = [] } = await chrome.storage.local.get('prompts');

  const scored = prompts
    .filter(p => AI.embeddingCache[p.id])
    .map(p => ({
      id: p.id,
      score: cosineSimilarity(queryEmbed, AI.embeddingCache[p.id]),
    }))
    .filter(r => r.score > 0.25)
    .sort((a, b) => b.score - a.score);

  // Mark results that semantic search surfaced but keyword search would miss
  const queryLower = query.toLowerCase();
  const keywordIds = new Set(
    prompts
      .filter(p =>
        p.title?.toLowerCase().includes(queryLower) ||
        p.text?.toLowerCase().includes(queryLower) ||
        (p.tags ?? []).some(t => t.toLowerCase().includes(queryLower))
      )
      .map(p => p.id)
  );

  return scored.map(r => ({
    id: r.id,
    score: r.score,
    semanticOnly: !keywordIds.has(r.id),
  }));
}

// ─── AI Feature: Auto-Tagging ────────────────────────────────────────────────

const TAG_DEFINITIONS = {
  coding:    'write code, programming, debug, fix bug, function, algorithm',
  writing:   'write essay, improve text, edit, proofread, grammar, draft',
  explain:   'explain concept, simplify, teach, what is, how does, ELI5',
  research:  'research, summarize, analyze, find information, compare',
  creative:  'creative writing, story, poem, brainstorm, ideas, imagine',
  planning:  'plan, organize, schedule, steps, outline, strategy, tasks',
  data:      'data analysis, table, spreadsheet, numbers, statistics, SQL',
  translate: 'translate, language, convert, localize',
};

const suggestTagsHeuristic = (promptText, maxCount = 3) => {
  const normalized = String(promptText || '').toLowerCase();
  if (!normalized) return [];

  const scored = Object.entries(TAG_DEFINITIONS)
    .map(([tag, definition]) => {
      const keywords = String(definition || '')
        .toLowerCase()
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const score = keywords.reduce((sum, keyword) => (
        normalized.includes(keyword) ? sum + 1 : sum
      ), 0);
      return { tag, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxCount)
    .map((entry) => entry.tag);

  return scored;
};

const parseTagsFromModelText = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return [];

  const parsedJson = safeJsonParse(raw) || safeJsonParse(raw.match(/\[[\s\S]*\]/)?.[0] || '');
  if (Array.isArray(parsedJson)) {
    return parsedJson
      .map((item) => String(item || '').toLowerCase().trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  return raw
    .split(/[,|\n]/)
    .map((item) => String(item || '').toLowerCase().replace(/[^a-z0-9-_]/g, '').trim())
    .filter(Boolean)
    .slice(0, 3);
};

const suggestTagsViaGeminiStrict = async (apiKey, promptText) => {
  const source = clampText(promptText, 2200);
  if (!source) {
    throw new Error('Empty prompt text provided.');
  }

  const instruction = [
    'Suggest 2-3 short lowercase tags for this prompt.',
    'Return strict JSON array only, e.g. ["coding","debugging"].',
    'No prose.'
  ].join('\n');

  const response = await callGeminiGenerateContent(apiKey, {
    contents: [{ role: 'user', parts: [{ text: `${instruction}\n\nPrompt:\n${source}` }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 80
    }
  });

  if (!response.ok) {
    throw new Error(`Gemini API request failed (${response.status}).`);
  }

  const data = await response.json();
  const tags = parseTagsFromModelText(readGeminiText(data));
  return { tags };
};

async function suggestTags(promptText) {
  const source = clampText(promptText, 2600);
  if (!source) return { ok: false, tags: [], error: 'Prompt text is required.' };

  try {
    const result = await runWithConfiguredBackend({
      feature: 'autoTags',
      geminiTask: (apiKey) => suggestTagsViaGeminiStrict(apiKey, source),
      localTask: () => runLocalTextTask('tags', { text: source }),
      noGeminiMessage: 'No Gemini API Key found in Extension Settings.'
    });

    const tags = Array.isArray(result?.tags)
      ? result.tags.map((tag) => String(tag || '').trim().toLowerCase()).filter(Boolean).slice(0, 3)
      : [];
    const fallbackTags = suggestTagsHeuristic(source, 3);
    return {
      ok: true,
      tags: tags.length ? tags : fallbackTags,
      backend: String(result?.backend || '').trim().toLowerCase() || undefined,
      advisory: String(result?.advisory || '').trim() || undefined
    };
  } catch (_error) {
    return {
      ok: true,
      tags: suggestTagsHeuristic(source, 3),
      backend: 'fallback'
    };
  }
}

// ─── AI Feature: Duplicate Detection ─────────────────────────────────────────

const normalizeDuplicateValue = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^\w\s]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const buildDuplicateCandidate = (title, text) => {
  const trimmedText = String(text || '').slice(0, 80);
  return `${normalizeDuplicateValue(title)}\n${normalizeDuplicateValue(trimmedText)}`.trim();
};

const levenshteinDistance = (left, right) => {
  const a = String(left || '');
  const b = String(right || '');
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[rows - 1][cols - 1];
};

const duplicateSimilarity = (left, right) => {
  const a = String(left || '');
  const b = String(right || '');
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 1;
  return 1 - (levenshteinDistance(a, b) / maxLen);
};

async function checkDuplicate(promptText, excludeId = null) {
  const { prompts = [] } = await chrome.storage.local.get('prompts');
  const payload = promptText && typeof promptText === 'object'
    ? promptText
    : { title: '', text: String(promptText || '') };
  const target = buildDuplicateCandidate(payload?.title || '', payload?.text || '');
  if (!target) return null;

  let bestPrompt = null;
  let bestScore = 0;

  for (const prompt of prompts) {
    if (prompt.id === excludeId) continue;
    const candidate = buildDuplicateCandidate(prompt?.title || '', prompt?.text || '');
    if (!candidate) continue;
    const score = duplicateSimilarity(target, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestPrompt = prompt;
    }
  }

  if (bestPrompt && bestScore > 0.85) {
    return { prompt: bestPrompt, score: bestScore };
  }
  return null;
}

// ─── AI Feature: Smart Suggestions via Gemini Flash Lite ─────────────────────

async function getSmartSuggestions(conversationText) {
  if (!conversationText || conversationText.length < 30) return null;

  try {
    const promptiumGeminiKey = await getGeminiApiKey();
    if (!promptiumGeminiKey) return null;

    const { prompts = [] } = await chrome.storage.local.get('prompts');
    if (!prompts.length) return null;

    const promptList = prompts
      .slice(0, 30)
      .map((p, i) => `${i + 1}. [${p.id}] "${p.title}"${p.tags?.length ? ` (tags: ${p.tags.join(', ')})` : ''}`)
      .join('\n');

    const systemPrompt = `You are a prompt suggestion engine. Given a conversation snippet and a numbered list of saved prompts, return the IDs of the top 3 most relevant prompts. Reply ONLY with a JSON array of ID strings, e.g. ["id1","id2","id3"]. If none are relevant, reply [].`;

    const safeConversation = redactSensitiveText(conversationText).slice(0, 600);
    const userMessage = `Conversation:\n${safeConversation}\n\nSaved prompts:\n${promptList}`;

    const response = await callGeminiGenerateContent(promptiumGeminiKey, {
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 200
      }
    });

    if (!response.ok) return null;

    const data = await response.json();
    const textResult = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Parse the JSON array from the response
    const match = textResult.match(/\[[\s\S]*?\]/);
    if (!match) return null;

    const ids = JSON.parse(match[0]);
    if (!Array.isArray(ids)) return null;

    // Validate returned IDs exist in prompts
    const promptIdSet = new Set(prompts.map(p => p.id));
    const validIds = ids.filter(id => promptIdSet.has(id)).slice(0, 3);

    return validIds.length > 0 ? validIds : null;
  } catch (_) {
    return null;
  }
}

// ─── AI Feature: AI Prompt Improvement, Paraphrase, Title, Clarity ──────────

const readGeminiText = (data) => String(data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

async function improvePromptViaGeminiStrict(apiKey, text, tags = [], style = 'general') {
  if (!text || text.trim().length === 0) {
    throw new Error('Empty prompt text provided.');
  }

  let styleInstruction = 'Make it clear, concise, and highly effective for an AI.';
  if (style === 'coding') {
    styleInstruction = 'Optimize for software engineering. Ask for code snippets, architecture details, and edge case handling.';
  } else if (style === 'study') {
    styleInstruction = 'Optimize for learning and summarization. Ask for clear explanations, analogies, and step-by-step breakdowns.';
  } else if (style === 'creative') {
    styleInstruction = 'Optimize for creative writing. Ask for vivid imagery, character depth, and engaging tone.';
  }

  const safeTags = Array.isArray(tags) ? tags.map((tag) => String(tag || '').trim()).filter(Boolean) : [];
  const tagContext = safeTags.length > 0 ? `Incorporate these concepts/topics: ${safeTags.join(', ')}.` : '';

  const systemPrompt = `You are an expert prompt engineer. Your goal is to improve the user's prompt so it yields the best possible response from an LLM.
${styleInstruction}
${tagContext}
ONLY return the improved prompt text. Do not add quotes, do not explain your changes, and do not add headings.`;

  const response = await callGeminiGenerateContent(apiKey, {
    contents: [
      { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser's Original Prompt: ${clampText(text, 5000)}` }] }
    ],
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 820
    }
  });

  if (!response.ok) {
    throw new Error(`Gemini API request failed (${response.status}).`);
  }

  const data = await response.json();
  const improvedText = readGeminiText(data);
  if (!improvedText) {
    throw new Error('Gemini returned empty improved text.');
  }
  return { text: improvedText };
}

async function paraphrasePromptViaGeminiStrict(apiKey, text) {
  const source = clampText(text, 5000);
  if (!source) {
    throw new Error('Empty prompt text provided.');
  }

  const systemPrompt = [
    'Rewrite the prompt for clarity while preserving intent and all placeholders exactly.',
    'Keep bracket placeholders unchanged (e.g., [topic], [tone?]).',
    'Return only the rewritten prompt text.'
  ].join('\n');

  const response = await callGeminiGenerateContent(apiKey, {
    contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nPrompt:\n${source}` }] }],
    generationConfig: {
      temperature: 0.25,
      maxOutputTokens: 620
    }
  });

  if (!response.ok) {
    throw new Error(`Gemini API request failed (${response.status}).`);
  }

  const data = await response.json();
  const rewritten = readGeminiText(data);
  if (!rewritten) {
    throw new Error('Gemini returned empty paraphrase output.');
  }
  return { text: rewritten };
}

async function buildContinuationHandoffViaGemini(messages, mode = 'FULL_SUMMARY', userNote = '', explicitKey = '') {
  const safeMessages = Array.isArray(messages) ? messages : [];
  if (!safeMessages.length) {
    return { ok: false, error: 'No messages to summarize.' };
  }

  const promptiumGeminiKey = String(explicitKey || '').trim() || await getGeminiApiKey();
  if (!promptiumGeminiKey) {
    return { ok: false, error: 'Missing Gemini key.' };
  }

  const prompt = buildContinuationPrompt(safeMessages, mode, userNote);

  try {
    const response = await callGeminiGenerateContent(promptiumGeminiKey, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 520
      }
    });

    if (!response.ok) {
      return { ok: false, error: `Gemini API request failed (${response.status}).` };
    }

    const data = await response.json();
    const raw = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    if (!raw) {
      return { ok: false, error: 'Gemini returned empty continuation context.' };
    }

    return { ok: true, text: limitWords(raw, CONTINUATION_WORD_LIMIT) };
  } catch (error) {
    const fallback = error?.name === 'AbortError' ? 'Gemini request timed out.' : 'Failed to generate continuation handoff.';
    return { ok: false, error: fallback };
  }
}

async function buildContinuationHandoffViaLocal(messages, mode = 'FULL_SUMMARY', userNote = '') {
  const safeMessages = Array.isArray(messages) ? messages : [];
  if (!safeMessages.length) {
    return { ok: false, error: 'No messages to summarize.' };
  }

  try {
    const result = await runLocalTextTask('continue_summary', {
      messages: safeMessages,
      mode,
      userNote
    });
    const text = limitWords(String(result?.text || '').trim(), CONTINUATION_WORD_LIMIT);
    if (!text) {
      return { ok: false, error: 'Local model returned empty continuation context.' };
    }
    return {
      ok: true,
      text,
      backend: AI_BACKEND_LOCAL,
      advisory: result?.cpuMode ? 'Running on CPU — may be slower' : undefined
    };
  } catch (error) {
    return { ok: false, error: String(error?.message || 'Failed to summarize locally.') };
  }
}

async function buildContinuationHandoff(messages, mode = 'FULL_SUMMARY', userNote = '', explicitKey = '', forceLocal = false) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  if (!safeMessages.length) {
    return { ok: false, error: 'No messages to summarize.' };
  }

  const key = String(explicitKey || '').trim();
  const hasExplicitKey = Boolean(key);
  const hasGeminiKey = hasExplicitKey || Boolean(await getGeminiApiKey());
  const longConversation = safeMessages.length > CONTINUATION_LONG_THRESHOLD;
  const forceGemini = longConversation && hasGeminiKey;
  const longAdvisory = longConversation
    ? (hasGeminiKey
      ? 'For best results, Gemini will be used for this long conversation.'
      : 'Long conversations may be lower quality with local AI. Add a Gemini key in Settings for better summaries.')
    : '';

  if (forceLocal) {
    const localResult = await buildContinuationHandoffViaLocal(safeMessages, mode, userNote);
    if (!localResult?.ok) {
      return { ok: false, error: String(localResult?.error || 'Failed to generate continuation handoff locally.') };
    }
    return {
      ok: true,
      text: limitWords(String(localResult?.text || '').trim(), CONTINUATION_WORD_LIMIT),
      backend: AI_BACKEND_LOCAL,
      advisory: String(localResult?.advisory || '').trim() || undefined
    };
  }

  try {
    const result = await runWithConfiguredBackend({
      feature: 'continueSummary',
      forceGemini,
      geminiApiKey: key,
      geminiTask: (apiKey) => buildContinuationHandoffViaGemini(safeMessages, mode, userNote, apiKey),
      localTask: () => buildContinuationHandoffViaLocal(safeMessages, mode, userNote),
      noGeminiMessage: 'No Gemini API Key found in Extension Settings.'
    });

    return {
      ok: true,
      text: limitWords(String(result?.text || '').trim(), CONTINUATION_WORD_LIMIT),
      backend: String(result?.backend || '').trim().toLowerCase() || AI_BACKEND_LOCAL,
      advisory: String(result?.advisory || longAdvisory || '').trim() || undefined
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || 'Failed to generate continuation handoff.'),
      advisory: longAdvisory || undefined
    };
  }
}

async function generatePromptTitleViaGeminiStrict(apiKey, text) {
  const source = clampText(text, 3200);
  if (!source) {
    throw new Error('Empty text provided.');
  }

  const instruction = `Create one concise title (max 8 words) for this prompt.
Return ONLY the title text.
No quotes, no numbering, no extra text.`;

  const response = await callGeminiGenerateContent(apiKey, {
    contents: [{ role: 'user', parts: [{ text: `${instruction}\n\nPrompt:\n${source}` }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 44
    }
  });

  if (!response.ok) {
    throw new Error(`Gemini API request failed (${response.status}).`);
  }

  const data = await response.json();
  const title = readGeminiText(data)
    .split('\n')[0]
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^\d+[\).\s-]+/, '')
    .trim()
    .slice(0, 80);

  if (!title) {
    throw new Error('No title generated.');
  }
  return { title };
}

async function scorePromptClarityViaGeminiStrict(apiKey, text) {
  const source = clampText(text, 4200);
  if (!source) {
    throw new Error('Empty text provided.');
  }

  const instruction = [
    'Evaluate this prompt on clarity, specificity, and completeness.',
    'Return strict JSON only in this shape:',
    '{"score": 0, "explanation": "one short sentence"}'
  ].join('\n');

  const response = await callGeminiGenerateContent(apiKey, {
    contents: [{ role: 'user', parts: [{ text: `${instruction}\n\nPrompt:\n${source}` }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 120
    }
  });

  if (!response.ok) {
    throw new Error(`Gemini API request failed (${response.status}).`);
  }

  const data = await response.json();
  const raw = readGeminiText(data);
  return parseClarityFromText(raw, source);
}

const improvePrompt = async (text, tags = [], style = 'general') => {
  try {
    const result = await runWithConfiguredBackend({
      feature: 'improvePrompt',
      geminiTask: (apiKey) => improvePromptViaGeminiStrict(apiKey, text, tags, style),
      localTask: () => runLocalTextTask('improve', { text, tags, style }),
      noGeminiMessage: 'No Gemini API Key found in Extension Settings.'
    });
    return {
      ok: true,
      text: String(result?.text || '').trim(),
      backend: result.backend,
      advisory: result?.advisory || undefined
    };
  } catch (error) {
    return { ok: false, error: String(error?.message || 'Failed to improve prompt.') };
  }
};

const generatePromptTitle = async (text) => {
  const source = clampText(text, 4200);
  if (!source) {
    return { error: 'Empty text provided.', title: '' };
  }

  try {
    const result = await runWithConfiguredBackend({
      feature: 'smartExportTitle',
      geminiTask: (apiKey) => generatePromptTitleViaGeminiStrict(apiKey, source),
      localTask: () => runLocalTextTask('title', { text: source }),
      noGeminiMessage: 'No Gemini API Key found in Extension Settings.'
    });

    const title = String(result?.title || '').trim().slice(0, 80);
    return {
      ok: true,
      title: title || deriveFallbackTitle(source),
      backend: result.backend,
      advisory: result?.advisory || undefined
    };
  } catch (_error) {
    return { ok: false, title: deriveFallbackTitle(source), backend: 'fallback' };
  }
};

const paraphrasePrompt = async (text) => {
  const source = clampText(text, 5200);
  if (!source) {
    return { ok: false, error: 'Empty prompt text provided.' };
  }
  try {
    const result = await runWithConfiguredBackend({
      feature: 'polish',
      geminiTask: (apiKey) => paraphrasePromptViaGeminiStrict(apiKey, source),
      localTask: () => runLocalTextTask('paraphrase', { text: source }),
      noGeminiMessage: 'No Gemini API Key found in Extension Settings.'
    });
    const rewritten = String(result?.text || '').trim();
    return {
      ok: true,
      text: rewritten || source,
      backend: result.backend,
      advisory: result?.advisory || undefined
    };
  } catch (error) {
    return { ok: false, text: source, backend: 'fallback', error: String(error?.message || 'Paraphrase failed.') };
  }
};

const scorePromptClarity = async (text) => {
  const source = clampText(text, 4200);
  if (!source) {
    return { ok: false, error: 'Empty prompt text provided.', score: 0, explanation: 'No prompt content provided.' };
  }

  try {
    const result = await runWithConfiguredBackend({
      feature: 'polish',
      geminiTask: (apiKey) => scorePromptClarityViaGeminiStrict(apiKey, source),
      localTask: () => runLocalTextTask('clarity', { text: source }),
      noGeminiMessage: 'No Gemini API Key found in Extension Settings.'
    });
    return {
      ok: true,
      score: Number(result?.score) || 0,
      explanation: String(result?.explanation || '').trim() || 'No explanation available.',
      backend: result.backend,
      advisory: result?.advisory || undefined
    };
  } catch (_error) {
    const fallback = parseClarityFromText('', source);
    return { ok: false, ...fallback, backend: 'fallback' };
  }
};

const preparePromptForSave = async ({ title = '', text = '', tags = [], category = null } = {}) => {
  const originalText = clampText(text, 5200);
  if (!originalText) {
    return { ok: false, error: 'Prompt text is required.' };
  }

  const runtime = await getAiRuntimeSettings();
  const normalizedTags = Array.isArray(tags)
    ? tags.map((tag) => String(tag || '').trim()).filter(Boolean)
    : [];

  if (runtime?.legacyAutoRewriteOnSave === false) {
    const initialTitle = String(title || '').trim();
    return {
      ok: true,
      prompt: {
        title: initialTitle || deriveFallbackTitle(originalText),
        text: originalText,
        tags: normalizedTags,
        category: category ? String(category).trim() : null,
        clarityScore: null,
        clarityExplanation: ''
      },
      backend: {
        paraphrase: null,
        title: initialTitle ? 'provided' : 'fallback',
        clarity: null
      }
    };
  }

  const paraphrased = await paraphrasePrompt(originalText);
  const finalText = clampText(paraphrased?.ok ? paraphrased?.text : originalText, 5200) || originalText;

  const initialTitle = String(title || '').trim();
  const [titleResult, clarity] = await Promise.all([
    initialTitle
      ? Promise.resolve({ title: initialTitle, backend: 'provided' })
      : generatePromptTitle(finalText),
    scorePromptClarity(finalText)
  ]);
  const finalTitle = String(titleResult?.title || '').trim() || deriveFallbackTitle(finalText);

  return {
    ok: true,
    prompt: {
      title: finalTitle,
      text: finalText,
      tags: normalizedTags,
      category: category ? String(category).trim() : null,
      clarityScore: clarity?.ok && Number.isFinite(Number(clarity?.score))
        ? Math.max(0, Math.min(100, Math.round(Number(clarity.score))))
        : null,
      clarityExplanation: String(clarity?.explanation || '').trim() || ''
    },
    backend: {
      paraphrase: paraphrased?.ok ? (paraphrased?.backend || null) : null,
      title: titleResult?.backend || null,
      clarity: clarity?.ok ? (clarity?.backend || null) : null
    }
  };
};

// ─── AI Message Handler ──────────────────────────────────────────────────────

const handleAIMessage = async (message, sendResponse) => {
  try {
    switch (message.type) {
      case 'AI_INIT':
        if (AI.status === 'idle') {
          AI.status = 'ready';
          broadcast({ type: 'AI_STATUS', status: 'ready' });
        }
        sendResponse({ status: AI.status });
        return true;

      case 'AI_SEARCH':
        sendResponse({ results: await semanticSearch(message.query) });
        return true;

      case 'AI_SUGGEST_TAGS':
        sendResponse(await suggestTags(message.text));
        return true;

      case 'AI_CHECK_DUPLICATE':
        sendResponse({ match: await checkDuplicate(message.text, message.excludeId) });
        return true;

      case 'AI_SMART_SUGGESTIONS':
        sendResponse({ ids: await getSmartSuggestions(message.conversationText) });
        return true;

      case 'AI_CACHE_ADD':
        await addToCache(message.prompt);
        sendResponse({ ok: true });
        return true;

      case 'AI_CACHE_REMOVE':
        await removeFromCache(message.promptId);
        sendResponse({ ok: true });
        return true;

      case 'AI_IMPROVE_PROMPT':
        improvePrompt(message.text, message.tags, message.style).then((result) => sendResponse(result));
        return true;

      case 'AI_GENERATE_PROMPT_TITLE':
        generatePromptTitle(message.text).then((result) => sendResponse(result));
        return true;

      case 'AI_PARAPHRASE_PROMPT':
        paraphrasePrompt(message.text).then((result) => sendResponse(result));
        return true;

      case 'AI_SCORE_CLARITY':
        scorePromptClarity(message.text).then((result) => sendResponse(result));
        return true;

      case 'AI_PREPARE_PROMPT_SAVE':
        preparePromptForSave(message.payload || {}).then((result) => sendResponse(result));
        return true;

      case 'AI_LOCAL_MODEL_INIT':
        initLocalModel().then((result) => sendResponse(result));
        return true;

      case 'AI_LOCAL_MODEL_DOWNLOAD':
        downloadLocalModel(message?.payload?.modelId || message?.modelId || '').then((result) => sendResponse(result));
        return true;

      case 'AI_LOCAL_MODEL_CANCEL_DOWNLOAD':
        cancelLocalModelDownload(message?.payload?.modelId || message?.modelId || '').then((result) => sendResponse(result));
        return true;

      case 'AI_LOCAL_MODEL_REMOVE_CACHE':
        clearLocalModelCache(message?.payload?.modelId || message?.modelId || '').then((result) => sendResponse(result));
        return true;

      case 'AI_LOCAL_MODEL_STATUS':
        sendResponse(getLocalStatusPayload());
        return true;

      case 'AI_LOCAL_MODEL_PROGRESS':
      case 'AI_LOCAL_STATUS_BROADCAST':
        sendResponse({ ok: true });
        return true;

      case 'AI_CONTINUE_SUMMARY':
        buildContinuationHandoff(message.messages, message.mode, message.userNote, message.key, message.forceLocal === true)
          .then((result) => sendResponse(result));
        return true;

      case 'AI_ROUTE_TASK':
        {
          const task = String(message?.task || '').trim().toLowerCase();
          if (task === 'paraphrase') {
            paraphrasePrompt(message?.text || '').then((result) => sendResponse(result));
            return true;
          }
          if (task === 'improve') {
            improvePrompt(message?.text || '', message?.tags || [], message?.style || 'general').then((result) => sendResponse(result));
            return true;
          }
          if (task === 'title') {
            generatePromptTitle(message?.text || '').then((result) => sendResponse(result));
            return true;
          }
          if (task === 'clarity') {
            scorePromptClarity(message?.text || '').then((result) => sendResponse(result));
            return true;
          }
          if (task === 'tags') {
            suggestTags(message?.text || '').then((result) => sendResponse(result));
            return true;
          }
          if (task === 'continue_summary') {
            buildContinuationHandoff(message?.messages || [], message?.mode, message?.userNote || '', message?.key || '')
              .then((result) => sendResponse(result));
            return true;
          }
          sendResponse({ ok: false, error: `Unsupported routed task: ${task || 'unknown'}` });
          return true;
        }

      case 'AI_STATUS_CHECK':
        sendResponse({
          status: AI.status,
          localModel: getLocalStatusPayload()
        });
        return true;

      default:
        return false;
    }
  } catch (err) {
    sendResponse({ error: err.message });
    return true;
  }
};

const SIDE_PANEL_PATH = 'sidepanel/sidepanel.html';
const SIDEPANEL_SESSION_KEY = BRAND_KEYS.sidePanelPayload;
const SUPPORTED_DOC_PATTERNS = [
  '*://*.chatgpt.com/*',
  '*://*.claude.ai/*',
  '*://gemini.google.com/*',
  '*://*.perplexity.ai/*',
  '*://copilot.microsoft.com/*'
];
const ALLOWED_LLM_HOSTS = new Set([
  'chatgpt.com',
  'claude.ai',
  'gemini.google.com',
  'www.perplexity.ai',
  'copilot.microsoft.com'
]);

/** Ensures prompts and chatHistory keys exist in storage without overwriting existing data. */
const initializeStorageKeys = async () => {
  const state = await chrome.storage.local.get(['prompts', 'chatHistory']);
  const updates = {};

  if (!Array.isArray(state.prompts)) {
    updates.prompts = [];
  }

  if (!Array.isArray(state.chatHistory)) {
    updates.chatHistory = [];
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
};

const detectPlatformFromUrl = (value) => {
  const url = String(value || '').toLowerCase();
  if (url.includes('chatgpt.com')) return 'chatgpt';
  if (url.includes('claude.ai')) return 'claude';
  if (url.includes('gemini.google.com')) return 'gemini';
  if (url.includes('perplexity.ai')) return 'perplexity';
  if (url.includes('copilot.microsoft.com')) return 'copilot';
  return 'unknown';
};

const registerContextMenus = async () => {
  try {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
      id: CONTEXT_MENU_SAVE_ID,
      title: 'Save to Promptium',
      contexts: ['selection'],
      documentUrlPatterns: SUPPORTED_DOC_PATTERNS
    });
  } catch (error) {
    console.warn('[Promptium][ServiceWorker] Failed to register context menu.', error);
  }
};

// Manually open the side panel when the user clicks the extension action icon.
// This often works more reliably than the declarative setPanelBehavior API.
chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch((error) => {
      console.error('[Promptium][ServiceWorker] Failed to open side panel on action click.', error);
    });
  }
});

/** Handles extension install lifecycle and applies initial storage and side panel setup. */
const onInstalled = async () => {
  try {
    await initializeStorageKeys();
    await registerContextMenus();
  } catch (error) {
    console.error('[Promptium][ServiceWorker] Initialization failed.', error);
  }
};

const openSidePanelForActiveTab = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.windowId) {
      return { ok: false, error: 'No active tab available.' };
    }
    await chrome.sidePanel.open({ tabId: tab.id, windowId: tab.windowId });
    return { ok: true, tab };
  } catch (error) {
    return { ok: false, error: error?.message || 'Failed to open side panel.' };
  }
};


/** Opens a new browser tab when content scripts request cross-LLM navigation. */
const handleOpenLlmTab = async (url) => {
  try {
    const parsed = new URL(String(url || ''));

    if (parsed.protocol !== 'https:') {
      return { ok: false, error: 'Invalid tab URL.' };
    }

    if (!ALLOWED_LLM_HOSTS.has(parsed.hostname.toLowerCase())) {
      return { ok: false, error: 'Target host is not allowlisted.' };
    }

    await chrome.tabs.create({ url: parsed.toString() });
    return { ok: true };
  } catch (_error) {
    return { ok: false, error: 'Failed to open requested tab.' };
  }
};

/** Stores side panel payload in trusted service-worker context session storage. */
const handleSetSidePanelPayload = async (payload) => {
  const value = payload && typeof payload === 'object' ? payload : null;

  if (!value || !Array.isArray(value.messages)) {
    return { ok: false, error: 'Invalid side panel payload.' };
  }

  try {
    await chrome.storage.session.set({ [SIDEPANEL_SESSION_KEY]: value });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'Failed to persist side panel payload.' };
  }
};

/** Persists payload on side panel action. The panel must be opened manually by clicking the action icon. */
const handleOpenSidePanel = async (_sender, payload = null) => {
  try {
    if (payload && typeof payload === 'object') {
      const persisted = await handleSetSidePanelPayload(payload);

      if (!persisted.ok) {
        return { ok: false, error: persisted.error || 'Payload failed to persist.' };
      }
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'Unable to handle payload.' };
  }
};

const handleOpenContinuationPanel = async (sender) => {
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  if (!tabId || !windowId) {
    const opened = await openSidePanelForActiveTab();
    if (!opened.ok) {
      return { ok: false, error: opened.error };
    }
    setTimeout(() => {
      void chrome.runtime.sendMessage({ action: 'showContinuation' }).catch(() => {});
    }, 360);
    return { ok: true };
  }

  try {
    await chrome.sidePanel.open({ tabId, windowId });
    setTimeout(() => {
      void chrome.runtime.sendMessage({ action: 'showContinuation' }).catch(() => {});
    }, 360);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'Failed to open side panel.' };
  }
};

const isOffscreenLocalEvent = (message) => {
  const type = String(message?.type || '').trim();
  return type === 'AI_LOCAL_MODEL_PROGRESS' || type === 'AI_LOCAL_MODEL_STATUS';
};

const isOffscreenLocalSender = (sender) => String(sender?.url || '').includes(`/${OFFSCREEN_LOCAL_URL}`);

/** Routes runtime messages and keeps channel open for async response delivery. */
const onRuntimeMessage = (message, sender, sendResponse) => {
  if (message?.target === OFFSCREEN_LOCAL_TARGET) {
    return false;
  }

  if (isOffscreenLocalSender(sender) && isOffscreenLocalEvent(message)) {
    updateLocalStatusFromEvent(message);
    return false;
  }

  let sidePanelPromise = null;

  if (message?.action === 'OPEN_SIDEPANEL') {
    const windowId = sender?.tab?.windowId;
    if (windowId) {
      // Must be called synchronously to consume gesture
      sidePanelPromise = chrome.sidePanel.open({ windowId, tabId: sender.tab.id }).catch((err) => err);
    }
  }

  void (async () => {
    let responded = false;
    const mappedType = (() => {
      const raw = String(message?.type || message?.action || '').trim();
      if (!raw) return '';
      if (raw === 'localModel:status') return 'AI_LOCAL_MODEL_STATUS';
      if (raw === 'localModel:load') return 'AI_LOCAL_MODEL_INIT';
      if (raw === 'localModel:paraphrase') return 'AI_PARAPHRASE_PROMPT';
      return raw;
    })();
    const routedMessage = mappedType ? { ...message, type: mappedType } : message;

    const respond = (payload) => {
      if (responded) {
        return;
      }

      responded = true;

      try {
        sendResponse(payload);
      } catch (_error) {
        return;
      }
    };

    try {
      // Route AI messages first (type-based) before existing action-based routing
      if (routedMessage?.type?.startsWith('AI_')) {
        const handled = await handleAIMessage(routedMessage, respond);
        if (handled) return;
      }

      if (message?.action === 'openExport') {
        const tabId = sender?.tab?.id;
        const windowId = sender?.tab?.windowId;
        if (!tabId || !windowId) {
          respond({ ok: false, error: 'No tab ID' });
          return;
        }

        try {
          await chrome.sidePanel.open({ windowId, tabId });
        } catch (err) {
          respond({ ok: false, error: err?.message || 'Failed to open side panel.' });
          return;
        }

        // Give side panel time to mount, then tell it to navigate to export
        setTimeout(async () => {
          try {
            await chrome.runtime.sendMessage({ action: 'showExport' });
          } catch (_) {
            // Retry once after another 400ms
            setTimeout(async () => {
              try { await chrome.runtime.sendMessage({ action: 'showExport' }); } catch (_) {}
            }, 400);
          }
        }, 400);

        respond({ ok: true });
        return;
      }

      if (message?.action === 'openSidePanel') {
        const tabId = sender?.tab?.id;
        const windowId = sender?.tab?.windowId;
        if (!tabId || !windowId) {
          respond({ ok: false, error: 'No tab ID' });
          return;
        }

        try {
          await chrome.sidePanel.open({ windowId, tabId });
          respond({ ok: true });
        } catch (err) {
          respond({ ok: false, error: err?.message || 'Failed to open side panel.' });
        }
        return;
      }

      if (message?.action === 'openLlmTab') {
        respond(await handleOpenLlmTab(message.url));
        return;
      }

      if (message?.action === 'openContinuationPanel') {
        respond(await handleOpenContinuationPanel(sender));
        return;
      }

      if (message?.action === 'OPEN_SIDEPANEL') {
        const payloadResult = await handleOpenSidePanel(sender, message.payload || null);
        
        // Wait for the synchronous side panel open attempt to settle
        let openError = null;
        if (sidePanelPromise) {
          const result = await sidePanelPromise;
          if (result instanceof Error) {
            openError = result.message;
          }
        }

        if (openError) {
          respond({ ok: false, error: `SidePanel Error: ${openError}` });
          return;
        }

        respond(payloadResult);
        return;
      }

      if (message?.action === 'SET_SIDEPANEL_PAYLOAD') {
        respond(await handleSetSidePanelPayload(message.payload));
        return;
      }

      if (message?.action === 'VALIDATE_GEMINI_KEY') {
        respond(await validateGeminiApiKey(message.key));
        return;
      }

      respond({ ok: false, error: `Unknown action: ${String(message?.action || 'undefined')}` });
    } catch (error) {
      respond({ ok: false, error: error?.message || 'Unexpected service worker failure.' });
    }
  })();

  return true;
};

chrome.runtime.onInstalled.addListener(() => {
  void onInstalled();
});

chrome.runtime.onStartup.addListener(() => {
  void registerContextMenus();
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'open-side-panel') {
    return;
  }
  void openSidePanelForActiveTab();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_SAVE_ID) {
    return;
  }

  const selectedText = String(info.selectionText || '').trim();
  if (!selectedText || !tab?.id || !tab.windowId) {
    return;
  }

  void (async () => {
    const sourceUrl = String(tab.url || '');
    await chrome.storage.local.set({
      [BRAND_KEYS.pendingSnippet]: {
        text: selectedText,
        sourceUrl,
        platform: detectPlatformFromUrl(sourceUrl),
        savedAt: Date.now()
      }
    });

    await chrome.sidePanel.open({ tabId: tab.id, windowId: tab.windowId }).catch(() => {});
    await chrome.tabs.sendMessage(tab.id, {
      action: 'notifyPromptium',
      text: 'Saved to Promptium'
    }).catch(() => {});
  })();
});

chrome.runtime.onMessage.addListener(onRuntimeMessage);
