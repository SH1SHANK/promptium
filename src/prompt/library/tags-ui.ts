import { Prompt } from '../types/types';
import { PromptStore } from '../storage/storage';
import { PromptForm } from '../builder/builder';
import { PnDialog } from '../../shared/utils/pn-dialog';
import { showToast } from '../../shared/utils/toast';
import { escapeHtml } from '../../shared/utils/dom-helpers';

const callbacks: {
  onApplyTagFilter: ((tag: string) => void) | null;
  onTagsMutated: (() => Promise<void> | void) | null;
} = {
  onApplyTagFilter: null,
  onTagsMutated: null,
};

const savePromptCollection = async (prompts: Prompt[]) => {
  const nextPrompts = Array.isArray(prompts) ? prompts : [];
  await chrome.storage.local.set({ prompts: nextPrompts });
};

const collectTags = async (prompts: Prompt[]) => {
  const map = new Map<string, number>();

  for (const prompt of prompts) {
    for (const tag of prompt.tags || []) {
      const normalized = String(tag || '').trim();
      if (!normalized) continue;
      map.set(normalized, (map.get(normalized) || 0) + 1);
    }
  }

  return Array.from(map.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
};

const renameTag = async (oldTag: string, nextTag: string) => {
  const prompts = await PromptStore.getPrompts();
  const oldValue = String(oldTag || '').trim();
  const nextValue = String(nextTag || '').trim();

  if (!oldValue || !nextValue) {
    return false;
  }

  const nextPrompts = prompts.map((prompt: Prompt) => {
    const updatedTags = (prompt.tags || []).map((tag: string) => {
      if (String(tag || '').trim() !== oldValue) {
        return String(tag || '').trim();
      }
      return nextValue;
    });

    return {
      ...prompt,
      tags: Array.from(new Set(updatedTags.filter(Boolean))),
    };
  });

  await savePromptCollection(nextPrompts);
  return true;
};

const deleteTag = async (tagToDelete: string) => {
  const prompts = await PromptStore.getPrompts();
  const normalized = String(tagToDelete || '').trim();

  if (!normalized) {
    return false;
  }

  const nextPrompts = prompts.map((prompt: Prompt) => ({
    ...prompt,
    tags: (prompt.tags || [])
      .map((tag: string) => String(tag || '').trim())
      .filter((tag: string) => tag && tag !== normalized),
  }));

  await savePromptCollection(nextPrompts);
  return true;
};

export const render = async () => {
  const container = document.getElementById('pn-tags-container');
  const emptyState = document.getElementById('pn-tags-empty');
  const emptyAction = document.getElementById('pn-tags-empty-action');
  const filterBar = document.getElementById('pn-tags-filter-bar');
  const quickFiltersHead = document.getElementById('pn-quick-filters-header');
  const quickFiltersDivider = document.getElementById('pn-quick-filters-divider');

  if (!container) {
    return;
  }

  container.querySelectorAll('.pn-skeleton').forEach((node) => node.remove());
  const skeletons = [];
  for (let i = 0; i < 3; i += 1) {
    const skel = document.createElement('div');
    skel.className = 'pn-skeleton';
    skeletons.push(skel);
    container.appendChild(skel);
  }

  const prompts = await PromptStore.getPrompts();
  skeletons.forEach((node) => node.remove());
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
        if (PromptForm?.open) {
          void PromptForm.open();
        }
      });
    }
    quickFiltersHead?.classList.add('pn-hidden');
    filterBar?.classList.add('pn-hidden');
    quickFiltersDivider?.classList.add('pn-hidden');
    if (emptyState) emptyState.classList.remove('pn-hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('pn-hidden');
  quickFiltersHead?.classList.remove('pn-hidden');
  filterBar?.classList.remove('pn-hidden');
  quickFiltersDivider?.classList.remove('pn-hidden');

  // Render quick filter buttons
  if (filterBar) {
    quickFilterTags.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = 'pn-quick-filter-tag';
      btn.type = 'button';
      btn.innerHTML = `<span class="pn-tag-hash">#</span>${escapeHtml(item.tag)} <span class="pn-tag-count">${item.count}</span>`;
      btn.addEventListener('click', () => {
        if (typeof callbacks.onApplyTagFilter === 'function') {
          callbacks.onApplyTagFilter(item.tag);
        }
      });
      filterBar.appendChild(btn);
    });
  }

  // Render main tags list
  for (const item of manageTags) {
    const row = document.createElement('div');
    row.className = 'pn-tag-row';

    const left = document.createElement('div');
    left.className = 'pn-tag-row-left';

    const name = document.createElement('span');
    name.className = 'pn-tag-row-name';
    name.textContent = item.tag;

    const count = document.createElement('span');
    count.className = 'pn-tag-row-count';
    count.textContent = String(item.count);

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
        const nextValue = await PnDialog.prompt(`Rename tag "${item.tag}" to:`, item.tag, {
          title: 'Rename Tag',
        });
        if (nextValue === null) return;
        const normalized = String(nextValue || '').trim();
        if (!normalized) {
          await showToast('Enter a tag name to continue.');
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
        const confirmed = await PnDialog.confirm(`Delete tag "${item.tag}" from all prompts?`, {
          title: 'Delete Tag',
          confirmLabel: 'Delete',
          danger: true,
        });
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

export const setCallbacks = (nextCallbacks: any = {}) => {
  callbacks.onApplyTagFilter = nextCallbacks.onApplyTagFilter || null;
  callbacks.onTagsMutated = nextCallbacks.onTagsMutated || null;
};

export const TagsUI = {
  render,
  renameTag,
  deleteTag,
  setCallbacks,
};

if (typeof window !== 'undefined') {
  (window as any).TagsUI = TagsUI;
}
