/**
 * File: offscreen/local-model-worker.js
 * Purpose: Offscreen local model host for Promptium AI tasks.
 */

import { pipeline, env } from '../libs/transformers.min.js';
import {
  EMBEDDING_MODELS,
  getDefaultEmbeddingModel,
  getEmbeddingModelById
} from '../utils/model-registry.js';

const OFFSCREEN_TARGET = 'promptium-offscreen-local-ai';
const SETTINGS_KEY = 'promptiumSettings';
const CACHE_INDEX_KEY = 'localModelCacheIndex';
const EMBEDDING_CACHE_INDEX_KEY = 'embeddingModelCacheIndex';
const STATUS_TYPES = Object.freeze({
  NOT_DOWNLOADED: 'not_downloaded',
  DOWNLOADING: 'downloading',
  CACHED: 'cached',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error'
});

const CONTINUATION_WORD_LIMIT = 300;
const EMBEDDING_RATE_LIMIT_PER_SEC = 10;
const MODEL_REGISTRY = Object.freeze({
  smollm2_1_7b: {
    key: 'smollm2_1_7b',
    modelId: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
    task: 'text-generation',
    dtype: 'q4',
    sizeLabel: '400MB'
  },
  phi35_mini: {
    key: 'phi35_mini',
    modelId: 'microsoft/Phi-3.5-mini-instruct',
    task: 'text-generation',
    dtype: 'q4',
    sizeLabel: '1.5GB'
  },
  qwen3_0_6b: {
    key: 'qwen3_0_6b',
    modelId: 'Qwen/Qwen3-0.6B-Instruct',
    task: 'text-generation',
    dtype: 'q4',
    sizeLabel: '300MB'
  }
});

// Seeded map is intentionally explicit and checked-in. Runtime discovery augments it.
const MODEL_CACHE_INDEX = {
  smollm2_1_7b: {
    cacheNames: ['transformers-cache'],
    urlPatterns: [
      'huggingfacetb/smollm2-1.7b-instruct',
      'smollm2-1.7b-instruct'
    ]
  },
  phi35_mini: {
    cacheNames: ['transformers-cache'],
    urlPatterns: [
      'microsoft/phi-3.5-mini-instruct',
      'phi-3.5-mini-instruct'
    ]
  },
  qwen3_0_6b: {
    cacheNames: ['transformers-cache'],
    urlPatterns: [
      'qwen/qwen3-0.6b-instruct',
      'qwen3-0.6b-instruct'
    ]
  }
};

env.allowRemoteModels = true;
env.localModelPath = '../models/';
env.backends.onnx.wasm.numThreads = 1;

const MODEL_STATE = Object.fromEntries(Object.keys(MODEL_REGISTRY).map((key) => [key, {
  status: STATUS_TYPES.NOT_DOWNLOADED,
  progress: 0,
  backend: 'webgpu',
  error: '',
  pipe: null,
  loadingPromise: null,
  cancelRequested: false,
  lastProgressBucket: -1,
  seenUrls: new Set(),
  lastUsedAt: 0
}]));

const EMBEDDING_REGISTRY = Object.freeze(Object.fromEntries(
  EMBEDDING_MODELS.map((entry) => [entry.id, {
    ...entry,
    key: entry.id,
    task: 'feature-extraction',
    dtype: 'q8'
  }])
));

const EMBEDDING_CACHE_INDEX = Object.freeze(Object.fromEntries(
  EMBEDDING_MODELS.map((entry) => [entry.id, {
    cacheNames: ['transformers-cache'],
    urlPatterns: [String(entry.modelId || '').toLowerCase()]
  }])
));

const EMBEDDING_STATE = Object.fromEntries(Object.keys(EMBEDDING_REGISTRY).map((key) => [key, {
  status: STATUS_TYPES.NOT_DOWNLOADED,
  progress: 0,
  backend: 'webgpu',
  error: '',
  pipe: null,
  loadingPromise: null,
  cancelRequested: false,
  lastProgressBucket: -1,
  seenUrls: new Set(),
  lastUsedAt: 0
}]));

let activeEmbeddingModelId = String(getDefaultEmbeddingModel()?.id || 'all-minilm-l6-v2');
let saveCacheIndexTimer = null;
let saveEmbeddingCacheIndexTimer = null;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const clampText = (value, max = 5000) => String(value || '').trim().slice(0, max);

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
};

const normalizeOutputText = (value) => String(value || '')
  .replace(/^```(?:json)?/i, '')
  .replace(/```$/i, '')
  .replace(/\u0000/g, '')
  .trim();

const readGeneratedText = (output, fallbackPrompt = '') => {
  if (Array.isArray(output) && output.length) {
    const first = output[0];
    if (typeof first === 'string') return first;
    if (typeof first?.generated_text === 'string') return first.generated_text;
    if (Array.isArray(first?.generated_text)) {
      const tail = first.generated_text[first.generated_text.length - 1];
      if (typeof tail === 'string') return tail;
      if (typeof tail?.content === 'string') return tail.content;
      if (Array.isArray(tail?.content)) {
        const part = tail.content.find((entry) => typeof entry?.text === 'string');
        if (part?.text) return part.text;
      }
    }
    if (typeof first?.text === 'string') return first.text;
  }

  if (typeof output?.generated_text === 'string') return output.generated_text;
  if (typeof output?.text === 'string') return output.text;
  return String(fallbackPrompt || '');
};

const stripPromptEcho = (generated, prompt) => {
  const text = String(generated || '').trim();
  const source = String(prompt || '').trim();
  if (!source) return text;
  if (text.startsWith(source)) return text.slice(source.length).trim();
  return text;
};

const normalizeRole = (role) => {
  const value = String(role || '').trim().toLowerCase();
  if (['user', 'you', 'human'].includes(value)) return 'Human';
  if (['assistant', 'model', 'bot', 'ai'].includes(value)) return 'Assistant';
  return value.includes('user') ? 'Human' : 'Assistant';
};

const limitWords = (value, maxWords) => {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ').trim();
  return `${words.slice(0, maxWords).join(' ').trim()}…`;
};

const modelKeyFromSettings = async () => {
  try {
    const snapshot = await chrome.storage.local.get([SETTINGS_KEY]);
    const settings = snapshot?.[SETTINGS_KEY] || {};
    const key = String(settings?.localModelId || 'smollm2_1_7b').trim().toLowerCase();
    return MODEL_REGISTRY[key] ? key : 'smollm2_1_7b';
  } catch (_error) {
    return 'smollm2_1_7b';
  }
};

const resolveModelKey = async (value) => {
  const key = String(value || '').trim().toLowerCase();
  if (MODEL_REGISTRY[key]) return key;
  return modelKeyFromSettings();
};

const embeddingModelIdFromSettings = async () => {
  try {
    const snapshot = await chrome.storage.local.get([SETTINGS_KEY]);
    const settings = snapshot?.[SETTINGS_KEY] || {};
    const modelId = String(settings?.embeddingModelId || activeEmbeddingModelId || '').trim();
    const resolved = getEmbeddingModelById(modelId);
    return String(resolved?.id || getDefaultEmbeddingModel()?.id || 'all-minilm-l6-v2');
  } catch (_error) {
    return String(getDefaultEmbeddingModel()?.id || 'all-minilm-l6-v2');
  }
};

const resolveEmbeddingModelId = async (value) => {
  const requested = String(value || '').trim();
  const exact = getEmbeddingModelById(requested);
  if (exact?.id) return exact.id;
  const fromSettings = await embeddingModelIdFromSettings();
  const normalized = getEmbeddingModelById(fromSettings);
  return String(normalized?.id || getDefaultEmbeddingModel()?.id || 'all-minilm-l6-v2');
};

const ensureIndexShape = (raw) => {
  const base = safeJsonParse(JSON.stringify(MODEL_CACHE_INDEX));
  const source = raw && typeof raw === 'object' ? raw : {};

  Object.keys(base).forEach((key) => {
    const entry = source?.[key];
    if (!entry || typeof entry !== 'object') return;
    const cacheNames = Array.isArray(entry.cacheNames) ? entry.cacheNames.map((item) => String(item || '').trim()).filter(Boolean) : [];
    const urlPatterns = Array.isArray(entry.urlPatterns) ? entry.urlPatterns.map((item) => String(item || '').trim()).filter(Boolean) : [];
    base[key] = {
      cacheNames: Array.from(new Set([...base[key].cacheNames, ...cacheNames])),
      urlPatterns: Array.from(new Set([...base[key].urlPatterns, ...urlPatterns]))
    };
  });

  return base;
};

const readCacheIndex = async () => {
  const snapshot = await chrome.storage.local.get([CACHE_INDEX_KEY]).catch(() => ({}));
  return ensureIndexShape(snapshot?.[CACHE_INDEX_KEY]);
};

const writeCacheIndex = async (index) => {
  await chrome.storage.local.set({ [CACHE_INDEX_KEY]: ensureIndexShape(index) }).catch(() => {});
};

const queueCacheIndexSave = () => {
  if (saveCacheIndexTimer) clearTimeout(saveCacheIndexTimer);
  saveCacheIndexTimer = setTimeout(async () => {
    saveCacheIndexTimer = null;
    const current = await readCacheIndex();

    Object.entries(MODEL_STATE).forEach(([modelId, state]) => {
      if (!state.seenUrls.size) return;
      const existing = current[modelId] || { cacheNames: [], urlPatterns: [] };
      const nextPatterns = Array.from(new Set([
        ...(existing.urlPatterns || []),
        ...Array.from(state.seenUrls)
      ]));
      current[modelId] = {
        cacheNames: Array.from(new Set(existing.cacheNames || [])),
        urlPatterns: nextPatterns
      };
    });

    await writeCacheIndex(current);
  }, 450);
};

const ensureEmbeddingIndexShape = (raw) => {
  const base = safeJsonParse(JSON.stringify(EMBEDDING_CACHE_INDEX));
  const source = raw && typeof raw === 'object' ? raw : {};

  Object.keys(base).forEach((key) => {
    const entry = source?.[key];
    if (!entry || typeof entry !== 'object') return;
    const cacheNames = Array.isArray(entry.cacheNames) ? entry.cacheNames.map((item) => String(item || '').trim()).filter(Boolean) : [];
    const urlPatterns = Array.isArray(entry.urlPatterns) ? entry.urlPatterns.map((item) => String(item || '').trim()).filter(Boolean) : [];
    base[key] = {
      cacheNames: Array.from(new Set([...base[key].cacheNames, ...cacheNames])),
      urlPatterns: Array.from(new Set([...base[key].urlPatterns, ...urlPatterns]))
    };
  });

  return base;
};

const readEmbeddingCacheIndex = async () => {
  const snapshot = await chrome.storage.local.get([EMBEDDING_CACHE_INDEX_KEY]).catch(() => ({}));
  return ensureEmbeddingIndexShape(snapshot?.[EMBEDDING_CACHE_INDEX_KEY]);
};

const writeEmbeddingCacheIndex = async (index) => {
  await chrome.storage.local.set({ [EMBEDDING_CACHE_INDEX_KEY]: ensureEmbeddingIndexShape(index) }).catch(() => {});
};

const queueEmbeddingCacheIndexSave = () => {
  if (saveEmbeddingCacheIndexTimer) clearTimeout(saveEmbeddingCacheIndexTimer);
  saveEmbeddingCacheIndexTimer = setTimeout(async () => {
    saveEmbeddingCacheIndexTimer = null;
    const current = await readEmbeddingCacheIndex();

    Object.entries(EMBEDDING_STATE).forEach(([modelId, state]) => {
      if (!state.seenUrls.size) return;
      const existing = current[modelId] || { cacheNames: [], urlPatterns: [] };
      const nextPatterns = Array.from(new Set([
        ...(existing.urlPatterns || []),
        ...Array.from(state.seenUrls)
      ]));
      current[modelId] = {
        cacheNames: Array.from(new Set(existing.cacheNames || [])),
        urlPatterns: nextPatterns
      };
    });

    await writeEmbeddingCacheIndex(current);
  }, 450);
};

const rememberArtifact = (modelId, value) => {
  const raw = String(value || '').trim();
  if (!raw) return;
  const normalized = raw.toLowerCase();
  MODEL_STATE[modelId].seenUrls.add(normalized);
  queueCacheIndexSave();
};

const rememberEmbeddingArtifact = (modelId, value) => {
  const raw = String(value || '').trim();
  if (!raw || !EMBEDDING_STATE[modelId]) return;
  const normalized = raw.toLowerCase();
  EMBEDDING_STATE[modelId].seenUrls.add(normalized);
  queueEmbeddingCacheIndexSave();
};

const emitStatus = async (modelId) => {
  const state = MODEL_STATE[modelId];
  const registry = MODEL_REGISTRY[modelId];
  await chrome.runtime.sendMessage({
    type: 'AI_LOCAL_MODEL_STATUS',
    modelId,
    modelLabel: registry?.modelId || modelId,
    status: state.status,
    progress: state.progress,
    backend: state.backend,
    error: state.error,
    cpuMode: state.backend === 'wasm'
  }).catch(() => {});
};

const emitProgress = async (modelId, progress, status = '') => {
  const state = MODEL_STATE[modelId];
  const normalized = clamp(Math.round(Number(progress) || 0), 0, 100);
  const bucket = Math.floor(normalized / 5) * 5;
  if (bucket < state.lastProgressBucket && normalized !== 100) {
    return;
  }
  if (bucket === state.lastProgressBucket && normalized !== 100) {
    return;
  }
  state.lastProgressBucket = bucket;

  await chrome.runtime.sendMessage({
    type: 'AI_LOCAL_MODEL_PROGRESS',
    modelId,
    progress: normalized,
    status: String(status || '').trim().toLowerCase() || state.status
  }).catch(() => {});
};

const emitEmbeddingStatus = async (modelId) => {
  const state = EMBEDDING_STATE[modelId];
  const registry = EMBEDDING_REGISTRY[modelId];
  await chrome.runtime.sendMessage({
    type: 'AI_EMBEDDING_STATUS',
    modelId,
    activeModelId: activeEmbeddingModelId,
    modelLabel: registry?.label || modelId,
    status: state?.status || STATUS_TYPES.NOT_DOWNLOADED,
    progress: state?.progress || 0,
    backend: state?.backend || 'webgpu',
    error: state?.error || ''
  }).catch(() => {});
};

const emitEmbeddingProgress = async (modelId, progress, status = '') => {
  const state = EMBEDDING_STATE[modelId];
  if (!state) return;
  const normalized = clamp(Math.round(Number(progress) || 0), 0, 100);
  const bucket = Math.floor(normalized / 5) * 5;
  if (bucket < state.lastProgressBucket && normalized !== 100) return;
  if (bucket === state.lastProgressBucket && normalized !== 100) return;
  state.lastProgressBucket = bucket;

  await chrome.runtime.sendMessage({
    type: 'AI_EMBEDDING_PROGRESS',
    modelId,
    activeModelId: activeEmbeddingModelId,
    progress: normalized,
    status: String(status || '').trim().toLowerCase() || state.status
  }).catch(() => {});
};

const setState = async (modelId, patch = {}) => {
  MODEL_STATE[modelId] = {
    ...MODEL_STATE[modelId],
    ...patch
  };
  await emitStatus(modelId);
};

const releaseModel = async (modelId, reason = 'idle') => {
  const state = MODEL_STATE[modelId];
  if (state?.pipe && typeof state.pipe.dispose === 'function') {
    try {
      await state.pipe.dispose();
    } catch (_error) {
      // ignore
    }
  }

  const nextStatus = state.status === STATUS_TYPES.NOT_DOWNLOADED
    ? STATUS_TYPES.NOT_DOWNLOADED
    : STATUS_TYPES.CACHED;

  state.pipe = null;
  state.loadingPromise = null;
  state.cancelRequested = false;
  state.lastProgressBucket = -1;
  state.status = nextStatus;
  state.error = '';
  state.progress = nextStatus === STATUS_TYPES.NOT_DOWNLOADED ? 0 : 100;

  await chrome.runtime.sendMessage({
    type: 'AI_LOCAL_MODEL_STATUS',
    modelId,
    status: state.status,
    progress: state.progress,
    backend: state.backend,
    error: state.error,
    reason
  }).catch(() => {});
};

const withProgressCallback = (modelId, status) => (data = {}) => {
  const state = MODEL_STATE[modelId];
  if (state.cancelRequested) {
    throw new Error('Local model download cancelled.');
  }

  const progress = clamp(Math.round(Number(data?.progress || 0)), 0, 100);
  state.progress = progress;
  if (progress > 0 && state.status === STATUS_TYPES.NOT_DOWNLOADED) {
    state.status = STATUS_TYPES.DOWNLOADING;
  }

  const fileHint = String(data?.file || data?.name || data?.url || '').trim();
  if (fileHint) {
    rememberArtifact(modelId, fileHint);
  }

  void emitProgress(modelId, progress, status || state.status);
};

const loadPipelineForModel = async (modelId, { downloadOnly = false } = {}) => {
  const state = MODEL_STATE[modelId];
  const config = MODEL_REGISTRY[modelId];

  if (!config) {
    throw new Error(`Unsupported model: ${modelId}`);
  }

  if (!downloadOnly && state.status === STATUS_TYPES.READY && state.pipe) {
    state.lastUsedAt = Date.now();
    return state.pipe;
  }

  if (state.loadingPromise) {
    return state.loadingPromise;
  }

  state.cancelRequested = false;
  state.progress = 0;
  state.error = '';
  state.lastProgressBucket = -1;
  state.status = downloadOnly ? STATUS_TYPES.DOWNLOADING : STATUS_TYPES.LOADING;
  await emitStatus(modelId);
  await emitProgress(modelId, 0, state.status);

  state.loadingPromise = (async () => {
    let loaded = null;
    try {
      try {
        state.backend = 'webgpu';
        loaded = await pipeline(config.task, config.modelId, {
          dtype: config.dtype,
          device: 'webgpu',
          progress_callback: withProgressCallback(modelId, state.status)
        });
      } catch (webgpuError) {
        state.backend = 'wasm';
        loaded = await pipeline(config.task, config.modelId, {
          dtype: config.dtype,
          device: 'wasm',
          progress_callback: withProgressCallback(modelId, state.status)
        });

        if (!loaded) {
          throw webgpuError;
        }
      }

      if (downloadOnly) {
        if (typeof loaded?.dispose === 'function') {
          await loaded.dispose().catch(() => {});
        }
        state.pipe = null;
        state.status = STATUS_TYPES.CACHED;
        state.progress = 100;
        state.error = '';
        state.lastUsedAt = Date.now();
        await emitStatus(modelId);
        await emitProgress(modelId, 100, STATUS_TYPES.CACHED);
        return null;
      }

      state.pipe = loaded;
      state.status = STATUS_TYPES.READY;
      state.progress = 100;
      state.error = '';
      state.lastUsedAt = Date.now();
      await emitStatus(modelId);
      await emitProgress(modelId, 100, STATUS_TYPES.READY);
      return loaded;
    } catch (error) {
      state.pipe = null;
      state.status = STATUS_TYPES.ERROR;
      state.error = String(error?.message || 'Local model failed to initialize.');
      state.progress = 0;
      await emitStatus(modelId);
      throw error;
    } finally {
      state.loadingPromise = null;
    }
  })();

  return state.loadingPromise;
};

const withEmbeddingProgressCallback = (modelId, status) => (data = {}) => {
  const state = EMBEDDING_STATE[modelId];
  if (!state) return;
  if (state.cancelRequested) {
    throw new Error('Embedding model download cancelled.');
  }

  const progress = clamp(Math.round(Number(data?.progress || 0)), 0, 100);
  state.progress = progress;
  if (progress > 0 && state.status === STATUS_TYPES.NOT_DOWNLOADED) {
    state.status = STATUS_TYPES.DOWNLOADING;
  }

  const fileHint = String(data?.file || data?.name || data?.url || '').trim();
  if (fileHint) {
    rememberEmbeddingArtifact(modelId, fileHint);
  }

  void emitEmbeddingProgress(modelId, progress, status || state.status);
};

const loadPipelineForEmbeddingModel = async (modelId, { downloadOnly = false } = {}) => {
  const state = EMBEDDING_STATE[modelId];
  const config = EMBEDDING_REGISTRY[modelId];

  if (!state || !config) {
    throw new Error(`Unsupported embedding model: ${modelId}`);
  }

  if (!downloadOnly && state.status === STATUS_TYPES.READY && state.pipe) {
    state.lastUsedAt = Date.now();
    return state.pipe;
  }

  if (state.loadingPromise) {
    return state.loadingPromise;
  }

  state.cancelRequested = false;
  state.progress = 0;
  state.error = '';
  state.lastProgressBucket = -1;
  state.status = downloadOnly ? STATUS_TYPES.DOWNLOADING : STATUS_TYPES.LOADING;
  await emitEmbeddingStatus(modelId);
  await emitEmbeddingProgress(modelId, 0, state.status);

  state.loadingPromise = (async () => {
    let loaded = null;
    try {
      try {
        state.backend = 'webgpu';
        loaded = await pipeline(config.task, config.modelId, {
          device: 'webgpu',
          dtype: config.dtype,
          progress_callback: withEmbeddingProgressCallback(modelId, state.status)
        });
      } catch (webgpuError) {
        state.backend = 'wasm';
        loaded = await pipeline(config.task, config.modelId, {
          device: 'wasm',
          progress_callback: withEmbeddingProgressCallback(modelId, state.status)
        });
        if (!loaded) throw webgpuError;
      }

      if (downloadOnly) {
        if (typeof loaded?.dispose === 'function') {
          await loaded.dispose().catch(() => {});
        }
        state.pipe = null;
        state.status = STATUS_TYPES.CACHED;
        state.progress = 100;
        state.error = '';
        state.lastUsedAt = Date.now();
        await emitEmbeddingStatus(modelId);
        await emitEmbeddingProgress(modelId, 100, STATUS_TYPES.CACHED);
        return null;
      }

      state.pipe = loaded;
      state.status = STATUS_TYPES.READY;
      state.progress = 100;
      state.error = '';
      state.lastUsedAt = Date.now();
      activeEmbeddingModelId = modelId;
      await emitEmbeddingStatus(modelId);
      await emitEmbeddingProgress(modelId, 100, STATUS_TYPES.READY);
      return loaded;
    } catch (error) {
      state.pipe = null;
      state.status = STATUS_TYPES.ERROR;
      state.error = String(error?.message || 'Embedding model failed to initialize.');
      state.progress = 0;
      await emitEmbeddingStatus(modelId);
      throw error;
    } finally {
      state.loadingPromise = null;
    }
  })();

  return state.loadingPromise;
};

const embedWithModel = async (modelId, text = '') => {
  const source = clampText(text, 7000);
  if (!source) return [];
  const pipe = await loadPipelineForEmbeddingModel(modelId, { downloadOnly: false });
  const output = await pipe(source, { pooling: 'mean', normalize: true });
  if (Array.isArray(output?.data)) {
    return output.data.map((value) => Number(value) || 0);
  }
  return Array.from(output?.data || []).map((value) => Number(value) || 0);
};

const batchEmbedWithModel = async (modelId, texts = [], ratePerSecond = EMBEDDING_RATE_LIMIT_PER_SEC) => {
  const sourceRows = Array.isArray(texts) ? texts : [];
  const pipe = await loadPipelineForEmbeddingModel(modelId, { downloadOnly: false });
  const total = sourceRows.length;
  const vectors = [];
  const intervalMs = Math.max(1, Math.round(1000 / Math.max(1, Number(ratePerSecond) || EMBEDDING_RATE_LIMIT_PER_SEC)));

  for (let i = 0; i < total; i += 1) {
    const text = clampText(sourceRows[i], 7000);
    if (!text) {
      vectors.push([]);
    } else {
      const output = await pipe(text, { pooling: 'mean', normalize: true });
      const vector = Array.from(output?.data || []).map((value) => Number(value) || 0);
      vectors.push(vector);
    }

    const progress = total ? Math.round(((i + 1) / total) * 100) : 100;
    await chrome.runtime.sendMessage({
      type: 'AI_EMBEDDING_REINDEX_PROGRESS',
      modelId,
      activeModelId: activeEmbeddingModelId,
      done: i + 1,
      total,
      progress
    }).catch(() => {});

    if (i < total - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return vectors;
};

const parseClarityJson = (raw) => {
  const normalized = normalizeOutputText(raw);
  const direct = safeJsonParse(normalized);
  if (direct && typeof direct === 'object') return direct;
  const match = normalized.match(/\{[\s\S]*\}/);
  return match ? safeJsonParse(match[0]) : null;
};

const estimateFallbackClarity = (text) => {
  const source = clampText(text, 4800);
  if (!source) return { score: 0, explanation: 'No prompt content provided.' };

  const hasActionVerb = /(write|create|generate|explain|summarize|analyze|compare|build|draft|optimize)/i.test(source);
  const hasConstraint = /(max|min|at least|no more than|format|tone|style|audience|length|steps|table|json|markdown)/i.test(source);
  const hasContext = source.length > 120;
  const hasPlaceholder = /\[[^\]]+\]/.test(source);

  let score = 42;
  if (hasActionVerb) score += 18;
  if (hasConstraint) score += 18;
  if (hasContext) score += 14;
  if (hasPlaceholder) score += 8;
  if (source.length > 500) score -= 6;

  score = clamp(Math.round(score), 0, 100);
  const explanation = score >= 75
    ? 'Clear goal with useful constraints.'
    : score >= 55
      ? 'Reasonably clear, but add more concrete constraints.'
      : 'Needs clearer goal, context, and output constraints.';

  return { score, explanation };
};

const buildParaphrasePrompt = (text) => [
  'You rewrite prompts for clarity while preserving intent.',
  'Rules:',
  '- Keep placeholders in square brackets unchanged (example: [topic], [tone?]).',
  '- Keep the meaning and requested outcome the same.',
  '- Remove filler and improve specificity.',
  '- Return only the rewritten prompt text.',
  '',
  'Prompt to rewrite:',
  clampText(text)
].join('\n');

const buildImprovePrompt = (text, tags = [], style = 'general') => {
  const styleMap = {
    coding: 'Optimize for software engineering and implementation accuracy.',
    study: 'Optimize for learning clarity, structure, and examples.',
    creative: 'Optimize for originality, tone, and vivid outputs.',
    general: 'Optimize for clarity, completeness, and actionable output.'
  };
  const styleInstruction = styleMap[String(style || 'general').toLowerCase()] || styleMap.general;
  const normalizedTags = Array.isArray(tags) ? tags.map((tag) => String(tag || '').trim()).filter(Boolean) : [];

  return [
    'You are an expert prompt engineer.',
    styleInstruction,
    normalizedTags.length ? `Context tags: ${normalizedTags.join(', ')}` : '',
    'Return only the improved prompt text.',
    '',
    'Original prompt:',
    clampText(text)
  ].filter(Boolean).join('\n');
};

const buildTitlePrompt = (text) => [
  'Create one concise title for the prompt below.',
  'Rules:',
  '- Maximum 8 words.',
  '- No quotes or numbering.',
  '- Output only the title.',
  '',
  'Prompt:',
  clampText(text, 3200)
].join('\n');

const buildClarityPrompt = (text) => [
  'Evaluate the clarity of this prompt.',
  'Score from 0 to 100 based on clarity, specificity, and completeness.',
  'Return strict JSON:',
  '{"score": 0, "explanation": "one short sentence"}',
  '',
  'Prompt:',
  clampText(text, 3600)
].join('\n');

const buildTagPrompt = (text) => [
  'Suggest 2-3 short lowercase tags for this prompt.',
  'Return only a JSON array, e.g. ["coding","debugging"].',
  'No prose or explanations.',
  '',
  'Prompt:',
  clampText(text, 2400)
].join('\n');

const buildContinuationPrompt = (messages = [], mode = 'FULL_SUMMARY', userNote = '') => {
  const transcript = (Array.isArray(messages) ? messages : [])
    .slice(-24)
    .map((message) => `${normalizeRole(message?.role)}: ${clampText(message?.text || '', 1800)}`)
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

const runGeneration = async (modelId, prompt, options = {}) => {
  const pipe = await loadPipelineForModel(modelId, { downloadOnly: false });

  const output = await pipe(prompt, {
    max_new_tokens: Number(options.maxNewTokens) || 220,
    temperature: Number.isFinite(options.temperature) ? options.temperature : 0.2,
    top_p: Number.isFinite(options.topP) ? options.topP : 0.9,
    do_sample: options.doSample === true,
    repetition_penalty: 1.05
  });

  const generated = readGeneratedText(output, prompt);
  const stripped = stripPromptEcho(generated, prompt);
  return normalizeOutputText(stripped || generated).slice(0, 2400);
};

const runTask = async (modelId, task, payload = {}) => {
  const text = clampText(payload.text || payload.input || '');

  if (task === 'paraphrase') {
    const prompt = buildParaphrasePrompt(text);
    const rewritten = await runGeneration(modelId, prompt, { maxNewTokens: 320, temperature: 0.25, topP: 0.92 });
    return { text: rewritten || text };
  }

  if (task === 'improve') {
    const prompt = buildImprovePrompt(text, payload.tags, payload.style);
    const improved = await runGeneration(modelId, prompt, { maxNewTokens: 520, temperature: 0.3, topP: 0.92 });
    return { text: improved || text };
  }

  if (task === 'title') {
    const prompt = buildTitlePrompt(text);
    const rawTitle = await runGeneration(modelId, prompt, { maxNewTokens: 40, temperature: 0.15, topP: 0.88 });
    const title = String(rawTitle || '')
      .split('\n')[0]
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^\d+[\).\s-]+/, '')
      .trim()
      .slice(0, 80);
    return { title };
  }

  if (task === 'clarity') {
    const prompt = buildClarityPrompt(text);
    const raw = await runGeneration(modelId, prompt, { maxNewTokens: 130, temperature: 0.1, topP: 0.85 });
    const parsed = parseClarityJson(raw) || estimateFallbackClarity(text);
    const score = clamp(Math.round(Number(parsed?.score) || 0), 0, 100);
    const explanation = String(parsed?.explanation || '').trim() || estimateFallbackClarity(text).explanation;
    return { score, explanation };
  }

  if (task === 'continue_summary') {
    const prompt = buildContinuationPrompt(payload.messages || [], payload.mode, payload.userNote || '');
    const summarized = await runGeneration(modelId, prompt, { maxNewTokens: 520, temperature: 0.25, topP: 0.9 });
    return {
      text: limitWords(summarized || 'We were working on this conversation. Continue from here:', CONTINUATION_WORD_LIMIT)
    };
  }

  if (task === 'tags') {
    const prompt = buildTagPrompt(text);
    const raw = await runGeneration(modelId, prompt, { maxNewTokens: 72, temperature: 0.15, topP: 0.85 });
    const parsed = safeJsonParse(raw) || safeJsonParse(String(raw || '').match(/\[[\s\S]*\]/)?.[0] || '');
    const tags = Array.isArray(parsed)
      ? parsed
        .map((item) => String(item || '').toLowerCase().replace(/[^a-z0-9-_]/g, '').trim())
        .filter(Boolean)
        .slice(0, 3)
      : [];
    return { tags };
  }

  throw new Error(`Unsupported local task: ${String(task || 'unknown')}`);
};

const removeCachedModelData = async (modelId) => {
  const index = await readCacheIndex();
  const entry = index?.[modelId] || { cacheNames: [], urlPatterns: [] };
  const modelIdToken = String(MODEL_REGISTRY?.[modelId]?.modelId || '').toLowerCase();
  const looseTokens = [
    modelIdToken,
    modelIdToken.replace(/\//g, '%2f'),
    modelIdToken.replace(/\//g, '_'),
    modelIdToken.split('/').pop(),
    modelId
  ].map((token) => String(token || '').toLowerCase()).filter(Boolean);

  let deletedRequests = 0;
  let touchedCaches = new Set(entry.cacheNames || []);

  const cacheNames = await caches.keys();
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    let cacheHadDeletes = false;

    for (const request of requests) {
      const url = String(request?.url || '').toLowerCase();
      const patternMatch = (entry.urlPatterns || []).some((pattern) => url.includes(String(pattern || '').toLowerCase()));
      const tokenMatch = looseTokens.some((token) => token && url.includes(token));

      if (!patternMatch && !tokenMatch) continue;

      const deleted = await cache.delete(request);
      if (deleted) {
        deletedRequests += 1;
        cacheHadDeletes = true;
      }
    }

    if (cacheHadDeletes) {
      touchedCaches.add(cacheName);
    }
  }

  if (deletedRequests > 0) {
    index[modelId] = { cacheNames: Array.from(touchedCaches), urlPatterns: [] };
    await writeCacheIndex(index);

    const state = MODEL_STATE[modelId];
    state.pipe = null;
    state.loadingPromise = null;
    state.cancelRequested = false;
    state.progress = 0;
    state.status = STATUS_TYPES.NOT_DOWNLOADED;
    state.error = '';
    state.lastProgressBucket = -1;
    state.seenUrls.clear();

    await emitStatus(modelId);
    return { ok: true, deletedRequests };
  }

  await setState(modelId, {
    status: STATUS_TYPES.ERROR,
    error: 'Unable to clear cached model data completely. Try retrying.'
  });
  return { ok: false, deletedRequests: 0, error: 'No matching cached files found.' };
};

const removeCachedEmbeddingModelData = async (modelId) => {
  const index = await readEmbeddingCacheIndex();
  const entry = index?.[modelId] || { cacheNames: [], urlPatterns: [] };
  const modelIdToken = String(EMBEDDING_REGISTRY?.[modelId]?.modelId || '').toLowerCase();
  const looseTokens = [
    modelIdToken,
    modelIdToken.replace(/\//g, '%2f'),
    modelIdToken.replace(/\//g, '_'),
    modelIdToken.split('/').pop(),
    modelId
  ].map((token) => String(token || '').toLowerCase()).filter(Boolean);

  let deletedRequests = 0;
  const touchedCaches = new Set(entry.cacheNames || []);

  const cacheNames = await caches.keys();
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    let cacheHadDeletes = false;

    for (const request of requests) {
      const url = String(request?.url || '').toLowerCase();
      const patternMatch = (entry.urlPatterns || []).some((pattern) => url.includes(String(pattern || '').toLowerCase()));
      const tokenMatch = looseTokens.some((token) => token && url.includes(token));
      if (!patternMatch && !tokenMatch) continue;

      const deleted = await cache.delete(request);
      if (deleted) {
        deletedRequests += 1;
        cacheHadDeletes = true;
      }
    }

    if (cacheHadDeletes) {
      touchedCaches.add(cacheName);
    }
  }

  if (deletedRequests > 0) {
    index[modelId] = { cacheNames: Array.from(touchedCaches), urlPatterns: [] };
    await writeEmbeddingCacheIndex(index);

    const state = EMBEDDING_STATE[modelId];
    if (state?.pipe && typeof state.pipe.dispose === 'function') {
      await state.pipe.dispose().catch(() => {});
    }
    if (state) {
      state.pipe = null;
      state.loadingPromise = null;
      state.cancelRequested = false;
      state.progress = 0;
      state.status = STATUS_TYPES.NOT_DOWNLOADED;
      state.error = '';
      state.lastProgressBucket = -1;
      state.seenUrls.clear();
      await emitEmbeddingStatus(modelId);
    }
    return { ok: true, deletedRequests };
  }

  return { ok: false, deletedRequests: 0, error: 'No matching cached files found.' };
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== OFFSCREEN_TARGET) {
    return false;
  }

  void (async () => {
    const incomingType = String(message?.type || '').trim();
    const type = incomingType === 'localModel:status'
      ? 'AI_LOCAL_MODEL_STATUS'
      : incomingType === 'localModel:load'
        ? 'AI_LOCAL_MODEL_INIT'
        : incomingType === 'localModel:paraphrase'
          ? 'RUN_LOCAL_TASK'
          : incomingType;
    const payload = message?.payload && typeof message.payload === 'object' ? message.payload : {};
    const modelId = await resolveModelKey(payload.modelId || message?.modelId);
    const embeddingModelId = await resolveEmbeddingModelId(payload.modelId || payload.embeddingModelId || message?.modelId || message?.embeddingModelId);

    try {
      if (type === 'AI_EMBEDDING_STATUS') {
        const state = EMBEDDING_STATE[embeddingModelId];
        sendResponse({
          ok: true,
          result: {
            modelId: embeddingModelId,
            activeModelId: activeEmbeddingModelId,
            status: state?.status || STATUS_TYPES.NOT_DOWNLOADED,
            progress: state?.progress || 0,
            backend: state?.backend || 'webgpu',
            error: state?.error || ''
          }
        });
        return;
      }

      if (type === 'AI_EMBEDDING_DOWNLOAD') {
        await loadPipelineForEmbeddingModel(embeddingModelId, { downloadOnly: true });
        sendResponse({
          ok: true,
          result: {
            modelId: embeddingModelId,
            activeModelId: activeEmbeddingModelId,
            status: EMBEDDING_STATE[embeddingModelId].status,
            progress: EMBEDDING_STATE[embeddingModelId].progress,
            backend: EMBEDDING_STATE[embeddingModelId].backend
          }
        });
        return;
      }

      if (type === 'AI_EMBEDDING_SWITCH') {
        activeEmbeddingModelId = embeddingModelId;
        await loadPipelineForEmbeddingModel(embeddingModelId, { downloadOnly: false });
        sendResponse({
          ok: true,
          result: {
            modelId: embeddingModelId,
            activeModelId: activeEmbeddingModelId,
            status: EMBEDDING_STATE[embeddingModelId].status,
            progress: EMBEDDING_STATE[embeddingModelId].progress,
            backend: EMBEDDING_STATE[embeddingModelId].backend
          }
        });
        return;
      }

      if (type === 'AI_EMBEDDING_EMBED_TEXT') {
        const vector = await embedWithModel(embeddingModelId, String(payload.text || payload.input || ''));
        sendResponse({
          ok: true,
          result: {
            modelId: embeddingModelId,
            activeModelId: activeEmbeddingModelId,
            vector
          }
        });
        return;
      }

      if (type === 'AI_EMBEDDING_BATCH_EMBED') {
        activeEmbeddingModelId = embeddingModelId;
        const vectors = await batchEmbedWithModel(
          embeddingModelId,
          Array.isArray(payload.texts) ? payload.texts : [],
          Number(payload.ratePerSecond || EMBEDDING_RATE_LIMIT_PER_SEC)
        );
        sendResponse({
          ok: true,
          result: {
            modelId: embeddingModelId,
            activeModelId: activeEmbeddingModelId,
            vectors
          }
        });
        return;
      }

      if (type === 'AI_EMBEDDING_REMOVE_CACHE') {
        const result = await removeCachedEmbeddingModelData(embeddingModelId);
        sendResponse({ ok: result.ok, result, error: result.error || '' });
        return;
      }

      if (type === 'AI_LOCAL_MODEL_STATUS' || type === 'LOCAL_MODEL_STATUS_CHECK') {
        const state = MODEL_STATE[modelId];
        sendResponse({
          ok: true,
          result: {
            modelId,
            status: state.status,
            progress: state.progress,
            backend: state.backend,
            error: state.error,
            cpuMode: state.backend === 'wasm'
          }
        });
        return;
      }

      if (type === 'AI_LOCAL_MODEL_DOWNLOAD') {
        await loadPipelineForModel(modelId, { downloadOnly: true });
        sendResponse({
          ok: true,
          result: {
            modelId,
            status: MODEL_STATE[modelId].status,
            progress: MODEL_STATE[modelId].progress,
            backend: MODEL_STATE[modelId].backend
          }
        });
        return;
      }

      if (type === 'AI_LOCAL_MODEL_CANCEL_DOWNLOAD') {
        MODEL_STATE[modelId].cancelRequested = true;
        sendResponse({ ok: true, result: { modelId, status: MODEL_STATE[modelId].status } });
        return;
      }

      if (type === 'AI_LOCAL_MODEL_REMOVE_CACHE') {
        const result = await removeCachedModelData(modelId);
        sendResponse({ ok: result.ok, result, error: result.error || '' });
        return;
      }

      if (type === 'AI_LOCAL_MODEL_INIT' || type === 'LOCAL_MODEL_INIT') {
        await loadPipelineForModel(modelId, { downloadOnly: false });
        sendResponse({
          ok: true,
          result: {
            modelId,
            status: MODEL_STATE[modelId].status,
            backend: MODEL_STATE[modelId].backend,
            cpuMode: MODEL_STATE[modelId].backend === 'wasm'
          }
        });
        return;
      }

      if (type === 'AI_LOCAL_MODEL_RELEASE_IDLE') {
        await releaseModel(modelId, 'idle');
        sendResponse({ ok: true, result: { modelId, status: MODEL_STATE[modelId].status } });
        return;
      }

      if (type === 'RUN_LOCAL_TASK') {
        const task = incomingType === 'localModel:paraphrase'
          ? 'paraphrase'
          : String(message?.task || '').trim().toLowerCase();
        const result = await runTask(modelId, task, payload);
        sendResponse({
          ok: true,
          result: {
            ...result,
            modelId,
            backend: MODEL_STATE[modelId].backend,
            cpuMode: MODEL_STATE[modelId].backend === 'wasm'
          }
        });
        return;
      }

      sendResponse({ ok: false, error: `Unsupported offscreen request type: ${type || 'unknown'}` });
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || 'Local model task failed.') });
    }
  })();

  return true;
});
