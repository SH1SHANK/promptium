import { getItems, createItem, updateItem, deleteItem, toggleItem } from './store';
import { VaultItem, VaultItemType } from './types';
import { detectImportSource, parseImportFile, initLearningCache, addPreference } from './importer';
import { ParsedImportDraft } from './importer/types';

let currentVaultSubtab: VaultItemType = 'knowledge';
let editingItemId: string | null = null;
let isInitialized = false;
let currentImportDrafts: ParsedImportDraft[] = [];
let previousActiveElement: HTMLElement | null = null;

export async function initVaultUI(): Promise<void> {
  if (isInitialized) {
    renderVaultItems();
    return;
  }
  isInitialized = true;

  // Keyboard navigation & focus traps for Vault modals
  const modal = document.getElementById('pn-vault-item-modal');
  modal?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeVaultModal();
      return;
    }
    if (e.key === 'Enter') {
      const active = document.activeElement;
      if (active && active.tagName === 'BUTTON') return;
      if (active && active.tagName === 'TEXTAREA') return;
      e.preventDefault();
      void handleSaveVaultItem();
      return;
    }
    if (e.key === 'Tab') {
      const focusables = Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled') && !el.closest('.pn-hidden'));

      if (focusables.length > 0) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) return;
        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    }
  });

  const previewModal = document.getElementById('pn-vault-import-preview-modal');
  previewModal?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeImportPreviewModal();
      return;
    }
    if (e.key === 'Enter') {
      const active = document.activeElement;
      if (active && active.tagName === 'BUTTON') return;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT')) {
        return;
      }
      e.preventDefault();
      void handleConfirmImport();
      return;
    }
    if (e.key === 'Tab') {
      const focusables = Array.from(
        previewModal.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled') && !el.closest('.pn-hidden'));

      if (focusables.length > 0) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) return;
        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    }
  });

  // Bind sub-tabs triggers
  const subtabs = Array.from(document.querySelectorAll('.pn-vault-subtab'));
  subtabs.forEach((btn: any) => {
    btn.addEventListener('click', () => {
      subtabs.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentVaultSubtab = btn.dataset.subtab as VaultItemType;

      // Update UI constraints matching Vault Type
      toggleFieldsForVaultType();
      renderVaultItems();
    });
  });

  // Search input event listeners
  const searchInput = document.getElementById('pn-vault-search') as HTMLInputElement | null;
  searchInput?.addEventListener('input', () => {
    renderVaultItems(searchInput.value.trim());
  });

  // Add Item floating button
  document.getElementById('pn-vault-add-btn')?.addEventListener('click', () => {
    openVaultModal(null);
  });

  // Import File button
  document.getElementById('pn-vault-import-btn')?.addEventListener('click', () => {
    document.getElementById('pn-vault-file-importer')?.click();
  });

  document.getElementById('pn-vault-file-importer')?.addEventListener('change', handleFileImport);

  // Import Preview Modal controls
  document
    .getElementById('pn-vault-import-preview-cancel')
    ?.addEventListener('click', closeImportPreviewModal);
  document
    .getElementById('pn-vault-import-preview-close-backdrop')
    ?.addEventListener('click', closeImportPreviewModal);
  document
    .getElementById('pn-vault-import-preview-confirm')
    ?.addEventListener('click', handleConfirmImport);

  // Save Item
  document.getElementById('pn-vault-modal-save')?.addEventListener('click', handleSaveVaultItem);

  // Close modals listeners
  document.getElementById('pn-vault-modal-cancel')?.addEventListener('click', closeVaultModal);
  document
    .getElementById('pn-vault-modal-close-backdrop')
    ?.addEventListener('click', closeVaultModal);

  // Type change listener inside modal to update helper headers
  document.getElementById('pn-vault-input-type')?.addEventListener('change', (e) => {
    const selectedType = (e.target as HTMLSelectElement).value as VaultItemType;
    adjustModalLayout(selectedType);
  });

  // URL Import button binding
  document.getElementById('pn-vault-url-import-btn')?.addEventListener('click', handleURLImport);

  renderVaultItems();
}

function adjustModalLayout(type: VaultItemType): void {
  const urlImportWrap = document.getElementById('pn-vault-url-import-wrap');
  const titleFieldWrap = document.getElementById('pn-vault-title-field-wrap');
  const tagsFieldWrap = document.getElementById('pn-vault-tags-field-wrap');
  const priorityFieldWrap = document.getElementById('pn-vault-priority-field-wrap');
  const contentLabel = document.getElementById('pn-vault-content-label');
  const contentInput = document.getElementById(
    'pn-vault-input-content'
  ) as HTMLTextAreaElement | null;

  // Set defaults
  urlImportWrap?.classList.add('pn-hidden');
  titleFieldWrap?.classList.remove('pn-hidden');
  tagsFieldWrap?.classList.remove('pn-hidden');
  priorityFieldWrap?.classList.add('pn-hidden');
  if (contentLabel) contentLabel.textContent = 'Content';

  if (type === 'knowledge') {
    urlImportWrap?.classList.remove('pn-hidden');
    if (contentInput)
      contentInput.placeholder = 'Paste guidelines, instructions, or markdown notes...';
  } else if (type === 'skill') {
    if (contentLabel) contentLabel.textContent = 'Role Description & Guidelines';
    if (contentInput)
      contentInput.placeholder =
        'e.g. Role: Senior System Architect\nGuidelines:\n- Focus on scaling rules\n- Prefer clean microservices design patterns';
  } else if (type === 'instruction') {
    titleFieldWrap?.classList.add('pn-hidden');
    tagsFieldWrap?.classList.add('pn-hidden');
    if (contentLabel) contentLabel.textContent = 'Preference Instruction';
    priorityFieldWrap?.classList.remove('pn-hidden');
    if (contentInput)
      contentInput.placeholder = 'e.g. Always write clean TypeScript, Keep answers concise...';
  }
}

function toggleFieldsForVaultType(): void {
  // Hide URL import unless knowledge sub-tab is active
  const urlImportWrap = document.getElementById('pn-vault-url-import-wrap');
  if (currentVaultSubtab === 'knowledge') {
    urlImportWrap?.classList.remove('pn-hidden');
  } else {
    urlImportWrap?.classList.add('pn-hidden');
  }
}

function openVaultModal(item: VaultItem | null): void {
  previousActiveElement = document.activeElement as HTMLElement | null;
  const modal = document.getElementById('pn-vault-item-modal');
  const titleInput = document.getElementById('pn-vault-input-title') as HTMLInputElement | null;
  const contentInput = document.getElementById(
    'pn-vault-input-content'
  ) as HTMLTextAreaElement | null;
  const tagsInput = document.getElementById('pn-vault-input-tags') as HTMLInputElement | null;
  const priorityInput = document.getElementById(
    'pn-vault-input-priority'
  ) as HTMLSelectElement | null;
  const pinnedInput = document.getElementById('pn-vault-input-pinned') as HTMLInputElement | null;
  const typeSelect = document.getElementById('pn-vault-input-type') as HTMLSelectElement | null;
  const modalTitle = document.getElementById('pn-vault-modal-title');
  const importStatus = document.getElementById('pn-vault-import-status');
  const importUrl = document.getElementById('pn-vault-import-url') as HTMLInputElement | null;

  if (importStatus) importStatus.classList.add('pn-hidden');
  if (importUrl) importUrl.value = '';

  if (item) {
    editingItemId = item.id;
    if (modalTitle) modalTitle.textContent = 'Edit Vault Item';
    if (typeSelect) {
      typeSelect.value = item.type;
      typeSelect.disabled = true;
    }
    if (titleInput) titleInput.value = item.title;
    if (contentInput) contentInput.value = item.content;
    if (tagsInput) tagsInput.value = item.tags.join(', ');
    if (priorityInput) priorityInput.value = item.priority || 'medium';
    if (pinnedInput) pinnedInput.checked = Boolean(item.pinned);
    adjustModalLayout(item.type);
  } else {
    editingItemId = null;
    if (modalTitle) modalTitle.textContent = 'Add Vault Item';
    if (typeSelect) {
      typeSelect.value = currentVaultSubtab;
      typeSelect.disabled = false;
    }
    if (titleInput) titleInput.value = '';
    if (contentInput) contentInput.value = '';
    if (tagsInput) tagsInput.value = '';
    if (priorityInput) priorityInput.value = 'medium';
    if (pinnedInput) pinnedInput.checked = false;
    adjustModalLayout(currentVaultSubtab);
  }

  modal?.classList.remove('pn-hidden');
}

function closeVaultModal(): void {
  document.getElementById('pn-vault-item-modal')?.classList.add('pn-hidden');
  editingItemId = null;
  if (previousActiveElement) {
    previousActiveElement.focus();
    previousActiveElement = null;
  }
}

async function handleSaveVaultItem(): Promise<void> {
  const typeSelect = document.getElementById('pn-vault-input-type') as HTMLSelectElement | null;
  const titleInput = document.getElementById('pn-vault-input-title') as HTMLInputElement | null;
  const contentInput = document.getElementById(
    'pn-vault-input-content'
  ) as HTMLTextAreaElement | null;
  const tagsInput = document.getElementById('pn-vault-input-tags') as HTMLInputElement | null;
  const priorityInput = document.getElementById(
    'pn-vault-input-priority'
  ) as HTMLSelectElement | null;
  const pinnedInput = document.getElementById('pn-vault-input-pinned') as HTMLInputElement | null;

  if (!typeSelect || !contentInput) return;

  const type = typeSelect.value as VaultItemType;
  const content = contentInput.value.trim();
  let title = titleInput?.value.trim() || '';
  const tags =
    tagsInput?.value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean) || [];
  const priority =
    type === 'instruction'
      ? (priorityInput?.value as 'low' | 'medium' | 'high') || 'medium'
      : undefined;
  const pinned = Boolean(pinnedInput?.checked);

  if (type === 'instruction') {
    // Instructions use a truncated version of content as the title fallback
    title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
  }

  if (!content) {
    alert('Content is required.');
    return;
  }
  if (type !== 'instruction' && !title) {
    alert('Title is required.');
    return;
  }

  if (editingItemId) {
    await updateItem(editingItemId, {
      title,
      content,
      tags,
      pinned,
      ...(priority ? { priority } : {}),
    });
  } else {
    await createItem({
      type,
      title,
      content,
      tags,
      enabled: true,
      pinned,
      ...(priority ? { priority } : {}),
    });
  }

  closeVaultModal();
  renderVaultItems();
}

async function handleURLImport(): Promise<void> {
  const importUrlInput = document.getElementById('pn-vault-import-url') as HTMLInputElement | null;
  const importStatus = document.getElementById('pn-vault-import-status');
  const titleInput = document.getElementById('pn-vault-input-title') as HTMLInputElement | null;
  const contentInput = document.getElementById(
    'pn-vault-input-content'
  ) as HTMLTextAreaElement | null;

  if (!importUrlInput || !importUrlInput.value) return;

  const url = importUrlInput.value.trim();
  if (importStatus) {
    importStatus.textContent = 'Fetching and cleaning content...';
    importStatus.classList.remove('pn-hidden');
    importStatus.style.color = '#38bdf8'; // blue loading
  }

  try {
    const cleanUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
    const response = await fetch(cleanUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch clean markdown from: ${url}`);
    }
    const content = await response.text();

    // Attempt to derive title from URL path or first line
    let derivedTitle = url.split('/').pop() || 'Imported Knowledge';
    if (content.startsWith('# ')) {
      derivedTitle = content.split('\n')[0]!.replace('# ', '').trim();
    }

    if (titleInput) titleInput.value = derivedTitle;
    if (contentInput) contentInput.value = content;

    if (importStatus) {
      importStatus.textContent = 'Imported successfully!';
      importStatus.style.color = '#4ade80'; // green success
      setTimeout(() => importStatus.classList.add('pn-hidden'), 3000);
    }
  } catch (err: any) {
    console.error('URL Markdown Import Error:', err);
    if (importStatus) {
      importStatus.textContent = 'Fetch failed. Please enter content manually.';
      importStatus.style.color = '#f87171'; // red error
    }
  }
}

function renderVaultItems(searchQuery = ''): void {
  const listContainer = document.getElementById('pn-vault-items-list');
  if (!listContainer) return;

  listContainer.innerHTML = '';

  let items = getItems(currentVaultSubtab);

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    items = items.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.content.toLowerCase().includes(query) ||
        item.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }

  if (items.length === 0) {
    let emptyTitle = '';
    let emptyMsg = '';
    let actionLabel = '';

    if (currentVaultSubtab === 'knowledge') {
      emptyTitle = 'No Vault Knowledge Base Entries';
      emptyMsg =
        'Knowledge items provide background context, documentation, and domain notes that the context engine uses to enrich your prompts.';
      actionLabel = '+ Add Knowledge';
    } else if (currentVaultSubtab === 'skill') {
      emptyTitle = 'No Vault Skills Found';
      emptyMsg =
        'Skills define specialized agent personas and system instructions to align your prompts to.';
      actionLabel = '+ Add Skill';
    } else {
      emptyTitle = 'No Vault Instructions Found';
      emptyMsg =
        'Preference instructions define format rules and style preferences prioritized during prompt generation.';
      actionLabel = '+ Add Instruction';
    }

    const emptyNode = (window as any).DomHelpers.createEmptyState({
      title: emptyTitle,
      message: emptyMsg,
      actionLabel,
      onAction: () => openVaultModal(null),
    });
    listContainer.appendChild(emptyNode);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement('div');
    card.style.background = 'rgba(255, 255, 255, 0.02)';
    card.style.border = '1px solid rgba(255, 255, 255, 0.05)';
    card.style.borderRadius = 'var(--radius-sm, 6px)';
    card.style.padding = '12px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '8px';
    card.style.position = 'relative';

    const tagsHtml = item.tags
      .map(
        (t) =>
          `<span style="font-size: 9px; padding: 1px 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); color: var(--text-muted); font-family: var(--font-mono);">${t}</span>`
      )
      .join(' ');

    const truncatedContent =
      item.content.length > 150 ? item.content.slice(0, 150) + '...' : item.content;

    card.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" class="pn-vault-item-toggle" data-id="${item.id}" ${item.enabled ? 'checked' : ''} style="cursor: pointer;" />
          <strong style="font-size: 13px; color: ${item.enabled ? 'var(--text-primary)' : 'var(--text-muted)'};">${item.title}${item.pinned ? ' 📌' : ''}</strong>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="pn-vault-item-pin pn-btn pn-btn--ghost" data-id="${item.id}" type="button" style="font-size: 10px; padding: 2px 6px; height: 20px;">${item.pinned ? 'Unpin' : 'Pin'}</button>
          <button class="pn-vault-item-edit pn-btn pn-btn--ghost" data-id="${item.id}" type="button" style="font-size: 10px; padding: 2px 6px; height: 20px;">Edit</button>
          <button class="pn-vault-item-delete pn-btn pn-btn--ghost" data-id="${item.id}" type="button" style="font-size: 10px; padding: 2px 6px; height: 20px; color: #f87171; border-color: rgba(248,113,113,0.2);">Delete</button>
        </div>
      </div>
      <p style="margin: 0; font-size: 12px; color: var(--text-secondary); line-height: 1.45; white-space: pre-wrap; word-break: break-word;">${truncatedContent}</p>
      ${tagsHtml ? `<div style="display: flex; gap: 4px; flex-wrap: wrap;">${tagsHtml}</div>` : ''}
    `;

    // Toggle enabled checkbox
    card.querySelector('.pn-vault-item-toggle')?.addEventListener('change', async () => {
      await toggleItem(item.id);
      renderVaultItems(searchQuery);
    });

    // Pin/Unpin item
    card.querySelector('.pn-vault-item-pin')?.addEventListener('click', async () => {
      await updateItem(item.id, { pinned: !item.pinned });
      renderVaultItems(searchQuery);
    });

    // Edit item
    card.querySelector('.pn-vault-item-edit')?.addEventListener('click', () => {
      openVaultModal(item);
    });

    // Delete item
    card.querySelector('.pn-vault-item-delete')?.addEventListener('click', async () => {
      if (confirm(`Are you sure you want to delete this ${item.type}?`)) {
        await deleteItem(item.id);
        renderVaultItems(searchQuery);
      }
    });

    listContainer.appendChild(card);
  });
}

async function handleFileImport(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;

  const file = input.files[0]!;
  const reader = new FileReader();

  reader.onload = async (event) => {
    const content = event.target?.result as string;
    if (!content) return;

    try {
      const format = detectImportSource(file.name, content);
      const drafts = await parseImportFile(file.name, content);

      if (drafts.length === 0) {
        alert('No importable content found in this file.');
        return;
      }

      currentImportDrafts = drafts;
      await initLearningCache();
      showImportPreviewModal(format, drafts);
    } catch (err) {
      console.error('File import failed:', err);
      alert('Failed to parse the file.');
    }
  };

  reader.readAsText(file);
  input.value = '';
}

function showImportPreviewModal(format: string, drafts: ParsedImportDraft[]): void {
  previousActiveElement = document.activeElement as HTMLElement | null;
  const modal = document.getElementById('pn-vault-import-preview-modal');
  const formatEl = document.getElementById('pn-vault-import-detected-format');
  const listEl = document.getElementById('pn-vault-import-drafts-list');

  if (formatEl) formatEl.textContent = format.toUpperCase();
  if (listEl) {
    listEl.innerHTML = '';
    drafts.forEach((draft, idx) => {
      const row = document.createElement('div');
      row.style.background = 'rgba(255, 255, 255, 0.02)';
      row.style.border = '1px solid rgba(255, 255, 255, 0.05)';
      row.style.borderRadius = 'var(--radius-sm, 6px)';
      row.style.padding = '12px';
      row.style.display = 'flex';
      row.style.flexDirection = 'column';
      row.style.gap = '8px';

      const confidenceLabel =
        draft.confidence >= 0.85 ? 'High' : draft.confidence >= 0.6 ? 'Medium' : 'Low';
      const confidenceColor =
        draft.confidence >= 0.85 ? '#4ade80' : draft.confidence >= 0.6 ? '#fbbf24' : '#f87171';

      row.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
            <input type="checkbox" class="pn-import-draft-checkbox" data-idx="${idx}" checked style="cursor: pointer;" />
            <input type="text" class="pn-import-draft-title" data-idx="${idx}" value="${draft.title}" style="flex: 1; font-size: 12px; font-weight: 600; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); color: #fff; padding: 4px 8px; border-radius: var(--radius-xs);" />
          </div>
          <span style="font-size: 9px; padding: 2px 6px; border-radius: 8px; background: rgba(255,255,255,0.05); color: ${confidenceColor}; font-weight: 600;">
            Confidence: ${confidenceLabel}
          </span>
        </div>
        
        <div style="display: flex; align-items: center; gap: 12px; margin-top: 2px;">
          <label style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
            Destination:
            <select class="pn-import-draft-type" data-idx="${idx}" style="font-size: 11px; padding: 2px 6px; background: #1e293b; color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;">
              <option value="knowledge" ${draft.type === 'knowledge' ? 'selected' : ''}>Knowledge</option>
              <option value="skill" ${draft.type === 'skill' ? 'selected' : ''}>Skill</option>
              <option value="instruction" ${draft.type === 'instruction' ? 'selected' : ''}>Instruction</option>
            </select>
          </label>
        </div>

        <pre style="margin: 4px 0 0; font-size: 11px; color: var(--text-secondary); max-height: 80px; overflow-y: auto; background: rgba(0,0,0,0.15); padding: 6px; border-radius: 4px; white-space: pre-wrap; word-break: break-all; font-family: var(--font-mono);">${draft.content.length > 250 ? draft.content.slice(0, 250) + '...' : draft.content}</pre>
      `;

      listEl.appendChild(row);
    });
  }

  modal?.classList.remove('pn-hidden');
}

function closeImportPreviewModal(): void {
  document.getElementById('pn-vault-import-preview-modal')?.classList.add('pn-hidden');
  currentImportDrafts = [];
  if (previousActiveElement) {
    previousActiveElement.focus();
    previousActiveElement = null;
  }
}

async function handleConfirmImport(): Promise<void> {
  const listEl = document.getElementById('pn-vault-import-drafts-list');
  if (!listEl) return;

  const rows = Array.from(listEl.children);
  let importedCount = 0;

  for (const row of rows) {
    const checkbox = row.querySelector('.pn-import-draft-checkbox') as HTMLInputElement | null;
    const titleInput = row.querySelector('.pn-import-draft-title') as HTMLInputElement | null;
    const typeSelect = row.querySelector('.pn-import-draft-type') as HTMLSelectElement | null;

    if (!checkbox || !checkbox.checked || !titleInput || !typeSelect) continue;

    const idx = parseInt(checkbox.dataset.idx || '0', 10);
    const draft = currentImportDrafts[idx];
    if (!draft) continue;

    const finalTitle = titleInput.value.trim();
    const finalType = typeSelect.value as VaultItemType;

    // Create item in storage
    await createItem({
      type: finalType,
      title: finalTitle,
      content: draft.content,
      tags: draft.tags,
      enabled: true,
    });

    // Save preference learning layer override if changed by user
    if (finalType !== draft.type) {
      await addPreference({
        titlePattern: finalTitle,
        sourcePattern: draft.originalSource,
        preferredType: finalType,
      });
    }

    importedCount++;
  }

  closeImportPreviewModal();
  renderVaultItems();
  if (importedCount > 0) {
    alert(`Successfully imported ${importedCount} item(s) into the Vault.`);
  }
}
