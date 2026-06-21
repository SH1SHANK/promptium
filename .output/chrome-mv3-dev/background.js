var background = (function () {
  //#region node_modules/.pnpm/wxt@0.20.26/node_modules/wxt/dist/utils/define-background.mjs
  function defineBackground(arg) {
    if (arg == null || typeof arg === 'function') return { main: arg };
    return arg;
  }
  //#endregion
  //#region src/utils/model-registry.ts
  /**
   * File: utils/model-registry.js
   * Purpose: Gemini models registry.
   */
  var PROVIDER_IDS = Object.freeze({ GEMINI: 'gemini' });
  Object.freeze({
    models: [
      {
        id: 'gemini-2.0-flash',
        label: 'gemini-2.0-flash',
        default: true,
        note: 'Default balanced model',
      },
      {
        id: 'gemini-2.0-flash-lite',
        label: 'gemini-2.0-flash-lite',
        default: false,
        note: 'Lower-cost fast option',
      },
      {
        id: 'gemini-1.5-pro',
        label: 'gemini-1.5-pro',
        default: false,
        note: 'Higher quality reasoning',
      },
      {
        id: 'gemini-1.5-flash',
        label: 'gemini-1.5-flash',
        default: false,
        note: 'Stable fast fallback',
      },
    ],
  });
  //#endregion
  //#region src/utils/gemini-client.ts
  var DEFAULT_TIMEOUT_MS = 18e3;
  var GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';
  var createClientError = (type, message) => {
    const error = new Error(String(message || 'Gemini request failed.'));
    error.type = type;
    return error;
  };
  var withTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
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
    } catch (error) {
      if (error?.name === 'AbortError') throw createClientError('network', 'Request timed out.');
      throw createClientError('network', 'Network request failed.');
    } finally {
      clearTimeout(timeoutId);
    }
  };
  var classifyHttpError = (status = 0, fallback = 'Gemini request failed.') => {
    if (status === 401 || status === 403)
      return createClientError('invalid_key', 'Invalid API key.');
    if (status === 429) return createClientError('quota', 'Quota exceeded or rate limited.');
    if (!status || status >= 500)
      return createClientError('network', 'Gemini server network error.');
    return createClientError('unknown', fallback);
  };
  var getGeminiApiKey = async () => {
    const snapshot = await chrome.storage.session.get(['promptiumGeminiKey']).catch(() => ({}));
    return String(snapshot?.promptiumGeminiKey || '').trim();
  };
  var callGemini = async (systemPrompt, userPrompt, modelId, key) => {
    const resolvedKey = key || (await getGeminiApiKey());
    if (!resolvedKey) throw createClientError('invalid_key', 'Gemini API key is missing.');
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
            parts: [{ text: [systemPrompt, userPrompt].filter(Boolean).join('\n\n') }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 900,
        },
      }),
    });
    if (!response.ok) throw classifyHttpError(response.status, 'Gemini request failed.');
    const data = await response.json().catch(() => null);
    const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    if (!text) throw createClientError('unknown', 'Gemini returned empty output.');
    return text;
  };
  var validateGeminiApiKey = async (apiKey) => {
    const key = String(apiKey || '').trim();
    if (!key)
      return {
        ok: false,
        category: 'invalid_key',
        message: 'Missing API key.',
      };
    try {
      const response = await withTimeout(`${GEMINI_API_ROOT}/models`, {
        method: 'GET',
        headers: { 'x-goog-api-key': key },
      });
      if (response.ok)
        return {
          ok: true,
          category: 'ok',
          message: 'Connected',
        };
      const error = classifyHttpError(response.status, 'Gemini validation failed.');
      return {
        ok: false,
        category: error.type,
        message: error.message,
        status: response.status,
      };
    } catch (error) {
      return {
        ok: false,
        category: String(error?.type || 'network'),
        message: String(error?.message || 'Validation failed.'),
      };
    }
  };
  //#endregion
  //#region src/entrypoints/background.ts
  /**
   * File: background/service_worker.js
   * Purpose: Initializes storage, configures side panel behavior, and routes AI features
   *          exclusively through the Gemini API client.
   */
  var background_default = defineBackground(() => {
    if (chrome?.storage && !chrome.storage.session) chrome.storage.session = chrome.storage.local;
    const AI = {
      status: 'idle',
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
    const PROVIDER_LABELS = Object.freeze({ gemini: 'Gemini' });
    Object.freeze([PROVIDER_IDS.GEMINI]);
    const normalizeProviderId = (providerId = '') => {
      return String(providerId || '')
        .trim()
        .toLowerCase() === PROVIDER_IDS.GEMINI
        ? PROVIDER_IDS.GEMINI
        : PROVIDER_IDS.GEMINI;
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
      if (words.length <= maxWords) return words.join(' ').trim();
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
    const clampText = (value, limit = 5e3) =>
      String(value || '')
        .trim()
        .slice(0, limit);
    const deriveFallbackTitle = (value) => {
      const compact = clampText(value || '', 240)
        .replace(/\s+/g, ' ')
        .trim();
      if (!compact) return 'Untitled Prompt';
      return (compact.split(/[.!?]/)[0]?.trim() || compact).slice(0, 80) || 'Untitled Prompt';
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
        if (!source)
          return {
            score: 0,
            explanation: 'No prompt content provided.',
          };
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
        return {
          score,
          explanation:
            score >= 75
              ? 'Clear goal with useful constraints.'
              : score >= 55
                ? 'Reasonably clear, but can use more concrete constraints.'
                : 'Needs clearer goal, context, and output constraints.',
        };
      })();
      const scoreRaw = Number(parsed?.score);
      return {
        score: Number.isFinite(scoreRaw)
          ? Math.max(0, Math.min(100, Math.round(scoreRaw)))
          : fallback.score,
        explanation: String(parsed?.explanation || '').trim() || fallback.explanation,
      };
    };
    const getAiRuntimeSettings = async () => {
      const DEFAULT_RUNTIME_SETTINGS = Object.freeze({
        activeProvider: 'gemini',
        providerModels: { gemini: 'gemini-2.0-flash' },
        featureFlags: { improvePrompt: true },
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
        const source = asObject(
          (await chrome.storage.local.get([BRAND_KEYS.settingsKey]))?.[BRAND_KEYS.settingsKey]
        );
        return {
          ...DEFAULT_RUNTIME_SETTINGS,
          providerModels: {
            gemini: String(source.providerModels?.gemini || 'gemini-2.0-flash').trim(),
          },
          featureFlags: { improvePrompt: source.featureFlags?.improvePrompt !== false },
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
      if (!apiKey) throw new Error(noGeminiMessage);
      const modelId = String(runtime.providerModels?.gemini || 'gemini-2.0-flash').trim();
      if (typeof cloudTask !== 'function') throw new Error('Invalid task.');
      return {
        ok: true,
        backend: 'gemini',
        ...((await cloudTask({
          providerId: 'gemini',
          apiKey,
          modelId,
          runtime,
        })) || {}),
      };
    };
    const mapValidationResultToLegacy = (result = {}) => {
      if (result?.ok) return { ok: true };
      const category = String(result?.category || '')
        .trim()
        .toLowerCase();
      if (category === 'invalid_key')
        return {
          ok: false,
          error: 'Invalid key.',
        };
      if (category === 'rate_limited')
        return {
          ok: false,
          error: 'Rate limited.',
        };
      if (category === 'network_error')
        return {
          ok: false,
          error: 'Network error.',
        };
      return {
        ok: false,
        error: String(result?.message || 'Provider error.'),
      };
    };
    const validateGeminiApiKey$1 = async (rawKey) => {
      const key = String(rawKey || '').trim();
      if (!key)
        return {
          ok: false,
          error: 'Missing API key.',
        };
      return mapValidationResultToLegacy(await validateGeminiApiKey(key));
    };
    function broadcast(message) {
      chrome.runtime.sendMessage(message).catch(() => {});
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
      if (!source) throw new Error('Empty prompt text provided.');
      return {
        tags: parseTagsFromModelText(
          await callProviderTextTask({
            providerId,
            modelId,
            apiKey,
            systemPrompt: [
              'Suggest 2-3 short lowercase tags for this prompt.',
              'Return strict JSON array only, e.g. ["coding","debugging"].',
              'No prose.',
            ].join('\n'),
            userPrompt: `Prompt:\n${source}`,
          })
        ),
      };
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
      return Object.entries(TAG_DEFINITIONS)
        .map(([tag, definition]) => {
          return {
            tag,
            score: String(definition || '')
              .toLowerCase()
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean)
              .reduce((sum, keyword) => (normalized.includes(keyword) ? sum + 1 : sum), 0),
          };
        })
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, maxCount)
        .map((entry) => entry.tag);
    };
    const parseTagsFromModelText = (text) => {
      const raw = String(text || '').trim();
      if (!raw) return [];
      const parsedJson = safeJsonParse(raw) || safeJsonParse(raw.match(/\[[\s\S]*\]/)?.[0] || '');
      if (Array.isArray(parsedJson))
        return parsedJson
          .map((item) =>
            String(item || '')
              .toLowerCase()
              .trim()
          )
          .filter(Boolean)
          .slice(0, 3);
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
      if (!source)
        return {
          ok: false,
          tags: [],
          error: 'Prompt text is required.',
        };
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
      for (let i = 1; i < rows; i += 1)
        for (let j = 1; j < cols; j += 1) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
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
          : {
              title: '',
              text: String(promptText || ''),
            };
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
      if (bestPrompt && bestScore > 0.85)
        return {
          prompt: bestPrompt,
          score: bestScore,
        };
      return null;
    }
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
        const userMessage = `Conversation:\n${redactSensitiveText(conversationText).slice(0, 600)}\n\nSaved prompts:\n${promptList}`;
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
    async function improvePromptViaCloudStrict({
      providerId,
      apiKey,
      modelId,
      text,
      tags = [],
      style = 'general',
    }) {
      if (!text || text.trim().length === 0) throw new Error('Empty prompt text provided.');
      let styleInstruction = 'Make it clear, concise, and highly effective for an AI.';
      if (style === 'coding')
        styleInstruction =
          'Optimize for software engineering. Ask for code snippets, architecture details, and edge case handling.';
      else if (style === 'study')
        styleInstruction =
          'Optimize for learning and summarization. Ask for clear explanations, analogies, and step-by-step breakdowns.';
      else if (style === 'creative')
        styleInstruction =
          'Optimize for creative writing. Ask for vivid imagery, character depth, and engaging tone.';
      const safeTags = Array.isArray(tags)
        ? tags.map((tag) => String(tag || '').trim()).filter(Boolean)
        : [];
      const tagContext =
        safeTags.length > 0 ? `Incorporate these concepts/topics: ${safeTags.join(', ')}.` : '';
      const improvedText = await callProviderTextTask({
        providerId,
        modelId,
        apiKey,
        systemPrompt: `You are an expert prompt engineer. Your goal is to improve the user's prompt so it yields the best possible response from an LLM.
${styleInstruction}
${tagContext}
ONLY return the improved prompt text. Do not add quotes, do not explain your changes, and do not add headings.`,
        userPrompt: `User's Original Prompt:\n${clampText(text, 5e3)}`,
      });
      if (!improvedText)
        throw new Error(`${getProviderLabel(providerId)} returned empty improved text.`);
      return { text: improvedText };
    }
    async function paraphrasePromptViaCloudStrict({ providerId, apiKey, modelId, text }) {
      const source = clampText(text, 5e3);
      if (!source) throw new Error('Empty prompt text provided.');
      const rewritten = await callProviderTextTask({
        providerId,
        modelId,
        apiKey,
        systemPrompt: [
          'Rewrite the prompt for clarity while preserving intent and all placeholders exactly.',
          'Keep bracket placeholders unchanged (e.g., [topic], [tone?]).',
          'Return only the rewritten prompt text.',
        ].join('\n'),
        userPrompt: `Prompt:\n${source}`,
      });
      if (!rewritten)
        throw new Error(`${getProviderLabel(providerId)} returned empty paraphrase output.`);
      return { text: rewritten };
    }
    async function buildContinuationHandoffViaCloud(
      messages,
      mode = 'FULL_SUMMARY',
      userNote = '',
      cloud = {}
    ) {
      const safeMessages = Array.isArray(messages) ? messages : [];
      if (!safeMessages.length)
        return {
          ok: false,
          error: 'No messages to summarize.',
        };
      const providerId = PROVIDER_IDS.GEMINI;
      const apiKey = String(cloud.apiKey || '').trim();
      const modelId = String(cloud.modelId || '').trim();
      if (!apiKey)
        return {
          ok: false,
          error: 'Missing provider key.',
        };
      const prompt = buildContinuationPrompt(safeMessages, mode, userNote);
      try {
        const raw = await callProviderTextTask({
          providerId,
          modelId,
          apiKey,
          systemPrompt: 'Summarize for a continuation handoff.',
          userPrompt: prompt,
        });
        if (!raw)
          return {
            ok: false,
            error: `${getProviderLabel(providerId)} returned empty continuation context.`,
          };
        return {
          ok: true,
          text: limitWords(raw, CONTINUATION_WORD_LIMIT),
        };
      } catch (error) {
        return {
          ok: false,
          error:
            error?.name === 'AbortError'
              ? `${getProviderLabel(providerId)} request timed out.`
              : 'Failed to generate continuation handoff.',
        };
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
      if (!safeMessages.length)
        return {
          ok: false,
          error: 'No messages to summarize.',
        };
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
          advisory: String(result?.advisory || longAdvisory || '').trim() || void 0,
        };
      } catch (error) {
        return {
          ok: false,
          error: String(error?.message || 'Failed to generate continuation handoff.'),
          advisory: longAdvisory || void 0,
        };
      }
    }
    async function generatePromptTitleViaCloudStrict({ providerId, apiKey, modelId, text }) {
      const source = clampText(text, 3200);
      if (!source) throw new Error('Empty text provided.');
      const title = (
        await callProviderTextTask({
          providerId,
          modelId,
          apiKey,
          systemPrompt: `Create one concise title (max 8 words) for this prompt.
Return ONLY the title text.
No quotes, no numbering, no extra text.`,
          userPrompt: `Prompt:\n${source}`,
        })
      )
        .split('\n')[0]
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/^\d+[\).\s-]+/, '')
        .trim()
        .slice(0, 80);
      if (!title) throw new Error('No title generated.');
      return { title };
    }
    async function scorePromptClarityViaCloudStrict({ providerId, apiKey, modelId, text }) {
      const source = clampText(text, 4200);
      if (!source) throw new Error('Empty text provided.');
      return parseClarityFromText(
        await callProviderTextTask({
          providerId,
          modelId,
          apiKey,
          systemPrompt: [
            'Evaluate this prompt on clarity, specificity, and completeness.',
            'Return strict JSON only in this shape:',
            '{"score": 0, "explanation": "one short sentence"}',
          ].join('\n'),
          userPrompt: `Prompt:\n${source}`,
        }),
        source
      );
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
          advisory: result?.advisory || void 0,
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
      if (!source)
        return {
          error: 'Empty text provided.',
          title: '',
        };
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
        return {
          ok: true,
          title:
            String(result?.title || '')
              .trim()
              .slice(0, 80) || deriveFallbackTitle(source),
          backend: 'gemini',
          advisory: result?.advisory || void 0,
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
      if (!source)
        return {
          ok: false,
          error: 'Empty prompt text provided.',
        };
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
        return {
          ok: true,
          text: String(result?.text || '').trim() || source,
          backend: 'gemini',
          advisory: result?.advisory || void 0,
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
      if (!source)
        return {
          ok: false,
          error: 'Empty prompt text provided.',
          score: 0,
          explanation: 'No prompt content provided.',
        };
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
          advisory: result?.advisory || void 0,
        };
      } catch (_error) {
        return {
          ok: false,
          ...parseClarityFromText('', source),
          backend: 'fallback',
        };
      }
    };
    const preparePromptForSave = async ({
      title = '',
      text = '',
      tags = [],
      category = null,
    } = {}) => {
      const originalText = clampText(text, 5200);
      if (!originalText)
        return {
          ok: false,
          error: 'Prompt text is required.',
        };
      const runtime = await getAiRuntimeSettings();
      const normalizedTags = Array.isArray(tags)
        ? tags.map((tag) => String(tag || '').trim()).filter(Boolean)
        : [];
      const paraphrased =
        runtime?.featureFlags?.polish !== false
          ? await paraphrasePrompt(originalText)
          : {
              ok: false,
              text: originalText,
              backend: null,
            };
      const finalText =
        clampText(paraphrased?.ok ? paraphrased?.text : originalText, 5200) || originalText;
      const initialTitle = String(title || '').trim();
      const [titleResult, clarity] = await Promise.all([
        initialTitle
          ? Promise.resolve({
              title: initialTitle,
              backend: 'provided',
            })
          : generatePromptTitle(finalText),
        scorePromptClarity(finalText),
      ]);
      return {
        ok: true,
        prompt: {
          title: String(titleResult?.title || '').trim() || deriveFallbackTitle(finalText),
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
    const handleRoutedTask = async (message = {}) => {
      const task = String(message?.task || '')
        .trim()
        .toLowerCase();
      switch (task) {
        case 'paraphrase':
          return paraphrasePrompt(message?.text || '');
        case 'improve':
          return improvePrompt(
            message?.text || '',
            message?.tags || [],
            message?.style || 'general'
          );
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
              broadcast({
                type: 'AI_STATUS',
                status: 'ready',
              });
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
          case 'AI_PROVIDER_VALIDATE_KEY':
            sendResponse(await validateGeminiApiKey$1(String(message?.key || '').trim()));
            return true;
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
            sendResponse({ match: await checkDuplicate(message.text, message.excludeId) });
            return true;
          case 'AI_SMART_SUGGESTIONS':
            sendResponse({ ids: await getSmartSuggestions(message.conversationText) });
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
            sendResponse({
              running: false,
              done: 0,
              total: 0,
              progress: 100,
            });
            return true;
          case 'AI_EMBEDDING_REINDEX_START':
            sendResponse({
              ok: true,
              running: false,
              done: 0,
              total: 0,
              progress: 100,
            });
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
    const SIDE_PANEL_PATH = 'sidepanel/sidepanel.html';
    const SIDEPANEL_SESSION_KEY = BRAND_KEYS.sidePanelPayload;
    const PENDING_PANEL_ACTION_KEY = 'promptiumPendingPanelAction';
    const PANEL_MODE_SESSION_KEY = 'promptiumPanelMode';
    const FALLBACK_PANEL_WIDTH = 420;
    const FALLBACK_PANEL_HEIGHT = 720;
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
    const isArc = navigator.userAgent.includes('Arc');
    const isSidePanelSupported = () =>
      Boolean(chrome.sidePanel && typeof chrome.sidePanel.open === 'function');
    let usePopupMode = isArc || !isSidePanelSupported();
    let fallbackPopupWindowId = null;
    const setPanelMode = async (mode) => {
      await chrome.storage.session
        .set({ [PANEL_MODE_SESSION_KEY]: String(mode || 'sidepanel') })
        .catch(() => {});
    };
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
          left =
            anchorLeft +
            Number(anchorWindow.width || FALLBACK_PANEL_WIDTH) -
            FALLBACK_PANEL_WIDTH -
            FALLBACK_PANEL_RIGHT_OFFSET;
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
          if (panelTab?.id)
            await chrome.tabs
              .update(panelTab.id, {
                active: true,
                url: getSidePanelUrl(route),
              })
              .catch(() => {});
          return {
            ok: true,
            tab: panelTab,
            reused: true,
          };
        }
        fallbackPopupWindowId = null;
      }
      const tabs = await chrome.tabs.query({ url: `${base}*` }).catch(() => []);
      if (!tabs.length) return null;
      const tab = tabs[0];
      if (tab.windowId) fallbackPopupWindowId = tab.windowId;
      if (tab.windowId)
        await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
      if (tab.id)
        await chrome.tabs
          .update(tab.id, {
            active: true,
            url: getSidePanelUrl(route),
          })
          .catch(() => {});
      return {
        ok: true,
        tab,
        reused: true,
      };
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
      return {
        ok: true,
        mode: 'popup',
        tab: win?.tabs?.[0],
        reused: false,
      };
    };
    const openPopupPanel = async ({ route = '', focus = true, windowId } = {}) => {
      await setPanelMode('popup');
      const existing = await focusExistingPanel(route);
      if (existing)
        return {
          ok: true,
          mode: 'popup',
          tab: existing.tab,
          reused: true,
        };
      return await createPopupPanel({
        route,
        focus,
        windowId,
      });
    };
    const openPromptiumPanel = async ({
      tabId,
      windowId,
      route = '',
      pendingAction = null,
    } = {}) => {
      if (!usePopupMode && isSidePanelSupported())
        try {
          if (tabId && windowId)
            await chrome.sidePanel.open({
              tabId,
              windowId,
            });
          else if (windowId) await chrome.sidePanel.open({ windowId });
          else if (tabId) await chrome.sidePanel.open({ tabId });
          else {
            const [tab] = await chrome.tabs.query({
              active: true,
              currentWindow: true,
            });
            if (tab?.id && tab.windowId)
              await chrome.sidePanel.open({
                tabId: tab.id,
                windowId: tab.windowId,
              });
          }
          await setPanelMode('sidepanel');
          return {
            ok: true,
            mode: 'sidepanel',
          };
        } catch (_error) {
          usePopupMode = true;
        }
      if (pendingAction) {
        const existing = await focusExistingPanel(route);
        if (existing?.reused) {
          const actionName =
            pendingAction?.type === 'showContinuation' ? 'showContinuation' : 'showExport';
          await chrome.runtime.sendMessage({ action: actionName }).catch(() => {});
          await chrome.storage.session.remove([PENDING_PANEL_ACTION_KEY]).catch(() => {});
          return {
            ok: true,
            mode: 'popup',
            tab: existing.tab,
            reused: true,
          };
        }
        await stashPendingPanelAction(pendingAction);
        return await createPopupPanel({
          route,
          windowId,
        });
      }
      return await openPopupPanel({
        route,
        windowId,
      });
    };
    const initializeStorageKeys = async () => {
      const state = await chrome.storage.local.get(['prompts']);
      const updates = {};
      if (!Array.isArray(state.prompts)) updates.prompts = [];
      if (Object.keys(updates).length > 0) await chrome.storage.local.set(updates);
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
        if (!tab?.id || !tab.windowId)
          return {
            ok: false,
            error: 'No active tab available.',
          };
        const opened = await openPromptiumPanel({
          tabId: tab.id,
          windowId: tab.windowId,
        });
        if (!opened?.ok)
          return {
            ok: false,
            error: 'Failed to open Promptium panel.',
          };
        return {
          ok: true,
          tab,
          mode: opened.mode,
        };
      } catch (error) {
        return {
          ok: false,
          error: error?.message || 'Failed to open Promptium panel.',
        };
      }
    };
    const handleOpenLlmTab = async (url) => {
      try {
        const parsed = new URL(String(url || ''));
        if (parsed.protocol !== 'https:')
          return {
            ok: false,
            error: 'Invalid tab URL.',
          };
        if (!ALLOWED_LLM_HOSTS.has(parsed.hostname.toLowerCase()))
          return {
            ok: false,
            error: 'Target host is not allowlisted.',
          };
        await chrome.tabs.create({ url: parsed.toString() });
        return { ok: true };
      } catch (_error) {
        return {
          ok: false,
          error: 'Failed to open requested tab.',
        };
      }
    };
    const handleSetSidePanelPayload = async (payload) => {
      const value = payload && typeof payload === 'object' ? payload : null;
      if (!value || !Array.isArray(value.messages))
        return {
          ok: false,
          error: 'Invalid side panel payload.',
        };
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
          if (!persisted.ok)
            return {
              ok: false,
              error: persisted.error || 'Payload failed to persist.',
            };
        }
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error?.message || 'Unable to handle payload.',
        };
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
        if (!opened?.ok)
          return {
            ok: false,
            error: 'Failed to open Promptium panel.',
          };
        if (opened.mode === 'sidepanel')
          await chrome.runtime.sendMessage({ action: 'showContinuation' }).catch((error) => {
            console.warn('[Promptium][ServiceWorker] Failed to notify continuation view.', error);
          });
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error?.message || 'Failed to open Promptium panel.',
        };
      }
    };
    const onRuntimeMessage = (message, sender, sendResponse) => {
      if (message?.type === 'OFFSCREEN_EMBEDDING') return false;
      let panelOpenPromise = null;
      if (message?.action === 'OPEN_SIDEPANEL') {
        const tabId = sender?.tab?.id;
        const windowId = sender?.tab?.windowId;
        if (isSidePanelSupported() && windowId)
          panelOpenPromise = chrome.sidePanel
            .open({
              windowId,
              tabId,
            })
            .catch((err) => err);
        else
          panelOpenPromise = openPromptiumPanel({
            tabId,
            windowId,
            route: 'export',
            pendingAction: { type: 'showExport' },
          }).catch((err) => err);
      }
      (async () => {
        let responded = false;
        const mappedType = String(message?.type || message?.action || '').trim();
        const routedMessage = mappedType
          ? {
              ...message,
              type: mappedType,
            }
          : message;
        const respond = (payload) => {
          if (responded) return;
          responded = true;
          try {
            sendResponse(payload);
          } catch (_error) {
            return;
          }
        };
        try {
          if (routedMessage?.type?.startsWith('AI_')) {
            if (await handleAIMessage(routedMessage, respond)) return;
          }
          if (message?.action === 'openExport') {
            const tabId = sender?.tab?.id;
            const windowId = sender?.tab?.windowId;
            if (!tabId || !windowId) {
              respond({
                ok: false,
                error: 'No tab ID',
              });
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
            if (opened.mode === 'sidepanel')
              await chrome.runtime.sendMessage({ action: 'showExport' }).catch((error) => {
                console.warn('[Promptium][ServiceWorker] Failed to notify export view.', error);
              });
            respond({ ok: true });
            return;
          }
          if (message?.action === 'openSidePanel') {
            const tabId = sender?.tab?.id;
            const windowId = sender?.tab?.windowId;
            if (!tabId || !windowId) {
              respond({
                ok: false,
                error: 'No tab ID',
              });
              return;
            }
            if (
              !(
                await openPromptiumPanel({
                  tabId,
                  windowId,
                })
              )?.ok
            ) {
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
              if (result instanceof Error) openError = result.message;
              else if (result?.ok === false) openError = result?.error || 'Panel open failed.';
            }
            if (openError) {
              respond({
                ok: false,
                error: `Panel Error: ${openError}`,
              });
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
            respond(await validateGeminiApiKey$1(message.key));
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
      onInstalled();
    });
    chrome.runtime.onStartup.addListener(() => {
      (async () => {
        await registerContextMenus();
      })();
    });
    chrome.commands.onCommand.addListener((command) => {
      if (command !== 'open-side-panel') return;
      openSidePanelForActiveTab();
    });
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId !== CONTEXT_MENU_SAVE_ID) return;
      const selectedText = String(info.selectionText || '').trim();
      if (!selectedText || !tab?.id || !tab.windowId) return;
      (async () => {
        const sourceUrl = String(tab.url || '');
        await chrome.storage.local.set({
          [BRAND_KEYS.pendingSnippet]: {
            text: selectedText,
            sourceUrl,
            platform: detectPlatformFromUrl(sourceUrl),
            savedAt: Date.now(),
          },
        });
        await openPromptiumPanel({
          tabId: tab.id,
          windowId: tab.windowId,
        }).catch(() => {});
        await chrome.tabs
          .sendMessage(tab.id, {
            action: 'notifyPromptium',
            text: 'Saved to Promptium',
          })
          .catch(() => {});
      })();
    });
    chrome.runtime.onSuspend.addListener(() => {});
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
  });
  //#endregion
  //#region node_modules/.pnpm/wxt@0.20.26/node_modules/wxt/dist/browser.mjs
  /**
   * Contains the `browser` export which you should use to access the extension
   * APIs in your project:
   *
   * ```ts
   * import { browser } from 'wxt/browser';
   *
   * browser.runtime.onInstalled.addListener(() => {
   *   // ...
   * });
   * ```
   *
   * @module wxt/browser
   */
  var browser = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;
  //#endregion
  //#region node_modules/.pnpm/@webext-core+match-patterns@1.0.3/node_modules/@webext-core/match-patterns/lib/index.js
  var _MatchPattern = class {
    constructor(matchPattern) {
      if (matchPattern === '<all_urls>') {
        this.isAllUrls = true;
        this.protocolMatches = [..._MatchPattern.PROTOCOLS];
        this.hostnameMatch = '*';
        this.pathnameMatch = '*';
      } else {
        const groups = /(.*):\/\/(.*?)(\/.*)/.exec(matchPattern);
        if (groups == null) throw new InvalidMatchPattern(matchPattern, 'Incorrect format');
        const [_, protocol, hostname, pathname] = groups;
        validateProtocol(matchPattern, protocol);
        validateHostname(matchPattern, hostname);
        this.protocolMatches = protocol === '*' ? ['http', 'https'] : [protocol];
        this.hostnameMatch = hostname;
        this.pathnameMatch = pathname;
      }
    }
    includes(url) {
      if (this.isAllUrls) return true;
      const u =
        typeof url === 'string' ? new URL(url) : url instanceof Location ? new URL(url.href) : url;
      return !!this.protocolMatches.find((protocol) => {
        if (protocol === 'http') return this.isHttpMatch(u);
        if (protocol === 'https') return this.isHttpsMatch(u);
        if (protocol === 'file') return this.isFileMatch(u);
        if (protocol === 'ftp') return this.isFtpMatch(u);
        if (protocol === 'urn') return this.isUrnMatch(u);
      });
    }
    isHttpMatch(url) {
      return url.protocol === 'http:' && this.isHostPathMatch(url);
    }
    isHttpsMatch(url) {
      return url.protocol === 'https:' && this.isHostPathMatch(url);
    }
    isHostPathMatch(url) {
      if (!this.hostnameMatch || !this.pathnameMatch) return false;
      const hostnameMatchRegexs = [
        this.convertPatternToRegex(this.hostnameMatch),
        this.convertPatternToRegex(this.hostnameMatch.replace(/^\*\./, '')),
      ];
      const pathnameMatchRegex = this.convertPatternToRegex(this.pathnameMatch);
      return (
        !!hostnameMatchRegexs.find((regex) => regex.test(url.hostname)) &&
        pathnameMatchRegex.test(url.pathname)
      );
    }
    isFileMatch(url) {
      throw Error('Not implemented: file:// pattern matching. Open a PR to add support');
    }
    isFtpMatch(url) {
      throw Error('Not implemented: ftp:// pattern matching. Open a PR to add support');
    }
    isUrnMatch(url) {
      throw Error('Not implemented: urn:// pattern matching. Open a PR to add support');
    }
    convertPatternToRegex(pattern) {
      const starsReplaced = this.escapeForRegex(pattern).replace(/\\\*/g, '.*');
      return RegExp(`^${starsReplaced}$`);
    }
    escapeForRegex(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  };
  var MatchPattern = _MatchPattern;
  MatchPattern.PROTOCOLS = ['http', 'https', 'file', 'ftp', 'urn'];
  var InvalidMatchPattern = class extends Error {
    constructor(matchPattern, reason) {
      super(`Invalid match pattern "${matchPattern}": ${reason}`);
    }
  };
  function validateProtocol(matchPattern, protocol) {
    if (!MatchPattern.PROTOCOLS.includes(protocol) && protocol !== '*')
      throw new InvalidMatchPattern(
        matchPattern,
        `${protocol} not a valid protocol (${MatchPattern.PROTOCOLS.join(', ')})`
      );
  }
  function validateHostname(matchPattern, hostname) {
    if (hostname.includes(':'))
      throw new InvalidMatchPattern(matchPattern, `Hostname cannot include a port`);
    if (hostname.includes('*') && hostname.length > 1 && !hostname.startsWith('*.'))
      throw new InvalidMatchPattern(
        matchPattern,
        `If using a wildcard (*), it must go at the start of the hostname`
      );
  }
  //#endregion
  //#region \0virtual:wxt-background-entrypoint?/Users/shashankmergu/Desktop/promptium/src/entrypoints/background.ts
  function print(method, ...args) {
    if (typeof args[0] === 'string') method(`[wxt] ${args.shift()}`, ...args);
    else method('[wxt]', ...args);
  }
  /** Wrapper around `console` with a "[wxt]" prefix */
  var logger = {
    debug: (...args) => print(console.debug, ...args),
    log: (...args) => print(console.log, ...args),
    warn: (...args) => print(console.warn, ...args),
    error: (...args) => print(console.error, ...args),
  };
  var ws;
  /** Connect to the websocket and listen for messages. */
  function getDevServerWebSocket() {
    if (ws == null) {
      const serverUrl = 'ws://localhost:3000';
      logger.debug('Connecting to dev server @', serverUrl);
      ws = new WebSocket(serverUrl, 'vite-hmr');
      ws.addWxtEventListener = ws.addEventListener.bind(ws);
      ws.sendCustom = (event, payload) =>
        ws?.send(
          JSON.stringify({
            type: 'custom',
            event,
            payload,
          })
        );
      ws.addEventListener('open', () => {
        logger.debug('Connected to dev server');
      });
      ws.addEventListener('close', () => {
        logger.debug('Disconnected from dev server');
      });
      ws.addEventListener('error', (event) => {
        logger.error('Failed to connect to dev server', event);
      });
      ws.addEventListener('message', (e) => {
        try {
          const message = JSON.parse(e.data);
          if (message.type === 'custom')
            ws?.dispatchEvent(new CustomEvent(message.event, { detail: message.data }));
        } catch (err) {
          logger.error('Failed to handle message', err);
        }
      });
    }
    return ws;
  }
  /** https://developer.chrome.com/blog/longer-esw-lifetimes/ */
  function keepServiceWorkerAlive() {
    setInterval(async () => {
      await browser.runtime.getPlatformInfo();
    }, 5e3);
  }
  function reloadContentScript(payload) {
    if (browser.runtime.getManifest().manifest_version == 2) reloadContentScriptMv2(payload);
    else reloadContentScriptMv3(payload);
  }
  async function reloadContentScriptMv3({ registration, contentScript }) {
    if (registration === 'runtime') await reloadRuntimeContentScriptMv3(contentScript);
    else await reloadManifestContentScriptMv3(contentScript);
  }
  async function reloadManifestContentScriptMv3(contentScript) {
    const id = `wxt:${contentScript.js[0]}`;
    logger.log('Reloading content script:', contentScript);
    const registered = await browser.scripting.getRegisteredContentScripts();
    logger.debug('Existing scripts:', registered);
    const existing = registered.find((cs) => cs.id === id);
    if (existing) {
      logger.debug('Updating content script', existing);
      await browser.scripting.updateContentScripts([
        {
          ...contentScript,
          id,
          css: contentScript.css ?? [],
        },
      ]);
    } else {
      logger.debug('Registering new content script...');
      await browser.scripting.registerContentScripts([
        {
          ...contentScript,
          id,
          css: contentScript.css ?? [],
        },
      ]);
    }
    await reloadTabsForContentScript(contentScript);
  }
  async function reloadRuntimeContentScriptMv3(contentScript) {
    logger.log('Reloading content script:', contentScript);
    const registered = await browser.scripting.getRegisteredContentScripts();
    logger.debug('Existing scripts:', registered);
    const matches = registered.filter((cs) => {
      const hasJs = contentScript.js?.find((js) => cs.js?.includes(js));
      const hasCss = contentScript.css?.find((css) => cs.css?.includes(css));
      return hasJs || hasCss;
    });
    if (matches.length === 0) {
      logger.log('Content script is not registered yet, nothing to reload', contentScript);
      return;
    }
    await browser.scripting.updateContentScripts(matches);
    await reloadTabsForContentScript(contentScript);
  }
  async function reloadTabsForContentScript(contentScript) {
    const allTabs = await browser.tabs.query({});
    const matchPatterns = contentScript.matches.map((match) => new MatchPattern(match));
    const matchingTabs = allTabs.filter((tab) => {
      const url = tab.url;
      if (!url) return false;
      return !!matchPatterns.find((pattern) => pattern.includes(url));
    });
    await Promise.all(
      matchingTabs.map(async (tab) => {
        try {
          await browser.tabs.reload(tab.id);
        } catch (err) {
          logger.warn('Failed to reload tab:', err);
        }
      })
    );
  }
  async function reloadContentScriptMv2(_payload) {
    throw Error('TODO: reloadContentScriptMv2');
  }
  try {
    const ws = getDevServerWebSocket();
    ws.addWxtEventListener('wxt:reload-extension', () => {
      browser.runtime.reload();
    });
    ws.addWxtEventListener('wxt:reload-content-script', (event) => {
      reloadContentScript(event.detail);
    });
    ws.addEventListener('open', () => ws.sendCustom('wxt:background-initialized'));
    keepServiceWorkerAlive();
  } catch (err) {
    logger.error('Failed to setup web socket connection with dev server', err);
  }
  browser.commands.onCommand.addListener((command) => {
    if (command === 'wxt:reload-extension') browser.runtime.reload();
  });
  var result;
  try {
    result = background_default.main();
    if (result instanceof Promise)
      console.warn("The background's main() function return a promise, but it must be synchronous");
  } catch (err) {
    logger.error('The background crashed on startup!');
    throw err;
  }
  //#endregion
  return result;
})();

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2dyb3VuZC5qcyIsIm5hbWVzIjpbImJyb3dzZXIiXSwic291cmNlcyI6WyIuLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd3h0QDAuMjAuMjYvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2RlZmluZS1iYWNrZ3JvdW5kLm1qcyIsIi4uLy4uL3NyYy91dGlscy9tb2RlbC1yZWdpc3RyeS50cyIsIi4uLy4uL3NyYy91dGlscy9nZW1pbmktY2xpZW50LnRzIiwiLi4vLi4vc3JjL2VudHJ5cG9pbnRzL2JhY2tncm91bmQudHMiLCIuLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vQHd4dC1kZXYrYnJvd3NlckAwLjEuNDMvbm9kZV9tb2R1bGVzL0B3eHQtZGV2L2Jyb3dzZXIvc3JjL2luZGV4Lm1qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS93eHRAMC4yMC4yNi9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvYnJvd3Nlci5tanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vQHdlYmV4dC1jb3JlK21hdGNoLXBhdHRlcm5zQDEuMC4zL25vZGVfbW9kdWxlcy9Ad2ViZXh0LWNvcmUvbWF0Y2gtcGF0dGVybnMvbGliL2luZGV4LmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vI3JlZ2lvbiBzcmMvdXRpbHMvZGVmaW5lLWJhY2tncm91bmQudHNcbmZ1bmN0aW9uIGRlZmluZUJhY2tncm91bmQoYXJnKSB7XG5cdGlmIChhcmcgPT0gbnVsbCB8fCB0eXBlb2YgYXJnID09PSBcImZ1bmN0aW9uXCIpIHJldHVybiB7IG1haW46IGFyZyB9O1xuXHRyZXR1cm4gYXJnO1xufVxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBkZWZpbmVCYWNrZ3JvdW5kIH07XG4iLCIvKipcbiAqIEZpbGU6IHV0aWxzL21vZGVsLXJlZ2lzdHJ5LmpzXG4gKiBQdXJwb3NlOiBHZW1pbmkgbW9kZWxzIHJlZ2lzdHJ5LlxuICovXG5cbmV4cG9ydCBjb25zdCBQUk9WSURFUl9JRFMgPSBPYmplY3QuZnJlZXplKHtcbiAgR0VNSU5JOiBcImdlbWluaVwiLFxufSk7XG5cbmV4cG9ydCBjb25zdCBNT0RFTF9SRUdJU1RSWSA9IE9iamVjdC5mcmVlemUoe1xuICBtb2RlbHM6IFtcbiAgICB7XG4gICAgICBpZDogXCJnZW1pbmktMi4wLWZsYXNoXCIsXG4gICAgICBsYWJlbDogXCJnZW1pbmktMi4wLWZsYXNoXCIsXG4gICAgICBkZWZhdWx0OiB0cnVlLFxuICAgICAgbm90ZTogXCJEZWZhdWx0IGJhbGFuY2VkIG1vZGVsXCIsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJnZW1pbmktMi4wLWZsYXNoLWxpdGVcIixcbiAgICAgIGxhYmVsOiBcImdlbWluaS0yLjAtZmxhc2gtbGl0ZVwiLFxuICAgICAgZGVmYXVsdDogZmFsc2UsXG4gICAgICBub3RlOiBcIkxvd2VyLWNvc3QgZmFzdCBvcHRpb25cIixcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcImdlbWluaS0xLjUtcHJvXCIsXG4gICAgICBsYWJlbDogXCJnZW1pbmktMS41LXByb1wiLFxuICAgICAgZGVmYXVsdDogZmFsc2UsXG4gICAgICBub3RlOiBcIkhpZ2hlciBxdWFsaXR5IHJlYXNvbmluZ1wiLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwiZ2VtaW5pLTEuNS1mbGFzaFwiLFxuICAgICAgbGFiZWw6IFwiZ2VtaW5pLTEuNS1mbGFzaFwiLFxuICAgICAgZGVmYXVsdDogZmFsc2UsXG4gICAgICBub3RlOiBcIlN0YWJsZSBmYXN0IGZhbGxiYWNrXCIsXG4gICAgfSxcbiAgXSxcbn0pO1xuXG5leHBvcnQgY29uc3QgZ2V0R2VtaW5pTW9kZWxzID0gKCkgPT4gTU9ERUxfUkVHSVNUUlkubW9kZWxzO1xuXG5leHBvcnQgY29uc3QgZ2V0R2VtaW5pRGVmYXVsdE1vZGVsID0gKCkgPT5cbiAgTU9ERUxfUkVHSVNUUlkubW9kZWxzLmZpbmQoKGVudHJ5KSA9PiBlbnRyeT8uZGVmYXVsdCkgfHwgTU9ERUxfUkVHSVNUUlkubW9kZWxzWzBdO1xuXG5leHBvcnQgY29uc3QgZ2V0R2VtaW5pTW9kZWxCeUlkID0gKG1vZGVsSWQgPSBcIlwiKSA9PiB7XG4gIGNvbnN0IHJlc29sdmVkSWQgPSBTdHJpbmcobW9kZWxJZCB8fCBcIlwiKS50cmltKCk7XG4gIGlmICghcmVzb2x2ZWRJZCkgcmV0dXJuIG51bGw7XG4gIHJldHVybiAoXG4gICAgTU9ERUxfUkVHSVNUUlkubW9kZWxzLmZpbmQoKGVudHJ5KSA9PiBTdHJpbmcoZW50cnk/LmlkIHx8IFwiXCIpID09PSByZXNvbHZlZElkKSB8fFxuICAgIG51bGxcbiAgKTtcbn07XG4iLCIvKipcbiAqIEZpbGU6IHV0aWxzL2dlbWluaS1jbGllbnQudHNcbiAqIFB1cnBvc2U6IERpcmVjdCBjbGllbnQgaW50ZXJmYWNlIGZvciB0aGUgR2VtaW5pIEFQSS5cbiAqL1xuXG5pbnRlcmZhY2UgQ2xpZW50RXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIHR5cGU6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFZhbGlkYXRpb25SZXN1bHQge1xuICBvazogYm9vbGVhbjtcbiAgY2F0ZWdvcnk6IHN0cmluZztcbiAgbWVzc2FnZTogc3RyaW5nO1xuICBzdGF0dXM/OiBudW1iZXI7XG59XG5cbmNvbnN0IERFRkFVTFRfVElNRU9VVF9NUyA9IDE4MDAwO1xuY29uc3QgR0VNSU5JX0FQSV9ST09UID0gXCJodHRwczovL2dlbmVyYXRpdmVsYW5ndWFnZS5nb29nbGVhcGlzLmNvbS92MWJldGFcIjtcblxuY29uc3QgY3JlYXRlQ2xpZW50RXJyb3IgPSAodHlwZTogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcpOiBDbGllbnRFcnJvciA9PiB7XG4gIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKFN0cmluZyhtZXNzYWdlIHx8IFwiR2VtaW5pIHJlcXVlc3QgZmFpbGVkLlwiKSkgYXMgQ2xpZW50RXJyb3I7XG4gIGVycm9yLnR5cGUgPSB0eXBlO1xuICByZXR1cm4gZXJyb3I7XG59O1xuXG5jb25zdCB3aXRoVGltZW91dCA9IGFzeW5jICh1cmw6IHN0cmluZywgb3B0aW9uczogUmVxdWVzdEluaXQgPSB7fSwgdGltZW91dE1zOiBudW1iZXIgPSBERUZBVUxUX1RJTUVPVVRfTVMpOiBQcm9taXNlPFJlc3BvbnNlPiA9PiB7XG4gIGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gIGNvbnN0IHRpbWVvdXRJZCA9IHNldFRpbWVvdXQoKCkgPT4gY29udHJvbGxlci5hYm9ydCgpLCB0aW1lb3V0TXMpO1xuXG4gIHRyeSB7XG4gICAgcmV0dXJuIGF3YWl0IGZldGNoKHVybCwge1xuICAgICAgY2FjaGU6IFwibm8tc3RvcmVcIixcbiAgICAgIGNyZWRlbnRpYWxzOiBcIm9taXRcIixcbiAgICAgIHJlZmVycmVyUG9saWN5OiBcIm5vLXJlZmVycmVyXCIsXG4gICAgICAuLi5vcHRpb25zLFxuICAgICAgc2lnbmFsOiBjb250cm9sbGVyLnNpZ25hbCxcbiAgICB9KTtcbiAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgIGlmIChlcnJvcj8ubmFtZSA9PT0gXCJBYm9ydEVycm9yXCIpIHtcbiAgICAgIHRocm93IGNyZWF0ZUNsaWVudEVycm9yKFwibmV0d29ya1wiLCBcIlJlcXVlc3QgdGltZWQgb3V0LlwiKTtcbiAgICB9XG4gICAgdGhyb3cgY3JlYXRlQ2xpZW50RXJyb3IoXCJuZXR3b3JrXCIsIFwiTmV0d29yayByZXF1ZXN0IGZhaWxlZC5cIik7XG4gIH0gZmluYWxseSB7XG4gICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gIH1cbn07XG5cbmNvbnN0IGNsYXNzaWZ5SHR0cEVycm9yID0gKHN0YXR1czogbnVtYmVyID0gMCwgZmFsbGJhY2s6IHN0cmluZyA9IFwiR2VtaW5pIHJlcXVlc3QgZmFpbGVkLlwiKTogQ2xpZW50RXJyb3IgPT4ge1xuICBpZiAoc3RhdHVzID09PSA0MDEgfHwgc3RhdHVzID09PSA0MDMpIHtcbiAgICByZXR1cm4gY3JlYXRlQ2xpZW50RXJyb3IoXCJpbnZhbGlkX2tleVwiLCBcIkludmFsaWQgQVBJIGtleS5cIik7XG4gIH1cbiAgaWYgKHN0YXR1cyA9PT0gNDI5KSB7XG4gICAgcmV0dXJuIGNyZWF0ZUNsaWVudEVycm9yKFwicXVvdGFcIiwgXCJRdW90YSBleGNlZWRlZCBvciByYXRlIGxpbWl0ZWQuXCIpO1xuICB9XG4gIGlmICghc3RhdHVzIHx8IHN0YXR1cyA+PSA1MDApIHtcbiAgICByZXR1cm4gY3JlYXRlQ2xpZW50RXJyb3IoXCJuZXR3b3JrXCIsIFwiR2VtaW5pIHNlcnZlciBuZXR3b3JrIGVycm9yLlwiKTtcbiAgfVxuICByZXR1cm4gY3JlYXRlQ2xpZW50RXJyb3IoXCJ1bmtub3duXCIsIGZhbGxiYWNrKTtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRHZW1pbmlBcGlLZXkgPSBhc3luYyAoKTogUHJvbWlzZTxzdHJpbmc+ID0+IHtcbiAgY29uc3Qgc25hcHNob3QgPSBhd2FpdCAoY2hyb21lLnN0b3JhZ2Uuc2Vzc2lvbi5nZXQoW1wicHJvbXB0aXVtR2VtaW5pS2V5XCJdKS5jYXRjaCgoKSA9PiAoe30pKSkgYXMgYW55O1xuICByZXR1cm4gU3RyaW5nKHNuYXBzaG90Py5wcm9tcHRpdW1HZW1pbmlLZXkgfHwgXCJcIikudHJpbSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGNhbGxHZW1pbmkgPSBhc3luYyAoc3lzdGVtUHJvbXB0OiBzdHJpbmcsIHVzZXJQcm9tcHQ6IHN0cmluZywgbW9kZWxJZDogc3RyaW5nLCBrZXk/OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4gPT4ge1xuICBjb25zdCByZXNvbHZlZEtleSA9IGtleSB8fCAoYXdhaXQgZ2V0R2VtaW5pQXBpS2V5KCkpO1xuICBpZiAoIXJlc29sdmVkS2V5KSB7XG4gICAgdGhyb3cgY3JlYXRlQ2xpZW50RXJyb3IoXCJpbnZhbGlkX2tleVwiLCBcIkdlbWluaSBBUEkga2V5IGlzIG1pc3NpbmcuXCIpO1xuICB9XG5cbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB3aXRoVGltZW91dChcbiAgICBgJHtHRU1JTklfQVBJX1JPT1R9L21vZGVscy8ke21vZGVsSWR9OmdlbmVyYXRlQ29udGVudGAsXG4gICAge1xuICAgICAgbWV0aG9kOiBcIlBPU1RcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgICAgIFwieC1nb29nLWFwaS1rZXlcIjogcmVzb2x2ZWRLZXksXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBjb250ZW50czogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIHJvbGU6IFwidXNlclwiLFxuICAgICAgICAgICAgcGFydHM6IFtcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRleHQ6IFtzeXN0ZW1Qcm9tcHQsIHVzZXJQcm9tcHRdLmZpbHRlcihCb29sZWFuKS5qb2luKFwiXFxuXFxuXCIpLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgICBnZW5lcmF0aW9uQ29uZmlnOiB7XG4gICAgICAgICAgdGVtcGVyYXR1cmU6IDAuMyxcbiAgICAgICAgICBtYXhPdXRwdXRUb2tlbnM6IDkwMCxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgIH0sXG4gICk7XG5cbiAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgIHRocm93IGNsYXNzaWZ5SHR0cEVycm9yKHJlc3BvbnNlLnN0YXR1cywgXCJHZW1pbmkgcmVxdWVzdCBmYWlsZWQuXCIpO1xuICB9XG5cbiAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKS5jYXRjaCgoKSA9PiBudWxsKTtcbiAgY29uc3QgdGV4dCA9IFN0cmluZyhkYXRhPy5jYW5kaWRhdGVzPy5bMF0/LmNvbnRlbnQ/LnBhcnRzPy5bMF0/LnRleHQgfHwgXCJcIikudHJpbSgpO1xuICBpZiAoIXRleHQpIHtcbiAgICB0aHJvdyBjcmVhdGVDbGllbnRFcnJvcihcInVua25vd25cIiwgXCJHZW1pbmkgcmV0dXJuZWQgZW1wdHkgb3V0cHV0LlwiKTtcbiAgfVxuICByZXR1cm4gdGV4dDtcbn07XG5cbmV4cG9ydCBjb25zdCB2YWxpZGF0ZUdlbWluaUFwaUtleSA9IGFzeW5jIChhcGlLZXk6IHN0cmluZyk6IFByb21pc2U8VmFsaWRhdGlvblJlc3VsdD4gPT4ge1xuICBjb25zdCBrZXkgPSBTdHJpbmcoYXBpS2V5IHx8IFwiXCIpLnRyaW0oKTtcbiAgaWYgKCFrZXkpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGNhdGVnb3J5OiBcImludmFsaWRfa2V5XCIsIG1lc3NhZ2U6IFwiTWlzc2luZyBBUEkga2V5LlwiIH07XG4gIH1cblxuICB0cnkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgd2l0aFRpbWVvdXQoYCR7R0VNSU5JX0FQSV9ST09UfS9tb2RlbHNgLCB7XG4gICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICBoZWFkZXJzOiB7IFwieC1nb29nLWFwaS1rZXlcIjoga2V5IH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uub2spIHtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBjYXRlZ29yeTogXCJva1wiLCBtZXNzYWdlOiBcIkNvbm5lY3RlZFwiIH07XG4gICAgfVxuICAgIGNvbnN0IGVycm9yID0gY2xhc3NpZnlIdHRwRXJyb3IocmVzcG9uc2Uuc3RhdHVzLCBcIkdlbWluaSB2YWxpZGF0aW9uIGZhaWxlZC5cIik7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIGNhdGVnb3J5OiBlcnJvci50eXBlLFxuICAgICAgbWVzc2FnZTogZXJyb3IubWVzc2FnZSxcbiAgICAgIHN0YXR1czogcmVzcG9uc2Uuc3RhdHVzLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgY2F0ZWdvcnk6IFN0cmluZyhlcnJvcj8udHlwZSB8fCBcIm5ldHdvcmtcIiksXG4gICAgICBtZXNzYWdlOiBTdHJpbmcoZXJyb3I/Lm1lc3NhZ2UgfHwgXCJWYWxpZGF0aW9uIGZhaWxlZC5cIiksXG4gICAgfTtcbiAgfVxufTtcbiIsIi8qKlxuICogRmlsZTogYmFja2dyb3VuZC9zZXJ2aWNlX3dvcmtlci5qc1xuICogUHVycG9zZTogSW5pdGlhbGl6ZXMgc3RvcmFnZSwgY29uZmlndXJlcyBzaWRlIHBhbmVsIGJlaGF2aW9yLCBhbmQgcm91dGVzIEFJIGZlYXR1cmVzXG4gKiAgICAgICAgICBleGNsdXNpdmVseSB0aHJvdWdoIHRoZSBHZW1pbmkgQVBJIGNsaWVudC5cbiAqL1xuXG5pbXBvcnQge1xuICBQUk9WSURFUl9JRFMsXG59IGZyb20gXCIuLi91dGlscy9tb2RlbC1yZWdpc3RyeVwiO1xuaW1wb3J0IHtcbiAgZ2V0R2VtaW5pQXBpS2V5LFxuICBjYWxsR2VtaW5pLFxuICB2YWxpZGF0ZUdlbWluaUFwaUtleSBhcyB2YWxpZGF0ZUdlbWluaUFwaUtleUNsaWVudCxcbn0gZnJvbSBcIi4uL3V0aWxzL2dlbWluaS1jbGllbnRcIjtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQmFja2dyb3VuZCgoKSA9PiB7XG4gIGlmIChjaHJvbWU/LnN0b3JhZ2UgJiYgIWNocm9tZS5zdG9yYWdlLnNlc3Npb24pIHtcbiAgICBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uID0gY2hyb21lLnN0b3JhZ2UubG9jYWw7XG4gIH1cblxuLy8g4pSA4pSA4pSAIEFJIFN0YXRlIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG5jb25zdCBBSSA9IHtcbiAgc3RhdHVzOiBcImlkbGVcIiwgLy8gaWRsZSB8IHJlYWR5IHwgZmFpbGVkXG4gIHNlYXJjaE1vZGU6IFwia2V5d29yZFwiLFxufTtcblxuY29uc3QgQlJBTkRfS0VZUyA9IHtcbiAgZ2VtaW5pS2V5OiBcInByb21wdGl1bUdlbWluaUtleVwiLFxuICBzZXR0aW5nc0tleTogXCJwcm9tcHRpdW1TZXR0aW5nc1wiLFxuICBzaWRlUGFuZWxQYXlsb2FkOiBcInByb21wdGl1bVNpZGVQYW5lbFBheWxvYWRcIixcbiAgaW1wcm92ZVBheWxvYWQ6IFwicHJvbXB0aXVtSW1wcm92ZVBheWxvYWRcIixcbiAgcGVuZGluZ1NuaXBwZXQ6IFwicGVuZGluZ1NuaXBwZXRcIixcbn07XG5cbmNvbnN0IENPTlRJTlVBVElPTl9XT1JEX0xJTUlUID0gMzAwO1xuY29uc3QgQ09OVElOVUFUSU9OX0xPTkdfVEhSRVNIT0xEID0gMjA7XG5jb25zdCBDT05URVhUX01FTlVfU0FWRV9JRCA9IFwicHJvbXB0aXVtLXNhdmUtc2VsZWN0aW9uXCI7XG5cbmNvbnN0IFBST1ZJREVSX0xBQkVMUyA9IE9iamVjdC5mcmVlemUoe1xuICBnZW1pbmk6IFwiR2VtaW5pXCIsXG59KTtcbmNvbnN0IEFMTF9QUk9WSURFUl9JRFMgPSBPYmplY3QuZnJlZXplKFtcbiAgUFJPVklERVJfSURTLkdFTUlOSSxcbl0pO1xuXG5jb25zdCBub3JtYWxpemVQcm92aWRlcklkID0gKHByb3ZpZGVySWQgPSBcIlwiKSA9PiB7XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBTdHJpbmcocHJvdmlkZXJJZCB8fCBcIlwiKVxuICAgIC50cmltKClcbiAgICAudG9Mb3dlckNhc2UoKTtcbiAgcmV0dXJuIG5vcm1hbGl6ZWQgPT09IFBST1ZJREVSX0lEUy5HRU1JTkkgPyBQUk9WSURFUl9JRFMuR0VNSU5JIDogUFJPVklERVJfSURTLkdFTUlOSTtcbn07XG5cbmNvbnN0IGdldFByb3ZpZGVyTGFiZWwgPSAocHJvdmlkZXJJZCA9IFwiXCIpID0+IHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVByb3ZpZGVySWQocHJvdmlkZXJJZCk7XG4gIHJldHVybiBQUk9WSURFUl9MQUJFTFNbbm9ybWFsaXplZF0gfHwgbm9ybWFsaXplZDtcbn07XG5cbi8qKiBSZWRhY3RzIG9idmlvdXMgc2VjcmV0LWxpa2UgYW5kIFBJSSBwYXR0ZXJucyBiZWZvcmUgZXh0ZXJuYWwgQVBJIGNhbGxzLiAqL1xuY29uc3QgcmVkYWN0U2Vuc2l0aXZlVGV4dCA9ICh2YWx1ZSkgPT5cbiAgU3RyaW5nKHZhbHVlIHx8IFwiXCIpXG4gICAgLnJlcGxhY2UoL1xcYltBLVowLTkuXyUrLV0rQFtBLVowLTkuLV0rXFwuW0EtWl17Mix9XFxiL2dpLCBcIltyZWRhY3RlZC1lbWFpbF1cIilcbiAgICAucmVwbGFjZSgvXFxiKD86c2t8Z2hwX3xBSXphU3kpW0EtWmEtejAtOV9cXC1dezEyLH1cXGIvZywgXCJbcmVkYWN0ZWQtdG9rZW5dXCIpXG4gICAgLnJlcGxhY2UoL1xcYlxcZHszfVstLlxcc10/XFxkezJ9Wy0uXFxzXT9cXGR7NH1cXGIvZywgXCJbcmVkYWN0ZWQtc3NuXVwiKTtcblxuY29uc3Qgbm9ybWFsaXplQ29udGludWF0aW9uUm9sZSA9IChyb2xlKSA9PiB7XG4gIGNvbnN0IHZhbHVlID0gU3RyaW5nKHJvbGUgfHwgXCJcIilcbiAgICAudHJpbSgpXG4gICAgLnRvTG93ZXJDYXNlKCk7XG4gIGlmIChbXCJ1c2VyXCIsIFwieW91XCIsIFwiaHVtYW5cIl0uaW5jbHVkZXModmFsdWUpKSByZXR1cm4gXCJIdW1hblwiO1xuICBpZiAoW1wiYXNzaXN0YW50XCIsIFwibW9kZWxcIiwgXCJib3RcIiwgXCJhaVwiXS5pbmNsdWRlcyh2YWx1ZSkpIHJldHVybiBcIkFzc2lzdGFudFwiO1xuICByZXR1cm4gdmFsdWUuaW5jbHVkZXMoXCJ1c2VyXCIpID8gXCJIdW1hblwiIDogXCJBc3Npc3RhbnRcIjtcbn07XG5cbmNvbnN0IGxpbWl0V29yZHMgPSAodmFsdWUsIG1heFdvcmRzKSA9PiB7XG4gIGNvbnN0IHdvcmRzID0gU3RyaW5nKHZhbHVlIHx8IFwiXCIpXG4gICAgLnRyaW0oKVxuICAgIC5zcGxpdCgvXFxzKy8pXG4gICAgLmZpbHRlcihCb29sZWFuKTtcbiAgaWYgKHdvcmRzLmxlbmd0aCA8PSBtYXhXb3Jkcykge1xuICAgIHJldHVybiB3b3Jkcy5qb2luKFwiIFwiKS50cmltKCk7XG4gIH1cbiAgcmV0dXJuIGAke3dvcmRzLnNsaWNlKDAsIG1heFdvcmRzKS5qb2luKFwiIFwiKS50cmltKCl94oCmYDtcbn07XG5cbmNvbnN0IGJ1aWxkQ29udGludWF0aW9uUHJvbXB0ID0gKG1lc3NhZ2VzLCBtb2RlLCB1c2VyTm90ZSA9IFwiXCIpID0+IHtcbiAgY29uc3QgdHJhbnNjcmlwdCA9IChBcnJheS5pc0FycmF5KG1lc3NhZ2VzKSA/IG1lc3NhZ2VzIDogW10pXG4gICAgLnNsaWNlKC0yNClcbiAgICAubWFwKChtZXNzYWdlKSA9PlxuICAgICAgYCR7bm9ybWFsaXplQ29udGludWF0aW9uUm9sZShtZXNzYWdlPy5yb2xlKX06ICR7cmVkYWN0U2Vuc2l0aXZlVGV4dChtZXNzYWdlPy50ZXh0IHx8IFwiXCIpfWAudHJpbSgpLFxuICAgIClcbiAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgLmpvaW4oXCJcXG5cXG5cIik7XG5cbiAgcmV0dXJuIFtcbiAgICBcIllvdSBhcmUgaGVscGluZyBhIHVzZXIgY29udGludWUgYSBjb252ZXJzYXRpb24gaW4gYSBuZXcgY2hhdCB3aW5kb3cuXCIsXG4gICAgXCJTdW1tYXJpemUgdGhlIGZvbGxvd2luZyBjb252ZXJzYXRpb24gYXMgYSBjbGVhciBoYW5kb2ZmIGNvbnRleHQuXCIsXG4gICAgYE1vZGU6ICR7U3RyaW5nKG1vZGUgfHwgXCJGVUxMX1NVTU1BUllcIil9YCxcbiAgICBgQWRkaXRpb25hbCBub3RlIGZyb20gdXNlcjogJHtTdHJpbmcodXNlck5vdGUgfHwgXCJcIikudHJpbSgpIHx8IFwibm9uZVwifWAsXG4gICAgXCJcIixcbiAgICAnV3JpdGUgaW4gc2Vjb25kIHBlcnNvbi4gU3RhcnQgd2l0aCBcIldlIHdlcmUgd29ya2luZyBvbi4uLlwiLicsXG4gICAgYEtlZXAgaXQgdW5kZXIgJHtDT05USU5VQVRJT05fV09SRF9MSU1JVH0gd29yZHMuIEVuZCB3aXRoIFwiQ29udGludWUgZnJvbSBoZXJlOlwiLmAsXG4gICAgXCJcIixcbiAgICBcIkNvbnZlcnNhdGlvbjpcIixcbiAgICB0cmFuc2NyaXB0LFxuICBdLmpvaW4oXCJcXG5cIik7XG59O1xuXG5jb25zdCBjbGFtcFRleHQgPSAodmFsdWUsIGxpbWl0ID0gNTAwMCkgPT5cbiAgU3RyaW5nKHZhbHVlIHx8IFwiXCIpXG4gICAgLnRyaW0oKVxuICAgIC5zbGljZSgwLCBsaW1pdCk7XG5cbmNvbnN0IGRlcml2ZUZhbGxiYWNrVGl0bGUgPSAodmFsdWUpID0+IHtcbiAgY29uc3QgY29tcGFjdCA9IGNsYW1wVGV4dCh2YWx1ZSB8fCBcIlwiLCAyNDApXG4gICAgLnJlcGxhY2UoL1xccysvZywgXCIgXCIpXG4gICAgLnRyaW0oKTtcbiAgaWYgKCFjb21wYWN0KSByZXR1cm4gXCJVbnRpdGxlZCBQcm9tcHRcIjtcbiAgY29uc3QgZmlyc3RTZW50ZW5jZSA9IGNvbXBhY3Quc3BsaXQoL1suIT9dLylbMF0/LnRyaW0oKSB8fCBjb21wYWN0O1xuICByZXR1cm4gZmlyc3RTZW50ZW5jZS5zbGljZSgwLCA4MCkgfHwgXCJVbnRpdGxlZCBQcm9tcHRcIjtcbn07XG5cbmNvbnN0IHNhZmVKc29uUGFyc2UgPSAodmFsdWUpID0+IHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZSh2YWx1ZSk7XG4gIH0gY2F0Y2ggKF9lcnJvcikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59O1xuXG5jb25zdCBwYXJzZUNsYXJpdHlGcm9tVGV4dCA9IChyYXdUZXh0LCBzb3VyY2VUZXh0ID0gXCJcIikgPT4ge1xuICBjb25zdCB0ZXh0ID0gU3RyaW5nKHJhd1RleHQgfHwgXCJcIikudHJpbSgpO1xuICBjb25zdCBkaXJlY3QgPSBzYWZlSnNvblBhcnNlKHRleHQpO1xuICBjb25zdCBwYXJzZWQgPVxuICAgIGRpcmVjdCAmJiB0eXBlb2YgZGlyZWN0ID09PSBcIm9iamVjdFwiXG4gICAgICA/IGRpcmVjdFxuICAgICAgOiBzYWZlSnNvblBhcnNlKHRleHQubWF0Y2goL1xce1tcXHNcXFNdKlxcfS8pPy5bMF0gfHwgXCJcIik7XG5cbiAgY29uc3QgZmFsbGJhY2sgPSAoKCkgPT4ge1xuICAgIGNvbnN0IHNvdXJjZSA9IGNsYW1wVGV4dChzb3VyY2VUZXh0LCA0ODAwKTtcbiAgICBpZiAoIXNvdXJjZSkge1xuICAgICAgcmV0dXJuIHsgc2NvcmU6IDAsIGV4cGxhbmF0aW9uOiBcIk5vIHByb21wdCBjb250ZW50IHByb3ZpZGVkLlwiIH07XG4gICAgfVxuICAgIGNvbnN0IGhhc0dvYWwgPVxuICAgICAgLyh3cml0ZXxjcmVhdGV8Z2VuZXJhdGV8ZXhwbGFpbnxzdW1tYXJpemV8YW5hbHl6ZXxjb21wYXJlfGJ1aWxkfGRyYWZ0fG9wdGltaXplKS9pLnRlc3QoXG4gICAgICAgIHNvdXJjZSxcbiAgICAgICk7XG4gICAgY29uc3QgaGFzQ29uc3RyYWludHMgPVxuICAgICAgLyhmb3JtYXR8dG9uZXxzdHlsZXxsZW5ndGh8bWF4fG1pbnxzdGVwc3x0YWJsZXxqc29ufG1hcmtkb3dufGF1ZGllbmNlKS9pLnRlc3QoXG4gICAgICAgIHNvdXJjZSxcbiAgICAgICk7XG4gICAgbGV0IHNjb3JlID0gNDAgKyAoaGFzR29hbCA/IDIwIDogMCkgKyAoaGFzQ29uc3RyYWludHMgPyAyMCA6IDApO1xuICAgIGlmIChzb3VyY2UubGVuZ3RoID4gMTEwKSBzY29yZSArPSAxMjtcbiAgICBpZiAoL1xcW1teXFxdXStcXF0vLnRlc3Qoc291cmNlKSkgc2NvcmUgKz0gODtcbiAgICBpZiAoc291cmNlLmxlbmd0aCA+IDUyMCkgc2NvcmUgLT0gNjtcbiAgICBzY29yZSA9IE1hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgTWF0aC5yb3VuZChzY29yZSkpKTtcbiAgICBjb25zdCBleHBsYW5hdGlvbiA9XG4gICAgICBzY29yZSA+PSA3NVxuICAgICAgICA/IFwiQ2xlYXIgZ29hbCB3aXRoIHVzZWZ1bCBjb25zdHJhaW50cy5cIlxuICAgICAgICA6IHNjb3JlID49IDU1XG4gICAgICAgICAgPyBcIlJlYXNvbmFibHkgY2xlYXIsIGJ1dCBjYW4gdXNlIG1vcmUgY29uY3JldGUgY29uc3RyYWludHMuXCJcbiAgICAgICAgICA6IFwiTmVlZHMgY2xlYXJlciBnb2FsLCBjb250ZXh0LCBhbmQgb3V0cHV0IGNvbnN0cmFpbnRzLlwiO1xuICAgIHJldHVybiB7IHNjb3JlLCBleHBsYW5hdGlvbiB9O1xuICB9KSgpO1xuXG4gIGNvbnN0IHNjb3JlUmF3ID0gTnVtYmVyKHBhcnNlZD8uc2NvcmUpO1xuICBjb25zdCBzY29yZSA9IE51bWJlci5pc0Zpbml0ZShzY29yZVJhdylcbiAgICA/IE1hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgTWF0aC5yb3VuZChzY29yZVJhdykpKVxuICAgIDogZmFsbGJhY2suc2NvcmU7XG4gIGNvbnN0IGV4cGxhbmF0aW9uID1cbiAgICBTdHJpbmcocGFyc2VkPy5leHBsYW5hdGlvbiB8fCBcIlwiKS50cmltKCkgfHwgZmFsbGJhY2suZXhwbGFuYXRpb247XG5cbiAgcmV0dXJuIHsgc2NvcmUsIGV4cGxhbmF0aW9uIH07XG59O1xuXG5jb25zdCBnZXRBaVJ1bnRpbWVTZXR0aW5ncyA9IGFzeW5jICgpID0+IHtcbiAgY29uc3QgREVGQVVMVF9SVU5USU1FX1NFVFRJTkdTID0gT2JqZWN0LmZyZWV6ZSh7XG4gICAgYWN0aXZlUHJvdmlkZXI6IFwiZ2VtaW5pXCIsXG4gICAgcHJvdmlkZXJNb2RlbHM6IHtcbiAgICAgIGdlbWluaTogXCJnZW1pbmktMi4wLWZsYXNoXCIsXG4gICAgfSxcbiAgICBmZWF0dXJlRmxhZ3M6IHtcbiAgICAgIGltcHJvdmVQcm9tcHQ6IHRydWUsXG4gICAgfSxcbiAgICBmYWJQb3NpdGlvbjogXCJib3R0b20tcmlnaHRcIixcbiAgICBmYWJTdHlsZTogXCJjaXJjbGVcIixcbiAgICBjaGF0SGlnaGxpZ2h0U3R5bGU6IFwic29saWRcIixcbiAgICBmYWJCdXR0b25zOiB7XG4gICAgICBzYXZlUHJvbXB0OiB0cnVlLFxuICAgICAgZXhwb3J0Q2hhdDogdHJ1ZSxcbiAgICAgIGNvbnRpbnVlQ2hhdDogdHJ1ZSxcbiAgICAgIGxpYnJhcnk6IHRydWUsXG4gICAgfSxcbiAgICBjYXJkRGVuc2l0eTogXCJjb21mb3J0YWJsZVwiLFxuICAgIGRlZmF1bHRFeHBvcnRGb3JtYXQ6IFwibWFya2Rvd25cIixcbiAgICBvbmJvYXJkaW5nQ29tcGxldGU6IGZhbHNlLFxuICAgIHRoZW1lOiBcImRhcmtcIixcbiAgfSk7XG5cbiAgY29uc3QgYXNPYmplY3QgPSAodmFsdWUpID0+XG4gICAgdmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiID8gdmFsdWUgOiB7fTtcblxuICBjb25zdCBub3JtYWxpemVGYWJQb3NpdGlvbiA9ICh2YWx1ZSA9IFwiXCIpID0+IHtcbiAgICBjb25zdCByYXcgPSBTdHJpbmcodmFsdWUgfHwgXCJcIikudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgcmV0dXJuIHJhdyA9PT0gXCJsZWZ0XCIgfHwgcmF3ID09PSBcImJvdHRvbS1sZWZ0XCJcbiAgICAgID8gXCJib3R0b20tbGVmdFwiXG4gICAgICA6IFwiYm90dG9tLXJpZ2h0XCI7XG4gIH07XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBzbmFwc2hvdCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbQlJBTkRfS0VZUy5zZXR0aW5nc0tleV0pO1xuICAgIGNvbnN0IHNvdXJjZSA9IGFzT2JqZWN0KHNuYXBzaG90Py5bQlJBTkRfS0VZUy5zZXR0aW5nc0tleV0pO1xuICAgIHJldHVybiB7XG4gICAgICAuLi5ERUZBVUxUX1JVTlRJTUVfU0VUVElOR1MsXG4gICAgICBwcm92aWRlck1vZGVsczoge1xuICAgICAgICBnZW1pbmk6IFN0cmluZyhzb3VyY2UucHJvdmlkZXJNb2RlbHM/LmdlbWluaSB8fCBcImdlbWluaS0yLjAtZmxhc2hcIikudHJpbSgpLFxuICAgICAgfSxcbiAgICAgIGZlYXR1cmVGbGFnczoge1xuICAgICAgICBpbXByb3ZlUHJvbXB0OiBzb3VyY2UuZmVhdHVyZUZsYWdzPy5pbXByb3ZlUHJvbXB0ICE9PSBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBmYWJQb3NpdGlvbjogbm9ybWFsaXplRmFiUG9zaXRpb24oc291cmNlLmZhYlBvc2l0aW9uKSxcbiAgICAgIGZhYlN0eWxlOiBTdHJpbmcoc291cmNlLmZhYlN0eWxlIHx8IFwiY2lyY2xlXCIpLnRyaW0oKS50b0xvd2VyQ2FzZSgpLFxuICAgICAgY2hhdEhpZ2hsaWdodFN0eWxlOiBTdHJpbmcoc291cmNlLmNoYXRIaWdobGlnaHRTdHlsZSB8fCBcInNvbGlkXCIpLnRyaW0oKS50b0xvd2VyQ2FzZSgpLFxuICAgICAgZmFiQnV0dG9uczoge1xuICAgICAgICBzYXZlUHJvbXB0OiBzb3VyY2UuZmFiQnV0dG9ucz8uc2F2ZVByb21wdCAhPT0gZmFsc2UsXG4gICAgICAgIGV4cG9ydENoYXQ6IHNvdXJjZS5mYWJCdXR0b25zPy5leHBvcnRDaGF0ICE9PSBmYWxzZSxcbiAgICAgICAgY29udGludWVDaGF0OiBzb3VyY2UuZmFiQnV0dG9ucz8uY29udGludWVDaGF0ICE9PSBmYWxzZSxcbiAgICAgICAgbGlicmFyeTogc291cmNlLmZhYkJ1dHRvbnM/LmxpYnJhcnkgIT09IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIGNhcmREZW5zaXR5OiBTdHJpbmcoc291cmNlLmNhcmREZW5zaXR5IHx8IFwiY29tZm9ydGFibGVcIikudHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09IFwiY29tcGFjdFwiID8gXCJjb21wYWN0XCIgOiBcImNvbWZvcnRhYmxlXCIsXG4gICAgICBkZWZhdWx0RXhwb3J0Rm9ybWF0OiBTdHJpbmcoc291cmNlLmRlZmF1bHRFeHBvcnRGb3JtYXQgfHwgXCJtYXJrZG93blwiKS50cmltKCkudG9Mb3dlckNhc2UoKSxcbiAgICAgIG9uYm9hcmRpbmdDb21wbGV0ZTogc291cmNlLm9uYm9hcmRpbmdDb21wbGV0ZSA9PT0gdHJ1ZSxcbiAgICAgIHRoZW1lOiBTdHJpbmcoc291cmNlLnRoZW1lIHx8IFwiZGFya1wiKS50cmltKCkudG9Mb3dlckNhc2UoKSA9PT0gXCJsaWdodFwiID8gXCJsaWdodFwiIDogXCJkYXJrXCIsXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICByZXR1cm4gREVGQVVMVF9SVU5USU1FX1NFVFRJTkdTO1xuICB9XG59O1xuXG5jb25zdCBydW5XaXRoQ29uZmlndXJlZEJhY2tlbmQgPSBhc3luYyAoe1xuICBmZWF0dXJlID0gXCJcIixcbiAgaW5wdXRUZXh0ID0gXCJcIixcbiAgY2xvdWRUYXNrLFxuICBmb3JjZVByb3ZpZGVyID0gXCJcIixcbiAgZm9yY2VHZW1pbmkgPSBmYWxzZSxcbiAgZ2VtaW5pQXBpS2V5ID0gXCJcIixcbiAgbm9DbG91ZE1lc3NhZ2UgPSBcIkdlbWluaSBBUEkga2V5IGlzIG5vdCBjb25maWd1cmVkLlwiLFxuICBub0dlbWluaU1lc3NhZ2UgPSBcIkdlbWluaSBBUEkga2V5IGlzIG5vdCBjb25maWd1cmVkLlwiLFxufSkgPT4ge1xuICBjb25zdCBydW50aW1lID0gYXdhaXQgZ2V0QWlSdW50aW1lU2V0dGluZ3MoKTtcbiAgY29uc3QgYXBpS2V5ID0gU3RyaW5nKGdlbWluaUFwaUtleSB8fCAoYXdhaXQgZ2V0R2VtaW5pQXBpS2V5KCkpIHx8IFwiXCIpLnRyaW0oKTtcbiAgaWYgKCFhcGlLZXkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3Iobm9HZW1pbmlNZXNzYWdlKTtcbiAgfVxuICBjb25zdCBtb2RlbElkID0gU3RyaW5nKHJ1bnRpbWUucHJvdmlkZXJNb2RlbHM/LmdlbWluaSB8fCBcImdlbWluaS0yLjAtZmxhc2hcIikudHJpbSgpO1xuXG4gIGlmICh0eXBlb2YgY2xvdWRUYXNrICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIHRhc2suXCIpO1xuICB9XG5cbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2xvdWRUYXNrKHtcbiAgICBwcm92aWRlcklkOiBcImdlbWluaVwiLFxuICAgIGFwaUtleSxcbiAgICBtb2RlbElkLFxuICAgIHJ1bnRpbWUsXG4gIH0pO1xuXG4gIHJldHVybiB7IG9rOiB0cnVlLCBiYWNrZW5kOiBcImdlbWluaVwiLCAuLi4ocmVzdWx0IHx8IHt9KSB9O1xufTtcblxuY29uc3QgbWFwVmFsaWRhdGlvblJlc3VsdFRvTGVnYWN5ID0gKHJlc3VsdCA9IHt9KSA9PiB7XG4gIGlmIChyZXN1bHQ/Lm9rKSByZXR1cm4geyBvazogdHJ1ZSB9O1xuICBjb25zdCBjYXRlZ29yeSA9IFN0cmluZyhyZXN1bHQ/LmNhdGVnb3J5IHx8IFwiXCIpXG4gICAgLnRyaW0oKVxuICAgIC50b0xvd2VyQ2FzZSgpO1xuICBpZiAoY2F0ZWdvcnkgPT09IFwiaW52YWxpZF9rZXlcIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGtleS5cIiB9O1xuICBpZiAoY2F0ZWdvcnkgPT09IFwicmF0ZV9saW1pdGVkXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiUmF0ZSBsaW1pdGVkLlwiIH07XG4gIGlmIChjYXRlZ29yeSA9PT0gXCJuZXR3b3JrX2Vycm9yXCIpXG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJOZXR3b3JrIGVycm9yLlwiIH07XG4gIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhyZXN1bHQ/Lm1lc3NhZ2UgfHwgXCJQcm92aWRlciBlcnJvci5cIikgfTtcbn07XG5cbmNvbnN0IHZhbGlkYXRlR2VtaW5pQXBpS2V5ID0gYXN5bmMgKHJhd0tleSkgPT4ge1xuICBjb25zdCBrZXkgPSBTdHJpbmcocmF3S2V5IHx8IFwiXCIpLnRyaW0oKTtcbiAgaWYgKCFrZXkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiTWlzc2luZyBBUEkga2V5LlwiIH07XG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHZhbGlkYXRlR2VtaW5pQXBpS2V5Q2xpZW50KGtleSk7XG4gIHJldHVybiBtYXBWYWxpZGF0aW9uUmVzdWx0VG9MZWdhY3kocmVzdWx0KTtcbn07XG5cbmZ1bmN0aW9uIGJyb2FkY2FzdChtZXNzYWdlKSB7XG4gIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKG1lc3NhZ2UpLmNhdGNoKCgpID0+IHtcbiAgICAvLyBTaWRlIHBhbmVsIG1heSBiZSBjbG9zZWQg4oCUIGlnbm9yZSBzaWxlbnRseVxuICB9KTtcbn1cblxuY29uc3QgY2FsbFByb3ZpZGVyVGV4dFRhc2sgPSBhc3luYyAoe1xuICBwcm92aWRlcklkID0gUFJPVklERVJfSURTLkdFTUlOSSxcbiAgYXBpS2V5ID0gXCJcIixcbiAgbW9kZWxJZCA9IFwiXCIsXG4gIHN5c3RlbVByb21wdCA9IFwiXCIsXG4gIHVzZXJQcm9tcHQgPSBcIlwiLFxufSA9IHt9KSA9PiB7XG4gIGNvbnN0IHJlc29sdmVkTW9kZWxJZCA9IG1vZGVsSWQgfHwgXCJnZW1pbmktMi4wLWZsYXNoXCI7XG4gIGNvbnN0IHRleHQgPSBhd2FpdCBjYWxsR2VtaW5pKFxuICAgIFN0cmluZyhzeXN0ZW1Qcm9tcHQgfHwgXCJcIikudHJpbSgpLFxuICAgIFN0cmluZyh1c2VyUHJvbXB0IHx8IFwiXCIpLnRyaW0oKSxcbiAgICByZXNvbHZlZE1vZGVsSWQsXG4gICAgYXBpS2V5XG4gICk7XG4gIHJldHVybiBTdHJpbmcodGV4dCB8fCBcIlwiKS50cmltKCk7XG59O1xuXG5jb25zdCBzdWdnZXN0VGFnc1ZpYUNsb3VkU3RyaWN0ID0gYXN5bmMgKHtcbiAgcHJvdmlkZXJJZCxcbiAgYXBpS2V5LFxuICBtb2RlbElkLFxuICBwcm9tcHRUZXh0LFxufSkgPT4ge1xuICBjb25zdCBzb3VyY2UgPSBjbGFtcFRleHQocHJvbXB0VGV4dCwgMjIwMCk7XG4gIGlmICghc291cmNlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiRW1wdHkgcHJvbXB0IHRleHQgcHJvdmlkZWQuXCIpO1xuICB9XG5cbiAgY29uc3Qgc3lzdGVtUHJvbXB0ID0gW1xuICAgIFwiU3VnZ2VzdCAyLTMgc2hvcnQgbG93ZXJjYXNlIHRhZ3MgZm9yIHRoaXMgcHJvbXB0LlwiLFxuICAgICdSZXR1cm4gc3RyaWN0IEpTT04gYXJyYXkgb25seSwgZS5nLiBbXCJjb2RpbmdcIixcImRlYnVnZ2luZ1wiXS4nLFxuICAgIFwiTm8gcHJvc2UuXCIsXG4gIF0uam9pbihcIlxcblwiKTtcbiAgY29uc3QgcmF3VGV4dCA9IGF3YWl0IGNhbGxQcm92aWRlclRleHRUYXNrKHtcbiAgICBwcm92aWRlcklkLFxuICAgIG1vZGVsSWQsXG4gICAgYXBpS2V5LFxuICAgIHN5c3RlbVByb21wdCxcbiAgICB1c2VyUHJvbXB0OiBgUHJvbXB0OlxcbiR7c291cmNlfWAsXG4gIH0pO1xuICBjb25zdCB0YWdzID0gcGFyc2VUYWdzRnJvbU1vZGVsVGV4dChyYXdUZXh0KTtcbiAgcmV0dXJuIHsgdGFncyB9O1xufTtcblxuY29uc3QgVEFHX0RFRklOSVRJT05TID0ge1xuICBjb2Rpbmc6IFwid3JpdGUgY29kZSwgcHJvZ3JhbW1pbmcsIGRlYnVnLCBmaXggYnVnLCBmdW5jdGlvbiwgYWxnb3JpdGhtXCIsXG4gIHdyaXRpbmc6IFwid3JpdGUgZXNzYXksIGltcHJvdmUgdGV4dCwgZWRpdCwgcHJvb2ZyZWFkLCBncmFtbWFyLCBkcmFmdFwiLFxuICBleHBsYWluOiBcImV4cGxhaW4gY29uY2VwdCwgc2ltcGxpZnksIHRlYWNoLCB3aGF0IGlzLCBob3cgZG9lcywgRUxJNVwiLFxuICByZXNlYXJjaDogXCJyZXNlYXJjaCwgc3VtbWFyaXplLCBhbmFseXplLCBmaW5kIGluZm9ybWF0aW9uLCBjb21wYXJlXCIsXG4gIGNyZWF0aXZlOiBcImNyZWF0aXZlIHdyaXRpbmcsIHN0b3J5LCBwb2VtLCBicmFpbnN0b3JtLCBpZGVhcywgaW1hZ2luZVwiLFxuICBwbGFubmluZzogXCJwbGFuLCBvcmdhbml6ZSwgc2NoZWR1bGUsIHN0ZXBzLCBvdXRsaW5lLCBzdHJhdGVneSwgdGFza3NcIixcbiAgZGF0YTogXCJkYXRhIGFuYWx5c2lzLCB0YWJsZSwgc3ByZWFkc2hlZXQsIG51bWJlcnMsIHN0YXRpc3RpY3MsIFNRTFwiLFxuICB0cmFuc2xhdGU6IFwidHJhbnNsYXRlLCBsYW5ndWFnZSwgY29udmVydCwgbG9jYWxpemVcIixcbn07XG5cbmNvbnN0IHN1Z2dlc3RUYWdzSGV1cmlzdGljID0gKHByb21wdFRleHQsIG1heENvdW50ID0gMykgPT4ge1xuICBjb25zdCBub3JtYWxpemVkID0gU3RyaW5nKHByb21wdFRleHQgfHwgXCJcIikudG9Mb3dlckNhc2UoKTtcbiAgaWYgKCFub3JtYWxpemVkKSByZXR1cm4gW107XG5cbiAgY29uc3Qgc2NvcmVkID0gT2JqZWN0LmVudHJpZXMoVEFHX0RFRklOSVRJT05TKVxuICAgIC5tYXAoKFt0YWcsIGRlZmluaXRpb25dKSA9PiB7XG4gICAgICBjb25zdCBrZXl3b3JkcyA9IFN0cmluZyhkZWZpbml0aW9uIHx8IFwiXCIpXG4gICAgICAgIC50b0xvd2VyQ2FzZSgpXG4gICAgICAgIC5zcGxpdChcIixcIilcbiAgICAgICAgLm1hcCgodmFsdWUpID0+IHZhbHVlLnRyaW0oKSlcbiAgICAgICAgLmZpbHRlcihCb29sZWFuKTtcbiAgICAgIGNvbnN0IHNjb3JlID0ga2V5d29yZHMucmVkdWNlKFxuICAgICAgICAoc3VtLCBrZXl3b3JkKSA9PiAobm9ybWFsaXplZC5pbmNsdWRlcyhrZXl3b3JkKSA/IHN1bSArIDEgOiBzdW0pLFxuICAgICAgICAwLFxuICAgICAgKTtcbiAgICAgIHJldHVybiB7IHRhZywgc2NvcmUgfTtcbiAgICB9KVxuICAgIC5maWx0ZXIoKGVudHJ5KSA9PiBlbnRyeS5zY29yZSA+IDApXG4gICAgLnNvcnQoKGxlZnQsIHJpZ2h0KSA9PiByaWdodC5zY29yZSAtIGxlZnQuc2NvcmUpXG4gICAgLnNsaWNlKDAsIG1heENvdW50KVxuICAgIC5tYXAoKGVudHJ5KSA9PiBlbnRyeS50YWcpO1xuXG4gIHJldHVybiBzY29yZWQ7XG59O1xuXG5jb25zdCBwYXJzZVRhZ3NGcm9tTW9kZWxUZXh0ID0gKHRleHQpID0+IHtcbiAgY29uc3QgcmF3ID0gU3RyaW5nKHRleHQgfHwgXCJcIikudHJpbSgpO1xuICBpZiAoIXJhdykgcmV0dXJuIFtdO1xuXG4gIGNvbnN0IHBhcnNlZEpzb24gPVxuICAgIHNhZmVKc29uUGFyc2UocmF3KSB8fCBzYWZlSnNvblBhcnNlKHJhdy5tYXRjaCgvXFxbW1xcc1xcU10qXFxdLyk/LlswXSB8fCBcIlwiKTtcbiAgaWYgKEFycmF5LmlzQXJyYXkocGFyc2VkSnNvbikpIHtcbiAgICByZXR1cm4gcGFyc2VkSnNvblxuICAgICAgLm1hcCgoaXRlbSkgPT5cbiAgICAgICAgU3RyaW5nKGl0ZW0gfHwgXCJcIilcbiAgICAgICAgICAudG9Mb3dlckNhc2UoKVxuICAgICAgICAgIC50cmltKCksXG4gICAgICApXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAuc2xpY2UoMCwgMyk7XG4gIH1cblxuICByZXR1cm4gcmF3XG4gICAgLnNwbGl0KC9bLHxcXG5dLylcbiAgICAubWFwKChpdGVtKSA9PlxuICAgICAgU3RyaW5nKGl0ZW0gfHwgXCJcIilcbiAgICAgICAgLnRvTG93ZXJDYXNlKClcbiAgICAgICAgLnJlcGxhY2UoL1teYS16MC05LV9dL2csIFwiXCIpXG4gICAgICAgIC50cmltKCksXG4gICAgKVxuICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAuc2xpY2UoMCwgMyk7XG59O1xuXG5hc3luYyBmdW5jdGlvbiBzdWdnZXN0VGFncyhwcm9tcHRUZXh0KSB7XG4gIGNvbnN0IHNvdXJjZSA9IGNsYW1wVGV4dChwcm9tcHRUZXh0LCAyNjAwKTtcbiAgaWYgKCFzb3VyY2UpXG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCB0YWdzOiBbXSwgZXJyb3I6IFwiUHJvbXB0IHRleHQgaXMgcmVxdWlyZWQuXCIgfTtcblxuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bldpdGhDb25maWd1cmVkQmFja2VuZCh7XG4gICAgICBmZWF0dXJlOiBcImF1dG9UYWdzXCIsXG4gICAgICBpbnB1dFRleHQ6IHNvdXJjZSxcbiAgICAgIGNsb3VkVGFzazogKHsgcHJvdmlkZXJJZCwgYXBpS2V5LCBtb2RlbElkIH0pID0+XG4gICAgICAgIHN1Z2dlc3RUYWdzVmlhQ2xvdWRTdHJpY3Qoe1xuICAgICAgICAgIHByb3ZpZGVySWQsXG4gICAgICAgICAgYXBpS2V5LFxuICAgICAgICAgIG1vZGVsSWQsXG4gICAgICAgICAgcHJvbXB0VGV4dDogc291cmNlLFxuICAgICAgICB9KSxcbiAgICAgIG5vQ2xvdWRNZXNzYWdlOiBcIk5vIGNsb3VkIEFQSSBrZXkgZm91bmQgaW4gU2V0dGluZ3MuXCIsXG4gICAgfSk7XG5cbiAgICBjb25zdCB0YWdzID0gQXJyYXkuaXNBcnJheShyZXN1bHQ/LnRhZ3MpXG4gICAgICA/IHJlc3VsdC50YWdzXG4gICAgICAgICAgLm1hcCgodGFnKSA9PlxuICAgICAgICAgICAgU3RyaW5nKHRhZyB8fCBcIlwiKVxuICAgICAgICAgICAgICAudHJpbSgpXG4gICAgICAgICAgICAgIC50b0xvd2VyQ2FzZSgpLFxuICAgICAgICAgIClcbiAgICAgICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAgICAgLnNsaWNlKDAsIDMpXG4gICAgICA6IFtdO1xuICAgIGNvbnN0IGZhbGxiYWNrVGFncyA9IHN1Z2dlc3RUYWdzSGV1cmlzdGljKHNvdXJjZSwgMyk7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiB0cnVlLFxuICAgICAgdGFnczogdGFncy5sZW5ndGggPyB0YWdzIDogZmFsbGJhY2tUYWdzLFxuICAgICAgYmFja2VuZDogXCJnZW1pbmlcIixcbiAgICB9O1xuICB9IGNhdGNoIChfZXJyb3IpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IHRydWUsXG4gICAgICB0YWdzOiBzdWdnZXN0VGFnc0hldXJpc3RpYyhzb3VyY2UsIDMpLFxuICAgICAgYmFja2VuZDogXCJmYWxsYmFja1wiLFxuICAgIH07XG4gIH1cbn1cblxuLy8g4pSA4pSA4pSAIEFJIEZlYXR1cmU6IER1cGxpY2F0ZSBEZXRlY3Rpb24g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbmNvbnN0IG5vcm1hbGl6ZUR1cGxpY2F0ZVZhbHVlID0gKHZhbHVlKSA9PlxuICBTdHJpbmcodmFsdWUgfHwgXCJcIilcbiAgICAudG9Mb3dlckNhc2UoKVxuICAgIC5yZXBsYWNlKC9bXlxcd1xcc10rL2csIFwiIFwiKVxuICAgIC5yZXBsYWNlKC9cXHMrL2csIFwiIFwiKVxuICAgIC50cmltKCk7XG5cbmNvbnN0IGJ1aWxkRHVwbGljYXRlQ2FuZGlkYXRlID0gKHRpdGxlLCB0ZXh0KSA9PiB7XG4gIGNvbnN0IHRyaW1tZWRUZXh0ID0gU3RyaW5nKHRleHQgfHwgXCJcIikuc2xpY2UoMCwgODApO1xuICByZXR1cm4gYCR7bm9ybWFsaXplRHVwbGljYXRlVmFsdWUodGl0bGUpfVxcbiR7bm9ybWFsaXplRHVwbGljYXRlVmFsdWUodHJpbW1lZFRleHQpfWAudHJpbSgpO1xufTtcblxuY29uc3QgbGV2ZW5zaHRlaW5EaXN0YW5jZSA9IChsZWZ0LCByaWdodCkgPT4ge1xuICBjb25zdCBhID0gU3RyaW5nKGxlZnQgfHwgXCJcIik7XG4gIGNvbnN0IGIgPSBTdHJpbmcocmlnaHQgfHwgXCJcIik7XG4gIGNvbnN0IHJvd3MgPSBhLmxlbmd0aCArIDE7XG4gIGNvbnN0IGNvbHMgPSBiLmxlbmd0aCArIDE7XG4gIGNvbnN0IGRwID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogcm93cyB9LCAoKSA9PiBBcnJheShjb2xzKS5maWxsKDApKTtcblxuICBmb3IgKGxldCBpID0gMDsgaSA8IHJvd3M7IGkgKz0gMSkgZHBbaV1bMF0gPSBpO1xuICBmb3IgKGxldCBqID0gMDsgaiA8IGNvbHM7IGogKz0gMSkgZHBbMF1bal0gPSBqO1xuXG4gIGZvciAobGV0IGkgPSAxOyBpIDwgcm93czsgaSArPSAxKSB7XG4gICAgZm9yIChsZXQgaiA9IDE7IGogPCBjb2xzOyBqICs9IDEpIHtcbiAgICAgIGNvbnN0IGNvc3QgPSBhW2kgLSAxXSA9PT0gYltqIC0gMV0gPyAwIDogMTtcbiAgICAgIGRwW2ldW2pdID0gTWF0aC5taW4oXG4gICAgICAgIGRwW2kgLSAxXVtqXSArIDEsXG4gICAgICAgIGRwW2ldW2ogLSAxXSArIDEsXG4gICAgICAgIGRwW2kgLSAxXVtqIC0gMV0gKyBjb3N0LFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZHBbcm93cyAtIDFdW2NvbHMgLSAxXTtcbn07XG5cbmNvbnN0IGR1cGxpY2F0ZVNpbWlsYXJpdHkgPSAobGVmdCwgcmlnaHQpID0+IHtcbiAgY29uc3QgYSA9IFN0cmluZyhsZWZ0IHx8IFwiXCIpO1xuICBjb25zdCBiID0gU3RyaW5nKHJpZ2h0IHx8IFwiXCIpO1xuICBjb25zdCBtYXhMZW4gPSBNYXRoLm1heChhLmxlbmd0aCwgYi5sZW5ndGgpO1xuICBpZiAoIW1heExlbikgcmV0dXJuIDE7XG4gIHJldHVybiAxIC0gbGV2ZW5zaHRlaW5EaXN0YW5jZShhLCBiKSAvIG1heExlbjtcbn07XG5cbmFzeW5jIGZ1bmN0aW9uIGNoZWNrRHVwbGljYXRlKHByb21wdFRleHQsIGV4Y2x1ZGVJZCA9IG51bGwpIHtcbiAgY29uc3QgeyBwcm9tcHRzID0gW10gfSA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcInByb21wdHNcIik7XG4gIGNvbnN0IHBheWxvYWQgPVxuICAgIHByb21wdFRleHQgJiYgdHlwZW9mIHByb21wdFRleHQgPT09IFwib2JqZWN0XCJcbiAgICAgID8gcHJvbXB0VGV4dFxuICAgICAgOiB7IHRpdGxlOiBcIlwiLCB0ZXh0OiBTdHJpbmcocHJvbXB0VGV4dCB8fCBcIlwiKSB9O1xuICBjb25zdCB0YXJnZXQgPSBidWlsZER1cGxpY2F0ZUNhbmRpZGF0ZShcbiAgICBwYXlsb2FkPy50aXRsZSB8fCBcIlwiLFxuICAgIHBheWxvYWQ/LnRleHQgfHwgXCJcIixcbiAgKTtcbiAgaWYgKCF0YXJnZXQpIHJldHVybiBudWxsO1xuXG4gIGxldCBiZXN0UHJvbXB0ID0gbnVsbDtcbiAgbGV0IGJlc3RTY29yZSA9IDA7XG5cbiAgZm9yIChjb25zdCBwcm9tcHQgb2YgcHJvbXB0cykge1xuICAgIGlmIChwcm9tcHQuaWQgPT09IGV4Y2x1ZGVJZCkgY29udGludWU7XG4gICAgY29uc3QgY2FuZGlkYXRlID0gYnVpbGREdXBsaWNhdGVDYW5kaWRhdGUoXG4gICAgICBwcm9tcHQ/LnRpdGxlIHx8IFwiXCIsXG4gICAgICBwcm9tcHQ/LnRleHQgfHwgXCJcIixcbiAgICApO1xuICAgIGlmICghY2FuZGlkYXRlKSBjb250aW51ZTtcbiAgICBjb25zdCBzY29yZSA9IGR1cGxpY2F0ZVNpbWlsYXJpdHkodGFyZ2V0LCBjYW5kaWRhdGUpO1xuICAgIGlmIChzY29yZSA+IGJlc3RTY29yZSkge1xuICAgICAgYmVzdFNjb3JlID0gc2NvcmU7XG4gICAgICBiZXN0UHJvbXB0ID0gcHJvbXB0O1xuICAgIH1cbiAgfVxuXG4gIGlmIChiZXN0UHJvbXB0ICYmIGJlc3RTY29yZSA+IDAuODUpIHtcbiAgICByZXR1cm4geyBwcm9tcHQ6IGJlc3RQcm9tcHQsIHNjb3JlOiBiZXN0U2NvcmUgfTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuLy8g4pSA4pSA4pSAIEFJIEZlYXR1cmU6IFNtYXJ0IFN1Z2dlc3Rpb25zIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG5hc3luYyBmdW5jdGlvbiBnZXRTbWFydFN1Z2dlc3Rpb25zKGNvbnZlcnNhdGlvblRleHQpIHtcbiAgaWYgKCFjb252ZXJzYXRpb25UZXh0IHx8IGNvbnZlcnNhdGlvblRleHQubGVuZ3RoIDwgMzApIHJldHVybiBudWxsO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgeyBwcm9tcHRzID0gW10gfSA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcInByb21wdHNcIik7XG4gICAgaWYgKCFwcm9tcHRzLmxlbmd0aCkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBwcm9tcHRMaXN0ID0gcHJvbXB0c1xuICAgICAgLnNsaWNlKDAsIDMwKVxuICAgICAgLm1hcChcbiAgICAgICAgKHAsIGkpID0+XG4gICAgICAgICAgYCR7aSArIDF9LiBbJHtwLmlkfV0gXCIke3AudGl0bGV9XCIke3AudGFncz8ubGVuZ3RoID8gYCAodGFnczogJHtwLnRhZ3Muam9pbihcIiwgXCIpfSlgIDogXCJcIn1gLFxuICAgICAgKVxuICAgICAgLmpvaW4oXCJcXG5cIik7XG5cbiAgICBjb25zdCBzeXN0ZW1Qcm9tcHQgPVxuICAgICAgJ1lvdSBhcmUgYSBwcm9tcHQgc3VnZ2VzdGlvbiBlbmdpbmUuIEdpdmVuIGEgY29udmVyc2F0aW9uIHNuaXBwZXQgYW5kIGEgbnVtYmVyZWQgbGlzdCBvZiBzYXZlZCBwcm9tcHRzLCByZXR1cm4gdGhlIElEcyBvZiB0aGUgdG9wIDMgbW9zdCByZWxldmFudCBwcm9tcHRzLiBSZXBseSBPTkxZIHdpdGggYSBKU09OIGFycmF5IG9mIElEIHN0cmluZ3MsIGUuZy4gW1wiaWQxXCIsXCJpZDJcIixcImlkM1wiXS4gSWYgbm9uZSBhcmUgcmVsZXZhbnQsIHJlcGx5IFtdLic7XG5cbiAgICBjb25zdCBzYWZlQ29udmVyc2F0aW9uID0gcmVkYWN0U2Vuc2l0aXZlVGV4dChjb252ZXJzYXRpb25UZXh0KS5zbGljZShcbiAgICAgIDAsXG4gICAgICA2MDAsXG4gICAgKTtcbiAgICBjb25zdCB1c2VyTWVzc2FnZSA9IGBDb252ZXJzYXRpb246XFxuJHtzYWZlQ29udmVyc2F0aW9ufVxcblxcblNhdmVkIHByb21wdHM6XFxuJHtwcm9tcHRMaXN0fWA7XG5cbiAgICBjb25zdCByb3V0ZWQgPSBhd2FpdCBydW5XaXRoQ29uZmlndXJlZEJhY2tlbmQoe1xuICAgICAgZmVhdHVyZTogXCJzdWdnZXN0aW9uc1wiLFxuICAgICAgaW5wdXRUZXh0OiB1c2VyTWVzc2FnZSxcbiAgICAgIGNsb3VkVGFzazogKHsgcHJvdmlkZXJJZCwgYXBpS2V5LCBtb2RlbElkIH0pID0+XG4gICAgICAgIGNhbGxQcm92aWRlclRleHRUYXNrKHtcbiAgICAgICAgICBwcm92aWRlcklkLFxuICAgICAgICAgIG1vZGVsSWQsXG4gICAgICAgICAgYXBpS2V5LFxuICAgICAgICAgIHN5c3RlbVByb21wdCxcbiAgICAgICAgICB1c2VyUHJvbXB0OiB1c2VyTWVzc2FnZSxcbiAgICAgICAgfSkudGhlbigodGV4dCkgPT4gKHsgdGV4dCB9KSksXG4gICAgICBub0Nsb3VkTWVzc2FnZTogXCJObyBjbG91ZCBBUEkga2V5IGZvdW5kIGluIFNldHRpbmdzLlwiLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdGV4dFJlc3VsdCA9IFN0cmluZyhyb3V0ZWQ/LnRleHQgfHwgXCJcIikudHJpbSgpO1xuICAgIGlmICghdGV4dFJlc3VsdCkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBtYXRjaCA9IHRleHRSZXN1bHQubWF0Y2goL1xcW1tcXHNcXFNdKj9cXF0vKTtcbiAgICBpZiAoIW1hdGNoKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IGlkcyA9IEpTT04ucGFyc2UobWF0Y2hbMF0pO1xuICAgIGlmICghQXJyYXkuaXNBcnJheShpZHMpKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IHByb21wdElkU2V0ID0gbmV3IFNldChwcm9tcHRzLm1hcCgocCkgPT4gcC5pZCkpO1xuICAgIGNvbnN0IHZhbGlkSWRzID0gaWRzLmZpbHRlcigoaWQpID0+IHByb21wdElkU2V0LmhhcyhpZCkpLnNsaWNlKDAsIDMpO1xuXG4gICAgcmV0dXJuIHZhbGlkSWRzLmxlbmd0aCA+IDAgPyB2YWxpZElkcyA6IG51bGw7XG4gIH0gY2F0Y2ggKF8pIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG4vLyDilIDilIDilIAgQUkgRmVhdHVyZTogQUkgUHJvbXB0IEltcHJvdmVtZW50LCBQYXJhcGhyYXNlLCBUaXRsZSwgQ2xhcml0eSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuYXN5bmMgZnVuY3Rpb24gaW1wcm92ZVByb21wdFZpYUNsb3VkU3RyaWN0KHtcbiAgcHJvdmlkZXJJZCxcbiAgYXBpS2V5LFxuICBtb2RlbElkLFxuICB0ZXh0LFxuICB0YWdzID0gW10sXG4gIHN0eWxlID0gXCJnZW5lcmFsXCIsXG59KSB7XG4gIGlmICghdGV4dCB8fCB0ZXh0LnRyaW0oKS5sZW5ndGggPT09IDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJFbXB0eSBwcm9tcHQgdGV4dCBwcm92aWRlZC5cIik7XG4gIH1cblxuICBsZXQgc3R5bGVJbnN0cnVjdGlvbiA9XG4gICAgXCJNYWtlIGl0IGNsZWFyLCBjb25jaXNlLCBhbmQgaGlnaGx5IGVmZmVjdGl2ZSBmb3IgYW4gQUkuXCI7XG4gIGlmIChzdHlsZSA9PT0gXCJjb2RpbmdcIikge1xuICAgIHN0eWxlSW5zdHJ1Y3Rpb24gPVxuICAgICAgXCJPcHRpbWl6ZSBmb3Igc29mdHdhcmUgZW5naW5lZXJpbmcuIEFzayBmb3IgY29kZSBzbmlwcGV0cywgYXJjaGl0ZWN0dXJlIGRldGFpbHMsIGFuZCBlZGdlIGNhc2UgaGFuZGxpbmcuXCI7XG4gIH0gZWxzZSBpZiAoc3R5bGUgPT09IFwic3R1ZHlcIikge1xuICAgIHN0eWxlSW5zdHJ1Y3Rpb24gPVxuICAgICAgXCJPcHRpbWl6ZSBmb3IgbGVhcm5pbmcgYW5kIHN1bW1hcml6YXRpb24uIEFzayBmb3IgY2xlYXIgZXhwbGFuYXRpb25zLCBhbmFsb2dpZXMsIGFuZCBzdGVwLWJ5LXN0ZXAgYnJlYWtkb3ducy5cIjtcbiAgfSBlbHNlIGlmIChzdHlsZSA9PT0gXCJjcmVhdGl2ZVwiKSB7XG4gICAgc3R5bGVJbnN0cnVjdGlvbiA9XG4gICAgICBcIk9wdGltaXplIGZvciBjcmVhdGl2ZSB3cml0aW5nLiBBc2sgZm9yIHZpdmlkIGltYWdlcnksIGNoYXJhY3RlciBkZXB0aCwgYW5kIGVuZ2FnaW5nIHRvbmUuXCI7XG4gIH1cblxuICBjb25zdCBzYWZlVGFncyA9IEFycmF5LmlzQXJyYXkodGFncylcbiAgICA/IHRhZ3MubWFwKCh0YWcpID0+IFN0cmluZyh0YWcgfHwgXCJcIikudHJpbSgpKS5maWx0ZXIoQm9vbGVhbilcbiAgICA6IFtdO1xuICBjb25zdCB0YWdDb250ZXh0ID1cbiAgICBzYWZlVGFncy5sZW5ndGggPiAwXG4gICAgICA/IGBJbmNvcnBvcmF0ZSB0aGVzZSBjb25jZXB0cy90b3BpY3M6ICR7c2FmZVRhZ3Muam9pbihcIiwgXCIpfS5gXG4gICAgICA6IFwiXCI7XG5cbiAgY29uc3Qgc3lzdGVtUHJvbXB0ID0gYFlvdSBhcmUgYW4gZXhwZXJ0IHByb21wdCBlbmdpbmVlci4gWW91ciBnb2FsIGlzIHRvIGltcHJvdmUgdGhlIHVzZXIncyBwcm9tcHQgc28gaXQgeWllbGRzIHRoZSBiZXN0IHBvc3NpYmxlIHJlc3BvbnNlIGZyb20gYW4gTExNLlxuJHtzdHlsZUluc3RydWN0aW9ufVxuJHt0YWdDb250ZXh0fVxuT05MWSByZXR1cm4gdGhlIGltcHJvdmVkIHByb21wdCB0ZXh0LiBEbyBub3QgYWRkIHF1b3RlcywgZG8gbm90IGV4cGxhaW4geW91ciBjaGFuZ2VzLCBhbmQgZG8gbm90IGFkZCBoZWFkaW5ncy5gO1xuXG4gIGNvbnN0IGltcHJvdmVkVGV4dCA9IGF3YWl0IGNhbGxQcm92aWRlclRleHRUYXNrKHtcbiAgICBwcm92aWRlcklkLFxuICAgIG1vZGVsSWQsXG4gICAgYXBpS2V5LFxuICAgIHN5c3RlbVByb21wdCxcbiAgICB1c2VyUHJvbXB0OiBgVXNlcidzIE9yaWdpbmFsIFByb21wdDpcXG4ke2NsYW1wVGV4dCh0ZXh0LCA1MDAwKX1gLFxuICB9KTtcbiAgaWYgKCFpbXByb3ZlZFRleHQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgJHtnZXRQcm92aWRlckxhYmVsKHByb3ZpZGVySWQpfSByZXR1cm5lZCBlbXB0eSBpbXByb3ZlZCB0ZXh0LmAsXG4gICAgKTtcbiAgfVxuICByZXR1cm4geyB0ZXh0OiBpbXByb3ZlZFRleHQgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcGFyYXBocmFzZVByb21wdFZpYUNsb3VkU3RyaWN0KHtcbiAgcHJvdmlkZXJJZCxcbiAgYXBpS2V5LFxuICBtb2RlbElkLFxuICB0ZXh0LFxufSkge1xuICBjb25zdCBzb3VyY2UgPSBjbGFtcFRleHQodGV4dCwgNTAwMCk7XG4gIGlmICghc291cmNlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiRW1wdHkgcHJvbXB0IHRleHQgcHJvdmlkZWQuXCIpO1xuICB9XG5cbiAgY29uc3Qgc3lzdGVtUHJvbXB0ID0gW1xuICAgIFwiUmV3cml0ZSB0aGUgcHJvbXB0IGZvciBjbGFyaXR5IHdoaWxlIHByZXNlcnZpbmcgaW50ZW50IGFuZCBhbGwgcGxhY2Vob2xkZXJzIGV4YWN0bHkuXCIsXG4gICAgXCJLZWVwIGJyYWNrZXQgcGxhY2Vob2xkZXJzIHVuY2hhbmdlZCAoZS5nLiwgW3RvcGljXSwgW3RvbmU/XSkuXCIsXG4gICAgXCJSZXR1cm4gb25seSB0aGUgcmV3cml0dGVuIHByb21wdCB0ZXh0LlwiLFxuICBdLmpvaW4oXCJcXG5cIik7XG5cbiAgY29uc3QgcmV3cml0dGVuID0gYXdhaXQgY2FsbFByb3ZpZGVyVGV4dFRhc2soe1xuICAgIHByb3ZpZGVySWQsXG4gICAgbW9kZWxJZCxcbiAgICBhcGlLZXksXG4gICAgc3lzdGVtUHJvbXB0LFxuICAgIHVzZXJQcm9tcHQ6IGBQcm9tcHQ6XFxuJHtzb3VyY2V9YCxcbiAgfSk7XG4gIGlmICghcmV3cml0dGVuKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYCR7Z2V0UHJvdmlkZXJMYWJlbChwcm92aWRlcklkKX0gcmV0dXJuZWQgZW1wdHkgcGFyYXBocmFzZSBvdXRwdXQuYCxcbiAgICApO1xuICB9XG4gIHJldHVybiB7IHRleHQ6IHJld3JpdHRlbiB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBidWlsZENvbnRpbnVhdGlvbkhhbmRvZmZWaWFDbG91ZChcbiAgbWVzc2FnZXMsXG4gIG1vZGUgPSBcIkZVTExfU1VNTUFSWVwiLFxuICB1c2VyTm90ZSA9IFwiXCIsXG4gIGNsb3VkID0ge30sXG4pIHtcbiAgY29uc3Qgc2FmZU1lc3NhZ2VzID0gQXJyYXkuaXNBcnJheShtZXNzYWdlcykgPyBtZXNzYWdlcyA6IFtdO1xuICBpZiAoIXNhZmVNZXNzYWdlcy5sZW5ndGgpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIk5vIG1lc3NhZ2VzIHRvIHN1bW1hcml6ZS5cIiB9O1xuICB9XG5cbiAgY29uc3QgcHJvdmlkZXJJZCA9IFBST1ZJREVSX0lEUy5HRU1JTkk7XG4gIGNvbnN0IGFwaUtleSA9IFN0cmluZyhjbG91ZC5hcGlLZXkgfHwgXCJcIikudHJpbSgpO1xuICBjb25zdCBtb2RlbElkID0gU3RyaW5nKGNsb3VkLm1vZGVsSWQgfHwgXCJcIikudHJpbSgpO1xuICBpZiAoIWFwaUtleSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiTWlzc2luZyBwcm92aWRlciBrZXkuXCIgfTtcbiAgfVxuXG4gIGNvbnN0IHByb21wdCA9IGJ1aWxkQ29udGludWF0aW9uUHJvbXB0KHNhZmVNZXNzYWdlcywgbW9kZSwgdXNlck5vdGUpO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcmF3ID0gYXdhaXQgY2FsbFByb3ZpZGVyVGV4dFRhc2soe1xuICAgICAgcHJvdmlkZXJJZCxcbiAgICAgIG1vZGVsSWQsXG4gICAgICBhcGlLZXksXG4gICAgICBzeXN0ZW1Qcm9tcHQ6IFwiU3VtbWFyaXplIGZvciBhIGNvbnRpbnVhdGlvbiBoYW5kb2ZmLlwiLFxuICAgICAgdXNlclByb21wdDogcHJvbXB0LFxuICAgIH0pO1xuICAgIGlmICghcmF3KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBvazogZmFsc2UsXG4gICAgICAgIGVycm9yOiBgJHtnZXRQcm92aWRlckxhYmVsKHByb3ZpZGVySWQpfSByZXR1cm5lZCBlbXB0eSBjb250aW51YXRpb24gY29udGV4dC5gLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4geyBvazogdHJ1ZSwgdGV4dDogbGltaXRXb3JkcyhyYXcsIENPTlRJTlVBVElPTl9XT1JEX0xJTUlUKSB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnN0IGZhbGxiYWNrID1cbiAgICAgIGVycm9yPy5uYW1lID09PSBcIkFib3J0RXJyb3JcIlxuICAgICAgICA/IGAke2dldFByb3ZpZGVyTGFiZWwocHJvdmlkZXJJZCl9IHJlcXVlc3QgdGltZWQgb3V0LmBcbiAgICAgICAgOiBcIkZhaWxlZCB0byBnZW5lcmF0ZSBjb250aW51YXRpb24gaGFuZG9mZi5cIjtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBmYWxsYmFjayB9O1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGJ1aWxkQ29udGludWF0aW9uSGFuZG9mZihcbiAgbWVzc2FnZXMsXG4gIG1vZGUgPSBcIkZVTExfU1VNTUFSWVwiLFxuICB1c2VyTm90ZSA9IFwiXCIsXG4gIGV4cGxpY2l0S2V5ID0gXCJcIixcbiAgX2ZvcmNlTG9jYWwgPSBmYWxzZSxcbikge1xuICBjb25zdCBzYWZlTWVzc2FnZXMgPSBBcnJheS5pc0FycmF5KG1lc3NhZ2VzKSA/IG1lc3NhZ2VzIDogW107XG4gIGlmICghc2FmZU1lc3NhZ2VzLmxlbmd0aCkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiTm8gbWVzc2FnZXMgdG8gc3VtbWFyaXplLlwiIH07XG4gIH1cblxuICBjb25zdCBrZXkgPSBTdHJpbmcoZXhwbGljaXRLZXkgfHwgXCJcIikudHJpbSgpO1xuICBjb25zdCBhY3RpdmVQcm92aWRlciA9IFBST1ZJREVSX0lEUy5HRU1JTkk7XG4gIGNvbnN0IGFjdGl2ZVByb3ZpZGVyS2V5ID0ga2V5IHx8IChhd2FpdCBnZXRHZW1pbmlBcGlLZXkoKSk7XG4gIGNvbnN0IGhhc0FjdGl2ZUtleSA9IEJvb2xlYW4oYWN0aXZlUHJvdmlkZXJLZXkpO1xuICBjb25zdCBsb25nQ29udmVyc2F0aW9uID0gc2FmZU1lc3NhZ2VzLmxlbmd0aCA+IENPTlRJTlVBVElPTl9MT05HX1RIUkVTSE9MRDtcbiAgY29uc3QgZm9yY2VQcm92aWRlciA9IGxvbmdDb252ZXJzYXRpb24gJiYgaGFzQWN0aXZlS2V5ID8gYWN0aXZlUHJvdmlkZXIgOiBcIlwiO1xuICBjb25zdCBhY3RpdmVMYWJlbCA9IGdldFByb3ZpZGVyTGFiZWwoYWN0aXZlUHJvdmlkZXIpO1xuICBjb25zdCBsb25nQWR2aXNvcnkgPSBsb25nQ29udmVyc2F0aW9uXG4gICAgPyBoYXNBY3RpdmVLZXlcbiAgICAgID8gYEZvciBiZXN0IHJlc3VsdHMsICR7YWN0aXZlTGFiZWx9IHdpbGwgYmUgdXNlZCBmb3IgdGhpcyBsb25nIGNvbnZlcnNhdGlvbi5gXG4gICAgICA6IFwiTG9uZyBjb252ZXJzYXRpb25zIHdvcmsgYmVzdCB3aXRoIGEgY29uZmlndXJlZCBwcm92aWRlciBrZXkgaW4gU2V0dGluZ3MuXCJcbiAgICA6IFwiXCI7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBydW5XaXRoQ29uZmlndXJlZEJhY2tlbmQoe1xuICAgICAgZmVhdHVyZTogXCJjb250aW51ZVN1bW1hcnlcIixcbiAgICAgIGlucHV0VGV4dDogc2FmZU1lc3NhZ2VzLm1hcCgobSkgPT4gU3RyaW5nKG0/LmNvbnRlbnQgfHwgbT8udGV4dCB8fCBcIlwiKSkuam9pbihcIiBcIiksXG4gICAgICBmb3JjZVByb3ZpZGVyLFxuICAgICAgZ2VtaW5pQXBpS2V5OiBrZXksXG4gICAgICBjbG91ZFRhc2s6ICh7IHByb3ZpZGVySWQsIGFwaUtleSwgbW9kZWxJZCB9KSA9PlxuICAgICAgICBidWlsZENvbnRpbnVhdGlvbkhhbmRvZmZWaWFDbG91ZChzYWZlTWVzc2FnZXMsIG1vZGUsIHVzZXJOb3RlLCB7XG4gICAgICAgICAgcHJvdmlkZXJJZCxcbiAgICAgICAgICBhcGlLZXksXG4gICAgICAgICAgbW9kZWxJZCxcbiAgICAgICAgfSksXG4gICAgICBub0Nsb3VkTWVzc2FnZTogXCJObyBjbG91ZCBBUEkga2V5IGZvdW5kIGluIFNldHRpbmdzLlwiLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiB0cnVlLFxuICAgICAgdGV4dDogbGltaXRXb3JkcyhcbiAgICAgICAgU3RyaW5nKHJlc3VsdD8udGV4dCB8fCBcIlwiKS50cmltKCksXG4gICAgICAgIENPTlRJTlVBVElPTl9XT1JEX0xJTUlULFxuICAgICAgKSxcbiAgICAgIGJhY2tlbmQ6IFwiZ2VtaW5pXCIsXG4gICAgICBhZHZpc29yeTpcbiAgICAgICAgU3RyaW5nKHJlc3VsdD8uYWR2aXNvcnkgfHwgbG9uZ0Fkdmlzb3J5IHx8IFwiXCIpLnRyaW0oKSB8fCB1bmRlZmluZWQsXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgZXJyb3I6IFN0cmluZyhcbiAgICAgICAgZXJyb3I/Lm1lc3NhZ2UgfHwgXCJGYWlsZWQgdG8gZ2VuZXJhdGUgY29udGludWF0aW9uIGhhbmRvZmYuXCIsXG4gICAgICApLFxuICAgICAgYWR2aXNvcnk6IGxvbmdBZHZpc29yeSB8fCB1bmRlZmluZWQsXG4gICAgfTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVByb21wdFRpdGxlVmlhQ2xvdWRTdHJpY3Qoe1xuICBwcm92aWRlcklkLFxuICBhcGlLZXksXG4gIG1vZGVsSWQsXG4gIHRleHQsXG59KSB7XG4gIGNvbnN0IHNvdXJjZSA9IGNsYW1wVGV4dCh0ZXh0LCAzMjAwKTtcbiAgaWYgKCFzb3VyY2UpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJFbXB0eSB0ZXh0IHByb3ZpZGVkLlwiKTtcbiAgfVxuXG4gIGNvbnN0IGluc3RydWN0aW9uID0gYENyZWF0ZSBvbmUgY29uY2lzZSB0aXRsZSAobWF4IDggd29yZHMpIGZvciB0aGlzIHByb21wdC5cblJldHVybiBPTkxZIHRoZSB0aXRsZSB0ZXh0LlxuTm8gcXVvdGVzLCBubyBudW1iZXJpbmcsIG5vIGV4dHJhIHRleHQuYDtcblxuICBjb25zdCB0aXRsZSA9IChcbiAgICBhd2FpdCBjYWxsUHJvdmlkZXJUZXh0VGFzayh7XG4gICAgICBwcm92aWRlcklkLFxuICAgICAgbW9kZWxJZCxcbiAgICAgIGFwaUtleSxcbiAgICAgIHN5c3RlbVByb21wdDogaW5zdHJ1Y3Rpb24sXG4gICAgICB1c2VyUHJvbXB0OiBgUHJvbXB0OlxcbiR7c291cmNlfWAsXG4gICAgfSlcbiAgKVxuICAgIC5zcGxpdChcIlxcblwiKVswXVxuICAgIC5yZXBsYWNlKC9eW1wiJ2BdK3xbXCInYF0rJC9nLCBcIlwiKVxuICAgIC5yZXBsYWNlKC9eXFxkK1tcXCkuXFxzLV0rLywgXCJcIilcbiAgICAudHJpbSgpXG4gICAgLnNsaWNlKDAsIDgwKTtcblxuICBpZiAoIXRpdGxlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiTm8gdGl0bGUgZ2VuZXJhdGVkLlwiKTtcbiAgfVxuICByZXR1cm4geyB0aXRsZSB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBzY29yZVByb21wdENsYXJpdHlWaWFDbG91ZFN0cmljdCh7XG4gIHByb3ZpZGVySWQsXG4gIGFwaUtleSxcbiAgbW9kZWxJZCxcbiAgdGV4dCxcbn0pIHtcbiAgY29uc3Qgc291cmNlID0gY2xhbXBUZXh0KHRleHQsIDQyMDApO1xuICBpZiAoIXNvdXJjZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkVtcHR5IHRleHQgcHJvdmlkZWQuXCIpO1xuICB9XG5cbiAgY29uc3QgaW5zdHJ1Y3Rpb24gPSBbXG4gICAgXCJFdmFsdWF0ZSB0aGlzIHByb21wdCBvbiBjbGFyaXR5LCBzcGVjaWZpY2l0eSwgYW5kIGNvbXBsZXRlbmVzcy5cIixcbiAgICBcIlJldHVybiBzdHJpY3QgSlNPTiBvbmx5IGluIHRoaXMgc2hhcGU6XCIsXG4gICAgJ3tcInNjb3JlXCI6IDAsIFwiZXhwbGFuYXRpb25cIjogXCJvbmUgc2hvcnQgc2VudGVuY2VcIn0nLFxuICBdLmpvaW4oXCJcXG5cIik7XG5cbiAgY29uc3QgcmF3ID0gYXdhaXQgY2FsbFByb3ZpZGVyVGV4dFRhc2soe1xuICAgIHByb3ZpZGVySWQsXG4gICAgbW9kZWxJZCxcbiAgICBhcGlLZXksXG4gICAgc3lzdGVtUHJvbXB0OiBpbnN0cnVjdGlvbixcbiAgICB1c2VyUHJvbXB0OiBgUHJvbXB0OlxcbiR7c291cmNlfWAsXG4gIH0pO1xuICByZXR1cm4gcGFyc2VDbGFyaXR5RnJvbVRleHQocmF3LCBzb3VyY2UpO1xufVxuXG5jb25zdCBpbXByb3ZlUHJvbXB0ID0gYXN5bmMgKHRleHQsIHRhZ3MgPSBbXSwgc3R5bGUgPSBcImdlbmVyYWxcIikgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bldpdGhDb25maWd1cmVkQmFja2VuZCh7XG4gICAgICBmZWF0dXJlOiBcImltcHJvdmVQcm9tcHRcIixcbiAgICAgIGlucHV0VGV4dDogdGV4dCxcbiAgICAgIGNsb3VkVGFzazogKHsgcHJvdmlkZXJJZCwgYXBpS2V5LCBtb2RlbElkIH0pID0+XG4gICAgICAgIGltcHJvdmVQcm9tcHRWaWFDbG91ZFN0cmljdCh7XG4gICAgICAgICAgcHJvdmlkZXJJZCxcbiAgICAgICAgICBhcGlLZXksXG4gICAgICAgICAgbW9kZWxJZCxcbiAgICAgICAgICB0ZXh0LFxuICAgICAgICAgIHRhZ3MsXG4gICAgICAgICAgc3R5bGUsXG4gICAgICAgIH0pLFxuICAgICAgbm9DbG91ZE1lc3NhZ2U6IFwiTm8gY2xvdWQgQVBJIGtleSBmb3VuZCBpbiBTZXR0aW5ncy5cIixcbiAgICB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IHRydWUsXG4gICAgICB0ZXh0OiBTdHJpbmcocmVzdWx0Py50ZXh0IHx8IFwiXCIpLnRyaW0oKSxcbiAgICAgIGJhY2tlbmQ6IFwiZ2VtaW5pXCIsXG4gICAgICBhZHZpc29yeTogcmVzdWx0Py5hZHZpc29yeSB8fCB1bmRlZmluZWQsXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgZXJyb3I6IFN0cmluZyhlcnJvcj8ubWVzc2FnZSB8fCBcIkZhaWxlZCB0byBpbXByb3ZlIHByb21wdC5cIiksXG4gICAgfTtcbiAgfVxufTtcblxuY29uc3QgZ2VuZXJhdGVQcm9tcHRUaXRsZSA9IGFzeW5jICh0ZXh0KSA9PiB7XG4gIGNvbnN0IHNvdXJjZSA9IGNsYW1wVGV4dCh0ZXh0LCA0MjAwKTtcbiAgaWYgKCFzb3VyY2UpIHtcbiAgICByZXR1cm4geyBlcnJvcjogXCJFbXB0eSB0ZXh0IHByb3ZpZGVkLlwiLCB0aXRsZTogXCJcIiB9O1xuICB9XG5cbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBydW5XaXRoQ29uZmlndXJlZEJhY2tlbmQoe1xuICAgICAgZmVhdHVyZTogXCJ0aXRsZVwiLFxuICAgICAgaW5wdXRUZXh0OiBzb3VyY2UsXG4gICAgICBjbG91ZFRhc2s6ICh7IHByb3ZpZGVySWQsIGFwaUtleSwgbW9kZWxJZCB9KSA9PlxuICAgICAgICBnZW5lcmF0ZVByb21wdFRpdGxlVmlhQ2xvdWRTdHJpY3Qoe1xuICAgICAgICAgIHByb3ZpZGVySWQsXG4gICAgICAgICAgYXBpS2V5LFxuICAgICAgICAgIG1vZGVsSWQsXG4gICAgICAgICAgdGV4dDogc291cmNlLFxuICAgICAgICB9KSxcbiAgICAgIG5vQ2xvdWRNZXNzYWdlOiBcIk5vIGNsb3VkIEFQSSBrZXkgZm91bmQgaW4gU2V0dGluZ3MuXCIsXG4gICAgfSk7XG5cbiAgICBjb25zdCB0aXRsZSA9IFN0cmluZyhyZXN1bHQ/LnRpdGxlIHx8IFwiXCIpXG4gICAgICAudHJpbSgpXG4gICAgICAuc2xpY2UoMCwgODApO1xuICAgIHJldHVybiB7XG4gICAgICBvazogdHJ1ZSxcbiAgICAgIHRpdGxlOiB0aXRsZSB8fCBkZXJpdmVGYWxsYmFja1RpdGxlKHNvdXJjZSksXG4gICAgICBiYWNrZW5kOiBcImdlbWluaVwiLFxuICAgICAgYWR2aXNvcnk6IHJlc3VsdD8uYWR2aXNvcnkgfHwgdW5kZWZpbmVkLFxuICAgIH07XG4gIH0gY2F0Y2ggKF9lcnJvcikge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICB0aXRsZTogZGVyaXZlRmFsbGJhY2tUaXRsZShzb3VyY2UpLFxuICAgICAgYmFja2VuZDogXCJmYWxsYmFja1wiLFxuICAgIH07XG4gIH1cbn07XG5cbmNvbnN0IHBhcmFwaHJhc2VQcm9tcHQgPSBhc3luYyAodGV4dCkgPT4ge1xuICBjb25zdCBzb3VyY2UgPSBjbGFtcFRleHQodGV4dCwgNTIwMCk7XG4gIGlmICghc291cmNlKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJFbXB0eSBwcm9tcHQgdGV4dCBwcm92aWRlZC5cIiB9O1xuICB9XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuV2l0aENvbmZpZ3VyZWRCYWNrZW5kKHtcbiAgICAgIGZlYXR1cmU6IFwicG9saXNoXCIsXG4gICAgICBpbnB1dFRleHQ6IHNvdXJjZSxcbiAgICAgIGNsb3VkVGFzazogKHsgcHJvdmlkZXJJZCwgYXBpS2V5LCBtb2RlbElkIH0pID0+XG4gICAgICAgIHBhcmFwaHJhc2VQcm9tcHRWaWFDbG91ZFN0cmljdCh7XG4gICAgICAgICAgcHJvdmlkZXJJZCxcbiAgICAgICAgICBhcGlLZXksXG4gICAgICAgICAgbW9kZWxJZCxcbiAgICAgICAgICB0ZXh0OiBzb3VyY2UsXG4gICAgICAgIH0pLFxuICAgICAgbm9DbG91ZE1lc3NhZ2U6IFwiTm8gY2xvdWQgQVBJIGtleSBmb3VuZCBpbiBTZXR0aW5ncy5cIixcbiAgICB9KTtcbiAgICBjb25zdCByZXdyaXR0ZW4gPSBTdHJpbmcocmVzdWx0Py50ZXh0IHx8IFwiXCIpLnRyaW0oKTtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IHRydWUsXG4gICAgICB0ZXh0OiByZXdyaXR0ZW4gfHwgc291cmNlLFxuICAgICAgYmFja2VuZDogXCJnZW1pbmlcIixcbiAgICAgIGFkdmlzb3J5OiByZXN1bHQ/LmFkdmlzb3J5IHx8IHVuZGVmaW5lZCxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIHJldHVybiB7XG4gICAgICBvazogZmFsc2UsXG4gICAgICB0ZXh0OiBzb3VyY2UsXG4gICAgICBiYWNrZW5kOiBcImZhbGxiYWNrXCIsXG4gICAgICBlcnJvcjogU3RyaW5nKGVycm9yPy5tZXNzYWdlIHx8IFwiUGFyYXBocmFzZSBmYWlsZWQuXCIpLFxuICAgIH07XG4gIH1cbn07XG5cbmNvbnN0IHNjb3JlUHJvbXB0Q2xhcml0eSA9IGFzeW5jICh0ZXh0KSA9PiB7XG4gIGNvbnN0IHNvdXJjZSA9IGNsYW1wVGV4dCh0ZXh0LCA0MjAwKTtcbiAgaWYgKCFzb3VyY2UpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgZXJyb3I6IFwiRW1wdHkgcHJvbXB0IHRleHQgcHJvdmlkZWQuXCIsXG4gICAgICBzY29yZTogMCxcbiAgICAgIGV4cGxhbmF0aW9uOiBcIk5vIHByb21wdCBjb250ZW50IHByb3ZpZGVkLlwiLFxuICAgIH07XG4gIH1cblxuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bldpdGhDb25maWd1cmVkQmFja2VuZCh7XG4gICAgICBmZWF0dXJlOiBcInBvbGlzaFwiLFxuICAgICAgaW5wdXRUZXh0OiBzb3VyY2UsXG4gICAgICBjbG91ZFRhc2s6ICh7IHByb3ZpZGVySWQsIGFwaUtleSwgbW9kZWxJZCB9KSA9PlxuICAgICAgICBzY29yZVByb21wdENsYXJpdHlWaWFDbG91ZFN0cmljdCh7XG4gICAgICAgICAgcHJvdmlkZXJJZCxcbiAgICAgICAgICBhcGlLZXksXG4gICAgICAgICAgbW9kZWxJZCxcbiAgICAgICAgICB0ZXh0OiBzb3VyY2UsXG4gICAgICAgIH0pLFxuICAgICAgbm9DbG91ZE1lc3NhZ2U6IFwiTm8gY2xvdWQgQVBJIGtleSBmb3VuZCBpbiBTZXR0aW5ncy5cIixcbiAgICB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IHRydWUsXG4gICAgICBzY29yZTogTnVtYmVyKHJlc3VsdD8uc2NvcmUpIHx8IDAsXG4gICAgICBleHBsYW5hdGlvbjpcbiAgICAgICAgU3RyaW5nKHJlc3VsdD8uZXhwbGFuYXRpb24gfHwgXCJcIikudHJpbSgpIHx8IFwiTm8gZXhwbGFuYXRpb24gYXZhaWxhYmxlLlwiLFxuICAgICAgYmFja2VuZDogXCJnZW1pbmlcIixcbiAgICAgIGFkdmlzb3J5OiByZXN1bHQ/LmFkdmlzb3J5IHx8IHVuZGVmaW5lZCxcbiAgICB9O1xuICB9IGNhdGNoIChfZXJyb3IpIHtcbiAgICBjb25zdCBmYWxsYmFjayA9IHBhcnNlQ2xhcml0eUZyb21UZXh0KFwiXCIsIHNvdXJjZSk7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCAuLi5mYWxsYmFjaywgYmFja2VuZDogXCJmYWxsYmFja1wiIH07XG4gIH1cbn07XG5cbmNvbnN0IHByZXBhcmVQcm9tcHRGb3JTYXZlID0gYXN5bmMgKHtcbiAgdGl0bGUgPSBcIlwiLFxuICB0ZXh0ID0gXCJcIixcbiAgdGFncyA9IFtdLFxuICBjYXRlZ29yeSA9IG51bGwsXG59ID0ge30pID0+IHtcbiAgY29uc3Qgb3JpZ2luYWxUZXh0ID0gY2xhbXBUZXh0KHRleHQsIDUyMDApO1xuICBpZiAoIW9yaWdpbmFsVGV4dCkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiUHJvbXB0IHRleHQgaXMgcmVxdWlyZWQuXCIgfTtcbiAgfVxuXG4gIGNvbnN0IHJ1bnRpbWUgPSBhd2FpdCBnZXRBaVJ1bnRpbWVTZXR0aW5ncygpO1xuICBjb25zdCBub3JtYWxpemVkVGFncyA9IEFycmF5LmlzQXJyYXkodGFncylcbiAgICA/IHRhZ3MubWFwKCh0YWcpID0+IFN0cmluZyh0YWcgfHwgXCJcIikudHJpbSgpKS5maWx0ZXIoQm9vbGVhbilcbiAgICA6IFtdO1xuICBjb25zdCBzaG91bGRQb2xpc2ggPSBydW50aW1lPy5mZWF0dXJlRmxhZ3M/LnBvbGlzaCAhPT0gZmFsc2U7XG4gIGNvbnN0IHBhcmFwaHJhc2VkID0gc2hvdWxkUG9saXNoXG4gICAgPyBhd2FpdCBwYXJhcGhyYXNlUHJvbXB0KG9yaWdpbmFsVGV4dClcbiAgICA6IHsgb2s6IGZhbHNlLCB0ZXh0OiBvcmlnaW5hbFRleHQsIGJhY2tlbmQ6IG51bGwgfTtcbiAgY29uc3QgZmluYWxUZXh0ID1cbiAgICBjbGFtcFRleHQocGFyYXBocmFzZWQ/Lm9rID8gcGFyYXBocmFzZWQ/LnRleHQgOiBvcmlnaW5hbFRleHQsIDUyMDApIHx8XG4gICAgb3JpZ2luYWxUZXh0O1xuXG4gIGNvbnN0IGluaXRpYWxUaXRsZSA9IFN0cmluZyh0aXRsZSB8fCBcIlwiKS50cmltKCk7XG4gIGNvbnN0IFt0aXRsZVJlc3VsdCwgY2xhcml0eV0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgaW5pdGlhbFRpdGxlXG4gICAgICA/IFByb21pc2UucmVzb2x2ZSh7IHRpdGxlOiBpbml0aWFsVGl0bGUsIGJhY2tlbmQ6IFwicHJvdmlkZWRcIiB9KVxuICAgICAgOiBnZW5lcmF0ZVByb21wdFRpdGxlKGZpbmFsVGV4dCksXG4gICAgc2NvcmVQcm9tcHRDbGFyaXR5KGZpbmFsVGV4dCksXG4gIF0pO1xuICBjb25zdCBmaW5hbFRpdGxlID1cbiAgICBTdHJpbmcodGl0bGVSZXN1bHQ/LnRpdGxlIHx8IFwiXCIpLnRyaW0oKSB8fCBkZXJpdmVGYWxsYmFja1RpdGxlKGZpbmFsVGV4dCk7XG5cbiAgcmV0dXJuIHtcbiAgICBvazogdHJ1ZSxcbiAgICBwcm9tcHQ6IHtcbiAgICAgIHRpdGxlOiBmaW5hbFRpdGxlLFxuICAgICAgdGV4dDogZmluYWxUZXh0LFxuICAgICAgdGFnczogbm9ybWFsaXplZFRhZ3MsXG4gICAgICBjYXRlZ29yeTogY2F0ZWdvcnkgPyBTdHJpbmcoY2F0ZWdvcnkpLnRyaW0oKSA6IG51bGwsXG4gICAgICBjbGFyaXR5U2NvcmU6XG4gICAgICAgIGNsYXJpdHk/Lm9rICYmIE51bWJlci5pc0Zpbml0ZShOdW1iZXIoY2xhcml0eT8uc2NvcmUpKVxuICAgICAgICAgID8gTWF0aC5tYXgoMCwgTWF0aC5taW4oMTAwLCBNYXRoLnJvdW5kKE51bWJlcihjbGFyaXR5LnNjb3JlKSkpKVxuICAgICAgICAgIDogbnVsbCxcbiAgICAgIGNsYXJpdHlFeHBsYW5hdGlvbjogU3RyaW5nKGNsYXJpdHk/LmV4cGxhbmF0aW9uIHx8IFwiXCIpLnRyaW0oKSB8fCBcIlwiLFxuICAgIH0sXG4gICAgYmFja2VuZDoge1xuICAgICAgcGFyYXBocmFzZTogcGFyYXBocmFzZWQ/Lm9rID8gcGFyYXBocmFzZWQ/LmJhY2tlbmQgfHwgbnVsbCA6IG51bGwsXG4gICAgICB0aXRsZTogdGl0bGVSZXN1bHQ/LmJhY2tlbmQgfHwgbnVsbCxcbiAgICAgIGNsYXJpdHk6IGNsYXJpdHk/Lm9rID8gY2xhcml0eT8uYmFja2VuZCB8fCBudWxsIDogbnVsbCxcbiAgICB9LFxuICB9O1xufTtcblxuLy8g4pSA4pSA4pSAIEFJIE1lc3NhZ2UgSGFuZGxlciDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbmNvbnN0IGhhbmRsZVJvdXRlZFRhc2sgPSBhc3luYyAobWVzc2FnZSA9IHt9KSA9PiB7XG4gIGNvbnN0IHRhc2sgPSBTdHJpbmcobWVzc2FnZT8udGFzayB8fCBcIlwiKS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgc3dpdGNoICh0YXNrKSB7XG4gICAgY2FzZSBcInBhcmFwaHJhc2VcIjpcbiAgICAgIHJldHVybiBwYXJhcGhyYXNlUHJvbXB0KG1lc3NhZ2U/LnRleHQgfHwgXCJcIik7XG4gICAgY2FzZSBcImltcHJvdmVcIjpcbiAgICAgIHJldHVybiBpbXByb3ZlUHJvbXB0KFxuICAgICAgICBtZXNzYWdlPy50ZXh0IHx8IFwiXCIsXG4gICAgICAgIG1lc3NhZ2U/LnRhZ3MgfHwgW10sXG4gICAgICAgIG1lc3NhZ2U/LnN0eWxlIHx8IFwiZ2VuZXJhbFwiLFxuICAgICAgKTtcbiAgICBjYXNlIFwidGl0bGVcIjpcbiAgICAgIHJldHVybiBnZW5lcmF0ZVByb21wdFRpdGxlKG1lc3NhZ2U/LnRleHQgfHwgXCJcIik7XG4gICAgY2FzZSBcImNsYXJpdHlcIjpcbiAgICAgIHJldHVybiBzY29yZVByb21wdENsYXJpdHkobWVzc2FnZT8udGV4dCB8fCBcIlwiKTtcbiAgICBjYXNlIFwidGFnc1wiOlxuICAgICAgcmV0dXJuIHN1Z2dlc3RUYWdzKG1lc3NhZ2U/LnRleHQgfHwgXCJcIik7XG4gICAgY2FzZSBcImNvbnRpbnVlX3N1bW1hcnlcIjpcbiAgICAgIHJldHVybiBidWlsZENvbnRpbnVhdGlvbkhhbmRvZmYoXG4gICAgICAgIG1lc3NhZ2U/Lm1lc3NhZ2VzIHx8IFtdLFxuICAgICAgICBtZXNzYWdlPy5tb2RlLFxuICAgICAgICBtZXNzYWdlPy51c2VyTm90ZSB8fCBcIlwiLFxuICAgICAgICBtZXNzYWdlPy5rZXkgfHwgXCJcIixcbiAgICAgICk7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgZXJyb3I6IGBVbnN1cHBvcnRlZCByb3V0ZWQgdGFzazogJHt0YXNrIHx8IFwidW5rbm93blwifWAsXG4gICAgICB9O1xuICB9XG59O1xuXG5jb25zdCBoYW5kbGVBSU1lc3NhZ2UgPSBhc3luYyAobWVzc2FnZSwgc2VuZFJlc3BvbnNlKSA9PiB7XG4gIHRyeSB7XG4gICAgc3dpdGNoIChtZXNzYWdlLnR5cGUpIHtcbiAgICAgIGNhc2UgXCJBSV9JTklUXCI6XG4gICAgICAgIGlmIChBSS5zdGF0dXMgPT09IFwiaWRsZVwiKSB7XG4gICAgICAgICAgQUkuc3RhdHVzID0gXCJyZWFkeVwiO1xuICAgICAgICAgIGJyb2FkY2FzdCh7IHR5cGU6IFwiQUlfU1RBVFVTXCIsIHN0YXR1czogXCJyZWFkeVwiIH0pO1xuICAgICAgICB9XG4gICAgICAgIHNlbmRSZXNwb25zZSh7XG4gICAgICAgICAgc3RhdHVzOiBBSS5zdGF0dXMsXG4gICAgICAgICAgZW1iZWRkaW5nOiB7IHNlYXJjaE1vZGU6IFwia2V5d29yZFwiLCBzdGF0dXM6IFwicmVhZHlcIiwgZG93bmxvYWRlZE1vZGVsSWRzOiBbXSwgcHJvZ3Jlc3M6IDEwMCB9LFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG5cbiAgICAgIGNhc2UgXCJBSV9QUk9WSURFUl9WQUxJREFURV9LRVlcIjoge1xuICAgICAgICBjb25zdCBrZXkgPSBTdHJpbmcobWVzc2FnZT8ua2V5IHx8IFwiXCIpLnRyaW0oKTtcbiAgICAgICAgc2VuZFJlc3BvbnNlKGF3YWl0IHZhbGlkYXRlR2VtaW5pQXBpS2V5KGtleSkpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgY2FzZSBcIkFJX1NUQVRVU19DSEVDS1wiOlxuICAgICAgICBzZW5kUmVzcG9uc2Uoe1xuICAgICAgICAgIHN0YXR1czogQUkuc3RhdHVzLFxuICAgICAgICAgIGVtYmVkZGluZzogeyBzZWFyY2hNb2RlOiBcImtleXdvcmRcIiwgc3RhdHVzOiBcInJlYWR5XCIsIGRvd25sb2FkZWRNb2RlbElkczogW10sIHByb2dyZXNzOiAxMDAgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuXG4gICAgICBjYXNlIFwiQUlfU1VHR0VTVF9UQUdTXCI6XG4gICAgICAgIHNlbmRSZXNwb25zZShhd2FpdCBzdWdnZXN0VGFncyhtZXNzYWdlLnRleHQpKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG5cbiAgICAgIGNhc2UgXCJBSV9DSEVDS19EVVBMSUNBVEVcIjpcbiAgICAgICAgc2VuZFJlc3BvbnNlKHtcbiAgICAgICAgICBtYXRjaDogYXdhaXQgY2hlY2tEdXBsaWNhdGUobWVzc2FnZS50ZXh0LCBtZXNzYWdlLmV4Y2x1ZGVJZCksXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcblxuICAgICAgY2FzZSBcIkFJX1NNQVJUX1NVR0dFU1RJT05TXCI6XG4gICAgICAgIHNlbmRSZXNwb25zZSh7XG4gICAgICAgICAgaWRzOiBhd2FpdCBnZXRTbWFydFN1Z2dlc3Rpb25zKG1lc3NhZ2UuY29udmVyc2F0aW9uVGV4dCksXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcblxuICAgICAgY2FzZSBcIkFJX0lNUFJPVkVfUFJPTVBUXCI6XG4gICAgICAgIHNlbmRSZXNwb25zZShcbiAgICAgICAgICBhd2FpdCBpbXByb3ZlUHJvbXB0KG1lc3NhZ2UudGV4dCwgbWVzc2FnZS50YWdzLCBtZXNzYWdlLnN0eWxlKSxcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG5cbiAgICAgIGNhc2UgXCJBSV9HRU5FUkFURV9QUk9NUFRfVElUTEVcIjpcbiAgICAgICAgc2VuZFJlc3BvbnNlKGF3YWl0IGdlbmVyYXRlUHJvbXB0VGl0bGUobWVzc2FnZS50ZXh0KSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuXG4gICAgICBjYXNlIFwiQUlfUEFSQVBIUkFTRV9QUk9NUFRcIjpcbiAgICAgICAgc2VuZFJlc3BvbnNlKGF3YWl0IHBhcmFwaHJhc2VQcm9tcHQobWVzc2FnZS50ZXh0KSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuXG4gICAgICBjYXNlIFwiQUlfU0NPUkVfQ0xBUklUWVwiOlxuICAgICAgICBzZW5kUmVzcG9uc2UoYXdhaXQgc2NvcmVQcm9tcHRDbGFyaXR5KG1lc3NhZ2UudGV4dCkpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcblxuICAgICAgY2FzZSBcIkFJX1BSRVBBUkVfUFJPTVBUX1NBVkVcIjpcbiAgICAgICAgc2VuZFJlc3BvbnNlKGF3YWl0IHByZXBhcmVQcm9tcHRGb3JTYXZlKG1lc3NhZ2UucGF5bG9hZCB8fCB7fSkpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcblxuICAgICAgY2FzZSBcIkFJX0NPTlRJTlVFX1NVTU1BUllcIjpcbiAgICAgICAgc2VuZFJlc3BvbnNlKFxuICAgICAgICAgIGF3YWl0IGJ1aWxkQ29udGludWF0aW9uSGFuZG9mZihcbiAgICAgICAgICAgIG1lc3NhZ2UubWVzc2FnZXMsXG4gICAgICAgICAgICBtZXNzYWdlLm1vZGUsXG4gICAgICAgICAgICBtZXNzYWdlLnVzZXJOb3RlLFxuICAgICAgICAgICAgbWVzc2FnZS5rZXksXG4gICAgICAgICAgICBtZXNzYWdlLmZvcmNlTG9jYWwgPT09IHRydWUsXG4gICAgICAgICAgKSxcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG5cbiAgICAgIGNhc2UgXCJBSV9ST1VURV9UQVNLXCI6XG4gICAgICAgIHNlbmRSZXNwb25zZShhd2FpdCBoYW5kbGVSb3V0ZWRUYXNrKG1lc3NhZ2UpKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG5cbiAgICAgIC8vIFN0dWIgZW1iZWRkaW5nIHN0YXR1cyBhbmQgcmVpbmRleCBxdWVyaWVzIHRvIGF2b2lkIFVJIGV4Y2VwdGlvbnNcbiAgICAgIGNhc2UgXCJBSV9FTUJFRERJTkdfU1RBVFVTX0NIRUNLXCI6XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IHNlYXJjaE1vZGU6IFwia2V5d29yZFwiLCBzdGF0dXM6IFwicmVhZHlcIiwgZG93bmxvYWRlZE1vZGVsSWRzOiBbXSwgcHJvZ3Jlc3M6IDEwMCB9KTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG5cbiAgICAgIGNhc2UgXCJBSV9FTUJFRERJTkdfRE9XTkxPQURcIjpcbiAgICAgIGNhc2UgXCJBSV9FTUJFRERJTkdfU1dJVENIXCI6XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlLCBzZWFyY2hNb2RlOiBcImtleXdvcmRcIiwgc3RhdHVzOiBcInJlYWR5XCIsIGRvd25sb2FkZWRNb2RlbElkczogW10sIHByb2dyZXNzOiAxMDAgfSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuXG4gICAgICBjYXNlIFwiQUlfRU1CRURESU5HX1JFSU5ERVhfU1RBVFVTXCI6XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IHJ1bm5pbmc6IGZhbHNlLCBkb25lOiAwLCB0b3RhbDogMCwgcHJvZ3Jlc3M6IDEwMCB9KTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG5cbiAgICAgIGNhc2UgXCJBSV9FTUJFRERJTkdfUkVJTkRFWF9TVEFSVFwiOlxuICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSwgcnVubmluZzogZmFsc2UsIGRvbmU6IDAsIHRvdGFsOiAwLCBwcm9ncmVzczogMTAwIH0pO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcblxuICAgICAgY2FzZSBcIkFJX0NBQ0hFX0FERFwiOlxuICAgICAgY2FzZSBcIkFJX0NBQ0hFX1JFTU9WRVwiOlxuICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSB9KTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG5cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgc2VuZFJlc3BvbnNlKHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIGVycm9yOiBTdHJpbmcoZXJyb3I/Lm1lc3NhZ2UgfHwgXCJBSSByZXF1ZXN0IGZhaWxlZC5cIiksXG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn07XG5cbmNvbnN0IFNJREVfUEFORUxfUEFUSCA9IFwic2lkZXBhbmVsL3NpZGVwYW5lbC5odG1sXCI7XG5jb25zdCBTSURFUEFORUxfU0VTU0lPTl9LRVkgPSBCUkFORF9LRVlTLnNpZGVQYW5lbFBheWxvYWQ7XG5jb25zdCBQRU5ESU5HX1BBTkVMX0FDVElPTl9LRVkgPSBcInByb21wdGl1bVBlbmRpbmdQYW5lbEFjdGlvblwiO1xuY29uc3QgUEFORUxfTU9ERV9TRVNTSU9OX0tFWSA9IFwicHJvbXB0aXVtUGFuZWxNb2RlXCI7XG5jb25zdCBGQUxMQkFDS19QQU5FTF9XSURUSCA9IDQyMDtcbmNvbnN0IEZBTExCQUNLX1BBTkVMX0hFSUdIVCA9IDcyMDtcbmNvbnN0IEZBTExCQUNLX1BBTkVMX1JJR0hUX09GRlNFVCA9IDI0O1xuY29uc3QgRkFMTEJBQ0tfUEFORUxfVE9QX09GRlNFVCA9IDU2O1xuXG5jb25zdCBTVVBQT1JURURfRE9DX1BBVFRFUk5TID0gW1xuICBcIio6Ly8qLmNoYXRncHQuY29tLypcIixcbiAgXCIqOi8vKi5jbGF1ZGUuYWkvKlwiLFxuICBcIio6Ly9nZW1pbmkuZ29vZ2xlLmNvbS8qXCIsXG4gIFwiKjovLyoucGVycGxleGl0eS5haS8qXCIsXG4gIFwiKjovL2NvcGlsb3QubWljcm9zb2Z0LmNvbS8qXCIsXG5dO1xuY29uc3QgQUxMT1dFRF9MTE1fSE9TVFMgPSBuZXcgU2V0KFtcbiAgXCJjaGF0Z3B0LmNvbVwiLFxuICBcImNsYXVkZS5haVwiLFxuICBcImdlbWluaS5nb29nbGUuY29tXCIsXG4gIFwid3d3LnBlcnBsZXhpdHkuYWlcIixcbiAgXCJjb3BpbG90Lm1pY3Jvc29mdC5jb21cIixcbl0pO1xuXG5jb25zdCBpc0FyYyA9IG5hdmlnYXRvci51c2VyQWdlbnQuaW5jbHVkZXMoXCJBcmNcIik7XG5jb25zdCBpc1NpZGVQYW5lbFN1cHBvcnRlZCA9ICgpID0+XG4gIEJvb2xlYW4oY2hyb21lLnNpZGVQYW5lbCAmJiB0eXBlb2YgY2hyb21lLnNpZGVQYW5lbC5vcGVuID09PSBcImZ1bmN0aW9uXCIpO1xubGV0IHVzZVBvcHVwTW9kZSA9IGlzQXJjIHx8ICFpc1NpZGVQYW5lbFN1cHBvcnRlZCgpO1xubGV0IGZhbGxiYWNrUG9wdXBXaW5kb3dJZCA9IG51bGw7XG5cbmNvbnN0IHNldFBhbmVsTW9kZSA9IGFzeW5jIChtb2RlKSA9PiB7XG4gIGF3YWl0IGNocm9tZS5zdG9yYWdlLnNlc3Npb25cbiAgICAuc2V0KHsgW1BBTkVMX01PREVfU0VTU0lPTl9LRVldOiBTdHJpbmcobW9kZSB8fCBcInNpZGVwYW5lbFwiKSB9KVxuICAgIC5jYXRjaCgoKSA9PiB7fSk7XG59O1xuXG5jb25zdCBzaG91bGRVc2VQb3B1cE1vZGUgPSAoKSA9PlxuICBpc0FyYyB8fCAhaXNTaWRlUGFuZWxTdXBwb3J0ZWQoKTtcblxuY29uc3QgZ2V0U2lkZVBhbmVsVXJsID0gKHJvdXRlID0gXCJcIikgPT4ge1xuICBjb25zdCBiYXNlID0gY2hyb21lLnJ1bnRpbWUuZ2V0VVJMKFNJREVfUEFORUxfUEFUSCk7XG4gIGNvbnN0IGNsZWFuID0gU3RyaW5nKHJvdXRlIHx8IFwiXCIpLnJlcGxhY2UoL14jLywgXCJcIikudHJpbSgpO1xuICByZXR1cm4gY2xlYW4gPyBgJHtiYXNlfSMke2NsZWFufWAgOiBiYXNlO1xufTtcblxuY29uc3QgcmVzb2x2ZVBvcHVwUGxhY2VtZW50ID0gYXN5bmMgKHdpbmRvd0lkKSA9PiB7XG4gIGNvbnN0IHNjcmVlbldpZHRoID0gTnVtYmVyKGdsb2JhbFRoaXM/LnNjcmVlbj8ud2lkdGggfHwgMCk7XG4gIGNvbnN0IHNjcmVlbkhlaWdodCA9IE51bWJlcihnbG9iYWxUaGlzPy5zY3JlZW4/LmhlaWdodCB8fCAwKTtcbiAgbGV0IGxlZnQgPSBzY3JlZW5XaWR0aFxuICAgID8gc2NyZWVuV2lkdGggLSBGQUxMQkFDS19QQU5FTF9XSURUSCAtIEZBTExCQUNLX1BBTkVMX1JJR0hUX09GRlNFVFxuICAgIDogMDtcbiAgbGV0IHRvcCA9IEZBTExCQUNLX1BBTkVMX1RPUF9PRkZTRVQ7XG5cbiAgaWYgKCFzY3JlZW5XaWR0aCB8fCAhc2NyZWVuSGVpZ2h0KSB7XG4gICAgY29uc3QgYW5jaG9yV2luZG93ID1cbiAgICAgICh3aW5kb3dJZCA/IGF3YWl0IGNocm9tZS53aW5kb3dzLmdldCh3aW5kb3dJZCkuY2F0Y2goKCkgPT4gbnVsbCkgOiBudWxsKSB8fFxuICAgICAgKGF3YWl0IGNocm9tZS53aW5kb3dzLmdldExhc3RGb2N1c2VkKCkuY2F0Y2goKCkgPT4gbnVsbCkpO1xuICAgIGlmIChhbmNob3JXaW5kb3cpIHtcbiAgICAgIGNvbnN0IGFuY2hvckxlZnQgPSBOdW1iZXIoYW5jaG9yV2luZG93LmxlZnQgfHwgMCk7XG4gICAgICBjb25zdCBhbmNob3JUb3AgPSBOdW1iZXIoYW5jaG9yV2luZG93LnRvcCB8fCAwKTtcbiAgICAgIGNvbnN0IGFuY2hvcldpZHRoID0gTnVtYmVyKGFuY2hvcldpbmRvdy53aWR0aCB8fCBGQUxMQkFDS19QQU5FTF9XSURUSCk7XG4gICAgICBsZWZ0ID1cbiAgICAgICAgYW5jaG9yTGVmdCArXG4gICAgICAgIGFuY2hvcldpZHRoIC1cbiAgICAgICAgRkFMTEJBQ0tfUEFORUxfV0lEVEggLVxuICAgICAgICBGQUxMQkFDS19QQU5FTF9SSUdIVF9PRkZTRVQ7XG4gICAgICB0b3AgPSBhbmNob3JUb3AgKyBGQUxMQkFDS19QQU5FTF9UT1BfT0ZGU0VUO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IG1heExlZnQgPSBNYXRoLm1heCgwLCBzY3JlZW5XaWR0aCAtIEZBTExCQUNLX1BBTkVMX1dJRFRIKTtcbiAgY29uc3QgbWF4VG9wID0gTWF0aC5tYXgoMCwgc2NyZWVuSGVpZ2h0IC0gRkFMTEJBQ0tfUEFORUxfSEVJR0hUKTtcbiAgcmV0dXJuIHtcbiAgICBsZWZ0OiBNYXRoLm1heCgwLCBNYXRoLm1pbihNYXRoLnJvdW5kKGxlZnQpLCBtYXhMZWZ0IHx8IE1hdGgucm91bmQobGVmdCkpKSxcbiAgICB0b3A6IE1hdGgubWF4KDAsIE1hdGgubWluKE1hdGgucm91bmQodG9wKSwgbWF4VG9wIHx8IE1hdGgucm91bmQodG9wKSkpLFxuICB9O1xufTtcblxuY29uc3Qgc3Rhc2hQZW5kaW5nUGFuZWxBY3Rpb24gPSBhc3luYyAoYWN0aW9uID0gbnVsbCkgPT4ge1xuICBpZiAoIWFjdGlvbikgcmV0dXJuO1xuICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uXG4gICAgLnNldCh7IFtQRU5ESU5HX1BBTkVMX0FDVElPTl9LRVldOiBhY3Rpb24gfSlcbiAgICAuY2F0Y2goKCkgPT4ge30pO1xufTtcblxuY29uc3QgZm9jdXNFeGlzdGluZ1BhbmVsID0gYXN5bmMgKHJvdXRlID0gXCJcIikgPT4ge1xuICBjb25zdCBiYXNlID0gY2hyb21lLnJ1bnRpbWUuZ2V0VVJMKFNJREVfUEFORUxfUEFUSCk7XG4gIGlmIChOdW1iZXIuaXNJbnRlZ2VyKGZhbGxiYWNrUG9wdXBXaW5kb3dJZCkpIHtcbiAgICBjb25zdCBrbm93bldpbmRvdyA9IGF3YWl0IGNocm9tZS53aW5kb3dzXG4gICAgICAuZ2V0KGZhbGxiYWNrUG9wdXBXaW5kb3dJZCwgeyBwb3B1bGF0ZTogdHJ1ZSB9KVxuICAgICAgLmNhdGNoKCgpID0+IG51bGwpO1xuICAgIGlmIChrbm93bldpbmRvdz8uaWQpIHtcbiAgICAgIGNvbnN0IHBhbmVsVGFiID1cbiAgICAgICAga25vd25XaW5kb3cudGFicz8uZmluZCgodGFiKSA9PlxuICAgICAgICAgIFN0cmluZyh0YWI/LnVybCB8fCBcIlwiKS5zdGFydHNXaXRoKGJhc2UpLFxuICAgICAgICApIHx8IGtub3duV2luZG93LnRhYnM/LlswXTtcbiAgICAgIGF3YWl0IGNocm9tZS53aW5kb3dzXG4gICAgICAgIC51cGRhdGUoa25vd25XaW5kb3cuaWQsIHsgZm9jdXNlZDogdHJ1ZSB9KVxuICAgICAgICAuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgaWYgKHBhbmVsVGFiPy5pZCkge1xuICAgICAgICBhd2FpdCBjaHJvbWUudGFic1xuICAgICAgICAgIC51cGRhdGUocGFuZWxUYWIuaWQsIHsgYWN0aXZlOiB0cnVlLCB1cmw6IGdldFNpZGVQYW5lbFVybChyb3V0ZSkgfSlcbiAgICAgICAgICAuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIHRhYjogcGFuZWxUYWIsIHJldXNlZDogdHJ1ZSB9O1xuICAgIH1cbiAgICBmYWxsYmFja1BvcHVwV2luZG93SWQgPSBudWxsO1xuICB9XG5cbiAgY29uc3QgdGFicyA9IGF3YWl0IGNocm9tZS50YWJzXG4gICAgLnF1ZXJ5KHsgdXJsOiBgJHtiYXNlfSpgIH0pXG4gICAgLmNhdGNoKCgpID0+IFtdKTtcbiAgaWYgKCF0YWJzLmxlbmd0aCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHRhYiA9IHRhYnNbMF07XG4gIGlmICh0YWIud2luZG93SWQpIHtcbiAgICBmYWxsYmFja1BvcHVwV2luZG93SWQgPSB0YWIud2luZG93SWQ7XG4gIH1cbiAgaWYgKHRhYi53aW5kb3dJZCkge1xuICAgIGF3YWl0IGNocm9tZS53aW5kb3dzLnVwZGF0ZSh0YWIud2luZG93SWQsIHsgZm9jdXNlZDogdHJ1ZSB9KS5jYXRjaCgoKSA9PiB7fSk7XG4gIH1cbiAgaWYgKHRhYi5pZCkge1xuICAgIGF3YWl0IGNocm9tZS50YWJzXG4gICAgICAudXBkYXRlKHRhYi5pZCwgeyBhY3RpdmU6IHRydWUsIHVybDogZ2V0U2lkZVBhbmVsVXJsKHJvdXRlKSB9KVxuICAgICAgLmNhdGNoKCgpID0+IHt9KTtcbiAgfVxuICByZXR1cm4geyBvazogdHJ1ZSwgdGFiLCByZXVzZWQ6IHRydWUgfTtcbn07XG5cbmNvbnN0IGNyZWF0ZVBvcHVwUGFuZWwgPSBhc3luYyAoeyByb3V0ZSA9IFwiXCIsIGZvY3VzID0gdHJ1ZSwgd2luZG93SWQgfSA9IHt9KSA9PiB7XG4gIGF3YWl0IHNldFBhbmVsTW9kZShcInBvcHVwXCIpO1xuICBjb25zdCB7IGxlZnQsIHRvcCB9ID0gYXdhaXQgcmVzb2x2ZVBvcHVwUGxhY2VtZW50KHdpbmRvd0lkKTtcbiAgY29uc3Qgd2luID0gYXdhaXQgY2hyb21lLndpbmRvd3MuY3JlYXRlKHtcbiAgICB1cmw6IGdldFNpZGVQYW5lbFVybChyb3V0ZSksXG4gICAgdHlwZTogXCJwb3B1cFwiLFxuICAgIHdpZHRoOiBGQUxMQkFDS19QQU5FTF9XSURUSCxcbiAgICBoZWlnaHQ6IEZBTExCQUNLX1BBTkVMX0hFSUdIVCxcbiAgICBsZWZ0LFxuICAgIHRvcCxcbiAgICBmb2N1c2VkOiBmb2N1cyxcbiAgfSk7XG4gIGZhbGxiYWNrUG9wdXBXaW5kb3dJZCA9IHR5cGVvZiB3aW4/LmlkID09PSBcIm51bWJlclwiID8gd2luLmlkIDogbnVsbDtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIG1vZGU6IFwicG9wdXBcIiwgdGFiOiB3aW4/LnRhYnM/LlswXSwgcmV1c2VkOiBmYWxzZSB9O1xufTtcblxuY29uc3Qgb3BlblBvcHVwUGFuZWwgPSBhc3luYyAoeyByb3V0ZSA9IFwiXCIsIGZvY3VzID0gdHJ1ZSwgd2luZG93SWQgfSA9IHt9KSA9PiB7XG4gIGF3YWl0IHNldFBhbmVsTW9kZShcInBvcHVwXCIpO1xuICBjb25zdCBleGlzdGluZyA9IGF3YWl0IGZvY3VzRXhpc3RpbmdQYW5lbChyb3V0ZSk7XG4gIGlmIChleGlzdGluZykge1xuICAgIHJldHVybiB7XG4gICAgICBvazogdHJ1ZSxcbiAgICAgIG1vZGU6IFwicG9wdXBcIixcbiAgICAgIHRhYjogZXhpc3RpbmcudGFiLFxuICAgICAgcmV1c2VkOiB0cnVlLFxuICAgIH07XG4gIH1cbiAgcmV0dXJuIGF3YWl0IGNyZWF0ZVBvcHVwUGFuZWwoeyByb3V0ZSwgZm9jdXMsIHdpbmRvd0lkIH0pO1xufTtcblxuY29uc3Qgb3BlblByb21wdGl1bVBhbmVsID0gYXN5bmMgKHtcbiAgdGFiSWQsXG4gIHdpbmRvd0lkLFxuICByb3V0ZSA9IFwiXCIsXG4gIHBlbmRpbmdBY3Rpb24gPSBudWxsLFxufSA9IHt9KSA9PiB7XG4gIGlmICghdXNlUG9wdXBNb2RlICYmIGlzU2lkZVBhbmVsU3VwcG9ydGVkKCkpIHtcbiAgICB0cnkge1xuICAgICAgaWYgKHRhYklkICYmIHdpbmRvd0lkKSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS5zaWRlUGFuZWwub3Blbih7IHRhYklkLCB3aW5kb3dJZCB9KTtcbiAgICAgIH0gZWxzZSBpZiAod2luZG93SWQpIHtcbiAgICAgICAgYXdhaXQgY2hyb21lLnNpZGVQYW5lbC5vcGVuKHsgd2luZG93SWQgfSk7XG4gICAgICB9IGVsc2UgaWYgKHRhYklkKSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS5zaWRlUGFuZWwub3Blbih7IHRhYklkIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgW3RhYl0gPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7XG4gICAgICAgICAgYWN0aXZlOiB0cnVlLFxuICAgICAgICAgIGN1cnJlbnRXaW5kb3c6IHRydWUsXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAodGFiPy5pZCAmJiB0YWIud2luZG93SWQpIHtcbiAgICAgICAgICBhd2FpdCBjaHJvbWUuc2lkZVBhbmVsLm9wZW4oeyB0YWJJZDogdGFiLmlkLCB3aW5kb3dJZDogdGFiLndpbmRvd0lkIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBhd2FpdCBzZXRQYW5lbE1vZGUoXCJzaWRlcGFuZWxcIik7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgbW9kZTogXCJzaWRlcGFuZWxcIiB9O1xuICAgIH0gY2F0Y2ggKF9lcnJvcikge1xuICAgICAgdXNlUG9wdXBNb2RlID0gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICBpZiAocGVuZGluZ0FjdGlvbikge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgZm9jdXNFeGlzdGluZ1BhbmVsKHJvdXRlKTtcbiAgICBpZiAoZXhpc3Rpbmc/LnJldXNlZCkge1xuICAgICAgY29uc3QgYWN0aW9uTmFtZSA9XG4gICAgICAgIHBlbmRpbmdBY3Rpb24/LnR5cGUgPT09IFwic2hvd0NvbnRpbnVhdGlvblwiXG4gICAgICAgICAgPyBcInNob3dDb250aW51YXRpb25cIlxuICAgICAgICAgIDogXCJzaG93RXhwb3J0XCI7XG4gICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IGFjdGlvbjogYWN0aW9uTmFtZSB9KS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uXG4gICAgICAgIC5yZW1vdmUoW1BFTkRJTkdfUEFORUxfQUNUSU9OX0tFWV0pXG4gICAgICAgIC5jYXRjaCgoKSA9PiB7fSk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgbW9kZTogXCJwb3B1cFwiLCB0YWI6IGV4aXN0aW5nLnRhYiwgcmV1c2VkOiB0cnVlIH07XG4gICAgfVxuXG4gICAgYXdhaXQgc3Rhc2hQZW5kaW5nUGFuZWxBY3Rpb24ocGVuZGluZ0FjdGlvbik7XG4gICAgcmV0dXJuIGF3YWl0IGNyZWF0ZVBvcHVwUGFuZWwoeyByb3V0ZSwgd2luZG93SWQgfSk7XG4gIH1cblxuICByZXR1cm4gYXdhaXQgb3BlblBvcHVwUGFuZWwoeyByb3V0ZSwgd2luZG93SWQgfSk7XG59O1xuXG5jb25zdCBpbml0aWFsaXplU3RvcmFnZUtleXMgPSBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHN0YXRlID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFtcbiAgICBcInByb21wdHNcIixcbiAgXSk7XG4gIGNvbnN0IHVwZGF0ZXMgPSB7fTtcblxuICBpZiAoIUFycmF5LmlzQXJyYXkoc3RhdGUucHJvbXB0cykpIHtcbiAgICB1cGRhdGVzLnByb21wdHMgPSBbXTtcbiAgfVxuXG4gIGlmIChPYmplY3Qua2V5cyh1cGRhdGVzKS5sZW5ndGggPiAwKSB7XG4gICAgYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHVwZGF0ZXMpO1xuICB9XG59O1xuXG5jb25zdCBkZXRlY3RQbGF0Zm9ybUZyb21VcmwgPSAodmFsdWUpID0+IHtcbiAgY29uc3QgdXJsID0gU3RyaW5nKHZhbHVlIHx8IFwiXCIpLnRvTG93ZXJDYXNlKCk7XG4gIGlmICh1cmwuaW5jbHVkZXMoXCJjaGF0Z3B0LmNvbVwiKSkgcmV0dXJuIFwiY2hhdGdwdFwiO1xuICBpZiAodXJsLmluY2x1ZGVzKFwiY2xhdWRlLmFpXCIpKSByZXR1cm4gXCJjbGF1ZGVcIjtcbiAgaWYgKHVybC5pbmNsdWRlcyhcImdlbWluaS5nb29nbGUuY29tXCIpKSByZXR1cm4gXCJnZW1pbmlcIjtcbiAgaWYgKHVybC5pbmNsdWRlcyhcInBlcnBsZXhpdHkuYWlcIikpIHJldHVybiBcInBlcnBsZXhpdHlcIjtcbiAgaWYgKHVybC5pbmNsdWRlcyhcImNvcGlsb3QubWljcm9zb2Z0LmNvbVwiKSkgcmV0dXJuIFwiY29waWxvdFwiO1xuICByZXR1cm4gXCJ1bmtub3duXCI7XG59O1xuXG5jb25zdCByZWdpc3RlckNvbnRleHRNZW51cyA9IGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBhd2FpdCBjaHJvbWUuY29udGV4dE1lbnVzLnJlbW92ZUFsbCgpO1xuICAgIGNocm9tZS5jb250ZXh0TWVudXMuY3JlYXRlKHtcbiAgICAgIGlkOiBDT05URVhUX01FTlVfU0FWRV9JRCxcbiAgICAgIHRpdGxlOiBcIlNhdmUgdG8gUHJvbXB0aXVtXCIsXG4gICAgICBjb250ZXh0czogW1wic2VsZWN0aW9uXCJdLFxuICAgICAgZG9jdW1lbnRVcmxQYXR0ZXJuczogU1VQUE9SVEVEX0RPQ19QQVRURVJOUyxcbiAgICB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLndhcm4oXG4gICAgICBcIltQcm9tcHRpdW1dW1NlcnZpY2VXb3JrZXJdIEZhaWxlZCB0byByZWdpc3RlciBjb250ZXh0IG1lbnUuXCIsXG4gICAgICBlcnJvcixcbiAgICApO1xuICB9XG59O1xuXG5jb25zdCBvbkluc3RhbGxlZCA9IGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBhd2FpdCBpbml0aWFsaXplU3RvcmFnZUtleXMoKTtcbiAgICBhd2FpdCByZWdpc3RlckNvbnRleHRNZW51cygpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJbUHJvbXB0aXVtXVtTZXJ2aWNlV29ya2VyXSBJbml0aWFsaXphdGlvbiBmYWlsZWQuXCIsIGVycm9yKTtcbiAgfVxufTtcblxuY29uc3Qgb3BlblNpZGVQYW5lbEZvckFjdGl2ZVRhYiA9IGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBbdGFiXSA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHtcbiAgICAgIGFjdGl2ZTogdHJ1ZSxcbiAgICAgIGN1cnJlbnRXaW5kb3c6IHRydWUsXG4gICAgfSk7XG4gICAgaWYgKCF0YWI/LmlkIHx8ICF0YWIud2luZG93SWQpIHtcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiTm8gYWN0aXZlIHRhYiBhdmFpbGFibGUuXCIgfTtcbiAgICB9XG4gICAgY29uc3Qgb3BlbmVkID0gYXdhaXQgb3BlblByb21wdGl1bVBhbmVsKHtcbiAgICAgIHRhYklkOiB0YWIuaWQsXG4gICAgICB3aW5kb3dJZDogdGFiLndpbmRvd0lkLFxuICAgIH0pO1xuICAgIGlmICghb3BlbmVkPy5vaykge1xuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJGYWlsZWQgdG8gb3BlbiBQcm9tcHRpdW0gcGFuZWwuXCIgfTtcbiAgICB9XG4gICAgcmV0dXJuIHsgb2s6IHRydWUsIHRhYiwgbW9kZTogb3BlbmVkLm1vZGUgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgZXJyb3I6IGVycm9yPy5tZXNzYWdlIHx8IFwiRmFpbGVkIHRvIG9wZW4gUHJvbXB0aXVtIHBhbmVsLlwiLFxuICAgIH07XG4gIH1cbn07XG5cbmNvbnN0IGhhbmRsZU9wZW5MbG1UYWIgPSBhc3luYyAodXJsKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTChTdHJpbmcodXJsIHx8IFwiXCIpKTtcblxuICAgIGlmIChwYXJzZWQucHJvdG9jb2wgIT09IFwiaHR0cHM6XCIpIHtcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB0YWIgVVJMLlwiIH07XG4gICAgfVxuXG4gICAgaWYgKCFBTExPV0VEX0xMTV9IT1NUUy5oYXMocGFyc2VkLmhvc3RuYW1lLnRvTG93ZXJDYXNlKCkpKSB7XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIlRhcmdldCBob3N0IGlzIG5vdCBhbGxvd2xpc3RlZC5cIiB9O1xuICAgIH1cblxuICAgIGF3YWl0IGNocm9tZS50YWJzLmNyZWF0ZSh7IHVybDogcGFyc2VkLnRvU3RyaW5nKCkgfSk7XG4gICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJGYWlsZWQgdG8gb3BlbiByZXF1ZXN0ZWQgdGFiLlwiIH07XG4gIH1cbn07XG5cbmNvbnN0IGhhbmRsZVNldFNpZGVQYW5lbFBheWxvYWQgPSBhc3luYyAocGF5bG9hZCkgPT4ge1xuICBjb25zdCB2YWx1ZSA9IHBheWxvYWQgJiYgdHlwZW9mIHBheWxvYWQgPT09IFwib2JqZWN0XCIgPyBwYXlsb2FkIDogbnVsbDtcblxuICBpZiAoIXZhbHVlIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLm1lc3NhZ2VzKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzaWRlIHBhbmVsIHBheWxvYWQuXCIgfTtcbiAgfVxuXG4gIHRyeSB7XG4gICAgYXdhaXQgY2hyb21lLnN0b3JhZ2Uuc2Vzc2lvbi5zZXQoeyBbU0lERVBBTkVMX1NFU1NJT05fS0VZXTogdmFsdWUgfSk7XG4gICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICByZXR1cm4ge1xuICAgICAgb2s6IGZhbHNlLFxuICAgICAgZXJyb3I6IGVycm9yPy5tZXNzYWdlIHx8IFwiRmFpbGVkIHRvIHBlcnNpc3Qgc2lkZSBwYW5lbCBwYXlsb2FkLlwiLFxuICAgIH07XG4gIH1cbn07XG5cbmNvbnN0IGhhbmRsZU9wZW5TaWRlUGFuZWwgPSBhc3luYyAoX3NlbmRlciwgcGF5bG9hZCA9IG51bGwpID0+IHtcbiAgdHJ5IHtcbiAgICBpZiAocGF5bG9hZCAmJiB0eXBlb2YgcGF5bG9hZCA9PT0gXCJvYmplY3RcIikge1xuICAgICAgY29uc3QgcGVyc2lzdGVkID0gYXdhaXQgaGFuZGxlU2V0U2lkZVBhbmVsUGF5bG9hZChwYXlsb2FkKTtcblxuICAgICAgaWYgKCFwZXJzaXN0ZWQub2spIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBvazogZmFsc2UsXG4gICAgICAgICAgZXJyb3I6IHBlcnNpc3RlZC5lcnJvciB8fCBcIlBheWxvYWQgZmFpbGVkIHRvIHBlcnNpc3QuXCIsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBlcnJvcj8ubWVzc2FnZSB8fCBcIlVuYWJsZSB0byBoYW5kbGUgcGF5bG9hZC5cIiB9O1xuICB9XG59O1xuXG5jb25zdCBoYW5kbGVPcGVuQ29udGludWF0aW9uUGFuZWwgPSBhc3luYyAoc2VuZGVyKSA9PiB7XG4gIGNvbnN0IHRhYklkID0gc2VuZGVyPy50YWI/LmlkO1xuICBjb25zdCB3aW5kb3dJZCA9IHNlbmRlcj8udGFiPy53aW5kb3dJZDtcbiAgdHJ5IHtcbiAgICBjb25zdCBvcGVuZWQgPSBhd2FpdCBvcGVuUHJvbXB0aXVtUGFuZWwoe1xuICAgICAgdGFiSWQsXG4gICAgICB3aW5kb3dJZCxcbiAgICAgIHJvdXRlOiBcImNvbnRpbnVlXCIsXG4gICAgICBwZW5kaW5nQWN0aW9uOiB7IHR5cGU6IFwic2hvd0NvbnRpbnVhdGlvblwiIH0sXG4gICAgfSk7XG4gICAgaWYgKCFvcGVuZWQ/Lm9rKSB7XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkZhaWxlZCB0byBvcGVuIFByb21wdGl1bSBwYW5lbC5cIiB9O1xuICAgIH1cbiAgICBpZiAob3BlbmVkLm1vZGUgPT09IFwic2lkZXBhbmVsXCIpIHtcbiAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgYWN0aW9uOiBcInNob3dDb250aW51YXRpb25cIiB9KS5jYXRjaChcbiAgICAgICAgKGVycm9yKSA9PiB7XG4gICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgXCJbUHJvbXB0aXVtXVtTZXJ2aWNlV29ya2VyXSBGYWlsZWQgdG8gbm90aWZ5IGNvbnRpbnVhdGlvbiB2aWV3LlwiLFxuICAgICAgICAgICAgZXJyb3IsXG4gICAgICAgICAgKTtcbiAgICAgICAgfSxcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiBmYWxzZSxcbiAgICAgIGVycm9yOiBlcnJvcj8ubWVzc2FnZSB8fCBcIkZhaWxlZCB0byBvcGVuIFByb21wdGl1bSBwYW5lbC5cIixcbiAgICB9O1xuICB9XG59O1xuXG5jb25zdCBvblJ1bnRpbWVNZXNzYWdlID0gKG1lc3NhZ2UsIHNlbmRlciwgc2VuZFJlc3BvbnNlKSA9PiB7XG4gIGlmIChtZXNzYWdlPy50eXBlID09PSBcIk9GRlNDUkVFTl9FTUJFRERJTkdcIikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGxldCBwYW5lbE9wZW5Qcm9taXNlID0gbnVsbDtcblxuICBpZiAobWVzc2FnZT8uYWN0aW9uID09PSBcIk9QRU5fU0lERVBBTkVMXCIpIHtcbiAgICBjb25zdCB0YWJJZCA9IHNlbmRlcj8udGFiPy5pZDtcbiAgICBjb25zdCB3aW5kb3dJZCA9IHNlbmRlcj8udGFiPy53aW5kb3dJZDtcbiAgICBpZiAoaXNTaWRlUGFuZWxTdXBwb3J0ZWQoKSAmJiB3aW5kb3dJZCkge1xuICAgICAgcGFuZWxPcGVuUHJvbWlzZSA9IGNocm9tZS5zaWRlUGFuZWxcbiAgICAgICAgLm9wZW4oeyB3aW5kb3dJZCwgdGFiSWQgfSlcbiAgICAgICAgLmNhdGNoKChlcnIpID0+IGVycik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHBhbmVsT3BlblByb21pc2UgPSBvcGVuUHJvbXB0aXVtUGFuZWwoe1xuICAgICAgICB0YWJJZCxcbiAgICAgICAgd2luZG93SWQsXG4gICAgICAgIHJvdXRlOiBcImV4cG9ydFwiLFxuICAgICAgICBwZW5kaW5nQWN0aW9uOiB7IHR5cGU6IFwic2hvd0V4cG9ydFwiIH0sXG4gICAgICB9KS5jYXRjaCgoZXJyKSA9PiBlcnIpO1xuICAgIH1cbiAgfVxuXG4gIHZvaWQgKGFzeW5jICgpID0+IHtcbiAgICBsZXQgcmVzcG9uZGVkID0gZmFsc2U7XG4gICAgY29uc3QgbWFwcGVkVHlwZSA9IFN0cmluZyhtZXNzYWdlPy50eXBlIHx8IG1lc3NhZ2U/LmFjdGlvbiB8fCBcIlwiKS50cmltKCk7XG4gICAgY29uc3Qgcm91dGVkTWVzc2FnZSA9IG1hcHBlZFR5cGVcbiAgICAgID8geyAuLi5tZXNzYWdlLCB0eXBlOiBtYXBwZWRUeXBlIH1cbiAgICAgIDogbWVzc2FnZTtcblxuICAgIGNvbnN0IHJlc3BvbmQgPSAocGF5bG9hZCkgPT4ge1xuICAgICAgaWYgKHJlc3BvbmRlZCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHJlc3BvbmRlZCA9IHRydWU7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIHNlbmRSZXNwb25zZShwYXlsb2FkKTtcbiAgICAgIH0gY2F0Y2ggKF9lcnJvcikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBpZiAocm91dGVkTWVzc2FnZT8udHlwZT8uc3RhcnRzV2l0aChcIkFJX1wiKSkge1xuICAgICAgICBjb25zdCBoYW5kbGVkID0gYXdhaXQgaGFuZGxlQUlNZXNzYWdlKHJvdXRlZE1lc3NhZ2UsIHJlc3BvbmQpO1xuICAgICAgICBpZiAoaGFuZGxlZCkgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAobWVzc2FnZT8uYWN0aW9uID09PSBcIm9wZW5FeHBvcnRcIikge1xuICAgICAgICBjb25zdCB0YWJJZCA9IHNlbmRlcj8udGFiPy5pZDtcbiAgICAgICAgY29uc3Qgd2luZG93SWQgPSBzZW5kZXI/LnRhYj8ud2luZG93SWQ7XG4gICAgICAgIGlmICghdGFiSWQgfHwgIXdpbmRvd0lkKSB7XG4gICAgICAgICAgcmVzcG9uZCh7IG9rOiBmYWxzZSwgZXJyb3I6IFwiTm8gdGFiIElEXCIgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IG9wZW5lZCA9IGF3YWl0IG9wZW5Qcm9tcHRpdW1QYW5lbCh7XG4gICAgICAgICAgdGFiSWQsXG4gICAgICAgICAgd2luZG93SWQsXG4gICAgICAgICAgcm91dGU6IFwiZXhwb3J0XCIsXG4gICAgICAgICAgcGVuZGluZ0FjdGlvbjogeyB0eXBlOiBcInNob3dFeHBvcnRcIiB9LFxuICAgICAgICB9KTtcbiAgICAgICAgaWYgKCFvcGVuZWQ/Lm9rKSB7XG4gICAgICAgICAgcmVzcG9uZCh7XG4gICAgICAgICAgICBvazogZmFsc2UsXG4gICAgICAgICAgICBlcnJvcjogXCJGYWlsZWQgdG8gb3BlbiBQcm9tcHRpdW0gcGFuZWwuXCIsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcGVuZWQubW9kZSA9PT0gXCJzaWRlcGFuZWxcIikge1xuICAgICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgYWN0aW9uOiBcInNob3dFeHBvcnRcIiB9KS5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgICAgXCJbUHJvbXB0aXVtXVtTZXJ2aWNlV29ya2VyXSBGYWlsZWQgdG8gbm90aWZ5IGV4cG9ydCB2aWV3LlwiLFxuICAgICAgICAgICAgICBlcnJvcixcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXNwb25kKHsgb2s6IHRydWUgfSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKG1lc3NhZ2U/LmFjdGlvbiA9PT0gXCJvcGVuU2lkZVBhbmVsXCIpIHtcbiAgICAgICAgY29uc3QgdGFiSWQgPSBzZW5kZXI/LnRhYj8uaWQ7XG4gICAgICAgIGNvbnN0IHdpbmRvd0lkID0gc2VuZGVyPy50YWI/LndpbmRvd0lkO1xuICAgICAgICBpZiAoIXRhYklkIHx8ICF3aW5kb3dJZCkge1xuICAgICAgICAgIHJlc3BvbmQoeyBvazogZmFsc2UsIGVycm9yOiBcIk5vIHRhYiBJRFwiIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBvcGVuZWQgPSBhd2FpdCBvcGVuUHJvbXB0aXVtUGFuZWwoeyB0YWJJZCwgd2luZG93SWQgfSk7XG4gICAgICAgIGlmICghb3BlbmVkPy5vaykge1xuICAgICAgICAgIHJlc3BvbmQoe1xuICAgICAgICAgICAgb2s6IGZhbHNlLFxuICAgICAgICAgICAgZXJyb3I6IFwiRmFpbGVkIHRvIG9wZW4gUHJvbXB0aXVtIHBhbmVsLlwiLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICByZXNwb25kKHsgb2s6IHRydWUgfSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKG1lc3NhZ2U/LmFjdGlvbiA9PT0gXCJvcGVuTGxtVGFiXCIpIHtcbiAgICAgICAgcmVzcG9uZChhd2FpdCBoYW5kbGVPcGVuTGxtVGFiKG1lc3NhZ2UudXJsKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKG1lc3NhZ2U/LmFjdGlvbiA9PT0gXCJvcGVuQ29udGludWF0aW9uUGFuZWxcIikge1xuICAgICAgICByZXNwb25kKGF3YWl0IGhhbmRsZU9wZW5Db250aW51YXRpb25QYW5lbChzZW5kZXIpKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAobWVzc2FnZT8uYWN0aW9uID09PSBcIk9QRU5fU0lERVBBTkVMXCIpIHtcbiAgICAgICAgY29uc3QgcGF5bG9hZFJlc3VsdCA9IGF3YWl0IGhhbmRsZU9wZW5TaWRlUGFuZWwoXG4gICAgICAgICAgc2VuZGVyLFxuICAgICAgICAgIG1lc3NhZ2UucGF5bG9hZCB8fCBudWxsLFxuICAgICAgICApO1xuXG4gICAgICAgIGxldCBvcGVuRXJyb3IgPSBudWxsO1xuICAgICAgICBpZiAocGFuZWxPcGVuUHJvbWlzZSkge1xuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHBhbmVsT3BlblByb21pc2U7XG4gICAgICAgICAgaWYgKHJlc3VsdCBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgICAgICBvcGVuRXJyb3IgPSByZXN1bHQubWVzc2FnZTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdD8ub2sgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICBvcGVuRXJyb3IgPSByZXN1bHQ/LmVycm9yIHx8IFwiUGFuZWwgb3BlbiBmYWlsZWQuXCI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG9wZW5FcnJvcikge1xuICAgICAgICAgIHJlc3BvbmQoeyBvazogZmFsc2UsIGVycm9yOiBgUGFuZWwgRXJyb3I6ICR7b3BlbkVycm9yfWAgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzcG9uZChwYXlsb2FkUmVzdWx0KTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAobWVzc2FnZT8uYWN0aW9uID09PSBcIlNFVF9TSURFUEFORUxfUEFZTE9BRFwiKSB7XG4gICAgICAgIHJlc3BvbmQoYXdhaXQgaGFuZGxlU2V0U2lkZVBhbmVsUGF5bG9hZChtZXNzYWdlLnBheWxvYWQpKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAobWVzc2FnZT8uYWN0aW9uID09PSBcIlZBTElEQVRFX0dFTUlOSV9LRVlcIikge1xuICAgICAgICByZXNwb25kKGF3YWl0IHZhbGlkYXRlR2VtaW5pQXBpS2V5KG1lc3NhZ2Uua2V5KSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgcmVzcG9uZCh7XG4gICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgZXJyb3I6IGBVbmtub3duIGFjdGlvbjogJHtTdHJpbmcobWVzc2FnZT8uYWN0aW9uIHx8IFwidW5kZWZpbmVkXCIpfWAsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmVzcG9uZCh7XG4gICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgZXJyb3I6IGVycm9yPy5tZXNzYWdlIHx8IFwiVW5leHBlY3RlZCBzZXJ2aWNlIHdvcmtlciBmYWlsdXJlLlwiLFxuICAgICAgfSk7XG4gICAgfVxuICB9KSgpO1xuXG4gIHJldHVybiB0cnVlO1xufTtcblxuY2hyb21lLnJ1bnRpbWUub25JbnN0YWxsZWQuYWRkTGlzdGVuZXIoKCkgPT4ge1xuICB2b2lkIG9uSW5zdGFsbGVkKCk7XG59KTtcblxuY2hyb21lLnJ1bnRpbWUub25TdGFydHVwLmFkZExpc3RlbmVyKCgpID0+IHtcbiAgdm9pZCAoYXN5bmMgKCkgPT4ge1xuICAgIGF3YWl0IHJlZ2lzdGVyQ29udGV4dE1lbnVzKCk7XG4gIH0pKCk7XG59KTtcblxuY2hyb21lLmNvbW1hbmRzLm9uQ29tbWFuZC5hZGRMaXN0ZW5lcigoY29tbWFuZCkgPT4ge1xuICBpZiAoY29tbWFuZCAhPT0gXCJvcGVuLXNpZGUtcGFuZWxcIikge1xuICAgIHJldHVybjtcbiAgfVxuICB2b2lkIG9wZW5TaWRlUGFuZWxGb3JBY3RpdmVUYWIoKTtcbn0pO1xuXG5jaHJvbWUuY29udGV4dE1lbnVzLm9uQ2xpY2tlZC5hZGRMaXN0ZW5lcigoaW5mbywgdGFiKSA9PiB7XG4gIGlmIChpbmZvLm1lbnVJdGVtSWQgIT09IENPTlRFWFRfTUVOVV9TQVZFX0lEKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgc2VsZWN0ZWRUZXh0ID0gU3RyaW5nKGluZm8uc2VsZWN0aW9uVGV4dCB8fCBcIlwiKS50cmltKCk7XG4gIGlmICghc2VsZWN0ZWRUZXh0IHx8ICF0YWI/LmlkIHx8ICF0YWIud2luZG93SWQpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2b2lkIChhc3luYyAoKSA9PiB7XG4gICAgY29uc3Qgc291cmNlVXJsID0gU3RyaW5nKHRhYi51cmwgfHwgXCJcIik7XG4gICAgYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHtcbiAgICAgIFtCUkFORF9LRVlTLnBlbmRpbmdTbmlwcGV0XToge1xuICAgICAgICB0ZXh0OiBzZWxlY3RlZFRleHQsXG4gICAgICAgIHNvdXJjZVVybCxcbiAgICAgICAgcGxhdGZvcm06IGRldGVjdFBsYXRmb3JtRnJvbVVybChzb3VyY2VVcmwpLFxuICAgICAgICBzYXZlZEF0OiBEYXRlLm5vdygpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGF3YWl0IG9wZW5Qcm9tcHRpdW1QYW5lbCh7IHRhYklkOiB0YWIuaWQsIHdpbmRvd0lkOiB0YWIud2luZG93SWQgfSkuY2F0Y2goXG4gICAgICAoKSA9PiB7fSxcbiAgICApO1xuICAgIGF3YWl0IGNocm9tZS50YWJzXG4gICAgICAuc2VuZE1lc3NhZ2UodGFiLmlkLCB7XG4gICAgICAgIGFjdGlvbjogXCJub3RpZnlQcm9tcHRpdW1cIixcbiAgICAgICAgdGV4dDogXCJTYXZlZCB0byBQcm9tcHRpdW1cIixcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goKCkgPT4ge30pO1xuICB9KSgpO1xufSk7XG5cbmNocm9tZS5ydW50aW1lLm9uU3VzcGVuZC5hZGRMaXN0ZW5lcigoKSA9PiB7XG4gIC8vIE5vLW9wXG59KTtcblxuICBjaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIob25SdW50aW1lTWVzc2FnZSk7XG59KTtcbiIsIi8vICNyZWdpb24gc25pcHBldFxuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBnbG9iYWxUaGlzLmJyb3dzZXI/LnJ1bnRpbWU/LmlkXG4gID8gZ2xvYmFsVGhpcy5icm93c2VyXG4gIDogZ2xvYmFsVGhpcy5jaHJvbWU7XG4vLyAjZW5kcmVnaW9uIHNuaXBwZXRcbiIsImltcG9ydCB7IGJyb3dzZXIgYXMgYnJvd3NlciQxIH0gZnJvbSBcIkB3eHQtZGV2L2Jyb3dzZXJcIjtcbi8vI3JlZ2lvbiBzcmMvYnJvd3Nlci50c1xuLyoqXG4qIENvbnRhaW5zIHRoZSBgYnJvd3NlcmAgZXhwb3J0IHdoaWNoIHlvdSBzaG91bGQgdXNlIHRvIGFjY2VzcyB0aGUgZXh0ZW5zaW9uXG4qIEFQSXMgaW4geW91ciBwcm9qZWN0OlxuKlxuKiBgYGB0c1xuKiBpbXBvcnQgeyBicm93c2VyIH0gZnJvbSAnd3h0L2Jyb3dzZXInO1xuKlxuKiBicm93c2VyLnJ1bnRpbWUub25JbnN0YWxsZWQuYWRkTGlzdGVuZXIoKCkgPT4ge1xuKiAgIC8vIC4uLlxuKiB9KTtcbiogYGBgXG4qXG4qIEBtb2R1bGUgd3h0L2Jyb3dzZXJcbiovXG5jb25zdCBicm93c2VyID0gYnJvd3NlciQxO1xuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBicm93c2VyIH07XG4iLCIvLyBzcmMvaW5kZXgudHNcbnZhciBfTWF0Y2hQYXR0ZXJuID0gY2xhc3Mge1xuICBjb25zdHJ1Y3RvcihtYXRjaFBhdHRlcm4pIHtcbiAgICBpZiAobWF0Y2hQYXR0ZXJuID09PSBcIjxhbGxfdXJscz5cIikge1xuICAgICAgdGhpcy5pc0FsbFVybHMgPSB0cnVlO1xuICAgICAgdGhpcy5wcm90b2NvbE1hdGNoZXMgPSBbLi4uX01hdGNoUGF0dGVybi5QUk9UT0NPTFNdO1xuICAgICAgdGhpcy5ob3N0bmFtZU1hdGNoID0gXCIqXCI7XG4gICAgICB0aGlzLnBhdGhuYW1lTWF0Y2ggPSBcIipcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgZ3JvdXBzID0gLyguKik6XFwvXFwvKC4qPykoXFwvLiopLy5leGVjKG1hdGNoUGF0dGVybik7XG4gICAgICBpZiAoZ3JvdXBzID09IG51bGwpXG4gICAgICAgIHRocm93IG5ldyBJbnZhbGlkTWF0Y2hQYXR0ZXJuKG1hdGNoUGF0dGVybiwgXCJJbmNvcnJlY3QgZm9ybWF0XCIpO1xuICAgICAgY29uc3QgW18sIHByb3RvY29sLCBob3N0bmFtZSwgcGF0aG5hbWVdID0gZ3JvdXBzO1xuICAgICAgdmFsaWRhdGVQcm90b2NvbChtYXRjaFBhdHRlcm4sIHByb3RvY29sKTtcbiAgICAgIHZhbGlkYXRlSG9zdG5hbWUobWF0Y2hQYXR0ZXJuLCBob3N0bmFtZSk7XG4gICAgICB2YWxpZGF0ZVBhdGhuYW1lKG1hdGNoUGF0dGVybiwgcGF0aG5hbWUpO1xuICAgICAgdGhpcy5wcm90b2NvbE1hdGNoZXMgPSBwcm90b2NvbCA9PT0gXCIqXCIgPyBbXCJodHRwXCIsIFwiaHR0cHNcIl0gOiBbcHJvdG9jb2xdO1xuICAgICAgdGhpcy5ob3N0bmFtZU1hdGNoID0gaG9zdG5hbWU7XG4gICAgICB0aGlzLnBhdGhuYW1lTWF0Y2ggPSBwYXRobmFtZTtcbiAgICB9XG4gIH1cbiAgaW5jbHVkZXModXJsKSB7XG4gICAgaWYgKHRoaXMuaXNBbGxVcmxzKVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgY29uc3QgdSA9IHR5cGVvZiB1cmwgPT09IFwic3RyaW5nXCIgPyBuZXcgVVJMKHVybCkgOiB1cmwgaW5zdGFuY2VvZiBMb2NhdGlvbiA/IG5ldyBVUkwodXJsLmhyZWYpIDogdXJsO1xuICAgIHJldHVybiAhIXRoaXMucHJvdG9jb2xNYXRjaGVzLmZpbmQoKHByb3RvY29sKSA9PiB7XG4gICAgICBpZiAocHJvdG9jb2wgPT09IFwiaHR0cFwiKVxuICAgICAgICByZXR1cm4gdGhpcy5pc0h0dHBNYXRjaCh1KTtcbiAgICAgIGlmIChwcm90b2NvbCA9PT0gXCJodHRwc1wiKVxuICAgICAgICByZXR1cm4gdGhpcy5pc0h0dHBzTWF0Y2godSk7XG4gICAgICBpZiAocHJvdG9jb2wgPT09IFwiZmlsZVwiKVxuICAgICAgICByZXR1cm4gdGhpcy5pc0ZpbGVNYXRjaCh1KTtcbiAgICAgIGlmIChwcm90b2NvbCA9PT0gXCJmdHBcIilcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNGdHBNYXRjaCh1KTtcbiAgICAgIGlmIChwcm90b2NvbCA9PT0gXCJ1cm5cIilcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNVcm5NYXRjaCh1KTtcbiAgICB9KTtcbiAgfVxuICBpc0h0dHBNYXRjaCh1cmwpIHtcbiAgICByZXR1cm4gdXJsLnByb3RvY29sID09PSBcImh0dHA6XCIgJiYgdGhpcy5pc0hvc3RQYXRoTWF0Y2godXJsKTtcbiAgfVxuICBpc0h0dHBzTWF0Y2godXJsKSB7XG4gICAgcmV0dXJuIHVybC5wcm90b2NvbCA9PT0gXCJodHRwczpcIiAmJiB0aGlzLmlzSG9zdFBhdGhNYXRjaCh1cmwpO1xuICB9XG4gIGlzSG9zdFBhdGhNYXRjaCh1cmwpIHtcbiAgICBpZiAoIXRoaXMuaG9zdG5hbWVNYXRjaCB8fCAhdGhpcy5wYXRobmFtZU1hdGNoKVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGhvc3RuYW1lTWF0Y2hSZWdleHMgPSBbXG4gICAgICB0aGlzLmNvbnZlcnRQYXR0ZXJuVG9SZWdleCh0aGlzLmhvc3RuYW1lTWF0Y2gpLFxuICAgICAgdGhpcy5jb252ZXJ0UGF0dGVyblRvUmVnZXgodGhpcy5ob3N0bmFtZU1hdGNoLnJlcGxhY2UoL15cXCpcXC4vLCBcIlwiKSlcbiAgICBdO1xuICAgIGNvbnN0IHBhdGhuYW1lTWF0Y2hSZWdleCA9IHRoaXMuY29udmVydFBhdHRlcm5Ub1JlZ2V4KHRoaXMucGF0aG5hbWVNYXRjaCk7XG4gICAgcmV0dXJuICEhaG9zdG5hbWVNYXRjaFJlZ2V4cy5maW5kKChyZWdleCkgPT4gcmVnZXgudGVzdCh1cmwuaG9zdG5hbWUpKSAmJiBwYXRobmFtZU1hdGNoUmVnZXgudGVzdCh1cmwucGF0aG5hbWUpO1xuICB9XG4gIGlzRmlsZU1hdGNoKHVybCkge1xuICAgIHRocm93IEVycm9yKFwiTm90IGltcGxlbWVudGVkOiBmaWxlOi8vIHBhdHRlcm4gbWF0Y2hpbmcuIE9wZW4gYSBQUiB0byBhZGQgc3VwcG9ydFwiKTtcbiAgfVxuICBpc0Z0cE1hdGNoKHVybCkge1xuICAgIHRocm93IEVycm9yKFwiTm90IGltcGxlbWVudGVkOiBmdHA6Ly8gcGF0dGVybiBtYXRjaGluZy4gT3BlbiBhIFBSIHRvIGFkZCBzdXBwb3J0XCIpO1xuICB9XG4gIGlzVXJuTWF0Y2godXJsKSB7XG4gICAgdGhyb3cgRXJyb3IoXCJOb3QgaW1wbGVtZW50ZWQ6IHVybjovLyBwYXR0ZXJuIG1hdGNoaW5nLiBPcGVuIGEgUFIgdG8gYWRkIHN1cHBvcnRcIik7XG4gIH1cbiAgY29udmVydFBhdHRlcm5Ub1JlZ2V4KHBhdHRlcm4pIHtcbiAgICBjb25zdCBlc2NhcGVkID0gdGhpcy5lc2NhcGVGb3JSZWdleChwYXR0ZXJuKTtcbiAgICBjb25zdCBzdGFyc1JlcGxhY2VkID0gZXNjYXBlZC5yZXBsYWNlKC9cXFxcXFwqL2csIFwiLipcIik7XG4gICAgcmV0dXJuIFJlZ0V4cChgXiR7c3RhcnNSZXBsYWNlZH0kYCk7XG4gIH1cbiAgZXNjYXBlRm9yUmVnZXgoc3RyaW5nKSB7XG4gICAgcmV0dXJuIHN0cmluZy5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgXCJcXFxcJCZcIik7XG4gIH1cbn07XG52YXIgTWF0Y2hQYXR0ZXJuID0gX01hdGNoUGF0dGVybjtcbk1hdGNoUGF0dGVybi5QUk9UT0NPTFMgPSBbXCJodHRwXCIsIFwiaHR0cHNcIiwgXCJmaWxlXCIsIFwiZnRwXCIsIFwidXJuXCJdO1xudmFyIEludmFsaWRNYXRjaFBhdHRlcm4gPSBjbGFzcyBleHRlbmRzIEVycm9yIHtcbiAgY29uc3RydWN0b3IobWF0Y2hQYXR0ZXJuLCByZWFzb24pIHtcbiAgICBzdXBlcihgSW52YWxpZCBtYXRjaCBwYXR0ZXJuIFwiJHttYXRjaFBhdHRlcm59XCI6ICR7cmVhc29ufWApO1xuICB9XG59O1xuZnVuY3Rpb24gdmFsaWRhdGVQcm90b2NvbChtYXRjaFBhdHRlcm4sIHByb3RvY29sKSB7XG4gIGlmICghTWF0Y2hQYXR0ZXJuLlBST1RPQ09MUy5pbmNsdWRlcyhwcm90b2NvbCkgJiYgcHJvdG9jb2wgIT09IFwiKlwiKVxuICAgIHRocm93IG5ldyBJbnZhbGlkTWF0Y2hQYXR0ZXJuKFxuICAgICAgbWF0Y2hQYXR0ZXJuLFxuICAgICAgYCR7cHJvdG9jb2x9IG5vdCBhIHZhbGlkIHByb3RvY29sICgke01hdGNoUGF0dGVybi5QUk9UT0NPTFMuam9pbihcIiwgXCIpfSlgXG4gICAgKTtcbn1cbmZ1bmN0aW9uIHZhbGlkYXRlSG9zdG5hbWUobWF0Y2hQYXR0ZXJuLCBob3N0bmFtZSkge1xuICBpZiAoaG9zdG5hbWUuaW5jbHVkZXMoXCI6XCIpKVxuICAgIHRocm93IG5ldyBJbnZhbGlkTWF0Y2hQYXR0ZXJuKG1hdGNoUGF0dGVybiwgYEhvc3RuYW1lIGNhbm5vdCBpbmNsdWRlIGEgcG9ydGApO1xuICBpZiAoaG9zdG5hbWUuaW5jbHVkZXMoXCIqXCIpICYmIGhvc3RuYW1lLmxlbmd0aCA+IDEgJiYgIWhvc3RuYW1lLnN0YXJ0c1dpdGgoXCIqLlwiKSlcbiAgICB0aHJvdyBuZXcgSW52YWxpZE1hdGNoUGF0dGVybihcbiAgICAgIG1hdGNoUGF0dGVybixcbiAgICAgIGBJZiB1c2luZyBhIHdpbGRjYXJkICgqKSwgaXQgbXVzdCBnbyBhdCB0aGUgc3RhcnQgb2YgdGhlIGhvc3RuYW1lYFxuICAgICk7XG59XG5mdW5jdGlvbiB2YWxpZGF0ZVBhdGhuYW1lKG1hdGNoUGF0dGVybiwgcGF0aG5hbWUpIHtcbiAgcmV0dXJuO1xufVxuZXhwb3J0IHtcbiAgSW52YWxpZE1hdGNoUGF0dGVybixcbiAgTWF0Y2hQYXR0ZXJuXG59O1xuIl0sInhfZ29vZ2xlX2lnbm9yZUxpc3QiOlswLDQsNSw2XSwibWFwcGluZ3MiOiI7O0NBQ0EsU0FBUyxpQkFBaUIsS0FBSztFQUM5QixJQUFJLE9BQU8sUUFBUSxPQUFPLFFBQVEsWUFBWSxPQUFPLEVBQUUsTUFBTSxJQUFJO0VBQ2pFLE9BQU87Q0FDUjs7Ozs7OztDQ0NBLElBQWEsZUFBZSxPQUFPLE9BQU8sRUFDeEMsUUFBUSxTQUNWLENBQUM7Q0FFNkIsT0FBTyxPQUFPLEVBQzFDLFFBQVE7RUFDTjtHQUNFLElBQUk7R0FDSixPQUFPO0dBQ1AsU0FBUztHQUNULE1BQU07RUFDUjtFQUNBO0dBQ0UsSUFBSTtHQUNKLE9BQU87R0FDUCxTQUFTO0dBQ1QsTUFBTTtFQUNSO0VBQ0E7R0FDRSxJQUFJO0dBQ0osT0FBTztHQUNQLFNBQVM7R0FDVCxNQUFNO0VBQ1I7RUFDQTtHQUNFLElBQUk7R0FDSixPQUFPO0dBQ1AsU0FBUztHQUNULE1BQU07RUFDUjtDQUNGLEVBQ0YsQ0FBQzs7O0NDcEJELElBQU0scUJBQXFCO0NBQzNCLElBQU0sa0JBQWtCO0NBRXhCLElBQU0scUJBQXFCLE1BQWMsWUFBaUM7RUFDeEUsTUFBTSxRQUFRLElBQUksTUFBTSxPQUFPLFdBQVcsd0JBQXdCLENBQUM7RUFDbkUsTUFBTSxPQUFPO0VBQ2IsT0FBTztDQUNUO0NBRUEsSUFBTSxjQUFjLE9BQU8sS0FBYSxVQUF1QixDQUFDLEdBQUcsWUFBb0IsdUJBQTBDO0VBQy9ILE1BQU0sYUFBYSxJQUFJLGdCQUFnQjtFQUN2QyxNQUFNLFlBQVksaUJBQWlCLFdBQVcsTUFBTSxHQUFHLFNBQVM7RUFFaEUsSUFBSTtHQUNGLE9BQU8sTUFBTSxNQUFNLEtBQUs7SUFDdEIsT0FBTztJQUNQLGFBQWE7SUFDYixnQkFBZ0I7SUFDaEIsR0FBRztJQUNILFFBQVEsV0FBVztHQUNyQixDQUFDO0VBQ0gsU0FBUyxPQUFZO0dBQ25CLElBQUksT0FBTyxTQUFTLGNBQ2xCLE1BQU0sa0JBQWtCLFdBQVcsb0JBQW9CO0dBRXpELE1BQU0sa0JBQWtCLFdBQVcseUJBQXlCO0VBQzlELFVBQVU7R0FDUixhQUFhLFNBQVM7RUFDeEI7Q0FDRjtDQUVBLElBQU0scUJBQXFCLFNBQWlCLEdBQUcsV0FBbUIsNkJBQTBDO0VBQzFHLElBQUksV0FBVyxPQUFPLFdBQVcsS0FDL0IsT0FBTyxrQkFBa0IsZUFBZSxrQkFBa0I7RUFFNUQsSUFBSSxXQUFXLEtBQ2IsT0FBTyxrQkFBa0IsU0FBUyxpQ0FBaUM7RUFFckUsSUFBSSxDQUFDLFVBQVUsVUFBVSxLQUN2QixPQUFPLGtCQUFrQixXQUFXLDhCQUE4QjtFQUVwRSxPQUFPLGtCQUFrQixXQUFXLFFBQVE7Q0FDOUM7Q0FFQSxJQUFhLGtCQUFrQixZQUE2QjtFQUMxRCxNQUFNLFdBQVcsTUFBTyxPQUFPLFFBQVEsUUFBUSxJQUFJLENBQUMsb0JBQW9CLENBQUMsRUFBRSxhQUFhLENBQUMsRUFBRTtFQUMzRixPQUFPLE9BQU8sVUFBVSxzQkFBc0IsRUFBRSxFQUFFLEtBQUs7Q0FDekQ7Q0FFQSxJQUFhLGFBQWEsT0FBTyxjQUFzQixZQUFvQixTQUFpQixRQUFrQztFQUM1SCxNQUFNLGNBQWMsT0FBUSxNQUFNLGdCQUFnQjtFQUNsRCxJQUFJLENBQUMsYUFDSCxNQUFNLGtCQUFrQixlQUFlLDRCQUE0QjtFQUdyRSxNQUFNLFdBQVcsTUFBTSxZQUNyQixHQUFHLGdCQUFnQixVQUFVLFFBQVEsbUJBQ3JDO0dBQ0UsUUFBUTtHQUNSLFNBQVM7SUFDUCxnQkFBZ0I7SUFDaEIsa0JBQWtCO0dBQ3BCO0dBQ0EsTUFBTSxLQUFLLFVBQVU7SUFDbkIsVUFBVSxDQUNSO0tBQ0UsTUFBTTtLQUNOLE9BQU8sQ0FDTCxFQUNFLE1BQU0sQ0FBQyxjQUFjLFVBQVUsRUFBRSxPQUFPLE9BQU8sRUFBRSxLQUFLLE1BQU0sRUFDOUQsQ0FDRjtJQUNGLENBQ0Y7SUFDQSxrQkFBa0I7S0FDaEIsYUFBYTtLQUNiLGlCQUFpQjtJQUNuQjtHQUNGLENBQUM7RUFDSCxDQUNGO0VBRUEsSUFBSSxDQUFDLFNBQVMsSUFDWixNQUFNLGtCQUFrQixTQUFTLFFBQVEsd0JBQXdCO0VBR25FLE1BQU0sT0FBTyxNQUFNLFNBQVMsS0FBSyxFQUFFLFlBQVksSUFBSTtFQUNuRCxNQUFNLE9BQU8sT0FBTyxNQUFNLGFBQWEsSUFBSSxTQUFTLFFBQVEsSUFBSSxRQUFRLEVBQUUsRUFBRSxLQUFLO0VBQ2pGLElBQUksQ0FBQyxNQUNILE1BQU0sa0JBQWtCLFdBQVcsK0JBQStCO0VBRXBFLE9BQU87Q0FDVDtDQUVBLElBQWEsdUJBQXVCLE9BQU8sV0FBOEM7RUFDdkYsTUFBTSxNQUFNLE9BQU8sVUFBVSxFQUFFLEVBQUUsS0FBSztFQUN0QyxJQUFJLENBQUMsS0FDSCxPQUFPO0dBQUUsSUFBSTtHQUFPLFVBQVU7R0FBZSxTQUFTO0VBQW1CO0VBRzNFLElBQUk7R0FDRixNQUFNLFdBQVcsTUFBTSxZQUFZLEdBQUcsZ0JBQWdCLFVBQVU7SUFDOUQsUUFBUTtJQUNSLFNBQVMsRUFBRSxrQkFBa0IsSUFBSTtHQUNuQyxDQUFDO0dBRUQsSUFBSSxTQUFTLElBQ1gsT0FBTztJQUFFLElBQUk7SUFBTSxVQUFVO0lBQU0sU0FBUztHQUFZO0dBRTFELE1BQU0sUUFBUSxrQkFBa0IsU0FBUyxRQUFRLDJCQUEyQjtHQUM1RSxPQUFPO0lBQ0wsSUFBSTtJQUNKLFVBQVUsTUFBTTtJQUNoQixTQUFTLE1BQU07SUFDZixRQUFRLFNBQVM7R0FDbkI7RUFDRixTQUFTLE9BQVk7R0FDbkIsT0FBTztJQUNMLElBQUk7SUFDSixVQUFVLE9BQU8sT0FBTyxRQUFRLFNBQVM7SUFDekMsU0FBUyxPQUFPLE9BQU8sV0FBVyxvQkFBb0I7R0FDeEQ7RUFDRjtDQUNGOzs7Ozs7OztDQzVIQSxJQUFBLHFCQUFBLHVCQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7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
