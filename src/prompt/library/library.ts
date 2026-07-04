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
import { LibraryDOM } from './library-dom';
import { LibraryActions } from './library-actions';
import { PnDialog } from '../shared/dialog';

let selectedPrompt: Prompt | null = null;
let currentPlaygroundValues: Record<string, string> = {};

const cardMap = new Map<string, HTMLElement>();

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

  const maxLines = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      if (oldLine !== undefined) {
        html += `<div class="diff-line diff-line--unchanged">  ${escapeHtml(oldLine)}</div>`;
      }
    } else {
      if (oldLine !== undefined) {
        html += `<div class="diff-line diff-line--removed">- ${escapeHtml(oldLine)}</div>`;
      }
      if (newLine !== undefined) {
        html += `<div class="diff-line diff-line--added">+ ${escapeHtml(newLine)}</div>`;
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

const formatRelativeTime = (timestamp: string | number | null): string => {
  if (!timestamp) return '';
  const timeMs = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  if (isNaN(timeMs)) return '';

  const diff = Date.now() - timeMs;
  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (secs < 60) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(timeMs).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

const getCardInnerHtml = (prompt: Prompt): string => {
  const displayTags = prompt.tags || [];
  const maxVisibleTags = 3;
  const visibleTags = displayTags.slice(0, maxVisibleTags);
  const remainingCount = displayTags.length - maxVisibleTags;

  const tagsMarkup = visibleTags
    .map((tag: string) => `<span class="card-tag">${escapeHtml(tag)}</span>`)
    .join('');
  const overflowMarkup =
    remainingCount > 0 ? `<span class="card-tag card-tag--overflow">+${remainingCount}</span>` : '';

  const varsCount = (prompt.variables || []).length;
  const varsMarkup = varsCount > 0 ? `<span class="card-vars-badge">${varsCount} vars</span>` : '';

  return `
    <div class="card-content">
      <div class="card-header">
        <span class="card-category category-badge category-badge--${prompt.category || 'general'}">${
          CATEGORY_LABELS[prompt.category || 'general'] || 'General'
        }</span>
        <div class="card-indicators">
          <button
            class="card-indicator button-pin"
            data-action="pin"
            title="${prompt.isPinned ? 'Unpin prompt' : 'Pin prompt'}"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${
              prompt.isPinned ? 'currentColor' : 'none'
            }" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a6 6 0 0 1 8.49 8.49Z"/><path d="M8.53 16.11 9 15.62"/><path d="m12 12.16.4-.39"/></svg>
          </button>
          <button
            class="card-indicator button-favorite"
            data-action="favorite"
            title="${prompt.isFavorite ? 'Remove from favorites' : 'Add to favorites'}"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${
              prompt.isFavorite ? 'currentColor' : 'none'
            }" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          </button>
        </div>
      </div>
      <h3 class="card-title">${escapeHtml(prompt.title || 'Untitled Prompt')}</h3>
      <p class="card-description">${escapeHtml(prompt.description || '')}</p>
      <div class="card-tags">${tagsMarkup}${overflowMarkup}</div>
      <div class="card-footer">
        ${varsMarkup}
        <span class="card-date">${formatRelativeTime(prompt.updatedAt || prompt.createdAt)}</span>
      </div>
    </div>
  `;
};

export const updateCard = (prompt: Prompt): void => {
  const card = cardMap.get(prompt.id);
  if (!card) return;

  const newHtml = getCardInnerHtml(prompt);
  if (card.innerHTML !== newHtml) {
    card.innerHTML = newHtml;
  }
  card.setAttribute('data-pinned', String(prompt.isPinned));
  card.setAttribute('data-favorite', String(prompt.isFavorite));
  card.setAttribute('data-selected', String(selectedPrompt && selectedPrompt.id === prompt.id));
};

const bindCardListeners = (card: HTMLElement, prompt: Prompt, query: string) => {
  const pinBtn = card.querySelector('[data-action="pin"]') as HTMLElement;
  if (pinBtn) {
    pinBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const updated = await PromptStore.setPinned(prompt.id, !prompt.isPinned);
      if (updated) {
        updateCard(updated);
        if (selectedPrompt && selectedPrompt.id === prompt.id) {
          selectedPrompt = updated;
          await openPreviewPanel(updated);
        }
      }
    });
  }

  const favBtn = card.querySelector('[data-action="favorite"]') as HTMLElement;
  if (favBtn) {
    favBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const updated = await PromptStore.setFavorite(prompt.id, !prompt.isFavorite);
      if (updated) {
        updateCard(updated);
        if (selectedPrompt && selectedPrompt.id === prompt.id) {
          selectedPrompt = updated;
          await openPreviewPanel(updated);
        }
      }
    });
  }

  card.addEventListener('click', async () => {
    const list = LibraryDOM.list;
    if (list) {
      list
        .querySelectorAll('.prompt-card')
        .forEach((c) => c.setAttribute('data-selected', 'false'));
    }
    card.setAttribute('data-selected', 'true');
    selectedPrompt = prompt;
    await openPreviewPanel(prompt);
  });

  card.addEventListener('dblclick', async () => {
    const PromptForm = (window as any).PromptForm;
    if (PromptForm?.openForEdit) {
      await PromptForm.openForEdit(prompt);
    }
  });
};

export const render = async (query = '', keepSelection = false): Promise<void> => {
  const container = LibraryDOM.list;
  if (!container) return;

  const sorted = promptSearchIndex.search(query);
  const allPrompts = query ? promptSearchIndex.search('') : sorted;

  if (selectedPrompt && !keepSelection) {
    const isStillVisible = sorted.some((p: Prompt) => p.id === selectedPrompt!.id);
    if (!isStillVisible) {
      closePreviewPanel();
    }
  }

  if (allPrompts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">No prompts yet</p>
        <p class="empty-state__message">Your prompt library is empty. Create your first prompt to get started.</p>
        <div class="empty-state__action">
          <button id="pn-empty-create-btn" class="button button--primary" type="button">Create Prompt</button>
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
      <div class="empty-state">
        <p class="empty-state__title">No results for "${escapeHtml(query)}"</p>
        <p class="empty-state__message">No prompts matched your search. Try adjusting keywords or clearing the search.</p>
        <div class="empty-suggestions">
          <span class="suggestion-chip" data-query="">Clear search</span>
        </div>
      </div>
    `;
    container.querySelectorAll('.suggestion-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        const targetQ = (e.currentTarget as HTMLElement).getAttribute('data-query') || '';
        const searchInput = getSearchInput() as HTMLInputElement | null;
        if (searchInput) {
          searchInput.value = targetQ;
          void render(targetQ);
        }
      });
    });
    return;
  }

  const scrollTop = container.scrollTop;

  const existingCards = Array.from(container.children) as HTMLElement[];
  const existingCardMap: Record<string, HTMLElement> = {};
  existingCards.forEach((c) => {
    const pid = c.getAttribute('data-prompt-id');
    if (pid) existingCardMap[pid] = c;
  });

  const fragment = document.createDocumentFragment();
  cardMap.clear();

  sorted.forEach((prompt: Prompt) => {
    let card = existingCardMap[prompt.id];
    const innerHtmlContent = getCardInnerHtml(prompt);

    if (card) {
      if (card.innerHTML !== innerHtmlContent) {
        const newCard = card.cloneNode(false) as HTMLElement;
        newCard.innerHTML = innerHtmlContent;
        card.replaceWith(newCard);
        card = newCard;
        bindCardListeners(card, prompt, query);
      }
    } else {
      card = document.createElement('li');
      card.className = 'prompt-card';
      card.dataset.promptId = prompt.id;
      card.innerHTML = innerHtmlContent;
      bindCardListeners(card, prompt, query);
    }

    card.setAttribute('data-pinned', String(prompt.isPinned));
    card.setAttribute('data-favorite', String(prompt.isFavorite));
    card.setAttribute('data-selected', String(selectedPrompt && selectedPrompt.id === prompt.id));
    card.tabIndex = 0;

    cardMap.set(prompt.id, card);
    fragment.appendChild(card);
  });

  container.replaceChildren(fragment);
  container.scrollTop = scrollTop;
};

/**
 * Opens and renders the details preview panel for the selected prompt.
 */
export const openPreviewPanel = async (prompt: Prompt): Promise<void> => {
  const panel = LibraryDOM.details;
  if (!panel) return;

  panel.classList.remove('hidden');
  void PromptStore.recordOpen(prompt.id);

  const titleEl = LibraryDOM.title;
  const catEl = LibraryDOM.category;
  const dateEl = LibraryDOM.updated;
  const descEl = LibraryDOM.desc;
  const tagsListEl = LibraryDOM.tags;
  const previewBox = LibraryDOM.previewBox;

  if (titleEl) titleEl.textContent = prompt.title;
  if (catEl) {
    catEl.className = `category-badge category-badge--${prompt.category || 'general'}`;
    catEl.textContent = CATEGORY_LABELS[prompt.category || 'general'] || 'General';
  }
  if (dateEl)
    dateEl.textContent = `Updated ${formatShortDate(prompt.updatedAt || prompt.createdAt)}`;
  if (descEl) descEl.textContent = prompt.description || 'No description provided.';

  if (tagsListEl) {
    tagsListEl.innerHTML = (prompt.tags || [])
      .map((tag: string) => `<span class="card-tag">${escapeHtml(tag)}</span>`)
      .join('');
  }

  // Clear playground state
  currentPlaygroundValues = {};

  // Setup Playground inputs if it has variables
  const varsSection = LibraryDOM.varsSection;
  const varsInputsWrap = LibraryDOM.varsInputs;

  if (prompt.variables && prompt.variables.length > 0) {
    varsSection?.classList.remove('hidden');
    if (varsInputsWrap) {
      varsInputsWrap.innerHTML = '';
      prompt.variables.forEach((variable: any) => {
        const inputId = `playground-var-${variable.name}`;
        const inputFieldContainer = document.createElement('div');
        inputFieldContainer.className = 'playground-field-group';

        const label = document.createElement('label');
        label.setAttribute('for', inputId);
        label.innerHTML = `<span>${escapeHtml(variable.name)}</span> ${
          variable.required ? '<small class="required-indicator">*</small>' : ''
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
    varsSection?.classList.add('hidden');
    if (varsInputsWrap) {
      varsInputsWrap.innerHTML = '';
    }
  }

  // Generate initial preview
  updateCompiledPreviewBox(prompt, previewBox);

  // Load Version History Snapshots list
  await renderVersionHistorySnapshots(prompt.id);
};

const updateCompiledPreviewBox = (prompt: Prompt, previewBox: HTMLElement | null): void => {
  if (!previewBox) return;
  const compiled = VariablesManager.compile(
    prompt.text,
    currentPlaygroundValues,
    prompt.variables || []
  );

  let html = escapeHtml(compiled);

  // Highlight heading structures
  html = html
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Convert fenced code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="preview-code-block"><code>$1</code></pre>');

  previewBox.innerHTML = html;
};

const renderVersionHistorySnapshots = async (promptId: string): Promise<void> => {
  const container = LibraryDOM.versionList;
  if (!container) return;

  const versions = await PromptVersionStore.getVersions(promptId);
  container.innerHTML = '';

  if (versions.length === 0) {
    container.innerHTML =
      '<p class="empty-version-msg">No saved versions yet. Versions are created automatically as you edit.</p>';
    return;
  }

  versions.forEach((version: PromptVersion) => {
    const div = document.createElement('li');
    div.className = 'details-version-item';
    div.innerHTML = `
      <div class="version-info">
        <span class="version-number">v${version.version}</span>
        <span class="version-annotation">${escapeHtml(version.annotation || 'Manual snapshot')}</span>
        <span class="version-date">${formatShortDate(version.updatedAt)}</span>
      </div>
      <div class="version-actions">
        <button class="button button--ghost button--sm version-compare-btn" type="button">Diff</button>
        <button class="button button--ghost button--sm version-restore-btn" type="button">Restore</button>
      </div>
      <div class="version-diff-output hidden"></div>
    `;

    const diffOutput = div.querySelector('.version-diff-output') as HTMLElement;
    const compareBtn = div.querySelector('.version-compare-btn') as HTMLButtonElement;

    compareBtn.addEventListener('click', () => {
      if (diffOutput.classList.contains('hidden')) {
        if (selectedPrompt) {
          diffOutput.innerHTML = renderLineDiff(version.text, selectedPrompt.text);
          diffOutput.classList.remove('hidden');
          compareBtn.textContent = 'Hide Diff';
        }
      } else {
        diffOutput.classList.add('hidden');
        compareBtn.textContent = 'Diff';
      }
    });

    div.querySelector('.version-restore-btn')?.addEventListener('click', async () => {
      void PnDialog.confirm(`Restore version v${version.version} of "${version.title}"?`, {
        title: 'Restore Version',
        confirmLabel: 'Restore',
      }).then(async (confirmed) => {
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
              const searchVal = getSearchValue() || '';
              await render(searchVal);
              await openPreviewPanel(restored);
              const DomHelpers = (window as any).DomHelpers;
              if (DomHelpers?.showToast)
                DomHelpers.showToast(`Restored version v${version.version}`);
            }
          }
        }
      });
    });

    container.appendChild(div);
  });
};

export const closePreviewPanel = (): void => {
  const panel = LibraryDOM.details;
  if (panel) {
    panel.classList.add('hidden');
  }
  cardMap.forEach((c) => c.setAttribute('data-selected', 'false'));
  selectedPrompt = null;
};

// Delegated event listener for the details panel root
if (typeof window !== 'undefined') {
  // Bind standard close click via delegation or direct listener (let's keep delegation clean)
  LibraryDOM.details.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-action]');
    if (!btn || !selectedPrompt) return;

    const action = btn.getAttribute('data-action');

    if (action === LibraryActions.CloseDetails) {
      closePreviewPanel();
      return;
    }

    e.stopPropagation();

    if (action === LibraryActions.Use) {
      const compiled = VariablesManager.compile(
        selectedPrompt.text,
        currentPlaygroundValues,
        selectedPrompt.variables || []
      );
      void doInject(compiled, false, btn as HTMLButtonElement);
      void PromptStore.incrementUsageCount(selectedPrompt.id);
    } else if (action === LibraryActions.Copy) {
      const originalText = btn.textContent || 'Copy Raw';
      void navigator.clipboard.writeText(selectedPrompt.text).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 1400);
        const DomHelpers = (window as any).DomHelpers;
        if (DomHelpers?.showToast) DomHelpers.showToast('Copied raw prompt to clipboard');
      });
    } else if (action === LibraryActions.CopyCompiled) {
      const originalText = btn.textContent || 'Copy Compiled';
      const compiled = VariablesManager.compile(
        selectedPrompt.text,
        currentPlaygroundValues,
        selectedPrompt.variables || []
      );
      void navigator.clipboard.writeText(compiled).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 1400);
        const DomHelpers = (window as any).DomHelpers;
        if (DomHelpers?.showToast) DomHelpers.showToast('Copied rendered prompt to clipboard');
      });
    } else if (action === LibraryActions.Edit) {
      const PromptForm = (window as any).PromptForm;
      if (PromptForm?.openForEdit) {
        void PromptForm.openForEdit(selectedPrompt);
      }
    } else if (action === LibraryActions.Duplicate) {
      void PromptStore.duplicatePrompt(selectedPrompt.id).then(async (duplicated) => {
        if (duplicated) {
          const searchVal = getSearchValue() || '';
          await render(searchVal);
          await openPreviewPanel(duplicated);
        }
      });
    } else if (action === LibraryActions.Delete) {
      void PnDialog.confirm(`Delete prompt "${selectedPrompt.title}"?`, {
        title: 'Delete Prompt',
        confirmLabel: 'Delete',
        danger: true,
      }).then(async (confirmed) => {
        if (confirmed && selectedPrompt) {
          await PromptStore.deletePrompt(selectedPrompt.id);
          closePreviewPanel();
          const searchVal = getSearchValue() || '';
          await render(searchVal);
        }
      });
    }
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
