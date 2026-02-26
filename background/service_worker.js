/**
 * File: background/service_worker.js
 * Purpose: Initializes storage, configures side panel behavior, handles extension-level
 *          runtime actions, and owns the on-device Transformers.js AI model.
 * Communicates with: utils/storage.js, popup/popup.js, content/content.js, utils/ai-bridge.js.
 */

import { pipeline, env } from '../libs/transformers.min.js';

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
    console.warn('[PromptNest AI] Model failed to load:', err.message);
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

  await chrome.storage.local.set({ embeddingCache: AI.embeddingCache });
}

async function addToCache(prompt) {
  try {
    const text = `${prompt.title} ${prompt.text} ${(prompt.tags ?? []).join(' ')}`;
    AI.embeddingCache[prompt.id] = await embed(text);
    await chrome.storage.local.set({ embeddingCache: AI.embeddingCache });
  } catch (_) {}
}

async function removeFromCache(promptId) {
  delete AI.embeddingCache[promptId];
  await chrome.storage.local.set({ embeddingCache: AI.embeddingCache });
}

// ─── AI Feature: Semantic Search ─────────────────────────────────────────────

async function semanticSearch(query) {
  if (AI.status !== 'ready') return null;

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

let tagEmbeddings = null;

async function getTagEmbeddings() {
  if (tagEmbeddings) return tagEmbeddings;
  tagEmbeddings = {};
  for (const [tag, definition] of Object.entries(TAG_DEFINITIONS)) {
    tagEmbeddings[tag] = await embed(definition);
  }
  return tagEmbeddings;
}

async function suggestTags(promptText) {
  if (AI.status !== 'ready') return [];

  const [textEmbed, labels] = await Promise.all([
    embed(promptText),
    getTagEmbeddings(),
  ]);

  const scored = Object.entries(labels)
    .map(([tag, labelEmbed]) => ({
      tag,
      score: cosineSimilarity(textEmbed, labelEmbed),
    }))
    .filter(r => r.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(r => r.tag);

  return scored;
}

// ─── AI Feature: Duplicate Detection ─────────────────────────────────────────

async function checkDuplicate(promptText, excludeId = null) {
  if (AI.status !== 'ready') return null;

  const textEmbed = await embed(promptText);
  const { prompts = [] } = await chrome.storage.local.get('prompts');

  let best = null;
  let bestScore = 0;

  for (const prompt of prompts) {
    if (prompt.id === excludeId) continue;
    if (!AI.embeddingCache[prompt.id]) continue;

    const score = cosineSimilarity(textEmbed, AI.embeddingCache[prompt.id]);
    if (score > bestScore) {
      bestScore = score;
      best = prompt;
    }
  }

  if (bestScore > 0.92) {
    return { prompt: best, score: bestScore };
  }
  return null;
}

// ─── AI Feature: Smart Suggestions via Gemini Flash Lite ─────────────────────

async function getSmartSuggestions(conversationText) {
  if (!conversationText || conversationText.length < 30) return null;

  try {
    const { pnGeminiKey } = await chrome.storage.local.get('pnGeminiKey');
    if (!pnGeminiKey) return null;

    const { prompts = [] } = await chrome.storage.local.get('prompts');
    if (!prompts.length) return null;

    const promptList = prompts
      .slice(0, 30)
      .map((p, i) => `${i + 1}. [${p.id}] "${p.title}"${p.tags?.length ? ` (tags: ${p.tags.join(', ')})` : ''}`)
      .join('\n');

    const systemPrompt = `You are a prompt suggestion engine. Given a conversation snippet and a numbered list of saved prompts, return the IDs of the top 3 most relevant prompts. Reply ONLY with a JSON array of ID strings, e.g. ["id1","id2","id3"]. If none are relevant, reply [].`;

    const userMessage = `Conversation:\n${conversationText.slice(0, 600)}\n\nSaved prompts:\n${promptList}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${pnGeminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 200,
          },
        }),
      }
    );

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

// ─── AI Feature: AI Prompt Improvement (Gemini Flash) ─────────────────────────

async function improvePromptViaGemini(text, tags = [], style = 'general') {
  if (!text || text.trim().length === 0) return null;

  try {
    const { pnGeminiKey } = await chrome.storage.local.get('pnGeminiKey');
    if (!pnGeminiKey) return null;

    let styleInstruction = 'Make it clear, concise, and highly effective for an AI.';
    if (style === 'coding') {
      styleInstruction = 'Optimize for software engineering. Ask for code snippets, architecture details, and edge case handling.';
    } else if (style === 'study') {
      styleInstruction = 'Optimize for learning and summarization. Ask for clear explanations, analogies, and step-by-step breakdowns.';
    } else if (style === 'creative') {
      styleInstruction = 'Optimize for creative writing. Ask for vivid imagery, character depth, and engaging tone.';
    }

    const tagContext = tags.length > 0 ? `Incorporate these concepts/topics: ${tags.join(', ')}.` : '';

    const systemPrompt = `You are an expert prompt engineer. Your goal is to improve the user's prompt so it yields the best possible response from an LLM. 
${styleInstruction} 
${tagContext}
ONLY return the improved prompt text. Do not add quotes, do not explain your changes, do not write "Here is the improved prompt:". Just the raw, ready-to-use prompt text.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${pnGeminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser's Original Prompt: ${text}` }] }
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 800,
          },
        }),
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const textResult = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    
    return textResult.trim() || null;
  } catch (err) {
    console.error('[PromptNest] Failed to improve prompt via Gemini:', err);
    return null;
  }
}

// ─── AI Message Handler ──────────────────────────────────────────────────────

const handleAIMessage = async (message, sendResponse) => {
  try {
    switch (message.type) {
      case 'AI_INIT':
        await loadModel();
        sendResponse({ status: AI.status });
        return true;

      case 'AI_SEARCH':
        sendResponse({ results: await semanticSearch(message.query) });
        return true;

      case 'AI_SUGGEST_TAGS':
        sendResponse({ tags: await suggestTags(message.text) });
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
        sendResponse({ text: await improvePromptViaGemini(message.text, message.tags, message.style) });
        return true;

      case 'AI_STATUS_CHECK':
        sendResponse({ status: AI.status });
        return true;

      default:
        return false;
    }
  } catch (err) {
    sendResponse({ error: err.message });
    return true;
  }
};

// Auto-start model loading when service worker wakes
loadModel();

const SIDE_PANEL_PATH = 'sidepanel/sidepanel.html';
const SIDEPANEL_SESSION_KEY = 'pnSidePanelPayload';
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

// Manually open the side panel when the user clicks the extension action icon.
// This often works more reliably than the declarative setPanelBehavior API.
chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch((error) => {
      console.error('[PromptNest][ServiceWorker] Failed to open side panel on action click.', error);
    });
  }
});

/** Handles extension install lifecycle and applies initial storage and side panel setup. */
const onInstalled = async () => {
  try {
    await initializeStorageKeys();
  } catch (error) {
    console.error('[PromptNest][ServiceWorker] Initialization failed.', error);
  }
};


/** Opens a new browser tab when content scripts request cross-LLM navigation. */
const handleOpenLlmTab = async (url) => {
  try {
    const parsed = new URL(String(url || ''));

    if (!['https:', 'http:'].includes(parsed.protocol)) {
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

/** Routes runtime messages and keeps channel open for async response delivery. */
const onRuntimeMessage = (message, sender, sendResponse) => {
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
      if (message?.type?.startsWith('AI_')) {
        const handled = await handleAIMessage(message, respond);
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

chrome.runtime.onMessage.addListener(onRuntimeMessage);
