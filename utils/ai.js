/**
 * File: utils/ai.js
 * Purpose: Provides on-device AI utilities for semantic search, tag suggestion, and duplicate detection.
 * Communicates with: popup/popup.js and chrome.storage.local in popup context.
 */

const MODEL_TASK = 'feature-extraction';
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const LABEL_CANDIDATES = ['coding', 'study', 'career', 'creative', 'general', 'debugging', 'explanation', 'interview'];
const PROMPTS_KEY = 'prompts';
const SEMANTIC_PROMPT_CAP = 200;

let modelPipeline = null;
let modelLoadingPromise = null;
let aiAvailable = false;
let labelsReady = false;
let rehydratingEmbeddings = false;

const labelEmbeddingCache = new Map();
const textEmbeddingCache = new Map();
const semanticEmbeddingCache = new Map();

/** Returns the AI status badge element from popup markup. */
const getStatusNode = async () => document.getElementById('ai-status');

/** Ensures AI status markup has dedicated dot and text nodes for rich updates. */
const ensureStatusStructure = async (statusNode) => {
  if (!statusNode) {
    return { dot: null, text: null };
  }

  let dot = statusNode.querySelector('.pn-ai-dot');
  let text = statusNode.querySelector('.pn-ai-status__text');

  if (!dot || !text) {
    statusNode.innerHTML = '<span class="pn-ai-dot"></span><span class="pn-ai-status__text">Loading AI...</span>';
    dot = statusNode.querySelector('.pn-ai-dot');
    text = statusNode.querySelector('.pn-ai-status__text');
  }

  return { dot, text };
};

/** Updates the popup AI badge text and visual status style. */
const setStatus = async (text, statusClass) => {
  const statusNode = await getStatusNode();

  if (!statusNode) {
    return;
  }

  const { dot, text: textNode } = await ensureStatusStructure(statusNode);

  if (textNode) {
    textNode.textContent = text;
  } else {
    statusNode.textContent = text;
  }

  statusNode.classList.remove('pn-ai-status--loading', 'pn-ai-status--ready', 'pn-ai-status--unavailable');

  if (statusClass) {
    statusNode.classList.add(statusClass);
  }

  if (dot) {
    dot.classList.toggle('loading', statusClass === 'pn-ai-status--loading');
  }
};

/** Converts unknown model output into tensor-like data and dims fields. */
const resolveTensor = async (output) => {
  if (output && output.data && Array.isArray(output.dims)) {
    return { data: output.data, dims: output.dims };
  }

  if (Array.isArray(output)) {
    const flattened = output.flat(3).map((item) => Number(item) || 0);
    return { data: new Float32Array(flattened), dims: [1, output.length || 1, output[0]?.length || flattened.length] };
  }

  return null;
};

/** Mean-pools token embeddings into a single vector and normalizes it to unit length. */
const meanPoolAndNormalize = async (tensor) => {
  const dims = tensor.dims;
  const source = tensor.data instanceof Float32Array ? tensor.data : new Float32Array(tensor.data);
  let pooled = null;

  if (dims.length >= 3) {
    const tokens = dims[dims.length - 2];
    const hidden = dims[dims.length - 1];
    pooled = new Float32Array(hidden);

    for (let tokenIndex = 0; tokenIndex < tokens; tokenIndex += 1) {
      for (let featureIndex = 0; featureIndex < hidden; featureIndex += 1) {
        pooled[featureIndex] += source[tokenIndex * hidden + featureIndex] || 0;
      }
    }

    for (let featureIndex = 0; featureIndex < hidden; featureIndex += 1) {
      pooled[featureIndex] /= tokens || 1;
    }
  } else if (dims.length === 2) {
    const rows = dims[0];
    const cols = dims[1];
    pooled = new Float32Array(cols);

    for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
      for (let colIndex = 0; colIndex < cols; colIndex += 1) {
        pooled[colIndex] += source[rowIndex * cols + colIndex] || 0;
      }
    }

    for (let colIndex = 0; colIndex < cols; colIndex += 1) {
      pooled[colIndex] /= rows || 1;
    }
  } else if (dims.length === 1) {
    pooled = new Float32Array(source);
  } else {
    return null;
  }

  let magnitude = 0;

  for (const value of pooled) {
    magnitude += value * value;
  }

  const denominator = Math.sqrt(magnitude);

  if (!denominator) {
    return pooled;
  }

  for (let index = 0; index < pooled.length; index += 1) {
    pooled[index] /= denominator;
  }

  return pooled;
};

/** Embeds a text string into a normalized Float32Array vector or returns null on failure. */
const embedText = async (text) => {
  try {
    const inputText = String(text || '').trim();

    if (!inputText || !aiAvailable || !modelPipeline) {
      return null;
    }

    const output = await modelPipeline(inputText);
    const tensor = await resolveTensor(output);

    if (!tensor) {
      return null;
    }

    return await meanPoolAndNormalize(tensor);
  } catch (error) {
    console.error('[PromptNest][AI] Failed to embed text.', error);
    return null;
  }
};

/** Converts an embedding array value into a Float32Array when valid. */
const toVector = async (embedding) => {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    return null;
  }

  const numeric = embedding.map((value) => Number(value) || 0);
  return new Float32Array(numeric);
};

/** Returns cosine similarity for two vectors and handles invalid inputs safely. */
const cosineSimilarity = async (vecA, vecB) => {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < vecA.length; index += 1) {
    dot += vecA[index] * vecB[index];
    normA += vecA[index] * vecA[index];
    normB += vecB[index] * vecB[index];
  }

  if (!normA || !normB) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

/** Filters prompts by keyword matching when semantic AI is unavailable. */
const keywordFilter = async (query, prompts) => {
  const normalized = String(query || '').trim().toLowerCase();

  if (!normalized) {
    return prompts;
  }

  return prompts.filter((prompt) => {
    const titleMatch = String(prompt.title || '').toLowerCase().includes(normalized);
    const textMatch = String(prompt.text || '').toLowerCase().includes(normalized);
    const tagsMatch = (prompt.tags || []).join(' ').toLowerCase().includes(normalized);
    return titleMatch || textMatch || tagsMatch;
  });
};

/** Caches label embeddings once for fast tag suggestion scoring. */
const precomputeLabelEmbeddings = async () => {
  if (!aiAvailable || labelsReady) {
    return;
  }

  for (const label of LABEL_CANDIDATES) {
    const embedding = await embedText(label);

    if (embedding) {
      labelEmbeddingCache.set(label, embedding);
    }
  }

  labelsReady = true;
};

/** Initializes Transformers.js model and updates popup AI status indicator. */
const initModel = async () => {
  if (modelPipeline && aiAvailable) {
    await setStatus('AI Ready', 'pn-ai-status--ready');
    return true;
  }

  if (modelLoadingPromise) {
    return modelLoadingPromise;
  }

  modelLoadingPromise = (async () => {
    try {
      await setStatus('Loading AI...', 'pn-ai-status--loading');

      if (!window.transformers || typeof window.transformers.pipeline !== 'function') {
        throw new Error('Transformers.js runtime not found in popup context.');
      }

      modelPipeline = await window.transformers.pipeline(MODEL_TASK, MODEL_NAME);
      aiAvailable = true;
      await precomputeLabelEmbeddings();
      await setStatus('AI Ready', 'pn-ai-status--ready');
      return true;
    } catch (error) {
      aiAvailable = false;
      modelPipeline = null;
      labelsReady = false;
      console.error('[PromptNest][AI] Model initialization failed.', error);
      await setStatus('AI Unavailable', 'pn-ai-status--unavailable');
      return false;
    } finally {
      modelLoadingPromise = null;
    }
  })();

  return modelLoadingPromise;
};

/** Returns AI availability state for popup feature gating decisions. */
const isAvailable = async () => aiAvailable;

/** Ranks prompts by semantic similarity to a query or falls back to keyword filtering. */
const semanticSearch = async (query, prompts) => {
  const normalizedQuery = String(query || '').trim();

  if (!normalizedQuery) {
    return prompts;
  }

  if (!aiAvailable) {
    return keywordFilter(normalizedQuery, prompts);
  }

  const queryVector = await embedText(normalizedQuery);

  if (!queryVector) {
    return keywordFilter(normalizedQuery, prompts);
  }

  const pool = Array.isArray(prompts) ? prompts : [];
  const limitedPrompts = pool.slice(0, SEMANTIC_PROMPT_CAP);

  if (pool.length > SEMANTIC_PROMPT_CAP) {
    console.warn('[PromptNest][AI] Semantic search limited to first 200 prompts for performance.');
  }

  const scored = [];

  for (const prompt of limitedPrompts) {
    const cacheKey = String(prompt.id || `${prompt.title || ''}:${prompt.text || ''}`);
    let promptVector = semanticEmbeddingCache.get(cacheKey) || null;

    if (!promptVector) {
      const combined = `${String(prompt.title || '').trim()} ${String(prompt.text || '').trim()}`.trim();
      promptVector = await embedText(combined);

      if (promptVector) {
        semanticEmbeddingCache.set(cacheKey, promptVector);
      }
    }

    if (!promptVector) {
      continue;
    }

    const similarity = await cosineSimilarity(queryVector, promptVector);

    if (similarity > 0.25) {
      scored.push({ ...prompt, _semanticScore: similarity });
    }
  }

  scored.sort((left, right) => right._semanticScore - left._semanticScore);
  return scored;
};

/** Suggests top two tags by comparing prompt text embedding to cached label embeddings. */
const suggestTags = async (text) => {
  if (!aiAvailable) {
    return [];
  }

  let userContext = '';

  try {
    const stored = await chrome.storage.local.get(['userContext']);
    userContext = String(stored?.userContext || '').trim();
  } catch (_error) {
    userContext = '';
  }

  const contextualText = userContext ? `${userContext} ${String(text || '').trim()}`.trim() : String(text || '').trim();
  const textVector = await embedText(contextualText);

  if (!textVector) {
    return [];
  }

  if (!labelsReady) {
    await precomputeLabelEmbeddings();
  }

  const scoredLabels = [];

  for (const label of LABEL_CANDIDATES) {
    const labelVector = labelEmbeddingCache.get(label);
    const similarity = await cosineSimilarity(textVector, labelVector || null);

    if (similarity > 0.4) {
      scoredLabels.push({ label, similarity });
    }
  }

  scoredLabels.sort((left, right) => right.similarity - left.similarity);
  return scoredLabels.slice(0, 2).map((entry) => entry.label);
};

/** Resolves prompt text embedding from stored data or computes it lazily when missing. */
const getPromptTextEmbedding = async (prompt) => {
  const promptId = String(prompt.id || '');

  if (promptId && textEmbeddingCache.has(promptId)) {
    return textEmbeddingCache.get(promptId);
  }

  const stored = await toVector(prompt.embedding);

  if (stored) {
    if (promptId) {
      textEmbeddingCache.set(promptId, stored);
    }

    return stored;
  }

  const computed = await embedText(String(prompt.text || '').trim());

  if (computed && promptId) {
    textEmbeddingCache.set(promptId, computed);
  }

  return computed;
};

/** Detects near-duplicate prompts by embedding similarity against existing prompt texts. */
const isDuplicate = async (newText, existingPrompts) => {
  if (!aiAvailable) {
    return { duplicate: false };
  }

  const queryVector = await embedText(newText);

  if (!queryVector) {
    return { duplicate: false };
  }

  for (const prompt of existingPrompts || []) {
    const promptVector = await getPromptTextEmbedding(prompt);

    if (!promptVector) {
      continue;
    }

    const similarity = await cosineSimilarity(queryVector, promptVector);

    if (similarity > 0.92) {
      return { duplicate: true, match: prompt };
    }
  }

  return { duplicate: false };
};

/** Lazily computes and persists missing prompt embeddings without blocking popup rendering. */
const rehydratePromptEmbeddings = async (prompts) => {
  if (!aiAvailable || rehydratingEmbeddings || !Array.isArray(prompts) || prompts.length === 0) {
    return false;
  }

  rehydratingEmbeddings = true;

  try {
    const nextPrompts = [...prompts];
    let changed = false;

    for (let index = 0; index < nextPrompts.length; index += 1) {
      const prompt = nextPrompts[index];

      if (Array.isArray(prompt.embedding) && prompt.embedding.length > 0) {
        continue;
      }

      const embedding = await embedText(String(prompt.text || '').trim());

      if (!embedding) {
        continue;
      }

      nextPrompts[index] = {
        ...prompt,
        embedding: Array.from(embedding)
      };

      if (prompt.id) {
        textEmbeddingCache.set(String(prompt.id), embedding);
      }

      changed = true;
    }

    if (changed) {
      await chrome.storage.local.set({ [PROMPTS_KEY]: nextPrompts });
    }

    return changed;
  } catch (error) {
    console.error('[PromptNest][AI] Failed to rehydrate prompt embeddings.', error);
    return false;
  } finally {
    rehydratingEmbeddings = false;
  }
};

const AI = {
  initModel,
  embedText,
  cosineSimilarity,
  semanticSearch,
  suggestTags,
  isDuplicate,
  rehydratePromptEmbeddings,
  isAvailable
};

if (typeof window !== 'undefined') {
  window.AI = AI;
}
