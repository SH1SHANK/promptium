import { getItems } from '../../../vault/store';
import { VaultItem } from '../../../vault/types';
import { getNotes } from '../../notes/store';
import { calculateTokens } from '../tokenization/tokenizer';
import { extractIntent } from '../analysis/compromise';
import { classifyPrompt } from '../category';
import { getFuse } from '../loaders/intelligence-loader';
import { ContextRetrievalResult, RetrievedItem } from './types';
import { budgetItems } from './budget';

const tokenize = (value: string): string[] =>
  String(value || '')
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9_-]{2,}/g) || [];

/**
 * Checks if a search keyword matches a target word (exact or substring).
 */
function isMatch(word1: string, word2: string): boolean {
  const w1 = word1.toLowerCase().trim();
  const w2 = word2.toLowerCase().trim();
  return w1.includes(w2) || w2.includes(w1);
}

/**
 * Perform keyword/tag matching manually or via Fuse.js.
 */
async function matchKnowledgeItems(
  text: string,
  keywords: string[],
  category: string
): Promise<RetrievedItem<VaultItem>[]> {
  const knowledgeItems = getItems('knowledge').filter((i) => i.enabled);
  if (knowledgeItems.length === 0) return [];

  const results: RetrievedItem<VaultItem>[] = [];

  // Pinned items get added with score 1.0 immediately
  const pinnedKnowledge = knowledgeItems.filter((k) => k.pinned);
  for (const item of pinnedKnowledge) {
    const tokenMetrics = await calculateTokens(item.title + '\n' + item.content);
    results.push({
      item,
      score: 1.0,
      explanation: 'Pinned context item.',
      tokenCount: tokenMetrics.tokenCount,
    });
  }

  try {
    const Fuse = await getFuse();
    const options = {
      keys: ['title', 'content', 'tags'],
      includeScore: true,
      threshold: 0.6,
    };

    const fuseInstance = new Fuse(knowledgeItems, options);
    const searchResults = fuseInstance.search(text || '');

    for (const res of searchResults) {
      const item = res.item as VaultItem;
      if (results.some((r) => r.item.id === item.id)) continue;
      const fuseScore = 1.0 - (res.score || 0);

      // Analyze tag overlap
      const normalizedTags = (item.tags || []).map((t) => t.toLowerCase());
      const matchedTags = normalizedTags.filter(
        (t) => keywords.some((kw) => isMatch(t, kw)) || isMatch(t, category)
      );

      // Analyze keyword overlap
      const contentLower = item.content.toLowerCase();
      const matchedKeywords = keywords.filter(
        (kw) => contentLower.includes(kw) || isMatch(item.title, kw)
      );

      let score = fuseScore;
      let explanation = 'Matched relevant text content.';

      if (matchedTags.length > 0) {
        score = Math.max(0.5, Math.min(1.0, score + 0.15 * matchedTags.length));
        explanation = `Matched tag(s): ${matchedTags.join(', ')}.`;
      } else if (matchedKeywords.length > 0) {
        score = Math.max(0.4, Math.min(1.0, score + 0.05 * matchedKeywords.length));
        explanation = `Matched keywords: ${matchedKeywords.slice(0, 3).join(', ')}.`;
      }

      const tokenMetrics = await calculateTokens(item.title + '\n' + item.content);

      results.push({
        item,
        score: Math.round(score * 100) / 100,
        explanation,
        tokenCount: tokenMetrics.tokenCount,
      });
    }
  } catch (err) {
    console.error('CRE Match knowledge failed:', err);
  }

  // Handle fallback tag/category matching for items not caught by Fuse.js
  for (const item of knowledgeItems) {
    if (results.some((r) => r.item.id === item.id)) continue;

    const normalizedTags = (item.tags || []).map((t) => t.toLowerCase());

    // Exact or strong keyword tag matches
    const matchedKws = normalizedTags.filter((t) => keywords.some((kw) => isMatch(t, kw)));
    const categoryMatches = normalizedTags.filter((t) => isMatch(t, category));

    if (matchedKws.length > 0) {
      const tokenMetrics = await calculateTokens(item.title + '\n' + item.content);
      results.push({
        item,
        score: 0.5,
        explanation: `Matched tag(s): ${matchedKws.join(', ')}.`,
        tokenCount: tokenMetrics.tokenCount,
      });
    } else if (categoryMatches.length > 0) {
      // pure category tag match with no keyword overlap gets lower score so it can be filtered out
      const tokenMetrics = await calculateTokens(item.title + '\n' + item.content);
      results.push({
        item,
        score: 0.25, // lower score
        explanation: `Related to category: ${categoryMatches.join(', ')}.`,
        tokenCount: tokenMetrics.tokenCount,
      });
    }
  }

  // Filter out low relevance results (below threshold 0.35)
  return results.filter((r) => r.score >= 0.35).sort((a, b) => b.score - a.score);
}

/**
 * Retrieve the best matching skill/persona from the Vault.
 */
async function retrieveBestSkill(
  text: string,
  keywords: string[],
  category: string
): Promise<RetrievedItem<VaultItem> | null> {
  const skills = getItems('skill').filter((i) => i.enabled);
  if (skills.length === 0) return null;

  // Pinned skill automatically wins
  const pinnedSkill = skills.find((s) => s.pinned);
  if (pinnedSkill) {
    const tokenMetrics = await calculateTokens(pinnedSkill.title + '\n' + pinnedSkill.content);
    return {
      item: pinnedSkill,
      score: 1.0,
      explanation: 'Pinned context persona.',
      tokenCount: tokenMetrics.tokenCount,
    };
  }

  let bestSkill: VaultItem | null = null;
  let bestScore = 0;
  let bestExplanation = '';

  for (const skill of skills) {
    let score = 0;
    let explanation = '';

    const titleLower = skill.title.toLowerCase();
    const contentLower = skill.content.toLowerCase();
    const tagsLower = (skill.tags || []).map((t) => t.toLowerCase());

    // 1. Category check
    if (tagsLower.some((t) => isMatch(t, category)) || isMatch(skill.title, category)) {
      score += 0.5;
      explanation = `Matches target category '${category}'.`;
    }

    // 2. Keyword check
    const matchedKws = keywords.filter(
      (kw) =>
        isMatch(skill.title, kw) ||
        contentLower.includes(kw) ||
        tagsLower.some((t) => isMatch(t, kw))
    );

    if (matchedKws.length > 0) {
      score += Math.min(0.4, 0.15 * matchedKws.length);
      explanation = explanation
        ? `${explanation} Matched keywords/tags: ${matchedKws.slice(0, 2).join(', ')}.`
        : `Matched keywords/tags: ${matchedKws.slice(0, 2).join(', ')}.`;
    }

    if (score > bestScore) {
      bestScore = score;
      bestSkill = skill;
      bestExplanation = explanation || `Active skill matched from Vault.`;
    }
  }

  // Fallback: pick the first skill if we have one, or return default category
  if (!bestSkill && skills.length > 0) {
    bestSkill = skills[0]!;
    bestScore = 0.3;
    bestExplanation = 'Default fallback skill.';
  }

  if (bestSkill) {
    const tokenMetrics = await calculateTokens(bestSkill.title + '\n' + bestSkill.content);
    return {
      item: bestSkill,
      score: Math.round(bestScore * 100) / 100,
      explanation: bestExplanation,
      tokenCount: tokenMetrics.tokenCount,
    };
  }

  return null;
}

/**
 * Retrieve active Context Retrieval Result.
 */
export async function retrieveContext(text: string): Promise<ContextRetrievalResult> {
  const trimmed = String(text || '').trim();
  const category = classifyPrompt(trimmed);
  const intent = await extractIntent(trimmed);
  const keywords = [...new Set([...(intent.keywords || []), ...tokenize(trimmed)])];

  // Compute prompt base tokens
  const promptTokens = (await calculateTokens(trimmed)).tokenCount;

  // 1. Retrieve & Score Refinement Notes
  const rawNotes = getNotes();
  const notes: RetrievedItem<any>[] = [];
  for (const n of rawNotes) {
    const tokenMetrics = await calculateTokens(n.selectedText + '\n' + n.instruction);
    notes.push({
      item: n,
      score: 1.0,
      explanation: `User instruction attached to text "${n.selectedText.slice(0, 20)}..."`,
      tokenCount: tokenMetrics.tokenCount,
    });
  }

  // 2. Retrieve & Score Instructions
  const rawInstructions = getItems('instruction').filter((i) => i.enabled);
  const instructions: RetrievedItem<VaultItem>[] = [];
  for (const ins of rawInstructions) {
    const tokenMetrics = await calculateTokens(ins.content);
    instructions.push({
      item: ins,
      score: 1.0,
      explanation: `Global persistent instruction: "${ins.title || ins.content.slice(0, 20)}..."`,
      tokenCount: tokenMetrics.tokenCount,
    });
  }

  // 3. Retrieve & Score Skill
  const skill = await retrieveBestSkill(trimmed, keywords, category);

  // 4. Retrieve & Score Knowledge Items
  const rawKnowledge = await matchKnowledgeItems(trimmed, keywords, category);

  // Apply budgeting. Budget starts with base prompt tokens.
  let currentTotal = promptTokens;

  // Add notes first (highest priority)
  const notesBudgetResult = await budgetItems(notes, currentTotal);
  currentTotal = notesBudgetResult.totalTokens;

  // Add skill next
  const skillsToBudget = skill ? [skill] : [];
  const skillBudgetResult = await budgetItems(skillsToBudget, currentTotal);
  currentTotal = skillBudgetResult.totalTokens;

  // Add instructions
  const instructionBudgetResult = await budgetItems(instructions, currentTotal);
  currentTotal = instructionBudgetResult.totalTokens;

  // Add knowledge guides
  const knowledgeBudgetResult = await budgetItems(rawKnowledge, currentTotal);
  currentTotal = knowledgeBudgetResult.totalTokens;

  const isTruncated =
    notesBudgetResult.isTruncated ||
    skillBudgetResult.isTruncated ||
    instructionBudgetResult.isTruncated ||
    knowledgeBudgetResult.isTruncated;

  return {
    skill: skillBudgetResult.budgeted.length > 0 ? skillBudgetResult.budgeted[0]! : null,
    knowledge: knowledgeBudgetResult.budgeted,
    instructions: instructionBudgetResult.budgeted,
    notes: notesBudgetResult.budgeted,
    budget: {
      totalTokens: currentTotal,
      limit: 2500,
      isTruncated,
    },
  };
}
