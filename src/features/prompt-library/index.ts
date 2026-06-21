// Barrel file for prompt-library feature
export * from './prompt-card';
export * from './prompt-search';
export * from './prompt-filters';
export * from './prompt-actions';
export * from './prompt-dialogs';
export * from './prompt-list';

import * as list from './prompt-list';
import * as search from './prompt-search';
import * as filters from './prompt-filters';
import * as actions from './prompt-actions';
import * as dialogs from './prompt-dialogs';

const PromptsUI = {
  render: list.render,
  bindSearchHandlers: search.bindSearchHandlers,
  getSearchValue: search.getSearchValue,
  clearSearch: search.clearSearch,
  loadSmartSuggestions: () => {}, // Curated templates suggestions
  renderBridgeStrip: () => {},
  setCallbacks: actions.setCallbacks,
  focusSearch: search.focusSearch,
  getSearchInput: search.getSearchInput,
  getSearchWrap: search.getSearchWrap,
  bindTemplateFilters: filters.bindTemplateFilters,
  setActiveFilter: filters.setActiveFilter,
  resetTemplateFilter: filters.resetTemplateFilter,
  renderModelFeedback: () => {},
  insertSelectedPrompt: () => {},
};

if (typeof window !== 'undefined') {
  (window as any).PromptsUI = PromptsUI;
}

export { PromptsUI };
