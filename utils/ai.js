/**
 * File: utils/ai.js
 * Purpose: Provides model-free prompt ranking, tag suggestions, and duplicate detection.
 * Communicates with: popup/popup.js, sidepanel/sidepanel.js, and chrome.storage.local.
 */

const LABEL_CANDIDATES = ['coding', 'study', 'career', 'creative', 'general', 'debugging', 'explanation', 'interview'];
const TAG_RULES = [
  { tag: 'coding', keywords: ['code', 'javascript', 'typescript', 'python', 'bug', 'debug', 'api', 'function'] },
  { tag: 'study', keywords: ['study', 'learn', 'revision', 'notes', 'exam', 'practice', 'flashcard'] },
  { tag: 'career', keywords: ['career', 'resume', 'cv', 'job', 'interview', 'promotion', 'manager'] },
  { tag: 'creative', keywords: ['story', 'poem', 'creative', 'design', 'brainstorm', 'idea', 'name'] },
  { tag: 'debugging', keywords: ['error', 'exception', 'trace', 'stack', 'fix', 'regression', 'issue'] },
  { tag: 'explanation', keywords: ['explain', 'summary', 'summarize', 'why', 'how', 'walkthrough'] },
  { tag: 'interview', keywords: ['interview', 'question', 'behavioral', 'system design', 'leetcode'] }
];

let aiAvailable = false;

/** Returns the AI status badge element from popup/sidepanel markup. */
const getStatusNode = async () => document.getElementById('ai-status');

/** Ensures AI status markup has dedicated dot and text nodes for rich updates. */
const ensureStatusStructure = async (statusNode) => {
  if (!statusNode) {
    return { dot: null, text: null };
  }

  let dot = statusNode.querySelector('.pn-ai-dot');
  let text = statusNode.querySelector('.pn-ai-status__text');

  if (!dot || !text) {
    statusNode.innerHTML = '<span class="pn-ai-dot"></span><span class="pn-ai-status__text">Smart features ready</span>';
    dot = statusNode.querySelector('.pn-ai-dot');
    text = statusNode.querySelector('.pn-ai-status__text');
  }

  return { dot, text };
};

/** Updates the AI badge text and visual status style. */
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

/** Returns optional progress UI nodes in settings panels when present. */
const getProgressNodes = async () => ({
  track: document.getElementById('ai-progress-track'),
  text: document.getElementById('ai-progress-text')
});

/** Clears model progress UI and shows mode message. */
const showModeMessage = async (message) => {
  const nodes = await getProgressNodes();

  if (nodes.track) {
    nodes.track.classList.add('hidden');
  }

  if (nodes.track instanceof HTMLProgressElement) {
    nodes.track.value = 0;
  }

  if (nodes.text) {
    nodes.text.textContent = String(message || '').trim();
  }
};

/** Normalizes text for deterministic token matching. */
const normalizeText = async (value) => String(value || '')
  .toLowerCase()
  .replace(/[^\w\s]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Tokenizes normalized text into unique terms. */
const toTokenSet = async (value) => {
  const normalized = await normalizeText(value);

  if (!normalized) {
    return new Set();
  }

  return new Set(normalized.split(' ').filter(Boolean));
};

/** Filters prompts by basic title/text/tag keyword match. */
const keywordFilter = async (query, prompts) => {
  const normalizedQuery = await normalizeText(query);

  if (!normalizedQuery) {
    return Array.isArray(prompts) ? prompts : [];
  }

  return (Array.isArray(prompts) ? prompts : []).filter((prompt) => {
    const title = String(prompt?.title || '').toLowerCase();
    const text = String(prompt?.text || '').toLowerCase();
    const tags = (prompt?.tags || []).join(' ').toLowerCase();
    return title.includes(normalizedQuery) || text.includes(normalizedQuery) || tags.includes(normalizedQuery);
  });
};

/** Computes deterministic relevance score from token and phrase overlap. */
const scorePrompt = async (query, prompt) => {
  const normalizedQuery = await normalizeText(query);
  const title = String(prompt?.title || '').toLowerCase();
  const text = String(prompt?.text || '').toLowerCase();
  const tagsText = (prompt?.tags || []).join(' ').toLowerCase();
  const queryTokens = Array.from(await toTokenSet(normalizedQuery));
  let rawScore = 0;

  if (!normalizedQuery) {
    return 0;
  }

  if (title.includes(normalizedQuery)) {
    rawScore += 4;
  }

  if (text.includes(normalizedQuery)) {
    rawScore += 3;
  }

  if (tagsText.includes(normalizedQuery)) {
    rawScore += 3;
  }

  for (const token of queryTokens) {
    if (token.length < 2) {
      continue;
    }

    if (title.includes(token)) {
      rawScore += 2;
    }

    if (text.includes(token)) {
      rawScore += 1;
    }

    if (tagsText.includes(token)) {
      rawScore += 2;
    }
  }

  return Math.max(0, Math.min(1, rawScore / 10));
};

/** Initializes model-free smart features and updates status UI. */
const initModel = async () => {
  aiAvailable = true;
  await showModeMessage('Model-free mode active. No model download required.');
  await setStatus('Smart Features Ready', 'pn-ai-status--ready');
  return true;
};

/** Returns model-free AI availability state. */
const isAvailable = async () => aiAvailable;

/** Model-free embedding is not used; kept for API compatibility. */
const embedText = async (_text) => null;

/** Model-free cosine similarity is not used; kept for API compatibility. */
const cosineSimilarity = async (_vecA, _vecB) => 0;

/** Ranks prompts by deterministic relevance and falls back to keyword filtering. */
const semanticSearch = async (query, prompts) => {
  const normalizedQuery = await normalizeText(query);

  if (!normalizedQuery) {
    return Array.isArray(prompts) ? prompts : [];
  }

  const pool = Array.isArray(prompts) ? prompts : [];
  const scored = [];

  for (const prompt of pool) {
    const score = await scorePrompt(normalizedQuery, prompt);

    if (score > 0) {
      scored.push({
        ...prompt,
        _semanticScore: score
      });
    }
  }

  if (!scored.length) {
    return keywordFilter(normalizedQuery, pool);
  }

  scored.sort((left, right) => right._semanticScore - left._semanticScore);
  return scored;
};

/** Suggests top tags by matching keyword rules and user context text. */
const suggestTags = async (text) => {
  const baseText = String(text || '').trim();

  if (!baseText) {
    return [];
  }

  let userContext = '';

  try {
    const stored = await chrome.storage.local.get(['userContext']);
    userContext = String(stored?.userContext || '').trim();
  } catch (_error) {
    userContext = '';
  }

  const mergedText = `${userContext} ${baseText}`.trim();
  const normalized = await normalizeText(mergedText);

  if (!normalized) {
    return [];
  }

  const scored = [];

  for (const rule of TAG_RULES) {
    let score = 0;

    for (const keyword of rule.keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }

    if (score > 0) {
      scored.push({ tag: rule.tag, score });
    }
  }

  if (!scored.length) {
    return [];
  }

  scored.sort((left, right) => right.score - left.score || left.tag.localeCompare(right.tag));
  return scored.slice(0, 2).map((entry) => entry.tag);
};

/** Computes Jaccard similarity between two token sets. */
const computeJaccard = async (leftText, rightText) => {
  const left = await toTokenSet(leftText);
  const right = await toTokenSet(rightText);

  if (!left.size || !right.size) {
    return 0;
  }

  let intersection = 0;

  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }

  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
};

/** Detects near-duplicate prompts with normalized text and token overlap heuristics. */
const isDuplicate = async (newText, existingPrompts) => {
  const target = await normalizeText(newText);

  if (!target) {
    return { duplicate: false };
  }

  for (const prompt of existingPrompts || []) {
    const candidate = await normalizeText(prompt?.text || '');

    if (!candidate) {
      continue;
    }

    if (candidate === target) {
      return { duplicate: true, match: prompt };
    }

    const similarity = await computeJaccard(target, candidate);

    if (similarity >= 0.86) {
      return { duplicate: true, match: prompt };
    }
  }

  return { duplicate: false };
};

/** No embedding hydration needed in model-free mode. */
const rehydratePromptEmbeddings = async (_prompts) => false;

const AI = {
  initModel,
  embedText,
  cosineSimilarity,
  semanticSearch,
  suggestTags,
  isDuplicate,
  rehydratePromptEmbeddings,
  isAvailable,
  LABEL_CANDIDATES
};

if (typeof window !== 'undefined') {
  window.AI = AI;
}
