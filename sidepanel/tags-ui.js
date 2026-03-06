(() => {
/**
 * File: sidepanel/tags-ui.js
 * Purpose: Tags tab rendering, quick filters, rename/delete actions.
 */

const callbacks = {
  onApplyTagFilter: null,
  onTagsMutated: null
};

const savePromptCollection = async (prompts) => {
  const nextPrompts = Array.isArray(prompts) ? prompts : [];
  await chrome.storage.local.set({ prompts: nextPrompts });
};

const collectTags = async (prompts) => {
  const map = new Map();

  for (const prompt of prompts) {
    for (const tag of prompt.tags || []) {
      const normalized = String(tag || '').trim();

      if (!normalized) {
        continue;
      }

      map.set(normalized, (map.get(normalized) || 0) + 1);
    }
  }

  return Array.from(map.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
};

const renameTag = async (oldTag, nextTag) => {
  const prompts = await window.Store.getPrompts();
  const oldValue = String(oldTag || '').trim();
  const nextValue = String(nextTag || '').trim();

  if (!oldValue || !nextValue) {
    return false;
  }

  const nextPrompts = prompts.map((prompt) => {
    const updatedTags = (prompt.tags || []).map((tag) => {
      if (String(tag || '').trim() !== oldValue) {
        return String(tag || '').trim();
      }

      return nextValue;
    });

    return {
      ...prompt,
      tags: Array.from(new Set(updatedTags.filter(Boolean)))
    };
  });

  await savePromptCollection(nextPrompts);
  return true;
};

const deleteTag = async (tagToDelete) => {
  const prompts = await window.Store.getPrompts();
  const normalized = String(tagToDelete || '').trim();

  if (!normalized) {
    return false;
  }

  const nextPrompts = prompts.map((prompt) => ({
    ...prompt,
    tags: (prompt.tags || []).map((tag) => String(tag || '').trim()).filter((tag) => tag && tag !== normalized)
  }));

  await savePromptCollection(nextPrompts);
  return true;
};

const render = async () => {
  const container = document.getElementById('tag-list');
  const filterBar = document.getElementById('pn-tag-filter-bar');
  const emptyState = document.getElementById('pn-tags-empty');
  const emptyAction = document.getElementById('pn-tags-empty-add');
  const quickFiltersHead = document.getElementById('pn-quick-filters-head');
  const quickFiltersDivider = document.getElementById('pn-tags-quick-divider');

  if (!container) {
    return;
  }

  const prompts = await window.Store.getPrompts();
  const tags = await collectTags(prompts);
  const quickFilterTags = tags.slice(0, 8);
  const manageTags = [...tags].sort((left, right) => left.tag.localeCompare(right.tag));

  container.querySelectorAll('.pn-tag-row').forEach((row) => row.remove());

  if (filterBar) {
    filterBar.innerHTML = '';
  }

  if (!tags.length) {
    if (emptyAction && !emptyAction.dataset.bound) {
      emptyAction.dataset.bound = '1';
      emptyAction.addEventListener('click', () => {
        if (window.PromptForm?.open) {
          void window.PromptForm.open();
        }
      });
    }
    quickFiltersHead?.classList.add('pn-hidden');
    filterBar?.classList.add('pn-hidden');
    quickFiltersDivider?.classList.add('pn-hidden');
    if (emptyState) emptyState.classList.remove('pn-hidden');
    return;
  }

  quickFiltersHead?.classList.toggle('pn-hidden', quickFilterTags.length === 0);
  filterBar?.classList.toggle('pn-hidden', quickFilterTags.length === 0);
  quickFiltersDivider?.classList.toggle('pn-hidden', quickFilterTags.length === 0);
  if (emptyState) emptyState.classList.add('pn-hidden');

  if (filterBar && quickFilterTags.length > 0) {
    for (const item of quickFilterTags) {
      const chip = document.createElement('button');
      chip.className = 'pn-tag-filter-chip';
      chip.type = 'button';
      chip.dataset.tag = item.tag;
      chip.textContent = `${item.tag} `;
      const count = document.createElement('span');
      count.className = 'pn-tag-count';
      count.textContent = String(item.count);
      chip.appendChild(count);
      chip.addEventListener('click', () => {
        const isActive = chip.classList.contains('active');
        filterBar.querySelectorAll('.pn-tag-filter-chip').forEach((c) => c.classList.remove('active'));
        if (!isActive) {
          chip.classList.add('active');
          if (typeof callbacks.onApplyTagFilter === 'function') {
            void callbacks.onApplyTagFilter(item.tag);
          }
        } else if (typeof callbacks.onApplyTagFilter === 'function') {
          void callbacks.onApplyTagFilter('');
        }
      });
      filterBar.appendChild(chip);
    }
  }

  for (const item of manageTags) {
    const row = document.createElement('div');
    row.className = 'pn-tag-row';

    const left = document.createElement('div');
    left.className = 'pn-tag-row-left';

    const dot = document.createElement('span');
    dot.className = 'pn-tag-dot';

    const name = document.createElement('span');
    name.className = 'pn-tag-name';
    name.textContent = item.tag;

    const count = document.createElement('span');
    count.className = 'pn-tag-count-badge';
    count.textContent = `${item.count} prompt${item.count === 1 ? '' : 's'}`;

    left.appendChild(dot);
    left.appendChild(name);
    left.appendChild(count);

    const actions = document.createElement('div');
    actions.className = 'pn-tag-row-actions';

    const renameBtn = document.createElement('button');
    renameBtn.className = 'pn-tag-action-btn rename';
    renameBtn.type = 'button';
    renameBtn.title = 'Rename';
    renameBtn.textContent = '\u270e';
    renameBtn.addEventListener('click', () => {
      void (async () => {
        const nextValue = await (window.PnDialog || window).prompt(`Rename tag "${item.tag}" to:`, item.tag, { title: 'Rename Tag' });
        if (nextValue === null) return;
        const normalized = String(nextValue || '').trim();
        if (!normalized) {
          await showToast('Tag name cannot be empty.');
          return;
        }
        await renameTag(item.tag, normalized);
        await render();
        if (typeof callbacks.onTagsMutated === 'function') {
          await callbacks.onTagsMutated();
        }
        await showToast('Tag renamed.');
      })();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'pn-tag-action-btn delete';
    deleteBtn.type = 'button';
    deleteBtn.title = 'Remove from all prompts';
    deleteBtn.textContent = '\u2715';
    deleteBtn.addEventListener('click', () => {
      void (async () => {
        const confirmed = await (window.PnDialog || window).confirm(
          `Delete tag "${item.tag}" from all prompts?`,
          { title: 'Delete Tag', confirmLabel: 'Delete', danger: true }
        );
        if (!confirmed) return;
        await deleteTag(item.tag);
        await render();
        if (typeof callbacks.onTagsMutated === 'function') {
          await callbacks.onTagsMutated();
        }
        await showToast('Tag deleted from prompts.');
      })();
    });

    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);

    row.appendChild(left);
    row.appendChild(actions);
    container.appendChild(row);
  }
};

const setCallbacks = (nextCallbacks = {}) => {
  callbacks.onApplyTagFilter = nextCallbacks.onApplyTagFilter || null;
  callbacks.onTagsMutated = nextCallbacks.onTagsMutated || null;
};

window.TagsUI = {
  render,
  renameTag,
  deleteTag,
  setCallbacks
};
})();
