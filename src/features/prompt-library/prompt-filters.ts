import { state } from '../../sidepanel/state';
import { sidepanelKeywordFilter, searchController } from './prompt-search';

let activeTemplateFilter = 'all';
let templateFiltersBound = false;

export const resetTemplateFilter = (): void => {
  activeTemplateFilter = 'all';
  const chips = document.querySelectorAll('.pn-filter-chip');
  chips.forEach((c) => {
    if (c.getAttribute('data-filter') === 'all') {
      c.classList.add('active');
    } else {
      c.classList.remove('active');
    }
  });
};

export const setActiveFilter = (filterVal: string): void => {
  activeTemplateFilter = filterVal;
  const chips = document.querySelectorAll('.pn-filter-chip');
  chips.forEach((c) => {
    if (c.getAttribute('data-filter') === filterVal) {
      c.classList.add('active');
    } else {
      c.classList.remove('active');
    }
  });
};

export const filterPrompts = async (filter: string, prompts: any[]): Promise<any[]> => {
  const normalized = String(filter || '').trim();

  if (!normalized) {
    state.semanticResults = null;
    return prompts;
  }

  return sidepanelKeywordFilter(normalized, prompts);
};

export const bindTemplateFilters = (onFilterChange: (filter: string) => void): void => {
  if (templateFiltersBound) return;
  const container = document.getElementById('pn-filters-container');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('.pn-filter-chip');
    if (!chip) return;
    const val = chip.getAttribute('data-filter') || 'all';
    setActiveFilter(val);
    onFilterChange(val);
  });
  templateFiltersBound = true;
};
