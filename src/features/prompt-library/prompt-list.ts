import { parse as parseVars, fill } from '../../lib/variables';
import { state } from '../../sidepanel/state';
import { CATEGORY_LABELS, formatShortDate, bindHoverPreview } from './prompt-card';
import { filterPrompts, resetTemplateFilter } from './prompt-filters';
import { doInject, callbacks } from './prompt-actions';
import { showDeleteConfirm } from './prompt-dialogs';

export const render = async (query = ''): Promise<void> => {
  const container = document.getElementById('pn-prompts-list');
  if (!container) return;

  const Store = (window as any).Store || (window as any).PromptStore;
  if (!Store) return;

  const rawPrompts = await Store.getAll();
  const prompts = await filterPrompts(query, rawPrompts);

  container.innerHTML = '';

  if (prompts.length === 0) {
    container.innerHTML = `
      <div class="pn-empty-state">
        <p>No prompts found</p>
      </div>
    `;
    return;
  }

  prompts.forEach((prompt: any) => {
    const card = document.createElement('article');
    card.className = 'pn-prompt-card';
    card.innerHTML = `
      <div class="pn-card-header">
        <h3 class="pn-card-title">${prompt.title}</h3>
      </div>
      <div class="pn-card-meta-row">
        <span class="pn-category-badge pn-category-badge--${prompt.category || 'general'}">${CATEGORY_LABELS[prompt.category] || 'General'}</span>
        <span class="pn-card-date">${formatShortDate(prompt.updatedAt || prompt.createdAt) || ''}</span>
      </div>
      <div class="pn-card-actions">
        <button class="pn-btn pn-btn--primary pn-card-action-btn use-btn">Use</button>
        <button class="pn-btn pn-btn--ghost pn-card-action-btn delete-btn">Delete</button>
      </div>
    `;

    const useBtn = card.querySelector('.use-btn') as HTMLButtonElement;
    useBtn.addEventListener('click', () => {
      void doInject(prompt.text, false, useBtn);
    });

    const deleteBtn = card.querySelector('.delete-btn') as HTMLButtonElement;
    deleteBtn.addEventListener('click', () => {
      void showDeleteConfirm(prompt.title, async () => {
        await Store.delete(prompt.id);
        if (callbacks.onPromptsMutated) {
          callbacks.onPromptsMutated();
        }
        await render(query);
      });
    });

    bindHoverPreview(card);
    container.appendChild(card);
  });
};
