import { RankedPattern, RankedSkill } from '../types';
import { getFuse } from '../loaders/intelligence-loader';
import { getItems } from '../../../vault/store';
import { VaultItem } from '../../../vault/types';
import { createLogger } from '../../../../core/logger';

const logger = createLogger('RecommendationSearch');

/**
 * Generic fuzz matching database retriever wrapper utilizing Fuse.js.
 */
export async function searchKnowledge<T>(
  text: string,
  list: T[],
  keys: string[]
): Promise<{ item: T; score: number }[]> {
  const query = String(text || '').trim();
  if (!query || list.length === 0) {
    return [];
  }

  try {
    const Fuse = await getFuse();
    const options = {
      keys,
      includeScore: true,
      threshold: 0.5, // Maximum distance threshold for fuzzy matching
    };

    const fuseInstance = new Fuse(list, options);
    const searchResults = fuseInstance.search(query);

    return searchResults.map((res: any) => ({
      item: res.item,
      score: 1.0 - (res.score || 0),
    }));
  } catch (err) {
    logger.warn('Fuse.js search failed; returning no matches.', err);
    return [];
  }
}

/**
 * Fuzzy search to match prompt patterns.
 */
export async function findRelevantPatterns(
  text: string,
  patterns: any[]
): Promise<RankedPattern[]> {
  const matches = await searchKnowledge(text, patterns, ['name', 'structure', 'example']);
  return matches
    .map((m) => ({
      id: String(m.item.name).toLowerCase(),
      name: m.item.name,
      score: m.score,
    }))
    .filter((m) => m.score >= 0.7); // Apply confidence threshold filter
}

/**
 * Fuzzy search to match skill packs from Vault.
 */
export async function findRelevantSkills(
  text: string,
  skills: VaultItem[]
): Promise<RankedSkill[]> {
  const matches = await searchKnowledge(text, skills, ['title', 'content', 'tags']);
  return matches
    .map((m) => ({
      id: m.item.id,
      name: m.item.title,
      score: m.score,
    }))
    .filter((m) => m.score >= 0.7); // Apply confidence threshold filter
}

/**
 * Fuzzy search across all Vault items.
 */
export async function searchVault(query: string): Promise<VaultItem[]> {
  const allItems = getItems().filter((i) => i.enabled);
  const matches = await searchKnowledge(query, allItems, ['title', 'content', 'tags']);
  return matches.map((m) => m.item);
}

/**
 * Retrieves the top 3-5 relevant knowledge guides.
 */
export async function findRelevantKnowledge(text: string): Promise<VaultItem[]> {
  const knowledgeItems = getItems('knowledge').filter((i) => i.enabled);
  const matches = await searchKnowledge(text, knowledgeItems, ['title', 'content', 'tags']);
  return matches
    .filter((m) => m.score >= 0.7)
    .slice(0, 5)
    .map((m) => m.item);
}

/**
 * Retrieves the most relevant Skill.
 */
export async function findRelevantSkill(text: string): Promise<VaultItem | null> {
  const skillItems = getItems('skill').filter((i) => i.enabled);
  const matches = await searchKnowledge(text, skillItems, ['title', 'content', 'tags']);
  const passed = matches.filter((m) => m.score >= 0.7);
  return passed.length > 0 ? passed[0]!.item : null;
}

/**
 * Retrieves all enabled Instructions (no filtering needed as they are persistent defaults).
 */
export function getEnabledInstructions(): VaultItem[] {
  return getItems('instruction').filter((i) => i.enabled);
}
