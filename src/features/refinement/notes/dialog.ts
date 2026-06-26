import { getSelectionContext } from './selection';
import { addNote, getNotes } from './store';
import { RefinementNote } from './types';

/**
 * Renders a lightweight note creation/editing popup dialog above or below the selected text area.
 * Supports keyboard navigation: Enter, Escape, Tab trapping, and focus restoration.
 */
export const showNoteDialog = (
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
  selectedText: string,
  onSave: () => void
): void => {
  const previousActive = document.activeElement as HTMLElement | null;

  // Remove existing note dialog if any
  const existing = document.getElementById('pn-note-dialog');
  if (existing) {
    existing.remove();
  }

  // Create the note dialog overlay container
  const dialog = document.createElement('div');
  dialog.id = 'pn-note-dialog';
  dialog.className = 'pn-note-dialog-overlay';
  dialog.style.position = 'absolute';
  dialog.style.zIndex = '1000';
  dialog.style.background = 'var(--surface-overlay, #1e293b)';
  dialog.style.border = '1px solid rgba(255, 255, 255, 0.15)';
  dialog.style.borderRadius = 'var(--radius-sm, 6px)';
  dialog.style.padding = '12px';
  dialog.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)';
  dialog.style.width = '260px';

  // Floating position calculations relative to the selection cursor coordinates (fallback to textarea relative)
  const rect = textarea.getBoundingClientRect();

  // Place dialog below or above the textarea dynamically
  dialog.style.left = `${rect.left + window.scrollX + (rect.width - 260) / 2}px`;
  dialog.style.top = `${rect.top + window.scrollY + 40}px`;

  dialog.innerHTML = `
    <div style="font-size: 11px; color: var(--text-muted, #94a3b8); margin-bottom: 6px; font-weight: 600; text-transform: uppercase;">Attach Refinement Note</div>
    <div style="font-size: 12px; color: var(--text-primary, #f8fafc); font-style: italic; background: rgba(0,0,0,0.2); padding: 4px 6px; border-radius: var(--radius-xs); margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">
      "${selectedText}"
    </div>
    <textarea id="pn-note-dialog-input" placeholder="e.g. Must scale to 100M users, write in JSON..." rows="3" style="width: 100%; font-size: 12px; padding: 6px; background: rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.08); color: #fff; border-radius: var(--radius-xs); resize: none; margin-bottom: 8px; font-family: var(--font-sans);"></textarea>
    <div style="display: flex; justify-content: flex-end; gap: 6px;">
      <button id="pn-note-dialog-cancel" class="pn-btn pn-btn--ghost" type="button" style="font-size: 11px; padding: 2px 8px; height: 24px;">Cancel</button>
      <button id="pn-note-dialog-save" class="pn-btn pn-btn--primary" type="button" style="font-size: 11px; padding: 2px 8px; height: 24px;">Save Note</button>
    </div>
  `;

  document.body.appendChild(dialog);

  const input = document.getElementById('pn-note-dialog-input') as HTMLTextAreaElement | null;
  const cancelBtn = document.getElementById('pn-note-dialog-cancel') as HTMLButtonElement | null;
  const saveBtn = document.getElementById('pn-note-dialog-save') as HTMLButtonElement | null;

  input?.focus();

  const cleanup = () => {
    dialog.remove();
    document.removeEventListener('mousedown', onOutsideClick);
    if (previousActive) {
      previousActive.focus();
    } else {
      textarea.focus();
    }
  };

  const handleSave = () => {
    const instruction = input?.value.trim() || '';
    if (!instruction) return;

    const note: RefinementNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      selectedText,
      instruction,
      startOffset: start,
      endOffset: end,
      createdAt: Date.now(),
    };

    addNote(note);
    onSave();
    cleanup();
  };

  cancelBtn?.addEventListener('click', cleanup);
  saveBtn?.addEventListener('click', handleSave);

  // Focus Trapping and Keyboard handling
  const focusables = [input, cancelBtn, saveBtn].filter(Boolean) as HTMLElement[];

  dialog.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      if (document.activeElement === cancelBtn) {
        cleanup();
      } else {
        handleSave();
      }
      e.preventDefault();
      return;
    }

    if (e.key === 'Tab') {
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
  });

  // Handle clicking outside to dismiss
  const onOutsideClick = (e: MouseEvent) => {
    if (!dialog.contains(e.target as Node) && e.target !== textarea) {
      cleanup();
    }
  };
  document.addEventListener('mousedown', onOutsideClick);
};
