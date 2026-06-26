import { getItems, getVaultRevision } from '../vault/store';
import { VaultItem } from '../vault/types';
import { getNotes } from '../refinement/notes/store';
import { classifyPrompt } from '../refinement/intelligence/category';
import {
  ContextRetrievalResult,
  QueryAnalysis,
  RetrievedItem,
  RetrievalOptions,
  RetrievalProvider,
  RetrievalSource,
} from './types';
import { LruCache, hashPrompt } from './cache';
import { getUsageWeight } from './feedback';
import { indexSections } from './section-index';
import { emptyDiagnostics } from './diagnostics';

export const CONTEXT_TOKEN_LIMIT = 2500;
const analysisCache = new LruCache<QueryAnalysis>(80);
const retrievalCache = new LruCache<ContextRetrievalResult>(80);
export function clearRetrievalCache(): void {
  retrievalCache.clear();
}
const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const words = (value: string) =>
  String(value || '')
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9_-]{2,}/g) || [];
const overlap = (a: string[], b: string[]) => a.filter((word) => b.includes(word));
const confidence = (score: number): 'High' | 'Medium' | 'Low' =>
  score >= 0.75 ? 'High' : score >= 0.45 ? 'Medium' : 'Low';
const sourceExplanation = (source: RetrievalSource, matched: string[], category: string) =>
  source === 'pinned'
    ? 'Pinned to always include.'
    : source === 'manual'
      ? 'Manually added for this rewrite.'
      : `Matched: ${matched.slice(0, 3).join(', ') || category}. Category: ${category}.`;
async function tokenCount(text: string): Promise<number> {
  const { calculateTokens } = await import('../refinement/intelligence/tokenization/tokenizer');
  return (await calculateTokens(text)).tokenCount;
}
async function intentFor(text: string) {
  const { extractIntent } = await import('../refinement/intelligence/analysis/compromise');
  return extractIntent(text);
}

async function analyze(text: string): Promise<QueryAnalysis> {
  const key = hashPrompt(text);
  const cached = analysisCache.get(key);
  if (cached) return cached;
  const intent = await intentFor(text);
  const analysis = {
    category: classifyPrompt(text),
    intent,
    keywords: [...new Set([...intent.keywords, ...words(text)])].slice(0, 16),
    promptTokens: await tokenCount(text),
  };
  analysisCache.set(key, analysis);
  return analysis;
}

function similarity(a: VaultItem, b: VaultItem): number {
  const left = new Set(words(`${a.title} ${a.tags.join(' ')} ${a.content.slice(0, 1000)}`));
  const right = new Set(words(`${b.title} ${b.tags.join(' ')} ${b.content.slice(0, 1000)}`));
  const union = new Set([...left, ...right]);
  return union.size ? [...left].filter((word) => right.has(word)).length / union.size : 0;
}

async function makeItem(
  item: VaultItem,
  analysis: QueryAnalysis,
  source: RetrievalSource,
  score = 1,
  section?: RetrievedItem<VaultItem>['section']
): Promise<RetrievedItem<VaultItem>> {
  const matched = overlap(
    analysis.keywords,
    words(`${item.title} ${item.tags.join(' ')} ${item.content}`)
  );
  let contextItem = item;
  if (item.type === 'knowledge' && item.content.length > 1200) {
    const candidates = indexSections(item).map((section) => ({
      ...section,
      score: overlap(analysis.keywords, words(section.content)).length,
    }));
    const selected = candidates
      .sort((a, b) => b.score - a.score || a.metadata.chunkId.localeCompare(b.metadata.chunkId))
      .filter((candidate) => source === 'pinned' || candidate.score > 0)
      .slice(0, 3);
    if (selected.length) {
      contextItem = {
        ...item,
        content: selected
          .map((candidate) => `## ${candidate.metadata.headingPath.at(-1)}\n${candidate.content}`)
          .join('\n\n'),
      };
      section = selected[0]!.metadata;
    }
  }
  const base = {
    item: contextItem,
    score: Math.round(score * 100) / 100,
    explanation: sourceExplanation(source, matched, analysis.category),
    tokenCount: await tokenCount(`${contextItem.title}\n${contextItem.content}`),
    retrievalReason: { matchedKeywords: matched.slice(0, 5), category: analysis.category, source },
    confidence: confidence(score),
  };
  return section ? { ...base, section } : base;
}

function isConflict(item: VaultItem, selected: VaultItem[]): boolean {
  const text = `${item.title} ${item.content}`.toLowerCase();
  const all = selected.map((value) => `${value.title} ${value.content}`.toLowerCase()).join(' ');
  return (
    (text.includes('concise') && /(exhaustive|detailed)/.test(all)) ||
    (text.includes('exhaustive') && /concise/.test(all)) ||
    (text.includes('academic researcher') && /startup founder/.test(all)) ||
    (text.includes('startup founder') && /academic researcher/.test(all))
  );
}

async function rank(
  items: VaultItem[],
  analysis: QueryAnalysis
): Promise<Array<{ item: VaultItem; score: number }>> {
  const candidates = await Promise.all(
    items.map(async (item) => {
      const haystack = words(`${item.title} ${item.tags.join(' ')} ${item.content}`);
      const matched = overlap(analysis.keywords, haystack);
      const categoryTerms: string[] = words(`${item.title} ${item.tags.join(' ')}`);
      const categoryMatch = categoryTerms.includes(analysis.category) ? 0.15 : 0;
      return {
        item,
        score: Math.min(
          1,
          0.2 + matched.length * 0.1 + categoryMatch + (await getUsageWeight(item.id))
        ),
      };
    })
  );
  const deduped = candidates
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .filter(
      (candidate, index, array) =>
        !array
          .slice(0, index)
          .some(
            (previous) =>
              previous.item.type === candidate.item.type &&
              similarity(previous.item, candidate.item) > 0.8
          )
    );
  const selected: Array<{ item: VaultItem; score: number }> = [];
  const represented = new Set<string>();
  for (const candidate of deduped)
    if (
      !isConflict(
        candidate.item,
        selected.map((entry) => entry.item)
      )
    ) {
      if (
        !represented.has(candidate.item.type) ||
        selected.filter((entry) => entry.item.type === candidate.item.type).length < 3
      ) {
        selected.push(candidate);
        represented.add(candidate.item.type);
      }
    }
  return selected;
}

async function budget<T>(
  items: RetrievedItem<T>[],
  total: number,
  result: ContextRetrievalResult
): Promise<{ values: RetrievedItem<T>[]; total: number }> {
  const values: RetrievedItem<T>[] = [];
  for (const item of items) {
    if (total + item.tokenCount <= CONTEXT_TOKEN_LIMIT) {
      values.push(item);
      total += item.tokenCount;
    } else
      result.diagnostics.droppedItems.push({
        id: (item.item as any).id || 'note',
        title: (item.item as any).title || 'Refinement note',
        reason:
          item.retrievalReason.source === 'pinned'
            ? 'Pinned context exceeded budget.'
            : 'Context budget exceeded.',
      });
  }
  return { values, total };
}

export class KeywordRetrievalProvider implements RetrievalProvider {
  async retrieve(query: string, options: RetrievalOptions = {}): Promise<ContextRetrievalResult> {
    const started = performance.now();
    const key = `${hashPrompt(query)}:${getVaultRevision()}`;
    const cached = retrievalCache.get(key);
    if (cached && !options.manualItemIds?.length && !options.removedItemIds?.length) {
      const clone = deepClone(cached);
      clone.diagnostics.cacheHit = true;
      clone.diagnostics.cacheMiss = false;
      return clone;
    }
    const analysis = await analyze(query);
    const diagnostics = emptyDiagnostics();
    const result: ContextRetrievalResult = {
      skill: null,
      knowledge: [],
      instructions: [],
      notes: [],
      budget: {
        totalTokens: analysis.promptTokens,
        limit: CONTEXT_TOKEN_LIMIT,
        isTruncated: false,
      },
      diagnostics,
    };
    const removed = new Set(options.removedItemIds || []);
    const enabled = getItems().filter((item) => item.enabled && !removed.has(item.id));
    const pinned = enabled.filter((item) => item.pinned);
    const automatic = enabled.filter((item) => !item.pinned);
    const manual = enabled.filter(
      (item) => options.manualItemIds?.includes(item.id) && !item.pinned
    );
    const ranked = await rank(
      automatic.filter((item) => !options.manualItemIds?.includes(item.id)),
      analysis
    );
    diagnostics.candidateCount = ranked.length;
    const noteItems = await Promise.all(
      getNotes().map(async (note) => ({
        item: note,
        score: 1,
        explanation: 'User instruction attached to selected text.',
        tokenCount: await tokenCount(`${note.selectedText}\n${note.instruction}`),
        retrievalReason: {
          matchedKeywords: [],
          category: analysis.category,
          source: 'manual' as RetrievalSource,
        },
        confidence: 'High' as const,
      }))
    );
    let total = analysis.promptTokens;
    ({ values: result.notes, total } = await budget(noteItems, total, result));
    const pinnedItems = await Promise.all(pinned.map((item) => makeItem(item, analysis, 'pinned')));
    const manualItems = await Promise.all(manual.map((item) => makeItem(item, analysis, 'manual')));
    const retrievedItems = await Promise.all(
      ranked.map((entry) => makeItem(entry.item, analysis, 'retrieved', entry.score))
    );
    const groups = [
      pinnedItems,
      manualItems,
      retrievedItems.filter(
        (item) => item.item.type === 'instruction' && item.item.priority === 'high'
      ),
      retrievedItems.filter((item) => item.item.type === 'skill'),
      retrievedItems.filter(
        (item) =>
          item.item.type === 'instruction' &&
          item.item.priority !== 'high' &&
          item.item.priority !== 'low'
      ),
      retrievedItems.filter((item) => item.item.type === 'knowledge'),
      retrievedItems.filter(
        (item) => item.item.type === 'instruction' && item.item.priority === 'low'
      ),
    ];
    const chosen: RetrievedItem<VaultItem>[] = [];
    for (const group of groups) {
      const budgeted = await budget(group, total, result);
      total = budgeted.total;
      chosen.push(...budgeted.values);
    }
    result.skill = chosen.find((item) => item.item.type === 'skill') || null;
    result.knowledge = chosen.filter((item) => item.item.type === 'knowledge');
    result.instructions = chosen.filter((item) => item.item.type === 'instruction');
    result.budget.totalTokens = total;
    result.budget.isTruncated = result.diagnostics.droppedItems.length > 0;
    diagnostics.consumedBudget = total;
    diagnostics.retrievalTimeMs = Math.round(performance.now() - started);
    diagnostics.budgetTimeMs = diagnostics.retrievalTimeMs;
    if (!options.manualItemIds?.length && !options.removedItemIds?.length)
      retrievalCache.set(key, deepClone(result));
    return result;
  }
}
