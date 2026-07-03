// File: src/features/prompt-library/prompt-search.ts
import { state } from '../state/state';

export const searchController = {
  activeCategory: 'all',
  activeTag: '',
  selectedPromptId: null as string | null,
  sortField: 'updated', // 'updated' | 'created' | 'usage' | 'title'
  filterPinnedOnly: false,
  filterFavoriteOnly: false,
  filterTemplatesOnly: false,
};

export const getSearchInput = (): HTMLInputElement | null => {
  return document.getElementById('prompt-search') as HTMLInputElement | null;
};

export const getSearchWrap = (): HTMLElement | null => {
  return document.getElementById('search-wrap');
};

export const getSearchValue = (): string => {
  const input = getSearchInput();
  return input ? input.value : '';
};

export const clearSearch = (): void => {
  const input = getSearchInput();
  if (input) {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
};

export const focusSearch = (): boolean => {
  const searchInput = getSearchInput();
  const searchWrap = getSearchWrap();
  if (!searchInput || !searchWrap || searchWrap.classList.contains('pn-hidden')) return false;
  searchInput.focus();
  searchInput.select();
  return true;
};

export const sidepanelKeywordFilter = (query: string, prompts: any[]): any[] => {
  const normalized = String(query || '')
    .trim()
    .toLowerCase();
  let filtered = [...prompts];

  // Apply state check filters from checklist UI
  if (searchController.filterPinnedOnly) {
    filtered = filtered.filter((p) => p.isPinned);
  }
  if (searchController.filterFavoriteOnly) {
    filtered = filtered.filter((p) => p.isFavorite);
  }
  if (searchController.filterTemplatesOnly) {
    filtered = filtered.filter((p) => p.isTemplate);
  }

  // Apply Category filter from dropdown
  if (searchController.activeCategory !== 'all') {
    filtered = filtered.filter(
      (p) => String(p.category || 'general').toLowerCase() === searchController.activeCategory
    );
  }

  // Apply Tag filter
  if (searchController.activeTag) {
    const tagQuery = searchController.activeTag.toLowerCase();
    filtered = filtered.filter((p) =>
      (p.tags || []).some((t: string) => t.toLowerCase() === tagQuery)
    );
  }

  if (!normalized) {
    return filtered;
  }

  const parts = normalized.split(/\s+/);
  const searchTerms: string[] = [];

  for (const part of parts) {
    if (part.startsWith('is:')) {
      const mode = part.slice(3);
      if (mode === 'pinned') {
        filtered = filtered.filter((p) => p.isPinned);
      } else if (mode === 'favorite') {
        filtered = filtered.filter((p) => p.isFavorite);
      }
    } else if (part.startsWith('favorite:')) {
      const val = part.slice(9);
      filtered = filtered.filter((p) => String(p.isFavorite) === val);
    } else if (part.startsWith('tag:')) {
      const tagVal = part.slice(4);
      filtered = filtered.filter((p) =>
        (p.tags || []).some((t: string) => t.toLowerCase().includes(tagVal))
      );
    } else if (part.startsWith('type:')) {
      const typeVal = part.slice(5);
      if (typeVal === 'template') {
        filtered = filtered.filter((p) => p.isTemplate);
      } else if (typeVal === 'plain') {
        filtered = filtered.filter((p) => !p.isTemplate);
      }
    } else if (part.startsWith('category:')) {
      const catVal = part.slice(9);
      filtered = filtered.filter((p) => String(p.category || 'general').toLowerCase() === catVal);
    } else if (part.startsWith('has:')) {
      const val = part.slice(4);
      if (val === 'variables') {
        filtered = filtered.filter((p) => p.variables && p.variables.length > 0);
      }
    } else if (part.startsWith('updated:')) {
      const timeVal = part.slice(8);
      if (timeVal === '7d') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        filtered = filtered.filter((p) => new Date(p.updatedAt || p.createdAt) >= sevenDaysAgo);
      }
    } else {
      searchTerms.push(part);
    }
  }

  if (searchTerms.length > 0) {
    const textQuery = searchTerms.join(' ');
    filtered = filtered.filter((prompt) => {
      const promptTags = (prompt.tags || []).map((t: string) => t.toLowerCase());
      const promptCategory = String(prompt.category || 'general').toLowerCase();
      const titleMatch = String(prompt.title || '')
        .toLowerCase()
        .includes(textQuery);
      const descMatch = String(prompt.description || '')
        .toLowerCase()
        .includes(textQuery);
      const textMatch = String(prompt.text || '')
        .toLowerCase()
        .includes(textQuery);
      const tagsMatch = promptTags.join(' ').includes(textQuery);

      return (
        titleMatch || descMatch || textMatch || tagsMatch || promptCategory.includes(textQuery)
      );
    });
  }

  return filtered;
};

/**
 * Normalized Search Scoring Algorithm
 */
export const sortPrompts = (prompts: any[], query = ''): any[] => {
  const list = [...prompts];
  const normalizedQuery = String(query || '')
    .trim()
    .toLowerCase();

  const getScore = (prompt: any): number => {
    let score = 0;
    const title = String(prompt.title || '').toLowerCase();
    const description = String(prompt.description || '').toLowerCase();
    const category = String(prompt.category || 'general').toLowerCase();
    const tags = (prompt.tags || []).map((t: string) => t.toLowerCase());
    const variables = (prompt.variables || []).map((v: any) => v.name.toLowerCase());

    if (normalizedQuery) {
      // 1. Exact Title Match (+1000)
      if (title === normalizedQuery) {
        score += 1000;
      }
      // 2. Title Prefix Match (+600)
      else if (title.startsWith(normalizedQuery)) {
        score += 600;
      }
      // 3. Substring Title Match (+300)
      else if (title.includes(normalizedQuery)) {
        score += 300;
      }

      // 4. Tags Match (+120)
      if (tags.some((t: string) => t === normalizedQuery || t.includes(normalizedQuery))) {
        score += 120;
      }

      // 5. Category Match (+80)
      if (category === normalizedQuery || category.includes(normalizedQuery)) {
        score += 80;
      }

      // 6. Description Match (+20)
      if (description.includes(normalizedQuery)) {
        score += 20;
      }

      // 7. Variables Match (+20)
      if (variables.some((v: string) => v === normalizedQuery || v.includes(normalizedQuery))) {
        score += 20;
      }
    }

    // 8. Pinned Status (+60)
    if (prompt.isPinned) {
      score += 60;
    }

    // 9. Recency Boost (0–50)
    const updateTime = new Date(
      prompt.updatedAt || prompt.lastEditedAt || prompt.createdAt || Date.now()
    ).getTime();
    const daysSinceUpdated = Math.max(0, (Date.now() - updateTime) / (1000 * 60 * 60 * 24));
    score += 50 / (1 + daysSinceUpdated);

    // 10. Usage Frequency Boost (0–40)
    const usageCount = prompt.usageCount || 0;
    score += (40 * usageCount) / (10 + usageCount);

    return score;
  };

  list.sort((a, b) => {
    // If no search query, fall back to selected sortField and pinned status
    if (!normalizedQuery) {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      if (searchController.sortField === 'updated') {
        const timeA = new Date(a.updatedAt || a.lastEditedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.lastEditedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      }
      if (searchController.sortField === 'created') {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      }
      if (searchController.sortField === 'usage') {
        return (b.usageCount || 0) - (a.usageCount || 0);
      }
      if (searchController.sortField === 'title') {
        return String(a.title).localeCompare(String(b.title));
      }
      return 0;
    }

    // Sort by computed score descending
    const scoreA = getScore(a);
    const scoreB = getScore(b);

    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }

    // Fallback to recency
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  return list;
};

class PromptSearchIndex {
  private prompts: any[] = [];

  setPrompts(prompts: any[]) {
    this.prompts = prompts;
  }

  getPrompts(): any[] {
    return this.prompts;
  }

  search(query: string): any[] {
    const filtered = sidepanelKeywordFilter(query, this.prompts);
    return sortPrompts(filtered, query);
  }
}

export const promptSearchIndex = new PromptSearchIndex();

export const bindSearchHandlers = (onSearch?: (val: string) => void): void => {
  const input = getSearchInput();
  if (!input) return;
  input.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    if (onSearch) {
      onSearch(val);
    } else {
      const PromptsUI = (window as any).PromptsUI;
      if (PromptsUI?.render) {
        void PromptsUI.render(val);
      }
    }
  });
};
