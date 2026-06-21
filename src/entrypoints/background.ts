/**
 * File: background/service_worker.js
 * Purpose: Initializes storage, opens the floating app window, and routes AI features
 *          exclusively through the Gemini API client.
 */

import { PROVIDER_IDS } from '../utils/model-registry';
import {
  getGeminiApiKey,
  callGemini,
  validateGeminiApiKey as validateGeminiApiKeyClient,
} from '../services/gemini-service';
import { windowManager } from '../services/window-manager';

export default defineBackground(() => {
  if (chrome?.storage && !chrome.storage.session) {
    chrome.storage.session = chrome.storage.local;
  }

  // ─── AI State ────────────────────────────────────────────────────────────────

  const AI = {
    status: 'idle', // idle | ready | failed
    searchMode: 'keyword',
  };

  const BRAND_KEYS = {
    geminiKey: 'promptiumGeminiKey',
    settingsKey: 'promptiumSettings',
    sidePanelPayload: 'promptiumSidePanelPayload',
    improvePayload: 'promptiumImprovePayload',
    pendingSnippet: 'pendingSnippet',
  };

  const CONTINUATION_WORD_LIMIT = 300;
  const CONTINUATION_LONG_THRESHOLD = 20;
  const CONTEXT_MENU_SAVE_ID = 'promptium-save-selection';

  const PROVIDER_LABELS = Object.freeze({
    gemini: 'Gemini',
  });
  const ALL_PROVIDER_IDS = Object.freeze([PROVIDER_IDS.GEMINI]);

  const normalizeProviderId = (providerId = '') => {
    const normalized = String(providerId || '')
      .trim()
      .toLowerCase();
    return normalized === PROVIDER_IDS.GEMINI ? PROVIDER_IDS.GEMINI : PROVIDER_IDS.GEMINI;
  };

  const getProviderLabel = (providerId = '') => {
    const normalized = normalizeProviderId(providerId);
    return PROVIDER_LABELS[normalized] || normalized;
  };

  /** Redacts obvious secret-like and PII patterns before external API calls. */
  const redactSensitiveText = (value) =>
    String(value || '')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
      .replace(/\b(?:sk|ghp_|AIzaSy)[A-Za-z0-9_\-]{12,}\b/g, '[redacted-token]')
      .replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, '[redacted-ssn]');

  const normalizeContinuationRole = (role) => {
    const value = String(role || '')
      .trim()
      .toLowerCase();
    if (['user', 'you', 'human'].includes(value)) return 'Human';
    if (['assistant', 'model', 'bot', 'ai'].includes(value)) return 'Assistant';
    return value.includes('user') ? 'Human' : 'Assistant';
  };

  const limitWords = (value, maxWords) => {
    const words = String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (words.length <= maxWords) {
      return words.join(' ').trim();
    }
    return `${words.slice(0, maxWords).join(' ').trim()}…`;
  };

  const buildContinuationPrompt = (messages, mode, userNote = '') => {
    const transcript = (Array.isArray(messages) ? messages : [])
      .slice(-24)
      .map((message) =>
        `${normalizeContinuationRole(message?.role)}: ${redactSensitiveText(message?.text || '')}`.trim()
      )
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
      transcript,
    ].join('\n');
  };

  const clampText = (value, limit = 5000) =>
    String(value || '')
      .trim()
      .slice(0, limit);

  const deriveFallbackTitle = (value) => {
    const compact = clampText(value || '', 240)
      .replace(/\s+/g, ' ')
      .trim();
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
    const parsed =
      direct && typeof direct === 'object'
        ? direct
        : safeJsonParse(text.match(/\{[\s\S]*\}/)?.[0] || '');

    const fallback = (() => {
      const source = clampText(sourceText, 4800);
      if (!source) {
        return { score: 0, explanation: 'No prompt content provided.' };
      }
      const hasGoal =
        /(write|create|generate|explain|summarize|analyze|compare|build|draft|optimize)/i.test(
          source
        );
      const hasConstraints =
        /(format|tone|style|length|max|min|steps|table|json|markdown|audience)/i.test(source);
      let score = 40 + (hasGoal ? 20 : 0) + (hasConstraints ? 20 : 0);
      if (source.length > 110) score += 12;
      if (/\[[^\]]+\]/.test(source)) score += 8;
      if (source.length > 520) score -= 6;
      score = Math.max(0, Math.min(100, Math.round(score)));
      const explanation =
        score >= 75
          ? 'Clear goal with useful constraints.'
          : score >= 55
            ? 'Reasonably clear, but can use more concrete constraints.'
            : 'Needs clearer goal, context, and output constraints.';
      return { score, explanation };
    })();

    const scoreRaw = Number(parsed?.score);
    const score = Number.isFinite(scoreRaw)
      ? Math.max(0, Math.min(100, Math.round(scoreRaw)))
      : fallback.score;
    const explanation = String(parsed?.explanation || '').trim() || fallback.explanation;

    return { score, explanation };
  };

  const getAiRuntimeSettings = async () => {
    const DEFAULT_RUNTIME_SETTINGS = Object.freeze({
      activeProvider: 'gemini',
      providerModels: {
        gemini: 'gemini-2.0-flash',
      },
      featureFlags: {
        improvePrompt: true,
      },
      fabPosition: 'bottom-right',
      fabStyle: 'circle',
      chatHighlightStyle: 'solid',
      fabButtons: {
        savePrompt: true,
        exportChat: true,
        continueChat: true,
        library: true,
      },
      cardDensity: 'comfortable',
      defaultExportFormat: 'markdown',
      onboardingComplete: false,
      theme: 'dark',
    });

    const asObject = (value) => (value && typeof value === 'object' ? value : {});

    const normalizeFabPosition = (value = '') => {
      const raw = String(value || '')
        .trim()
        .toLowerCase();
      return raw === 'left' || raw === 'bottom-left' ? 'bottom-left' : 'bottom-right';
    };

    try {
      const snapshot = await chrome.storage.local.get([BRAND_KEYS.settingsKey]);
      const source = asObject(snapshot?.[BRAND_KEYS.settingsKey]);
      return {
        ...DEFAULT_RUNTIME_SETTINGS,
        providerModels: {
          gemini: String(source.providerModels?.gemini || 'gemini-2.0-flash').trim(),
        },
        featureFlags: {
          improvePrompt: source.featureFlags?.improvePrompt !== false,
        },
        fabPosition: normalizeFabPosition(source.fabPosition),
        fabStyle: String(source.fabStyle || 'circle')
          .trim()
          .toLowerCase(),
        chatHighlightStyle: String(source.chatHighlightStyle || 'solid')
          .trim()
          .toLowerCase(),
        fabButtons: {
          savePrompt: source.fabButtons?.savePrompt !== false,
          exportChat: source.fabButtons?.exportChat !== false,
          continueChat: source.fabButtons?.continueChat !== false,
          library: source.fabButtons?.library !== false,
        },
        cardDensity:
          String(source.cardDensity || 'comfortable')
            .trim()
            .toLowerCase() === 'compact'
            ? 'compact'
            : 'comfortable',
        defaultExportFormat: String(source.defaultExportFormat || 'markdown')
          .trim()
          .toLowerCase(),
        onboardingComplete: source.onboardingComplete === true,
        theme:
          String(source.theme || 'dark')
            .trim()
            .toLowerCase() === 'light'
            ? 'light'
            : 'dark',
      };
    } catch (error) {
      return DEFAULT_RUNTIME_SETTINGS;
    }
  };

  const runWithConfiguredBackend = async ({
    feature = '',
    inputText = '',
    cloudTask,
    forceProvider = '',
    forceGemini = false,
    geminiApiKey = '',
    noCloudMessage = 'Gemini API key is not configured.',
    noGeminiMessage = 'Gemini API key is not configured.',
  }) => {
    const runtime = await getAiRuntimeSettings();
    const apiKey = String(geminiApiKey || (await getGeminiApiKey()) || '').trim();
    if (!apiKey) {
      throw new Error(noGeminiMessage);
    }
    const modelId = String(runtime.providerModels?.gemini || 'gemini-2.0-flash').trim();

    if (typeof cloudTask !== 'function') {
      throw new Error('Invalid task.');
    }

    const result = await cloudTask({
      providerId: 'gemini',
      apiKey,
      modelId,
      runtime,
    });

    return { ok: true, backend: 'gemini', ...(result || {}) };
  };

  const mapValidationResultToLegacy = (result = {}) => {
    if (result?.ok) return { ok: true };
    const category = String(result?.category || '')
      .trim()
      .toLowerCase();
    if (category === 'invalid_key') return { ok: false, error: 'Invalid key.' };
    if (category === 'rate_limited') return { ok: false, error: 'Rate limited.' };
    if (category === 'network_error') return { ok: false, error: 'Network error.' };
    return { ok: false, error: String(result?.message || 'Provider error.') };
  };

  const validateGeminiApiKey = async (rawKey) => {
    const key = String(rawKey || '').trim();
    if (!key) return { ok: false, error: 'Missing API key.' };
    const result = await validateGeminiApiKeyClient(key);
    return mapValidationResultToLegacy(result);
  };

  function broadcast(message) {
    chrome.runtime.sendMessage(message).catch(() => {
      // Side panel may be closed — ignore silently
    });
  }

  const callProviderTextTask = async ({
    providerId = PROVIDER_IDS.GEMINI,
    apiKey = '',
    modelId = '',
    systemPrompt = '',
    userPrompt = '',
  } = {}) => {
    const resolvedModelId = modelId || 'gemini-2.0-flash';
    const text = await callGemini(
      String(systemPrompt || '').trim(),
      String(userPrompt || '').trim(),
      resolvedModelId,
      apiKey
    );
    return String(text || '').trim();
  };

  const suggestTagsViaCloudStrict = async ({ providerId, apiKey, modelId, promptText }) => {
    const source = clampText(promptText, 2200);
    if (!source) {
      throw new Error('Empty prompt text provided.');
    }

    const systemPrompt = [
      'Suggest 2-3 short lowercase tags for this prompt.',
      'Return strict JSON array only, e.g. ["coding","debugging"].',
      'No prose.',
    ].join('\n');
    const rawText = await callProviderTextTask({
      providerId,
      modelId,
      apiKey,
      systemPrompt,
      userPrompt: `Prompt:\n${source}`,
    });
    const tags = parseTagsFromModelText(rawText);
    return { tags };
  };

  const TAG_DEFINITIONS = {
    coding: 'write code, programming, debug, fix bug, function, algorithm',
    writing: 'write essay, improve text, edit, proofread, grammar, draft',
    explain: 'explain concept, simplify, teach, what is, how does, ELI5',
    research: 'research, summarize, analyze, find information, compare',
    creative: 'creative writing, story, poem, brainstorm, ideas, imagine',
    planning: 'plan, organize, schedule, steps, outline, strategy, tasks',
    data: 'data analysis, table, spreadsheet, numbers, statistics, SQL',
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
        const score = keywords.reduce(
          (sum, keyword) => (normalized.includes(keyword) ? sum + 1 : sum),
          0
        );
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
        .map((item) =>
          String(item || '')
            .toLowerCase()
            .trim()
        )
        .filter(Boolean)
        .slice(0, 3);
    }

    return raw
      .split(/[,|\n]/)
      .map((item) =>
        String(item || '')
          .toLowerCase()
          .replace(/[^a-z0-9-_]/g, '')
          .trim()
      )
      .filter(Boolean)
      .slice(0, 3);
  };

  async function suggestTags(promptText) {
    const source = clampText(promptText, 2600);
    if (!source) return { ok: false, tags: [], error: 'Prompt text is required.' };

    try {
      const result = await runWithConfiguredBackend({
        feature: 'autoTags',
        inputText: source,
        cloudTask: ({ providerId, apiKey, modelId }) =>
          suggestTagsViaCloudStrict({
            providerId,
            apiKey,
            modelId,
            promptText: source,
          }),
        noCloudMessage: 'No cloud API key found in Settings.',
      });

      const tags = Array.isArray(result?.tags)
        ? result.tags
            .map((tag) =>
              String(tag || '')
                .trim()
                .toLowerCase()
            )
            .filter(Boolean)
            .slice(0, 3)
        : [];
      const fallbackTags = suggestTagsHeuristic(source, 3);
      return {
        ok: true,
        tags: tags.length ? tags : fallbackTags,
        backend: 'gemini',
      };
    } catch (_error) {
      return {
        ok: true,
        tags: suggestTagsHeuristic(source, 3),
        backend: 'fallback',
      };
    }
  }

  // ─── AI Feature: Duplicate Detection ─────────────────────────────────────────

  const normalizeDuplicateValue = (value) =>
    String(value || '')
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
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }

    return dp[rows - 1][cols - 1];
  };

  const duplicateSimilarity = (left, right) => {
    const a = String(left || '');
    const b = String(right || '');
    const maxLen = Math.max(a.length, b.length);
    if (!maxLen) return 1;
    return 1 - levenshteinDistance(a, b) / maxLen;
  };

  async function checkDuplicate(promptText, excludeId = null) {
    const { prompts = [] } = await chrome.storage.local.get('prompts');
    const payload =
      promptText && typeof promptText === 'object'
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

  // ─── AI Feature: Smart Suggestions ───────────────────────────────────────────

  async function getSmartSuggestions(conversationText) {
    if (!conversationText || conversationText.length < 30) return null;

    try {
      const { prompts = [] } = await chrome.storage.local.get('prompts');
      if (!prompts.length) return null;

      const promptList = prompts
        .slice(0, 30)
        .map(
          (p, i) =>
            `${i + 1}. [${p.id}] "${p.title}"${p.tags?.length ? ` (tags: ${p.tags.join(', ')})` : ''}`
        )
        .join('\n');

      const systemPrompt =
        'You are a prompt suggestion engine. Given a conversation snippet and a numbered list of saved prompts, return the IDs of the top 3 most relevant prompts. Reply ONLY with a JSON array of ID strings, e.g. ["id1","id2","id3"]. If none are relevant, reply [].';

      const safeConversation = redactSensitiveText(conversationText).slice(0, 600);
      const userMessage = `Conversation:\n${safeConversation}\n\nSaved prompts:\n${promptList}`;

      const routed = await runWithConfiguredBackend({
        feature: 'suggestions',
        inputText: userMessage,
        cloudTask: ({ providerId, apiKey, modelId }) =>
          callProviderTextTask({
            providerId,
            modelId,
            apiKey,
            systemPrompt,
            userPrompt: userMessage,
          }).then((text) => ({ text })),
        noCloudMessage: 'No cloud API key found in Settings.',
      });

      const textResult = String(routed?.text || '').trim();
      if (!textResult) return null;

      const match = textResult.match(/\[[\s\S]*?\]/);
      if (!match) return null;

      const ids = JSON.parse(match[0]);
      if (!Array.isArray(ids)) return null;

      const promptIdSet = new Set(prompts.map((p) => p.id));
      const validIds = ids.filter((id) => promptIdSet.has(id)).slice(0, 3);

      return validIds.length > 0 ? validIds : null;
    } catch (_) {
      return null;
    }
  }

  // ─── AI Feature: AI Prompt Improvement, Paraphrase, Title, Clarity ──────────

  async function improvePromptViaCloudStrict({
    providerId,
    apiKey,
    modelId,
    text,
    tags = [],
    style = 'general',
  }) {
    if (!text || text.trim().length === 0) {
      throw new Error('Empty prompt text provided.');
    }

    let styleInstruction = 'Make it clear, concise, and highly effective for an AI.';
    if (style === 'coding') {
      styleInstruction =
        'Optimize for software engineering. Ask for code snippets, architecture details, and edge case handling.';
    } else if (style === 'study') {
      styleInstruction =
        'Optimize for learning and summarization. Ask for clear explanations, analogies, and step-by-step breakdowns.';
    } else if (style === 'creative') {
      styleInstruction =
        'Optimize for creative writing. Ask for vivid imagery, character depth, and engaging tone.';
    }

    const safeTags = Array.isArray(tags)
      ? tags.map((tag) => String(tag || '').trim()).filter(Boolean)
      : [];
    const tagContext =
      safeTags.length > 0 ? `Incorporate these concepts/topics: ${safeTags.join(', ')}.` : '';

    const systemPrompt = `You are an expert prompt engineer. Your goal is to improve the user's prompt so it yields the best possible response from an LLM.
${styleInstruction}
${tagContext}
ONLY return the improved prompt text. Do not add quotes, do not explain your changes, and do not add headings.`;

    const improvedText = await callProviderTextTask({
      providerId,
      modelId,
      apiKey,
      systemPrompt,
      userPrompt: `User's Original Prompt:\n${clampText(text, 5000)}`,
    });
    if (!improvedText) {
      throw new Error(`${getProviderLabel(providerId)} returned empty improved text.`);
    }
    return { text: improvedText };
  }

  async function paraphrasePromptViaCloudStrict({ providerId, apiKey, modelId, text }) {
    const source = clampText(text, 5000);
    if (!source) {
      throw new Error('Empty prompt text provided.');
    }

    const systemPrompt = [
      'Rewrite the prompt for clarity while preserving intent and all placeholders exactly.',
      'Keep bracket placeholders unchanged (e.g., [topic], [tone?]).',
      'Return only the rewritten prompt text.',
    ].join('\n');

    const rewritten = await callProviderTextTask({
      providerId,
      modelId,
      apiKey,
      systemPrompt,
      userPrompt: `Prompt:\n${source}`,
    });
    if (!rewritten) {
      throw new Error(`${getProviderLabel(providerId)} returned empty paraphrase output.`);
    }
    return { text: rewritten };
  }

  async function buildContinuationHandoffViaCloud(
    messages,
    mode = 'FULL_SUMMARY',
    userNote = '',
    cloud = {}
  ) {
    const safeMessages = Array.isArray(messages) ? messages : [];
    if (!safeMessages.length) {
      return { ok: false, error: 'No messages to summarize.' };
    }

    const providerId = PROVIDER_IDS.GEMINI;
    const apiKey = String(cloud.apiKey || '').trim();
    const modelId = String(cloud.modelId || '').trim();
    if (!apiKey) {
      return { ok: false, error: 'Missing provider key.' };
    }

    const prompt = buildContinuationPrompt(safeMessages, mode, userNote);

    try {
      const raw = await callProviderTextTask({
        providerId,
        modelId,
        apiKey,
        systemPrompt: 'Summarize for a continuation handoff.',
        userPrompt: prompt,
      });
      if (!raw) {
        return {
          ok: false,
          error: `${getProviderLabel(providerId)} returned empty continuation context.`,
        };
      }

      return { ok: true, text: limitWords(raw, CONTINUATION_WORD_LIMIT) };
    } catch (error) {
      const fallback =
        error?.name === 'AbortError'
          ? `${getProviderLabel(providerId)} request timed out.`
          : 'Failed to generate continuation handoff.';
      return { ok: false, error: fallback };
    }
  }

  async function buildContinuationHandoff(
    messages,
    mode = 'FULL_SUMMARY',
    userNote = '',
    explicitKey = '',
    _forceLocal = false
  ) {
    const safeMessages = Array.isArray(messages) ? messages : [];
    if (!safeMessages.length) {
      return { ok: false, error: 'No messages to summarize.' };
    }

    const key = String(explicitKey || '').trim();
    const activeProvider = PROVIDER_IDS.GEMINI;
    const activeProviderKey = key || (await getGeminiApiKey());
    const hasActiveKey = Boolean(activeProviderKey);
    const longConversation = safeMessages.length > CONTINUATION_LONG_THRESHOLD;
    const forceProvider = longConversation && hasActiveKey ? activeProvider : '';
    const activeLabel = getProviderLabel(activeProvider);
    const longAdvisory = longConversation
      ? hasActiveKey
        ? `For best results, ${activeLabel} will be used for this long conversation.`
        : 'Long conversations work best with a configured provider key in Settings.'
      : '';

    try {
      const result = await runWithConfiguredBackend({
        feature: 'continueSummary',
        inputText: safeMessages.map((m) => String(m?.content || m?.text || '')).join(' '),
        forceProvider,
        geminiApiKey: key,
        cloudTask: ({ providerId, apiKey, modelId }) =>
          buildContinuationHandoffViaCloud(safeMessages, mode, userNote, {
            providerId,
            apiKey,
            modelId,
          }),
        noCloudMessage: 'No cloud API key found in Settings.',
      });

      return {
        ok: true,
        text: limitWords(String(result?.text || '').trim(), CONTINUATION_WORD_LIMIT),
        backend: 'gemini',
        advisory: String(result?.advisory || longAdvisory || '').trim() || undefined,
      };
    } catch (error) {
      return {
        ok: false,
        error: String(error?.message || 'Failed to generate continuation handoff.'),
        advisory: longAdvisory || undefined,
      };
    }
  }

  async function generatePromptTitleViaCloudStrict({ providerId, apiKey, modelId, text }) {
    const source = clampText(text, 3200);
    if (!source) {
      throw new Error('Empty text provided.');
    }

    const instruction = `Create one concise title (max 8 words) for this prompt.
Return ONLY the title text.
No quotes, no numbering, no extra text.`;

    const title = (
      await callProviderTextTask({
        providerId,
        modelId,
        apiKey,
        systemPrompt: instruction,
        userPrompt: `Prompt:\n${source}`,
      })
    )
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

  async function scorePromptClarityViaCloudStrict({ providerId, apiKey, modelId, text }) {
    const source = clampText(text, 4200);
    if (!source) {
      throw new Error('Empty text provided.');
    }

    const instruction = [
      'Evaluate this prompt on clarity, specificity, and completeness.',
      'Return strict JSON only in this shape:',
      '{"score": 0, "explanation": "one short sentence"}',
    ].join('\n');

    const raw = await callProviderTextTask({
      providerId,
      modelId,
      apiKey,
      systemPrompt: instruction,
      userPrompt: `Prompt:\n${source}`,
    });
    return parseClarityFromText(raw, source);
  }

  const improvePrompt = async (text, tags = [], style = 'general') => {
    try {
      const result = await runWithConfiguredBackend({
        feature: 'improvePrompt',
        inputText: text,
        cloudTask: ({ providerId, apiKey, modelId }) =>
          improvePromptViaCloudStrict({
            providerId,
            apiKey,
            modelId,
            text,
            tags,
            style,
          }),
        noCloudMessage: 'No cloud API key found in Settings.',
      });
      return {
        ok: true,
        text: String(result?.text || '').trim(),
        backend: 'gemini',
        advisory: result?.advisory || undefined,
      };
    } catch (error) {
      return {
        ok: false,
        error: String(error?.message || 'Failed to improve prompt.'),
      };
    }
  };

  const generatePromptTitle = async (text) => {
    const source = clampText(text, 4200);
    if (!source) {
      return { error: 'Empty text provided.', title: '' };
    }

    try {
      const result = await runWithConfiguredBackend({
        feature: 'title',
        inputText: source,
        cloudTask: ({ providerId, apiKey, modelId }) =>
          generatePromptTitleViaCloudStrict({
            providerId,
            apiKey,
            modelId,
            text: source,
          }),
        noCloudMessage: 'No cloud API key found in Settings.',
      });

      const title = String(result?.title || '')
        .trim()
        .slice(0, 80);
      return {
        ok: true,
        title: title || deriveFallbackTitle(source),
        backend: 'gemini',
        advisory: result?.advisory || undefined,
      };
    } catch (_error) {
      return {
        ok: false,
        title: deriveFallbackTitle(source),
        backend: 'fallback',
      };
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
        inputText: source,
        cloudTask: ({ providerId, apiKey, modelId }) =>
          paraphrasePromptViaCloudStrict({
            providerId,
            apiKey,
            modelId,
            text: source,
          }),
        noCloudMessage: 'No cloud API key found in Settings.',
      });
      const rewritten = String(result?.text || '').trim();
      return {
        ok: true,
        text: rewritten || source,
        backend: 'gemini',
        advisory: result?.advisory || undefined,
      };
    } catch (error) {
      return {
        ok: false,
        text: source,
        backend: 'fallback',
        error: String(error?.message || 'Paraphrase failed.'),
      };
    }
  };

  const scorePromptClarity = async (text) => {
    const source = clampText(text, 4200);
    if (!source) {
      return {
        ok: false,
        error: 'Empty prompt text provided.',
        score: 0,
        explanation: 'No prompt content provided.',
      };
    }

    try {
      const result = await runWithConfiguredBackend({
        feature: 'polish',
        inputText: source,
        cloudTask: ({ providerId, apiKey, modelId }) =>
          scorePromptClarityViaCloudStrict({
            providerId,
            apiKey,
            modelId,
            text: source,
          }),
        noCloudMessage: 'No cloud API key found in Settings.',
      });
      return {
        ok: true,
        score: Number(result?.score) || 0,
        explanation: String(result?.explanation || '').trim() || 'No explanation available.',
        backend: 'gemini',
        advisory: result?.advisory || undefined,
      };
    } catch (_error) {
      const fallback = parseClarityFromText('', source);
      return { ok: false, ...fallback, backend: 'fallback' };
    }
  };

  const preparePromptForSave = async ({
    title = '',
    text = '',
    tags = [],
    category = null,
  } = {}) => {
    const originalText = clampText(text, 5200);
    if (!originalText) {
      return { ok: false, error: 'Prompt text is required.' };
    }

    const runtime = await getAiRuntimeSettings();
    const normalizedTags = Array.isArray(tags)
      ? tags.map((tag) => String(tag || '').trim()).filter(Boolean)
      : [];
    const shouldPolish = runtime?.featureFlags?.polish !== false;
    const paraphrased = shouldPolish
      ? await paraphrasePrompt(originalText)
      : { ok: false, text: originalText, backend: null };
    const finalText =
      clampText(paraphrased?.ok ? paraphrased?.text : originalText, 5200) || originalText;

    const initialTitle = String(title || '').trim();
    const [titleResult, clarity] = await Promise.all([
      initialTitle
        ? Promise.resolve({ title: initialTitle, backend: 'provided' })
        : generatePromptTitle(finalText),
      scorePromptClarity(finalText),
    ]);
    const finalTitle = String(titleResult?.title || '').trim() || deriveFallbackTitle(finalText);

    return {
      ok: true,
      prompt: {
        title: finalTitle,
        text: finalText,
        tags: normalizedTags,
        category: category ? String(category).trim() : null,
        clarityScore:
          clarity?.ok && Number.isFinite(Number(clarity?.score))
            ? Math.max(0, Math.min(100, Math.round(Number(clarity.score))))
            : null,
        clarityExplanation: String(clarity?.explanation || '').trim() || '',
      },
      backend: {
        paraphrase: paraphrased?.ok ? paraphrased?.backend || null : null,
        title: titleResult?.backend || null,
        clarity: clarity?.ok ? clarity?.backend || null : null,
      },
    };
  };

  // ─── AI Message Handler ──────────────────────────────────────────────────────
  const handleRoutedTask = async (message = {}) => {
    const task = String(message?.task || '')
      .trim()
      .toLowerCase();
    switch (task) {
      case 'paraphrase':
        return paraphrasePrompt(message?.text || '');
      case 'improve':
        return improvePrompt(message?.text || '', message?.tags || [], message?.style || 'general');
      case 'title':
        return generatePromptTitle(message?.text || '');
      case 'clarity':
        return scorePromptClarity(message?.text || '');
      case 'tags':
        return suggestTags(message?.text || '');
      case 'continue_summary':
        return buildContinuationHandoff(
          message?.messages || [],
          message?.mode,
          message?.userNote || '',
          message?.key || ''
        );
      default:
        return {
          ok: false,
          error: `Unsupported routed task: ${task || 'unknown'}`,
        };
    }
  };

  const handleAIMessage = async (message, sendResponse) => {
    try {
      switch (message.type) {
        case 'AI_INIT':
          if (AI.status === 'idle') {
            AI.status = 'ready';
            broadcast({ type: 'AI_STATUS', status: 'ready' });
          }
          sendResponse({
            status: AI.status,
            embedding: {
              searchMode: 'keyword',
              status: 'ready',
              downloadedModelIds: [],
              progress: 100,
            },
          });
          return true;

        case 'AI_PROVIDER_VALIDATE_KEY': {
          const key = String(message?.key || '').trim();
          sendResponse(await validateGeminiApiKey(key));
          return true;
        }

        case 'AI_STATUS_CHECK':
          sendResponse({
            status: AI.status,
            embedding: {
              searchMode: 'keyword',
              status: 'ready',
              downloadedModelIds: [],
              progress: 100,
            },
          });
          return true;

        case 'AI_SUGGEST_TAGS':
          sendResponse(await suggestTags(message.text));
          return true;

        case 'AI_CHECK_DUPLICATE':
          sendResponse({
            match: await checkDuplicate(message.text, message.excludeId),
          });
          return true;

        case 'AI_SMART_SUGGESTIONS':
          sendResponse({
            ids: await getSmartSuggestions(message.conversationText),
          });
          return true;

        case 'AI_IMPROVE_PROMPT':
          sendResponse(await improvePrompt(message.text, message.tags, message.style));
          return true;

        case 'AI_GENERATE_PROMPT_TITLE':
          sendResponse(await generatePromptTitle(message.text));
          return true;

        case 'AI_PARAPHRASE_PROMPT':
          sendResponse(await paraphrasePrompt(message.text));
          return true;

        case 'AI_SCORE_CLARITY':
          sendResponse(await scorePromptClarity(message.text));
          return true;

        case 'AI_PREPARE_PROMPT_SAVE':
          sendResponse(await preparePromptForSave(message.payload || {}));
          return true;

        case 'AI_CONTINUE_SUMMARY':
          sendResponse(
            await buildContinuationHandoff(
              message.messages,
              message.mode,
              message.userNote,
              message.key,
              message.forceLocal === true
            )
          );
          return true;

        case 'AI_ROUTE_TASK':
          sendResponse(await handleRoutedTask(message));
          return true;

        // Stub embedding status and reindex queries to avoid UI exceptions
        case 'AI_EMBEDDING_STATUS_CHECK':
          sendResponse({
            searchMode: 'keyword',
            status: 'ready',
            downloadedModelIds: [],
            progress: 100,
          });
          return true;

        case 'AI_EMBEDDING_DOWNLOAD':
        case 'AI_EMBEDDING_SWITCH':
          sendResponse({
            ok: true,
            searchMode: 'keyword',
            status: 'ready',
            downloadedModelIds: [],
            progress: 100,
          });
          return true;

        case 'AI_EMBEDDING_REINDEX_STATUS':
          sendResponse({ running: false, done: 0, total: 0, progress: 100 });
          return true;

        case 'AI_EMBEDDING_REINDEX_START':
          sendResponse({ ok: true, running: false, done: 0, total: 0, progress: 100 });
          return true;

        case 'AI_CACHE_ADD':
        case 'AI_CACHE_REMOVE':
          sendResponse({ ok: true });
          return true;

        default:
          return false;
      }
    } catch (error) {
      sendResponse({
        ok: false,
        error: String(error?.message || 'AI request failed.'),
      });
      return true;
    }
  };

  const APP_WINDOW_PATH = 'app.html';
  const SIDE_PANEL_PATH = APP_WINDOW_PATH;
  const SIDEPANEL_SESSION_KEY = BRAND_KEYS.sidePanelPayload;
  const PENDING_PANEL_ACTION_KEY = 'promptiumPendingPanelAction';
  const PANEL_MODE_SESSION_KEY = 'promptiumPanelMode';
  const FALLBACK_PANEL_WIDTH = 500;
  const FALLBACK_PANEL_HEIGHT = 850;
  const FALLBACK_PANEL_RIGHT_OFFSET = 24;
  const FALLBACK_PANEL_TOP_OFFSET = 56;

  const SUPPORTED_DOC_PATTERNS = [
    '*://*.chatgpt.com/*',
    '*://*.claude.ai/*',
    '*://gemini.google.com/*',
    '*://*.perplexity.ai/*',
    '*://copilot.microsoft.com/*',
  ];
  const ALLOWED_LLM_HOSTS = new Set([
    'chatgpt.com',
    'claude.ai',
    'gemini.google.com',
    'www.perplexity.ai',
    'copilot.microsoft.com',
  ]);

  let usePopupMode = true;
  let fallbackPopupWindowId = null;

  const setPanelMode = async (mode) => {
    await chrome.storage.session
      .set({ [PANEL_MODE_SESSION_KEY]: String(mode || 'sidepanel') })
      .catch(() => {});
  };

  const shouldUsePopupMode = () => true;

  const getSidePanelUrl = (route = '') => {
    const base = chrome.runtime.getURL(SIDE_PANEL_PATH);
    const clean = String(route || '')
      .replace(/^#/, '')
      .trim();
    return clean ? `${base}#${clean}` : base;
  };

  const resolvePopupPlacement = async (windowId) => {
    const screenWidth = Number(globalThis?.screen?.width || 0);
    const screenHeight = Number(globalThis?.screen?.height || 0);
    let left = screenWidth ? screenWidth - FALLBACK_PANEL_WIDTH - FALLBACK_PANEL_RIGHT_OFFSET : 0;
    let top = FALLBACK_PANEL_TOP_OFFSET;

    if (!screenWidth || !screenHeight) {
      const anchorWindow =
        (windowId ? await chrome.windows.get(windowId).catch(() => null) : null) ||
        (await chrome.windows.getLastFocused().catch(() => null));
      if (anchorWindow) {
        const anchorLeft = Number(anchorWindow.left || 0);
        const anchorTop = Number(anchorWindow.top || 0);
        const anchorWidth = Number(anchorWindow.width || FALLBACK_PANEL_WIDTH);
        left = anchorLeft + anchorWidth - FALLBACK_PANEL_WIDTH - FALLBACK_PANEL_RIGHT_OFFSET;
        top = anchorTop + FALLBACK_PANEL_TOP_OFFSET;
      }
    }

    const maxLeft = Math.max(0, screenWidth - FALLBACK_PANEL_WIDTH);
    const maxTop = Math.max(0, screenHeight - FALLBACK_PANEL_HEIGHT);
    return {
      left: Math.max(0, Math.min(Math.round(left), maxLeft || Math.round(left))),
      top: Math.max(0, Math.min(Math.round(top), maxTop || Math.round(top))),
    };
  };

  const stashPendingPanelAction = async (action = null) => {
    if (!action) return;
    await chrome.storage.session.set({ [PENDING_PANEL_ACTION_KEY]: action }).catch(() => {});
  };

  const focusExistingPanel = async (route = '') => {
    const base = chrome.runtime.getURL(SIDE_PANEL_PATH);
    if (Number.isInteger(fallbackPopupWindowId)) {
      const knownWindow = await chrome.windows
        .get(fallbackPopupWindowId, { populate: true })
        .catch(() => null);
      if (knownWindow?.id) {
        const panelTab =
          knownWindow.tabs?.find((tab) => String(tab?.url || '').startsWith(base)) ||
          knownWindow.tabs?.[0];
        await chrome.windows.update(knownWindow.id, { focused: true }).catch(() => {});
        if (panelTab?.id) {
          await chrome.tabs
            .update(panelTab.id, { active: true, url: getSidePanelUrl(route) })
            .catch(() => {});
        }
        return { ok: true, tab: panelTab, reused: true };
      }
      fallbackPopupWindowId = null;
    }

    const tabs = await chrome.tabs.query({ url: `${base}*` }).catch(() => []);
    if (!tabs.length) return null;
    const tab = tabs[0];
    if (tab.windowId) {
      fallbackPopupWindowId = tab.windowId;
    }
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    }
    if (tab.id) {
      await chrome.tabs
        .update(tab.id, { active: true, url: getSidePanelUrl(route) })
        .catch(() => {});
    }
    return { ok: true, tab, reused: true };
  };

  const createPopupPanel = async ({ route = '', focus = true, windowId } = {}) => {
    await setPanelMode('popup');
    const { left, top } = await resolvePopupPlacement(windowId);
    const win = await chrome.windows.create({
      url: getSidePanelUrl(route),
      type: 'popup',
      width: FALLBACK_PANEL_WIDTH,
      height: FALLBACK_PANEL_HEIGHT,
      left,
      top,
      focused: focus,
    });
    fallbackPopupWindowId = typeof win?.id === 'number' ? win.id : null;
    return { ok: true, mode: 'popup', tab: win?.tabs?.[0], reused: false };
  };

  const openPopupPanel = async ({ route = '', focus = true, windowId } = {}) => {
    await setPanelMode('popup');
    const existing = await focusExistingPanel(route);
    if (existing) {
      return {
        ok: true,
        mode: 'popup',
        tab: existing.tab,
        reused: true,
      };
    }
    return await createPopupPanel({ route, focus, windowId });
  };

  const openPromptiumPanel = async ({ tabId, windowId, route = '', pendingAction = null } = {}) => {
    usePopupMode = true;

    if (pendingAction) {
      const existing = await focusExistingPanel(route);
      if (existing?.reused) {
        const actionName =
          pendingAction?.type === 'showContinuation' ? 'showContinuation' : 'showExport';
        await chrome.runtime.sendMessage({ action: actionName }).catch(() => {});
        await chrome.storage.session.remove([PENDING_PANEL_ACTION_KEY]).catch(() => {});
        return { ok: true, mode: 'popup', tab: existing.tab, reused: true };
      }

      await stashPendingPanelAction(pendingAction);
      return await createPopupPanel({ route, windowId });
    }

    return await openPopupPanel({ route, windowId });
  };

  const initializeStorageKeys = async () => {
    const state = await chrome.storage.local.get(['prompts']);
    const updates = {};

    if (!Array.isArray(state.prompts)) {
      updates.prompts = [];
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
        documentUrlPatterns: SUPPORTED_DOC_PATTERNS,
      });
    } catch (error) {
      console.warn('[Promptium][ServiceWorker] Failed to register context menu.', error);
    }
  };

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
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id || !tab.windowId) {
        return { ok: false, error: 'No active tab available.' };
      }
      const opened = await openPromptiumPanel({
        tabId: tab.id,
        windowId: tab.windowId,
      });
      if (!opened?.ok) {
        return { ok: false, error: 'Failed to open Promptium window.' };
      }
      return { ok: true, tab, mode: opened.mode };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || 'Failed to open Promptium window.',
      };
    }
  };

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

  const handleSetSidePanelPayload = async (payload) => {
    const value = payload && typeof payload === 'object' ? payload : null;

    if (!value || !Array.isArray(value.messages)) {
      return { ok: false, error: 'Invalid side panel payload.' };
    }

    try {
      await chrome.storage.session.set({ [SIDEPANEL_SESSION_KEY]: value });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || 'Failed to persist side panel payload.',
      };
    }
  };

  const handleOpenSidePanel = async (_sender, payload = null) => {
    try {
      if (payload && typeof payload === 'object') {
        const persisted = await handleSetSidePanelPayload(payload);

        if (!persisted.ok) {
          return {
            ok: false,
            error: persisted.error || 'Payload failed to persist.',
          };
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
    try {
      const opened = await openPromptiumPanel({
        tabId,
        windowId,
        route: 'continue',
        pendingAction: { type: 'showContinuation' },
      });
      if (!opened?.ok) {
        return { ok: false, error: 'Failed to open Promptium panel.' };
      }
      if (opened.mode === 'sidepanel') {
        await chrome.runtime.sendMessage({ action: 'showContinuation' }).catch((error) => {
          console.warn('[Promptium][ServiceWorker] Failed to notify continuation view.', error);
        });
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || 'Failed to open Promptium panel.',
      };
    }
  };

  const onRuntimeMessage = (message, sender, sendResponse) => {
    if (message?.type === 'OFFSCREEN_EMBEDDING') {
      return false;
    }

    let panelOpenPromise = null;

    if (message?.action === 'OPEN_SIDEPANEL') {
      const tabId = sender?.tab?.id;
      const windowId = sender?.tab?.windowId;
      panelOpenPromise = openPromptiumPanel({
        tabId,
        windowId,
        route: 'export',
        pendingAction: { type: 'showExport' },
      }).catch((err) => err);
    }

    void (async () => {
      let responded = false;
      const mappedType = String(message?.type || message?.action || '').trim();
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
          const opened = await openPromptiumPanel({
            tabId,
            windowId,
            route: 'export',
            pendingAction: { type: 'showExport' },
          });
          if (!opened?.ok) {
            respond({
              ok: false,
              error: 'Failed to open Promptium panel.',
            });
            return;
          }
          if (opened.mode === 'sidepanel') {
            await chrome.runtime.sendMessage({ action: 'showExport' }).catch((error) => {
              console.warn('[Promptium][ServiceWorker] Failed to notify export view.', error);
            });
          }

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
          const opened = await openPromptiumPanel({ tabId, windowId });
          if (!opened?.ok) {
            respond({
              ok: false,
              error: 'Failed to open Promptium panel.',
            });
            return;
          }
          respond({ ok: true });
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

          let openError = null;
          if (panelOpenPromise) {
            const result = await panelOpenPromise;
            if (result instanceof Error) {
              openError = result.message;
            } else if (result?.ok === false) {
              openError = result?.error || 'Panel open failed.';
            }
          }

          if (openError) {
            respond({ ok: false, error: `Panel Error: ${openError}` });
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

        respond({
          ok: false,
          error: `Unknown action: ${String(message?.action || 'undefined')}`,
        });
      } catch (error) {
        respond({
          ok: false,
          error: error?.message || 'Unexpected service worker failure.',
        });
      }
    })();

    return true;
  };

  chrome.runtime.onInstalled.addListener(() => {
    void onInstalled();
    void windowManager.initialize();
  });

  chrome.runtime.onStartup.addListener(() => {
    void (async () => {
      await registerContextMenus();
      await windowManager.initialize();
    })();
  });

  chrome.action.onClicked.addListener(() => {
    void (async () => {
      const result = await windowManager.openWindow();
      if (!result.success) {
        console.warn('[Promptium] Failed to open window:', result);
      }
    })();
  });

  chrome.commands.onCommand.addListener((command) => {
    if (command !== 'open-side-panel') {
      return;
    }
    void (async () => {
      const result = await windowManager.openWindow();
      if (!result.success) {
        console.warn('[Promptium] Failed to open window:', result);
      }
    })();
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
          savedAt: Date.now(),
        },
      });

      await openPromptiumPanel({ tabId: tab.id, windowId: tab.windowId }).catch(() => {});
      await chrome.tabs
        .sendMessage(tab.id, {
          action: 'notifyPromptium',
          text: 'Saved to Promptium',
        })
        .catch(() => {});
    })();
  });

  chrome.runtime.onSuspend.addListener(() => {
    // No-op
  });

  chrome.runtime.onMessage.addListener(onRuntimeMessage);
});
