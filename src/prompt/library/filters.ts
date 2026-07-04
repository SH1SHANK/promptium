// File: src/features/prompt-library/prompt-filters.ts
import { searchController } from '../search/search';

export const resetTemplateFilter = (): void => {
  searchController.activeCategory = 'all';
  searchController.sortField = 'updated';
  searchController.filterPinnedOnly = false;
  searchController.filterFavoriteOnly = false;
  searchController.filterTemplatesOnly = false;

  const categorySelect = document.getElementById('pn-toolbar-category') as HTMLSelectElement | null;
  const sortSelect = document.getElementById('pn-toolbar-sort') as HTMLSelectElement | null;
  const pinCheck = document.getElementById('filter-pinned') as HTMLInputElement | null;
  const favCheck = document.getElementById('filter-favorite') as HTMLInputElement | null;
  const tplCheck = document.getElementById('filter-templates') as HTMLInputElement | null;

  if (categorySelect) categorySelect.value = 'all';
  if (sortSelect) sortSelect.value = 'updated';
  if (pinCheck) pinCheck.checked = false;
  if (favCheck) favCheck.checked = false;
  if (tplCheck) tplCheck.checked = false;
};

export const bindTemplateFilters = (onFilterChange: () => void): void => {
  const categorySelect = document.getElementById('pn-toolbar-category') as HTMLSelectElement | null;
  const sortSelect = document.getElementById('pn-toolbar-sort') as HTMLSelectElement | null;
  const pinCheck = document.getElementById('filter-pinned') as HTMLInputElement | null;
  const favCheck = document.getElementById('filter-favorite') as HTMLInputElement | null;
  const tplCheck = document.getElementById('filter-templates') as HTMLInputElement | null;

  const filterBtn = document.getElementById('pn-toolbar-filter-btn');
  const filterMenu = document.getElementById('pn-toolbar-filter-menu');

  if (categorySelect) {
    categorySelect.addEventListener('change', (e) => {
      searchController.activeCategory = (e.target as HTMLSelectElement).value;
      onFilterChange();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      searchController.sortField = (e.target as HTMLSelectElement).value;
      onFilterChange();
    });
  }

  if (pinCheck) {
    pinCheck.addEventListener('change', (e) => {
      searchController.filterPinnedOnly = (e.target as HTMLInputElement).checked;
      onFilterChange();
    });
  }

  if (favCheck) {
    favCheck.addEventListener('change', (e) => {
      searchController.filterFavoriteOnly = (e.target as HTMLInputElement).checked;
      onFilterChange();
    });
  }

  if (tplCheck) {
    tplCheck.addEventListener('change', (e) => {
      searchController.filterTemplatesOnly = (e.target as HTMLInputElement).checked;
      onFilterChange();
    });
  }

  // Toggle advanced filters menu dropdown
  if (filterBtn && filterMenu) {
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      filterMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!filterMenu.contains(target) && target !== filterBtn && !filterBtn.contains(target)) {
        filterMenu.classList.add('hidden');
      }
    });
  }
};
