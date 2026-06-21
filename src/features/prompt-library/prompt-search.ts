import { state } from '../../sidepanel/state';
import { normalizeLegacy } from '../../lib/variables';

export const searchController = {
  activeCategory: 'all',
  activeTag: '',
  selectedPromptId: null as number | null,
};

export const getSearchInput = (): HTMLInputElement | null => {
  return document.getElementById('prompt-search') as HTMLInputElement | null;
};

export const getSearchWrap = (): HTMLElement | null => {
  return document.getElementById('pn-search-wrap');
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
  if (!searchInput || !searchWrap || searchWrap.classList.contains('hidden')) return false;
  searchInput.focus();
  searchInput.select();
  return true;
};

export const sidepanelKeywordFilter = async (query: string, prompts: any[]): Promise<any[]> => {
  const normalized = String(query || '')
    .trim()
    .toLowerCase();
  const categoryFilter = String(searchController.activeCategory || 'all')
    .trim()
    .toLowerCase();
  const tagFilter = String(searchController.activeTag || '')
    .trim()
    .toLowerCase();

  const hashTags: string[] = [];
  let textQuery = normalized;
  const tagMatch = normalized.match(/#[^\s]+/g);
  if (tagMatch) {
    hashTags.push(...tagMatch.map((t) => t.slice(1)));
    textQuery = normalized.replace(/#[^\s]+/g, '').trim();
  }

  return prompts.filter((prompt) => {
    const promptTags = (prompt.tags || []).map((t: string) => t.toLowerCase());
    const promptCategory = String(prompt.category || 'general').toLowerCase();

    if (categoryFilter !== 'all' && promptCategory !== categoryFilter) {
      return false;
    }
    if (tagFilter && !promptTags.some((promptTag: string) => promptTag.includes(tagFilter))) {
      return false;
    }

    if (!normalized) {
      return true;
    }

    if (hashTags.length > 0) {
      const hasAllTags = hashTags.every((ht) => promptTags.some((pt: string) => pt.includes(ht)));
      if (!hasAllTags) return false;
      if (!textQuery) return true;
    }

    const titleMatch = String(prompt.title || '')
      .toLowerCase()
      .includes(textQuery);
    const textMatch = normalizeLegacy(prompt.text).toLowerCase().includes(textQuery);
    const categoryMatch = promptCategory.includes(textQuery);

    if (!hashTags.length) {
      const tagsMatch = promptTags.join(' ').includes(textQuery);
      return titleMatch || textMatch || tagsMatch || categoryMatch;
    }

    return titleMatch || textMatch || categoryMatch;
  });
};

export const bindSearchHandlers = (onSearch: (val: string) => void): void => {
  const input = getSearchInput();
  if (!input) return;
  input.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    onSearch(val);
  });
};
