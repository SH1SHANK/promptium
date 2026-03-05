(() => {
/**
 * File: utils/prompt-duplicate.js
 * Purpose: Deterministic duplicate detection using normalized Levenshtein ratio.
 */

const normalize = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^\w\s]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const first80 = (value) => String(value || '').slice(0, 80);

const buildCandidate = (title, text) => `${normalize(title)}\n${normalize(first80(text))}`.trim();

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

const similarity = (left, right) => {
  const a = String(left || '');
  const b = String(right || '');
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 1;
  return 1 - (levenshteinDistance(a, b) / maxLen);
};

const findDuplicate = (candidatePrompt, prompts, threshold = 0.85) => {
  const source = candidatePrompt && typeof candidatePrompt === 'object'
    ? candidatePrompt
    : { title: '', text: String(candidatePrompt || '') };

  const target = buildCandidate(source.title, source.text);
  if (!target) {
    return { duplicate: false, ratio: 0, match: null };
  }

  let bestRatio = 0;
  let match = null;
  const excludeId = String(source.excludeId || '').trim();

  (Array.isArray(prompts) ? prompts : []).forEach((prompt) => {
    if (!prompt || (excludeId && String(prompt.id || '') === excludeId)) return;
    const candidate = buildCandidate(prompt.title || '', prompt.text || '');
    if (!candidate) return;
    const ratio = similarity(target, candidate);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      match = prompt;
    }
  });

  return {
    duplicate: bestRatio > threshold,
    ratio: bestRatio,
    match
  };
};

const PromptDuplicate = {
  normalize,
  first80,
  buildCandidate,
  levenshteinDistance,
  similarity,
  findDuplicate
};

if (typeof window !== 'undefined') {
  window.PromptDuplicate = PromptDuplicate;
}

if (typeof self !== 'undefined') {
  self.PromptDuplicate = PromptDuplicate;
}
})();
