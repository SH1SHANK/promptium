import { Prompt } from '../types/types';
import { PromptStore } from '../storage/storage';
import { PromptVersionStore, PromptVersion } from '../versions/versions';
import { VariablesManager } from '../variables/variables';
import {
  sortPrompts,
  sidepanelKeywordFilter,
  searchController,
  promptSearchIndex,
  bindSearchHandlers,
  getSearchValue,
  clearSearch,
  focusSearch,
  getSearchInput,
  getSearchWrap,
} from '../search/search';
import { doInject, callbacks, setCallbacks } from './actions';
import { bindTemplateFilters, resetTemplateFilter } from './filters';

let selectedPrompt: Prompt | null = null;
let currentPlaygroundValues: Record<string, string> = {};

const CATEGORY_LABELS: Record<string, string> = {
  writing: 'Writing',
  coding: 'Coding',
  study: 'Study',
  research: 'Research',
  creative: 'Creative',
  work: 'Work',
  general: 'General',
};

const formatShortDate = (isoString: string | null): string => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch (_) {
    return '';
  }
};

/**
 * Computes a simple line-by-line diff for comparing versions.
 */
const renderLineDiff = (oldText: string, newText: string): string => {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  let html = '';

  // Simple line-by-line rendering for changes
  const maxLines = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      if (oldLine !== undefined) {
        html += `<div class="pn-diff-line pn-diff-line--unchanged">  ${escapeHtml(oldLine)}</div>`;
      }
    } else {
      if (oldLine !== undefined) {
        html += `<div class="pn-diff-line pn-diff-line--removed">- ${escapeHtml(oldLine)}</div>`;
      }
      if (newLine !== undefined) {
        html += `<div class="pn-diff-line pn-diff-line--added">+ ${escapeHtml(newLine)}</div>`;
      }
    }
  }
  return html;
};

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const bindCardListeners = (card: HTMLElement, prompt: Prompt, query: string) => {
  const pinBtn = card.querySelector('.pn-card-pin-btn') as HTMLElement;
  pinBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await PromptStore.setPinned(prompt.id, !prompt.isPinned);
    await render(query);
    if (selectedPrompt && selectedPrompt.id === prompt.id) {
      selectedPrompt.isPinned = !prompt.isPinned;
      await openPreviewPanel(selectedPrompt);
    }
  });

  const favBtn = card.querySelector('.pn-card-fav-btn') as HTMLElement;
  favBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await PromptStore.setFavorite(prompt.id, !prompt.isFavorite);
    await render(query);
    if (selectedPrompt && selectedPrompt.id === prompt.id) {
      selectedPrompt.isFavorite = !prompt.isFavorite;
      await openPreviewPanel(selectedPrompt);
    }
  });

  card.querySelector('.pn-action-use')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const compiled = VariablesManager.compile(prompt.text, {}, prompt.variables || []);
    const btn = e.currentTarget as HTMLButtonElement;
    await doInject(compiled, false, btn);
    await PromptStore.incrementUsageCount(prompt.id);
  });

  card.querySelector('.pn-action-edit')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const PromptForm = (window as any).PromptForm;
    if (PromptForm?.openForEdit) {
      await PromptForm.openForEdit(prompt);
    }
  });

  card.querySelector('.pn-action-duplicate')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const duplicated = await PromptStore.duplicatePrompt(prompt.id);
    if (duplicated) {
      await render(query);
    }
  });

  card.querySelector('.pn-action-delete')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const confirmed = window.confirm(`Delete prompt "${prompt.title}"?`);
    if (confirmed) {
      await PromptStore.deletePrompt(prompt.id);
      if (selectedPrompt && selectedPrompt.id === prompt.id) {
        closePreviewPanel();
      }
      await render(query);
    }
  });

  card.addEventListener('click', async () => {
    document
      .querySelectorAll('.pn-prompt-card')
      .forEach((c) => c.classList.remove('pn-card--selected'));
    card.classList.add('pn-card--selected');
    selectedPrompt = prompt;
    await openPreviewPanel(prompt);
  });
};

export const render = async (query = ''): Promise<void> => {
  const container = document.getElementById('prompt-list');
  if (!container) return;

  const sorted = promptSearchIndex.search(query);
  const allPrompts = promptSearchIndex.search('');

  if (allPrompts.length === 0) {
    container.innerHTML = `
      <div class="pn-empty-state">
        <p class="pn-empty-state__title">No prompts yet</p>
        <p class="pn-empty-state__message">Create your first prompt to get started.</p>
        <div class="pn-empty-state__action">
          <button id="pn-empty-create-btn" class="pn-btn pn-btn--primary" type="button">Create Prompt</button>
        </div>
      </div>
    `;
    document.getElementById('pn-empty-create-btn')?.addEventListener('click', () => {
      const PromptForm = (window as any).PromptForm;
      if (PromptForm?.open) {
        void PromptForm.open();
      }
    });
    return;
  }

  if (sorted.length === 0) {
    container.innerHTML = `
      <div class="pn-empty-state">
        <p class="pn-empty-state__title">No results found</p>
        <p class="pn-empty-state__message">No prompts matched your search. Try adjusting keywords or choosing tag suggestions.</p>
        <div class="pn-empty-suggestions" style="margin-top: var(--space-2); display: flex; gap: var(--space-2); flex-wrap: wrap; justify-content: center;">
          <span class="pn-suggestion-chip" style="cursor: pointer; background: var(--color-bg-elevated); padding: 4px var(--space-2); border-radius: var(--radius-xs); border: 1px solid var(--color-border-default); font-size: var(--font-size-sm);" data-query="">Clear search</span>
          <span class="pn-suggestion-chip" style="cursor: pointer; background: var(--color-bg-elevated); padding: 4px var(--space-2); border-radius: var(--radius-xs); border: 1px solid var(--color-border-default); font-size: var(--font-size-sm);" data-query="writing">writing</span>
          <span class="pn-suggestion-chip" style="cursor: pointer; background: var(--color-bg-elevated); padding: 4px var(--space-2); border-radius: var(--radius-xs); border: 1px solid var(--color-border-default); font-size: var(--font-size-sm);" data-query="coding">coding</span>
        </div>
      </div>
    `;
    container.querySelectorAll('.pn-suggestion-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        const targetQ = (e.currentTarget as HTMLElement).getAttribute('data-query') || '';
        const searchInput = document.getElementById('prompt-search') as HTMLInputElement | null;
        if (searchInput) {
          searchInput.value = targetQ;
          void render(targetQ);
        }
      });
    });
    return;
  }

  const existingCards = Array.from(container.children) as HTMLElement[];
  const existingCardMap: Record<string, HTMLElement> = {};
  existingCards.forEach((c) => {
    const pid = c.getAttribute('data-prompt-id');
    if (pid) existingCardMap[pid] = c;
  });

  const fragment = document.createDocumentFragment();

  sorted.forEach((prompt: Prompt) => {
    let card = existingCardMap[prompt.id];
    const tagsMarkup = (prompt.tags || [])
      .map((tag: string) => `<span class="pn-card-tag">${escapeHtml(tag)}</span>`)
      .join('');

    const innerHtmlContent = `
      <div class="pn-card-main-content">
        <div class="pn-card-top-row">
          <span class="pn-card-category pn-category-badge pn-category-badge--${prompt.category || 'general'}">${
            CATEGORY_LABELS[prompt.category || 'general'] || 'General'
          }</span>
          <div class="pn-card-quick-indicators">
            <button class="pn-card-pin-btn ${prompt.isPinned ? 'active' : ''}" type="button" title="Pin prompt">📌</button>
            <button class="pn-card-fav-btn ${prompt.isFavorite ? 'active' : ''}" type="button" title="Favorite prompt">★</button>
          </div>
        </div>
        <h3 class="pn-card-title">${escapeHtml(prompt.title)}</h3>
        <p class="pn-card-desc">${escapeHtml(prompt.description || 'No description.')}</p>
        <div class="pn-card-tags">
          ${tagsMarkup}
        </div>
      </div>
      <div class="pn-card-footer">
        <span class="pn-card-var-count">${(prompt.variables || []).length} variables</span>
        <span class="pn-card-date">Updated ${formatShortDate(prompt.updatedAt || prompt.createdAt)}</span>
      </div>
      <div class="pn-card-hover-actions">
        <button class="pn-hover-action-btn pn-action-use" type="button" title="Inject into active tab">Use</button>
        <button class="pn-hover-action-btn pn-action-edit" type="button" title="Edit Prompt">Edit</button>
        <button class="pn-hover-action-btn pn-action-duplicate" type="button" title="Duplicate">Duplicate</button>
        <button class="pn-hover-action-btn pn-action-delete" type="button" title="Delete">Delete</button>
      </div>
    `;

    if (card) {
      if (card.innerHTML !== innerHtmlContent) {
        card.className = `pn-prompt-card ${prompt.isPinned ? 'pn-card--pinned' : ''}`;
        if (selectedPrompt && selectedPrompt.id === prompt.id) {
          card.classList.add('pn-card--selected');
        }
        card.innerHTML = innerHtmlContent;
        bindCardListeners(card, prompt, query);
      } else {
        card.className = `pn-prompt-card ${prompt.isPinned ? 'pn-card--pinned' : ''}`;
        if (selectedPrompt && selectedPrompt.id === prompt.id) {
          card.classList.add('pn-card--selected');
        }
      }
    } else {
      card = document.createElement('article');
      card.className = `pn-prompt-card ${prompt.isPinned ? 'pn-card--pinned' : ''}`;
      if (selectedPrompt && selectedPrompt.id === prompt.id) {
        card.classList.add('pn-card--selected');
      }
      card.dataset.promptId = prompt.id;
      card.innerHTML = innerHtmlContent;
      bindCardListeners(card, prompt, query);
    }

    fragment.appendChild(card);
  });

  container.innerHTML = '';
  container.appendChild(fragment);
};

/**
 * Opens and renders the details preview panel for the selected prompt.
 */
export const openPreviewPanel = async (prompt: Prompt): Promise<void> => {
  const panel = document.getElementById('pn-prompt-detail-panel');
  if (!panel) return;

  panel.classList.remove('pn-hidden');
  void PromptStore.recordOpen(prompt.id);

  const titleEl = document.getElementById('pn-detail-title');
  const catEl = document.getElementById('pn-detail-category');
  const dateEl = document.getElementById('pn-detail-updated');
  const descEl = document.getElementById('pn-detail-desc');
  const tagsListEl = document.getElementById('pn-detail-tags');
  const previewBox = document.getElementById('pn-detail-preview-box');

  if (titleEl) titleEl.textContent = prompt.title;
  if (catEl) {
    catEl.className = `pn-category-badge pn-category-badge--${prompt.category || 'general'}`;
    catEl.textContent = CATEGORY_LABELS[prompt.category || 'general'] || 'General';
  }
  if (dateEl)
    dateEl.textContent = `Updated ${formatShortDate(prompt.updatedAt || prompt.createdAt)}`;
  if (descEl) descEl.textContent = prompt.description || 'No description provided.';

  if (tagsListEl) {
    tagsListEl.innerHTML = (prompt.tags || [])
      .map((tag: string) => `<span class="pn-card-tag">${escapeHtml(tag)}</span>`)
      .join('');
  }

  // Clear playground state
  currentPlaygroundValues = {};

  // Setup Playground inputs if it has variables
  const varsSection = document.getElementById('pn-detail-vars-section');
  const varsInputsWrap = document.getElementById('pn-detail-vars-inputs');

  if (prompt.variables && prompt.variables.length > 0) {
    varsSection?.classList.remove('pn-hidden');
    if (varsInputsWrap) {
      varsInputsWrap.innerHTML = '';
      prompt.variables.forEach((variable: any) => {
        const inputId = `playground-var-${variable.name}`;
        const inputFieldContainer = document.createElement('div');
        inputFieldContainer.className = 'pn-playground-field-group';

        const label = document.createElement('label');
        label.setAttribute('for', inputId);
        label.innerHTML = `<span>${escapeHtml(variable.name)}</span> ${
          variable.required ? '<small class="pn-required-indicator">*</small>' : ''
        }`;

        let inputEl: HTMLElement;

        if (variable.type === 'choice') {
          const select = document.createElement('select');
          select.id = inputId;
          (variable.choices || []).forEach((choice: string) => {
            const opt = document.createElement('option');
            opt.value = choice;
            opt.textContent = choice;
            select.appendChild(opt);
          });
          select.value = variable.defaultValue || '';
          inputEl = select;
        } else if (variable.type === 'boolean') {
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.id = inputId;
          checkbox.checked = variable.defaultValue === 'true';
          inputEl = checkbox;
        } else if (variable.type === 'long-text') {
          const textarea = document.createElement('textarea');
          textarea.id = inputId;
          textarea.rows = 2;
          textarea.placeholder = variable.placeholder || `Enter ${variable.name}...`;
          textarea.value = variable.defaultValue || '';
          inputEl = textarea;
        } else {
          const textInput = document.createElement('input');
          textInput.type = 'text';
          textInput.id = inputId;
          textInput.placeholder = variable.placeholder || `Enter ${variable.name}...`;
          textInput.value = variable.defaultValue || '';
          inputEl = textInput;
        }

        // Handle value changes to compile live preview
        const handleChange = () => {
          let value = '';
          if (variable.type === 'boolean') {
            value = String((inputEl as HTMLInputElement).checked);
          } else {
            value = (inputEl as HTMLInputElement).value;
          }
          currentPlaygroundValues[variable.name] = value;
          updateCompiledPreviewBox(prompt, previewBox);
        };

        inputEl.addEventListener('input', handleChange);
        inputEl.addEventListener('change', handleChange);

        inputFieldContainer.appendChild(label);
        inputFieldContainer.appendChild(inputEl);
        varsInputsWrap.appendChild(inputFieldContainer);

        // Prepopulate default value
        currentPlaygroundValues[variable.name] =
          variable.type === 'boolean'
            ? String((inputEl as HTMLInputElement).checked)
            : (inputEl as HTMLInputElement).value;
      });
    }
  } else {
    varsSection?.classList.add('pn-hidden');
  }

  // Generate initial preview
  updateCompiledPreviewBox(prompt, previewBox);

  // Load Version History Snapshots list
  await renderVersionHistorySnapshots(prompt.id);

  // Setup detail panel action buttons
  const useBtn = document.getElementById('pn-detail-btn-use');
  useBtn?.replaceWith(useBtn.cloneNode(true));
  document.getElementById('pn-detail-btn-use')?.addEventListener('click', async (e) => {
    const compiled = VariablesManager.compile(
      prompt.text,
      currentPlaygroundValues,
      prompt.variables || []
    );
    const btn = e.currentTarget as HTMLButtonElement;
    await doInject(compiled, false, btn);
    await PromptStore.incrementUsageCount(prompt.id);
  });

  const copyBtn = document.getElementById('pn-detail-btn-copy');
  copyBtn?.replaceWith(copyBtn.cloneNode(true));
  document.getElementById('pn-detail-btn-copy')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(prompt.text);
    const DomHelpers = (window as any).DomHelpers;
    if (DomHelpers?.showToast) DomHelpers.showToast('Copied raw prompt to clipboard');
  });

  const copyCompiledBtn = document.getElementById('pn-detail-btn-copy-compiled');
  copyCompiledBtn?.replaceWith(copyCompiledBtn.cloneNode(true));
  document.getElementById('pn-detail-btn-copy-compiled')?.addEventListener('click', async () => {
    const compiled = VariablesManager.compile(
      prompt.text,
      currentPlaygroundValues,
      prompt.variables || []
    );
    await navigator.clipboard.writeText(compiled);
    const DomHelpers = (window as any).DomHelpers;
    if (DomHelpers?.showToast) DomHelpers.showToast('Copied rendered prompt to clipboard');
  });

  const editBtn = document.getElementById('pn-detail-btn-edit');
  editBtn?.replaceWith(editBtn.cloneNode(true));
  document.getElementById('pn-detail-btn-edit')?.addEventListener('click', async () => {
    const PromptForm = (window as any).PromptForm;
    if (PromptForm?.openForEdit) {
      await PromptForm.openForEdit(prompt);
    }
  });

  const dupBtn = document.getElementById('pn-detail-btn-duplicate');
  dupBtn?.replaceWith(dupBtn.cloneNode(true));
  document.getElementById('pn-detail-btn-duplicate')?.addEventListener('click', async () => {
    const duplicated = await PromptStore.duplicatePrompt(prompt.id);
    if (duplicated) {
      const searchVal = (document.getElementById('prompt-search') as HTMLInputElement)?.value || '';
      await render(searchVal);
      await openPreviewPanel(duplicated);
    }
  });

  const delBtn = document.getElementById('pn-detail-btn-delete');
  delBtn?.replaceWith(delBtn.cloneNode(true));
  document.getElementById('pn-detail-btn-delete')?.addEventListener('click', async () => {
    const confirmed = window.confirm(`Delete prompt "${prompt.title}"?`);
    if (confirmed) {
      await PromptStore.deletePrompt(prompt.id);
      closePreviewPanel();
      const searchVal = (document.getElementById('prompt-search') as HTMLInputElement)?.value || '';
      await render(searchVal);
    }
  });
};

const updateCompiledPreviewBox = (prompt: Prompt, previewBox: HTMLElement | null): void => {
  if (!previewBox) return;
  const compiled = VariablesManager.compile(
    prompt.text,
    currentPlaygroundValues,
    prompt.variables || []
  );

  // Highlight variables inside compiled preview block if still not resolved
  let html = escapeHtml(compiled);

  // Highlight heading structures
  html = html
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Convert fenced code blocks
  html = html.replace(
    /```([\s\S]*?)```/g,
    '<pre class="pn-preview-code-block"><code>$1</code></pre>'
  );

  previewBox.innerHTML = html;
};

const renderVersionHistorySnapshots = async (promptId: string): Promise<void> => {
  const container = document.getElementById('pn-detail-versions-list');
  if (!container) return;

  const versions = await PromptVersionStore.getVersions(promptId);
  container.innerHTML = '';

  if (versions.length === 0) {
    container.innerHTML = '<p class="pn-card-meta">No save history available.</p>';
    return;
  }

  versions.forEach((version: PromptVersion) => {
    const div = document.createElement('div');
    div.className = 'pn-detail-version-item';
    div.innerHTML = `
      <div class="pn-version-info">
        <span class="pn-version-number">v${version.version}</span>
        <span class="pn-version-annotation">${escapeHtml(version.annotation || 'Manual snapshot')}</span>
        <span class="pn-version-date">${formatShortDate(version.updatedAt)}</span>
      </div>
      <div class="pn-version-actions">
        <button class="pn-btn pn-btn--ghost pn-btn--sm pn-version-compare-btn" type="button">Diff</button>
        <button class="pn-btn pn-btn--ghost pn-btn--sm pn-version-restore-btn" type="button">Restore</button>
      </div>
      <div class="pn-version-diff-output pn-hidden"></div>
    `;

    const diffOutput = div.querySelector('.pn-version-diff-output') as HTMLElement;
    const compareBtn = div.querySelector('.pn-version-compare-btn') as HTMLButtonElement;

    compareBtn.addEventListener('click', () => {
      if (diffOutput.classList.contains('pn-hidden')) {
        // Compute diff
        if (selectedPrompt) {
          diffOutput.innerHTML = renderLineDiff(version.text, selectedPrompt.text);
          diffOutput.classList.remove('pn-hidden');
          compareBtn.textContent = 'Hide Diff';
        }
      } else {
        diffOutput.classList.add('pn-hidden');
        compareBtn.textContent = 'Diff';
      }
    });

    div.querySelector('.pn-version-restore-btn')?.addEventListener('click', async () => {
      const confirmed = window.confirm(
        `Restore version v${version.version} of "${version.title}"?`
      );
      if (confirmed) {
        if (selectedPrompt) {
          const restored = await PromptStore.updatePrompt(
            selectedPrompt.id,
            {
              title: version.title,
              description: version.description,
              text: version.text,
              tags: version.tags,
              category: version.category,
              variables: version.variables,
            },
            `Restored version v${version.version}`
          );
          if (restored) {
            selectedPrompt = restored;
            const searchVal =
              (document.getElementById('prompt-search') as HTMLInputElement)?.value || '';
            await render(searchVal);
            await openPreviewPanel(restored);
            const DomHelpers = (window as any).DomHelpers;
            if (DomHelpers?.showToast) DomHelpers.showToast(`Restored version v${version.version}`);
          }
        }
      }
    });

    container.appendChild(div);
  });
};

export const closePreviewPanel = (): void => {
  const panel = document.getElementById('pn-prompt-detail-panel');
  if (panel) {
    panel.classList.add('pn-hidden');
  }
  document
    .querySelectorAll('.pn-prompt-card')
    .forEach((c) => c.classList.remove('pn-card--selected'));
  selectedPrompt = null;
};

// Bind elements
if (typeof window !== 'undefined') {
  document.getElementById('pn-detail-close')?.addEventListener('click', () => {
    closePreviewPanel();
  });
}

export const PromptsUI = {
  render,
  closePreviewPanel,
  openPreviewPanel,
  bindSearchHandlers,
  getSearchValue,
  clearSearch,
  focusSearch,
  getSearchInput,
  getSearchWrap,
  bindTemplateFilters,
  resetTemplateFilter,
  setCallbacks,
  initToolbar: () => {},
};

if (typeof window !== 'undefined') {
  (window as any).PromptsUI = PromptsUI;
}
