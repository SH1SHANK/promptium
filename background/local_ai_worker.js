/**
 * File: background/local_ai_worker.js
 * Purpose: Dedicated Web Worker for local on-device text generation tasks.
 * Runs Qwen3 ONNX via Transformers.js with WebGPU preference and WASM fallback.
 */

import { pipeline, env } from '../libs/transformers.min.js';

env.allowLocalModels = false;   // force CDN fetch only — no local filesystem in Chrome extensions
env.useBrowserCache = true;     // use browser Cache API for persistence across sessions
env.allowRemoteModels = true;   // explicitly allow HuggingFace CDN
env.backends.onnx.wasm.numThreads = 1;

const MODEL_ID = 'onnx-community/Qwen3-0.6B-ONNX';
const TASK_NAME = 'text-generation';

const MAX_SOURCE_CHARS = 5000;
const MAX_OUTPUT_CHARS = 2200;

const MODEL = {
  pipe: null,
  status: 'idle', // idle | loading | ready | failed
  backend: 'webgpu',
  lastError: ''
};

const clampText = (value, max = MAX_SOURCE_CHARS) => String(value || '').trim().slice(0, max);

const postStatus = (status, extra = {}) => {
  self.postMessage({
    type: 'LOCAL_MODEL_STATUS',
    status,
    backend: MODEL.backend,
    error: MODEL.lastError || '',
    ...extra
  });
};

const postProgress = (data) => {
  const raw = Number(data?.progress ?? 0);
  const progress = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0;
  self.postMessage({
    type: 'LOCAL_MODEL_PROGRESS',
    progress,
    status: String(data?.status || '')
  });
};

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
};

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
        const textPart = tail.content.find((part) => typeof part?.text === 'string');
        if (textPart?.text) return textPart.text;
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
  if (text.startsWith(source)) {
    return text.slice(source.length).trim();
  }
  return text;
};

const normalizeOutputText = (value) => String(value || '')
  .replace(/^```(?:json)?/i, '')
  .replace(/```$/i, '')
  .replace(/\u0000/g, '')
  .trim()
  .slice(0, MAX_OUTPUT_CHARS);

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

const parseClarityJson = (raw) => {
  const normalized = normalizeOutputText(raw);
  const direct = safeJsonParse(normalized);
  if (direct && typeof direct === 'object') {
    return direct;
  }
  const match = normalized.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return safeJsonParse(match[0]);
};

const estimateFallbackClarity = (text) => {
  const source = clampText(text, 4800);
  if (!source) {
    return { score: 0, explanation: 'No prompt content provided.' };
  }

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

  score = Math.max(0, Math.min(100, Math.round(score)));
  const explanation = score >= 75
    ? 'Clear goal with useful constraints.'
    : score >= 55
      ? 'Reasonably clear, but add more concrete constraints.'
      : 'Needs clearer goal, context, and output constraints.';

  return { score, explanation };
};

const runGeneration = async (prompt, options = {}) => {
  await ensureModel();

  const response = await MODEL.pipe(prompt, {
    max_new_tokens: Number(options.maxNewTokens) || 220,
    temperature: Number.isFinite(options.temperature) ? options.temperature : 0.2,
    top_p: Number.isFinite(options.topP) ? options.topP : 0.9,
    do_sample: options.doSample === true,
    repetition_penalty: 1.05
  });

  const generated = readGeneratedText(response, prompt);
  const stripped = stripPromptEcho(generated, prompt);
  return normalizeOutputText(stripped || generated);
};

const ensureModel = async () => {
  if (MODEL.status === 'ready' && MODEL.pipe) {
    return MODEL.pipe;
  }
  if (MODEL.status === 'loading') {
    // Poll status briefly if another request is initializing.
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (MODEL.status === 'ready' && MODEL.pipe) return MODEL.pipe;
  }

  MODEL.status = 'loading';
  MODEL.lastError = '';
  postStatus('loading');

  try {
    MODEL.backend = 'webgpu';
    MODEL.pipe = await pipeline(TASK_NAME, MODEL_ID, {
      device: 'webgpu',
      dtype: 'q4',
      progress_callback: postProgress
    });
    MODEL.status = 'ready';
    postStatus('ready', { downloaded: true });
    return MODEL.pipe;
  } catch (webgpuError) {
    try {
      MODEL.backend = 'wasm';
      MODEL.pipe = await pipeline(TASK_NAME, MODEL_ID, {
        device: 'wasm',
        progress_callback: postProgress
      });
      MODEL.status = 'ready';
      postStatus('ready', { downloaded: true, fallback: 'wasm' });
      return MODEL.pipe;
    } catch (wasmError) {
      MODEL.pipe = null;
      MODEL.status = 'failed';
      MODEL.lastError = String(
        wasmError?.message || webgpuError?.message || 'Local model failed to load.'
      );
      postStatus('failed');
      throw new Error(MODEL.lastError);
    }
  }
};

const runTask = async (task, payload = {}) => {
  const text = clampText(payload.text || payload.input || '');

  if (task === 'paraphrase') {
    const prompt = buildParaphrasePrompt(text);
    const rewritten = await runGeneration(prompt, { maxNewTokens: 320, temperature: 0.25, topP: 0.92 });
    return { text: rewritten || text };
  }

  if (task === 'improve') {
    const prompt = buildImprovePrompt(text, payload.tags, payload.style);
    const improved = await runGeneration(prompt, { maxNewTokens: 520, temperature: 0.3, topP: 0.92 });
    return { text: improved || text };
  }

  if (task === 'title') {
    const prompt = buildTitlePrompt(text);
    const rawTitle = await runGeneration(prompt, { maxNewTokens: 36, temperature: 0.15, topP: 0.88 });
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
    const raw = await runGeneration(prompt, { maxNewTokens: 120, temperature: 0.1, topP: 0.85 });
    const parsed = parseClarityJson(raw) || estimateFallbackClarity(text);
    const numeric = Number(parsed?.score);
    const score = Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : estimateFallbackClarity(text).score;
    const explanation = String(parsed?.explanation || '').trim() || estimateFallbackClarity(text).explanation;
    return { score, explanation };
  }

  throw new Error(`Unsupported local task: ${String(task || 'unknown')}`);
};

self.onmessage = (event) => {
  void (async () => {
    const message = event?.data || {};
    const id = Number(message.id || 0) || 0;
    const type = String(message.type || '').trim();

    try {
      if (type === 'LOCAL_MODEL_INIT') {
        await ensureModel();
        self.postMessage({
          type: 'LOCAL_TASK_RESULT',
          id,
          ok: true,
          result: { status: MODEL.status, backend: MODEL.backend }
        });
        return;
      }

      if (type === 'LOCAL_MODEL_STATUS_CHECK') {
        self.postMessage({
          type: 'LOCAL_TASK_RESULT',
          id,
          ok: true,
          result: {
            status: MODEL.status,
            backend: MODEL.backend,
            error: MODEL.lastError || ''
          }
        });
        return;
      }

      if (type === 'RUN_LOCAL_TASK') {
        const task = String(message.task || '').trim().toLowerCase();
        const result = await runTask(task, message.payload || {});
        self.postMessage({
          type: 'LOCAL_TASK_RESULT',
          id,
          ok: true,
          result
        });
        return;
      }

      throw new Error(`Unsupported worker message type: ${type || 'unknown'}`);
    } catch (error) {
      self.postMessage({
        type: 'LOCAL_TASK_RESULT',
        id,
        ok: false,
        error: String(error?.message || 'Local model task failed.')
      });
    }
  })();
};
