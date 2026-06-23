/**
 * File: utils/ai.js
 * Purpose: Provides model-free prompt ranking, tag suggestions, and duplicate detection.
 * Communicates with the app shell and chrome.storage.local.
 */

const TAG_RULES = [
  {
    tag: 'coding',
    keywords: [
      'code',
      'javascript',
      'typescript',
      'python',
      'bug',
      'debug',
      'api',
      'function',
      'react',
      'css',
      'html',
      'docker',
      'git',
      'regex',
      'bash',
    ],
  },
  {
    tag: 'study',
    keywords: [
      'study',
      'learn',
      'revision',
      'notes',
      'exam',
      'practice',
      'flashcard',
      'quiz',
      'tutor',
      'syllabus',
      'academic',
    ],
  },
  {
    tag: 'career',
    keywords: [
      'career',
      'resume',
      'cv',
      'job',
      'interview',
      'promotion',
      'manager',
      'salary',
      'linkedin',
      'networking',
      'cover letter',
    ],
  },
  {
    tag: 'creative',
    keywords: [
      'story',
      'poem',
      'creative',
      'brainstorm',
      'idea',
      'name',
      'fiction',
      'character',
      'narrative',
    ],
  },
  {
    tag: 'debugging',
    keywords: [
      'error',
      'exception',
      'trace',
      'stack',
      'fix',
      'regression',
      'issue',
      'troubleshoot',
      'crash',
    ],
  },
  {
    tag: 'explanation',
    keywords: [
      'explain',
      'summary',
      'summarize',
      'why',
      'how',
      'walkthrough',
      'describe',
      'breakdown',
    ],
  },
  {
    tag: 'interview',
    keywords: ['interview', 'question', 'behavioral', 'system design', 'leetcode', 'star method'],
  },
  {
    tag: 'engineering',
    keywords: [
      'autocad',
      'solidworks',
      'matlab',
      'fusion360',
      'fea',
      'cad',
      'cnc',
      'gcode',
      'ansys',
      'revit',
      'pcb',
      'arduino',
      'pid',
      'thermodynamics',
      'statics',
    ],
  },
  {
    tag: '3d-modeling',
    keywords: [
      'blender',
      'maya',
      'unity',
      'unreal',
      'zbrush',
      'render',
      'texture',
      'rigging',
      'sculpt',
      'mesh',
      'pbr',
      'substance',
    ],
  },
  {
    tag: 'design',
    keywords: [
      'figma',
      'ui',
      'ux',
      'wireframe',
      'prototype',
      'typography',
      'color palette',
      'logo',
      'icon',
      'accessibility',
      'midjourney',
    ],
  },
  {
    tag: 'marketing',
    keywords: [
      'seo',
      'ad copy',
      'social media',
      'campaign',
      'newsletter',
      'affiliate',
      'gtm',
      'product description',
      'competitor',
    ],
  },
  {
    tag: 'data',
    keywords: [
      'sql',
      'pandas',
      'excel',
      'analysis',
      'dataset',
      'statistics',
      'csv',
      'cleaning',
      'visualization',
      'report',
    ],
  },
  {
    tag: 'writing',
    keywords: [
      'blog',
      'email',
      'draft',
      'press release',
      'script',
      'proofreader',
      'copy editing',
      'tone',
      'youtube',
    ],
  },
  {
    tag: 'daily',
    keywords: [
      'news',
      'meal',
      'recipe',
      'workout',
      'travel',
      'gift',
      'budget',
      'chore',
      'movie',
      'book',
      'pet',
    ],
  },
  {
    tag: 'productivity',
    keywords: [
      'meeting',
      'agenda',
      'pomodoro',
      'eisenhower',
      'habit',
      'okr',
      'retrospective',
      'sop',
      'decision',
      'prioritize',
    ],
  },
];

let aiAvailable = false;

/** Returns the AI status badge element from popup/sidepanel markup. */
const getStatusNode = () => document.getElementById('ai-status');

/** Ensures AI status markup has dedicated dot and text nodes for rich updates. */
const ensureStatusStructure = (statusNode: any) => {
  if (!statusNode) {
    return { dot: null, text: null };
  }

  let dot = statusNode.querySelector('.pn-ai-dot');
  let text = statusNode.querySelector('.pn-ai-status__text');

  if (!dot || !text) {
    statusNode.innerHTML =
      '<span class="pn-ai-dot"></span><span class="pn-ai-status__text">Smart features ready</span>';
    dot = statusNode.querySelector('.pn-ai-dot');
    text = statusNode.querySelector('.pn-ai-status__text');
  }

  return { dot, text };
};

/** Updates the AI badge text and visual status style. */
const setStatus = async (text: any, statusClass?: any) => {
  const statusNode = getStatusNode();

  if (!statusNode) {
    return;
  }

  const { dot, text: textNode } = ensureStatusStructure(statusNode);

  if (textNode) {
    textNode.textContent = text;
  } else {
    statusNode.textContent = text;
  }

  statusNode.classList.remove(
    'pn-ai-status--loading',
    'pn-ai-status--ready',
    'pn-ai-status--unavailable'
  );

  if (statusClass) {
    statusNode.classList.add(statusClass);
  }

  if (dot) {
    dot.classList.toggle('loading', statusClass === 'pn-ai-status--loading');
  }
};

/** Returns optional progress UI nodes in settings panels when present. */
const getProgressNodes = () => ({
  track: document.getElementById('ai-progress-track'),
  text: document.getElementById('ai-progress-text'),
});

/** Clears model progress UI and shows mode message. */
const showModeMessage = (message: any) => {
  const nodes = getProgressNodes();

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
const normalizeText = (value: any) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^\w\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Tokenizes normalized text into unique terms (minimum 2 chars). */
const toTokenSet = (value: any): Set<string> => {
  const normalized = normalizeText(value);

  if (!normalized) {
    return new Set();
  }

  return new Set(normalized.split(' ').filter((t) => t.length >= 2));
};

/**
 * Common synonym clusters for cross-domain search expansion.
 * Searching any word in a cluster will also match the others.
 */
const SYNONYM_CLUSTERS = [
  ['fix', 'debug', 'error', 'bug', 'issue', 'troubleshoot'],
  ['code', 'coding', 'programming', 'development', 'script'],
  ['explain', 'explanation', 'describe', 'walkthrough', 'breakdown'],
  ['write', 'writing', 'draft', 'compose', 'author'],
  ['study', 'learn', 'education', 'academic', 'revision'],
  ['design', 'ui', 'ux', 'layout', 'wireframe', 'mockup'],
  ['career', 'job', 'resume', 'cv', 'interview', 'hire'],
  ['make', 'create', 'build', 'generate', 'produce'],
  ['improve', 'enhance', 'optimize', 'refine', 'polish', 'refactor'],
  ['test', 'testing', 'unit', 'spec', 'assertion', 'jest', 'pytest'],
  ['cad', 'autocad', 'solidworks', 'fusion360', 'revit', 'engineering'],
  ['model', 'modeling', '3d', 'blender', 'maya', 'sculpt', 'mesh'],
  ['animate', 'animation', 'rig', 'rigging', 'keyframe', 'motion'],
  ['data', 'analysis', 'analytics', 'dataset', 'statistics', 'report'],
  ['market', 'marketing', 'seo', 'ad', 'copy', 'campaign', 'social'],
  ['plan', 'planning', 'schedule', 'agenda', 'organize', 'productivity'],
  ['food', 'recipe', 'cook', 'cooking', 'meal', 'ingredient'],
  ['travel', 'trip', 'vacation', 'itinerary', 'destination'],
  ['email', 'mail', 'message', 'outreach', 'newsletter'],
  ['sql', 'query', 'database', 'db', 'postgres', 'mysql'],
];

/** Build a fast token → expanded-tokens lookup from synonym clusters. */
const _synonymMap = (() => {
  const map = new Map();
  for (const cluster of SYNONYM_CLUSTERS) {
    for (const word of cluster) {
      const existing = map.get(word) || new Set();
      for (const syn of cluster) existing.add(syn);
      map.set(word, existing);
    }
  }
  return map;
})();

/** Expands a set of query tokens with synonyms. */
const expandWithSynonyms = (tokens: string[]): Set<string> => {
  const expanded = new Set<string>(tokens);
  for (const token of tokens) {
    const syns = _synonymMap.get(token);
    if (syns) for (const s of syns) expanded.add(s);
  }
  return expanded;
};

/** Checks if a term appears as a whole word (or word-prefix) in text. */
const wordBoundaryMatch = (text: any, term: any) => {
  // Quick check first
  if (!text.includes(term)) return false;
  // Exact word-boundary regex: \bterm or term as prefix of a word
  try {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    return re.test(text);
  } catch {
    return text.includes(term);
  }
};

/** Checks if any word in text starts with the given prefix. */
const prefixMatch = (text: any, prefix: any) => {
  if (prefix.length < 3) return false;
  try {
    const re = new RegExp(`\\b${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`, 'i');
    return re.test(text);
  } catch {
    return false;
  }
};

/** Filters prompts by keyword match (fallback path). */
const keywordFilter = (query: any, prompts: any) => {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return Array.isArray(prompts) ? prompts : [];
  }

  const queryTokens = Array.from(toTokenSet(normalizedQuery));
  const expanded = expandWithSynonyms(queryTokens);

  return (Array.isArray(prompts) ? prompts : []).filter((prompt) => {
    const haystack =
      `${prompt?.title || ''} ${prompt?.text || ''} ${(prompt?.tags || []).join(' ')} ${prompt?.category || ''}`.toLowerCase();
    // Match if the full phrase appears, OR if any expanded token matches as a whole word
    if (haystack.includes(normalizedQuery)) return true;
    for (const token of expanded) {
      if (wordBoundaryMatch(haystack, token)) return true;
    }
    return false;
  });
};

/**
 * Computes a nuanced relevance score incorporating:
 * - Exact phrase matching (highest weight)
 * - Word-boundary token matching (prevents "code" matching "unicode")
 * - Prefix/stem matching ("debug" matches "debugging")
 * - Synonym expansion ("fix" finds prompts about "debug")
 * - Field weighting (title > tags > category > text)
 * - Query-length-aware normalization
 */
const scorePrompt = (query: any, prompt: any) => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;

  const title = normalizeText(prompt?.title);
  const text = normalizeText(prompt?.text);
  const tagsText = normalizeText((prompt?.tags || []).join(' '));
  const category = normalizeText(prompt?.category);
  const queryTokens = Array.from(toTokenSet(normalizedQuery));
  const expandedTokens = expandWithSynonyms(queryTokens);

  let score = 0;

  // ── Phase 1: Exact phrase matching (very high signal) ──
  if (title.includes(normalizedQuery)) score += 10;
  if (tagsText.includes(normalizedQuery)) score += 8;
  if (category.includes(normalizedQuery)) score += 6;
  if (text.includes(normalizedQuery)) score += 4;

  // ── Phase 2: Word-boundary token matching per field ──
  for (const token of queryTokens) {
    if (token.length < 2) continue;
    if (wordBoundaryMatch(title, token)) score += 5;
    if (wordBoundaryMatch(tagsText, token)) score += 4;
    if (wordBoundaryMatch(category, token)) score += 3;
    if (wordBoundaryMatch(text, token)) score += 1;
  }

  // ── Phase 3: Prefix/stem matching (partial words) ──
  for (const token of queryTokens) {
    if (token.length < 3) continue;
    if (prefixMatch(title, token)) score += 3;
    if (prefixMatch(tagsText, token)) score += 2;
    if (prefixMatch(text, token)) score += 0.5;
  }

  // ── Phase 4: Synonym expansion bonus ──
  const synonymOnly = new Set([...expandedTokens].filter((t) => !queryTokens.includes(t)));
  for (const syn of synonymOnly) {
    if (wordBoundaryMatch(title, syn)) score += 2;
    if (wordBoundaryMatch(tagsText, syn)) score += 2;
    if (wordBoundaryMatch(text, syn)) score += 0.5;
  }

  // ── Normalize: scale by query complexity to keep score 0–1 ──
  const maxPossible =
    10 +
    8 +
    6 +
    4 +
    queryTokens.length * (5 + 4 + 3 + 1) +
    queryTokens.length * (3 + 2 + 0.5) +
    synonymOnly.size * (2 + 2 + 0.5);

  return maxPossible > 0 ? Math.max(0, Math.min(1, score / maxPossible)) : 0;
};

/** Initializes model-free smart features and updates status UI. */
const initModel = async () => {
  aiAvailable = true;
  showModeMessage('Model-free mode active. No model download required.');
  await setStatus('Smart Features Ready', 'pn-ai-status--ready');
  return true;
};

/** Returns model-free AI availability state. */
const isAvailable = async () => aiAvailable;

/** Model-free embedding is not used; kept for API compatibility. */
const embedText = async (_text: any) => null;

/** Model-free cosine similarity is not used; kept for API compatibility. */
const cosineSimilarity = async (_vecA: any, _vecB: any) => 0;

/** Ranks prompts by deterministic relevance and falls back to keyword filtering. */
const semanticSearch = async (query: any, prompts: any) => {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return Array.isArray(prompts) ? prompts : [];
  }

  const pool = Array.isArray(prompts) ? prompts : [];
  const scored = [];

  for (const prompt of pool) {
    const score = scorePrompt(normalizedQuery, prompt);

    if (score > 0) {
      scored.push({
        ...prompt,
        _semanticScore: score,
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
const suggestTags = async (text: any) => {
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
  const normalized = normalizeText(mergedText);

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

/** Detects near-duplicate prompts via normalized Levenshtein ratio on title + first 80 chars. */
const isDuplicate = (candidatePrompt: any, existingPrompts: any) => {
  if (window.PromptDuplicate?.findDuplicate) {
    return window.PromptDuplicate.findDuplicate(candidatePrompt, existingPrompts, 0.85);
  }

  const source =
    candidatePrompt && typeof candidatePrompt === 'object'
      ? candidatePrompt
      : { title: '', text: String(candidatePrompt || '') };
  const target = normalizeText(`${source.title || ''}\n${String(source.text || '').slice(0, 80)}`);

  if (!target) return { duplicate: false, ratio: 0, match: null };

  let bestRatio = 0;
  let bestMatch = null;

  for (const prompt of existingPrompts || []) {
    const candidate = normalizeText(
      `${prompt?.title || ''}\n${String(prompt?.text || '').slice(0, 80)}`
    );
    if (!candidate) continue;
    const maxLen = Math.max(target.length, candidate.length);
    if (!maxLen) continue;

    const rows = target.length + 1;
    const cols = candidate.length + 1;
    const dp = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (let i = 0; i < rows; i += 1) dp[i]![0] = i;
    const dp0 = dp[0]!;
    for (let j = 0; j < cols; j += 1) dp0[j] = j;
    for (let i = 1; i < rows; i += 1) {
      const r = dp[i]!;
      const prevR = dp[i - 1]!;
      for (let j = 1; j < cols; j += 1) {
        const cost = target[i - 1] === candidate[j - 1] ? 0 : 1;
        r[j] = Math.min(prevR[j]! + 1, r[j - 1]! + 1, prevR[j - 1]! + cost);
      }
    }
    const lastRow = dp[rows - 1]!;
    const ratio = 1 - lastRow[cols - 1]! / maxLen;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestMatch = prompt;
    }
  }

  return {
    duplicate: bestRatio > 0.85,
    ratio: bestRatio,
    match: bestMatch,
  };
};

/** No embedding hydration needed in model-free mode. */
const rehydratePromptEmbeddings = (_prompts: any) => false;

const AI = {
  initModel,
  embedText,
  cosineSimilarity,
  semanticSearch,
  suggestTags,
  isDuplicate,
  rehydratePromptEmbeddings,
  isAvailable,
};

if (typeof window !== 'undefined') {
  window.AI = AI;
}
