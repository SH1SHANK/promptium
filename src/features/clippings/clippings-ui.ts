/**
 * File: src/features/clippings/clippings-ui.ts
 * Purpose: Manage renderings, card events, multi-selection, and Review Mode for Clippings.
 */

import { ClippingStore } from './store';
import { Clipping } from './types';
import { initVaultStore, createItem } from '../vault/store';

class ClippingsUIClass {
  private activeTags: string[] = [];
  private selectedClippings: Set<string> = new Set();
  private previousActiveElement: HTMLElement | null = null;

  // Review Mode state
  private reviewList: Clipping[] = [];
  private reviewIndex = 0;

  async init() {
    this.bindEvents();
    await this.render();
  }

  private bindEvents() {
    const searchInput = document.getElementById('pn-clippings-search');
    searchInput?.addEventListener('input', () => void this.renderList());

    const reviewBtn = document.getElementById('pn-clippings-review-btn');
    reviewBtn?.addEventListener('click', () => void this.startReviewMode());

    const closeReviewBtn = document.getElementById('pn-clippings-review-close');
    closeReviewBtn?.addEventListener('click', () => this.stopReviewMode());

    const closeBackdrop = document.getElementById('pn-clippings-review-close-backdrop');
    closeBackdrop?.addEventListener('click', () => this.stopReviewMode());

    const modal = document.getElementById('pn-clippings-review-modal');
    modal?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.stopReviewMode();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.navigateReview(-1);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.navigateReview(1);
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

    const prevReviewBtn = document.getElementById('pn-clippings-review-prev');
    prevReviewBtn?.addEventListener('click', () => this.navigateReview(-1));

    const nextReviewBtn = document.getElementById('pn-clippings-review-next');
    nextReviewBtn?.addEventListener('click', () => this.navigateReview(1));

    const revealBtn = document.getElementById('pn-clippings-review-reveal');
    revealBtn?.addEventListener('click', () => {
      const block = document.getElementById('pn-clippings-review-context-block');
      block?.classList.toggle('pn-hidden');
    });

    // Multi-select actions
    const mergeBtn = document.getElementById('pn-clippings-multi-merge');
    mergeBtn?.addEventListener('click', () => void this.handleMultiMerge());

    const deleteBtn = document.getElementById('pn-clippings-multi-delete');
    deleteBtn?.addEventListener('click', () => void this.handleMultiDelete());

    const exportBtn = document.getElementById('pn-clippings-multi-export');
    exportBtn?.addEventListener('click', () => void this.handleMultiExport());

    const convertBtn = document.getElementById('pn-clippings-multi-convert');
    convertBtn?.addEventListener('click', () => void this.handleMultiConvert());
  }

  async render() {
    await this.renderTagsFilter();
    await this.renderList();
    this.updateMultiSelectBar();
  }

  private async renderTagsFilter() {
    const filterContainer = document.getElementById('pn-clippings-tags-filter');
    if (!filterContainer) return;
    filterContainer.innerHTML = '';

    const clippings = await ClippingStore.getAll();
    const allTags = Array.from(new Set(clippings.flatMap((c) => c.tags || []))).sort();

    if (allTags.length === 0) {
      filterContainer.innerHTML =
        '<span style="color: var(--text-muted);">No tags available.</span>';
      return;
    }

    allTags.forEach((tag) => {
      const chip = document.createElement('span');
      chip.textContent = tag;
      const isActive = this.activeTags.includes(tag);
      chip.style.cssText = `
        padding: 4px 10px;
        border-radius: 9999px;
        cursor: pointer;
        font-size: 11px;
        border: 1px solid ${isActive ? '#10b981' : 'rgba(255,255,255,0.08)'};
        background: ${isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.02)'};
        color: ${isActive ? '#34d399' : 'var(--text-muted)'};
        transition: all 0.2s ease;
      `;
      chip.addEventListener('click', () => {
        if (isActive) {
          this.activeTags = this.activeTags.filter((t) => t !== tag);
        } else {
          this.activeTags.push(tag);
        }
        void this.render();
      });
      filterContainer.appendChild(chip);
    });
  }

  private async renderList() {
    const listContainer = document.getElementById('pn-clippings-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const searchInput = document.getElementById('pn-clippings-search') as HTMLInputElement;
    const query = searchInput?.value || '';

    // Search and filter
    let clippings = await ClippingStore.search(query);
    if (this.activeTags.length > 0) {
      clippings = clippings.filter((c) => this.activeTags.every((t) => c.tags?.includes(t)));
    }

    if (clippings.length === 0) {
      const emptyNode = (window as any).DomHelpers.createEmptyState({
        title: query ? 'No Matching Clippings' : 'No Clippings Captured',
        message: query
          ? 'No clippings match your search query. Try clearing the search or adjusting filters.'
          : 'Clippings are short snippets highlighted from your LLM chats. Highlight text and choose "Save Clipping" from the context menu to begin capturing.',
        actionLabel: query ? 'Clear Search' : '',
        onAction: query
          ? () => {
              if (searchInput) searchInput.value = '';
              void this.renderList();
            }
          : undefined,
      });
      listContainer.appendChild(emptyNode);
      return;
    }

    clippings.forEach((clipping) => {
      const card = this.createClippingCard(clipping);
      listContainer.appendChild(card);
    });
  }

  private createClippingCard(clipping: Clipping): HTMLElement {
    const card = document.createElement('div');
    card.className = 'pn-clipping-card';
    const isSelected = this.selectedClippings.has(clipping.id);

    card.style.cssText = `
      background: var(--surface-card, rgba(255, 255, 255, 0.02));
      border: 1px solid ${isSelected ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.06)'};
      border-radius: var(--radius-md, 8px);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      position: relative;
      cursor: pointer;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      transition: all 0.2s ease;
    `;

    if (isSelected) {
      card.style.background = 'rgba(16, 185, 129, 0.03)';
    }

    // Toggle multi-select on card body click (excluding button action clicks)
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('a') || target.closest('textarea')) return;

      if (this.selectedClippings.has(clipping.id)) {
        this.selectedClippings.delete(clipping.id);
      } else {
        this.selectedClippings.add(clipping.id);
      }
      void this.render();
    });

    const header = document.createElement('div');
    header.style.cssText =
      'display: flex; justify-content: space-between; align-items: center; gap: 8px;';

    const meta = document.createElement('span');
    meta.style.cssText = 'font-size: 11px; color: var(--text-muted); font-weight: 500;';
    meta.textContent = clipping.conversationTitle || `Exercept from ${clipping.platform}`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isSelected;
    checkbox.style.cssText = 'cursor: pointer; accent-color: #10b981;';
    checkbox.addEventListener('change', () => {
      if (this.selectedClippings.has(clipping.id)) {
        this.selectedClippings.delete(clipping.id);
      } else {
        this.selectedClippings.add(clipping.id);
      }
      void this.render();
    });

    header.appendChild(meta);
    header.appendChild(checkbox);
    card.appendChild(header);

    const bodyText = document.createElement('blockquote');
    bodyText.style.cssText = `
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
      color: #e2e8f0;
      border-left: 2px solid rgba(255,255,255,0.1);
      padding-left: 10px;
      max-height: 120px;
      overflow-y: auto;
      white-space: pre-wrap;
    `;
    bodyText.textContent = clipping.selectedText;
    card.appendChild(bodyText);

    // Note Block
    if (clipping.note) {
      const noteBlock = document.createElement('div');
      noteBlock.style.cssText =
        'font-size: 12px; color: #34d399; font-style: italic; background: rgba(16, 185, 129, 0.05); padding: 6px 10px; border-radius: 4px;';
      noteBlock.textContent = `Note: ${clipping.note}`;
      card.appendChild(noteBlock);
    }

    // Tags list
    if (clipping.tags && clipping.tags.length > 0) {
      const tagRow = document.createElement('div');
      tagRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px;';
      clipping.tags.forEach((tag) => {
        const tagSpan = document.createElement('span');
        tagSpan.textContent = `#${tag}`;
        tagSpan.style.cssText =
          'font-size: 10px; color: var(--text-muted); background: rgba(255,255,255,0.04); padding: 1px 6px; border-radius: 4px;';
        tagRow.appendChild(tagSpan);
      });
      card.appendChild(tagRow);
    }

    // Actions Row
    const actionsRow = document.createElement('div');
    actionsRow.style.cssText =
      'display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px;';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'pn-btn pn-btn--ghost';
    copyBtn.style.cssText = 'font-size: 11px; padding: 2px 8px;';
    copyBtn.textContent = '📋 Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(clipping.selectedText);
      toast.success('Copied text to clipboard');
    });

    const editBtn = document.createElement('button');
    editBtn.className = 'pn-btn pn-btn--ghost';
    editBtn.style.cssText = 'font-size: 11px; padding: 2px 8px;';
    editBtn.textContent = '✏️ Edit Note';
    editBtn.addEventListener('click', () => {
      const newNote = prompt('Edit note:', clipping.note || '');
      if (newNote !== null) {
        const val = newNote.trim();
        if (val) {
          clipping.note = val;
        } else {
          delete clipping.note;
        }
        void ClippingStore.save(clipping).then(() => void this.render());
      }
    });

    const continueBtn = document.createElement('button');
    continueBtn.className = 'pn-btn pn-btn--ghost';
    continueBtn.style.cssText = 'font-size: 11px; padding: 2px 8px; color: #60a5fa;';
    continueBtn.textContent = '💬 Continue';
    continueBtn.addEventListener('click', () => {
      void this.handleContinue(clipping);
    });

    const vaultBtn = document.createElement('button');
    vaultBtn.className = 'pn-btn pn-btn--ghost';
    vaultBtn.style.cssText = 'font-size: 11px; padding: 2px 8px; color: #10B981;';
    vaultBtn.textContent = '📥 Convert to Vault';
    vaultBtn.addEventListener('click', () => {
      void this.handleConvertToVault(clipping);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'pn-btn pn-btn--danger';
    deleteBtn.style.cssText =
      'font-size: 11px; padding: 2px 8px; background: transparent; color: #ef4444; border: none;';
    deleteBtn.textContent = '🗑️ Delete';
    deleteBtn.addEventListener('click', () => {
      if (confirm('Delete this clipping?')) {
        void ClippingStore.delete(clipping.id).then(() => void this.render());
      }
    });

    actionsRow.appendChild(copyBtn);
    actionsRow.appendChild(editBtn);
    actionsRow.appendChild(continueBtn);
    actionsRow.appendChild(vaultBtn);
    actionsRow.appendChild(deleteBtn);
    card.appendChild(actionsRow);

    return card;
  }

  private updateMultiSelectBar() {
    const bar = document.getElementById('pn-clippings-multi-bar');
    const countSpan = document.getElementById('pn-clippings-selected-count');
    if (!bar || !countSpan) return;

    if (this.selectedClippings.size > 0) {
      bar.classList.remove('pn-hidden');
      countSpan.textContent = `${this.selectedClippings.size} items selected`;
    } else {
      bar.classList.add('pn-hidden');
    }
  }

  private async handleMultiMerge() {
    const ids = Array.from(this.selectedClippings);
    if (ids.length < 2) {
      alert('Select at least 2 clippings to merge.');
      return;
    }

    const note = prompt('Enter note for merged clipping (optional):');
    if (note !== null) {
      const merged = await ClippingStore.merge(ids, note);
      if (merged) {
        toast.success('Clippings merged successfully.');
        this.selectedClippings.clear();
        void this.render();
      }
    }
  }

  private async handleMultiDelete() {
    const ids = Array.from(this.selectedClippings);
    if (confirm(`Delete the ${ids.length} selected clippings?`)) {
      const count = await ClippingStore.deleteMultiple(ids);
      toast.success(`Deleted ${count} clippings.`);
      this.selectedClippings.clear();
      void this.render();
    }
  }

  private async handleMultiExport() {
    const ids = Array.from(this.selectedClippings);
    const all = await ClippingStore.getAll();
    const targets = all.filter((c) => ids.includes(c.id));
    if (targets.length === 0) return;

    const md = targets
      .map((c, i) => {
        return `## Clipping #${i + 1} (${c.conversationTitle || 'Conversation'})\n\n> ${c.selectedText}\n\n${c.note ? `*Note:* ${c.note}\n` : ''}${c.tags.length ? `*Tags:* ${c.tags.map((t) => '#' + t).join(' ')}\n` : ''}`;
      })
      .join('\n\n---\n\n');

    this.downloadMarkdown('promptium-exported-clippings.md', md);
    toast.success(`Exported ${targets.length} clippings as markdown.`);
    this.selectedClippings.clear();
    void this.render();
  }

  private async handleMultiConvert() {
    const ids = Array.from(this.selectedClippings);
    const all = await ClippingStore.getAll();
    const targets = all.filter((c) => ids.includes(c.id));
    if (targets.length === 0) return;

    if (confirm(`Convert ${targets.length} clippings to Vault items?`)) {
      await initVaultStore();
      for (const c of targets) {
        const type = this.classifyText(c.selectedText);
        await createItem({
          type,
          title: c.conversationTitle || 'Clipping',
          content: c.selectedText,
          tags: ['clipping', ...c.tags],
          enabled: true,
          pinned: false,
          priority: 'medium',
        });
      }
      toast.success(`Converted ${targets.length} items to Vault.`);
      this.selectedClippings.clear();
      void this.render();
    }
  }

  private downloadMarkdown(filename: string, text: string) {
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private classifyText(text: string): 'knowledge' | 'instruction' | 'skill' {
    const t = text.toLowerCase();
    if (
      t.includes('you are') ||
      t.includes('act as') ||
      t.includes('persona') ||
      t.includes('senior') ||
      t.includes('expert')
    ) {
      return 'skill';
    }
    if (
      t.includes('always') ||
      t.includes('never') ||
      t.includes('do not') ||
      t.includes('prefer') ||
      t.includes('guideline') ||
      t.includes('instruction')
    ) {
      return 'instruction';
    }
    return 'knowledge';
  }

  private async handleContinue(clipping: Clipping) {
    // 11. Continue From Clipping
    // Store clipping context
    const context = `[Clipping Context]\n${clipping.selectedText}\n\n${clipping.surroundingContext ? `[Surrounding Context]\n${clipping.surroundingContext}\n` : ''}${clipping.note ? `[Personal Note]\n${clipping.note}` : ''}`;

    await chrome.storage.local.set({
      pendingContinuation: {
        text: context,
        sourcePlatform: clipping.platform,
        targetPlatform: clipping.platform,
        createdAt: Date.now(),
      },
    });

    // Open workspace continuation panel
    await chrome.storage.session.set({
      promptiumPendingPanelAction: { type: 'showContinuation' },
    });

    // Notify/Switch tab
    const shell = (window as any).AppShell;
    if (shell?.switchTab) {
      await shell.switchTab('continue');
    }
  }

  private async handleConvertToVault(clipping: Clipping) {
    const suggestedType = this.classifyText(clipping.selectedText);
    const title = prompt('Vault Title:', clipping.conversationTitle || 'Vault Item');
    if (!title) return;

    const typeStr = prompt('Vault Type (knowledge / instruction / skill):', suggestedType);
    if (!typeStr) return;
    const type = typeStr.trim().toLowerCase() as 'knowledge' | 'instruction' | 'skill';

    await initVaultStore();
    await createItem({
      type,
      title,
      content: clipping.selectedText + (clipping.note ? `\n\nNote: ${clipping.note}` : ''),
      tags: ['clipping', ...clipping.tags],
      enabled: true,
      pinned: false,
      priority: 'medium',
    });

    toast.success(`Saved to Vault as ${type}.`);
  }

  // --- Kindle Style Review Mode ---
  private async startReviewMode() {
    const list = await ClippingStore.getAll();
    if (list.length === 0) {
      toast.info('No clippings to review.');
      return;
    }
    this.previousActiveElement = document.activeElement as HTMLElement | null;
    this.reviewList = list;
    this.reviewIndex = 0;

    const modal = document.getElementById('pn-clippings-review-modal');
    modal?.classList.remove('pn-hidden');
    this.renderReviewCard();
  }

  private stopReviewMode() {
    const modal = document.getElementById('pn-clippings-review-modal');
    modal?.classList.add('pn-hidden');
    if (this.previousActiveElement) {
      this.previousActiveElement.focus();
      this.previousActiveElement = null;
    }
  }

  private navigateReview(delta: number) {
    this.reviewIndex = (this.reviewIndex + delta + this.reviewList.length) % this.reviewList.length;
    this.renderReviewCard();
  }

  private renderReviewCard() {
    const clipping = this.reviewList[this.reviewIndex];
    if (!clipping) return;

    const indexSpan = document.getElementById('pn-clippings-review-index');
    if (indexSpan) indexSpan.textContent = `${this.reviewIndex + 1} / ${this.reviewList.length}`;

    const titleEl = document.getElementById('pn-clippings-review-meta-title');
    if (titleEl) titleEl.textContent = clipping.conversationTitle || 'AI Conversation';

    const textEl = document.getElementById('pn-clippings-review-text');
    if (textEl) textEl.textContent = clipping.selectedText;

    const contextBlock = document.getElementById('pn-clippings-review-context-block');
    const contextText = document.getElementById('pn-clippings-review-context-text');
    contextBlock?.classList.add('pn-hidden'); // Keep hidden initially
    if (contextText) {
      contextText.textContent = clipping.surroundingContext || 'No surrounding context captured.';
    }

    const noteBlock = document.getElementById('pn-clippings-review-note-block');
    const noteText = document.getElementById('pn-clippings-review-note-text');
    if (clipping.note) {
      noteBlock?.classList.remove('pn-hidden');
      if (noteText) noteText.textContent = clipping.note;
    } else {
      noteBlock?.classList.add('pn-hidden');
    }
  }
}

export const ClippingsUI = new ClippingsUIClass();
if (typeof window !== 'undefined') {
  (window as any).ClippingsUI = ClippingsUI;
}
