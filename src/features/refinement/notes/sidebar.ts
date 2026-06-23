import { getNotes, removeNote } from './store';
import { RefinementNote } from './types';
import { highlightNoteSegment } from './highlighting';

/**
 * Renders the refinement notes list inside the sidebar container element.
 */
export const renderNotesSidebar = (container: HTMLElement, textarea: HTMLTextAreaElement): void => {
  const notes = getNotes();

  container.innerHTML = '';

  if (notes.length === 0) {
    container.innerHTML = `
      <div style="font-size: 12px; color: var(--text-muted, #94a3b8); text-align: center; padding: 12px 0;">
        Select text in the prompt above and click "Add Note" to annotate your prompt for Rewrites.
      </div>
    `;
    return;
  }

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '8px';

  notes.forEach((note) => {
    const card = document.createElement('div');
    card.className = 'pn-note-sidebar-card';
    card.style.background = 'rgba(255, 255, 255, 0.02)';
    card.style.border = '1px solid rgba(255, 255, 255, 0.05)';
    card.style.borderRadius = 'var(--radius-sm, 6px)';
    card.style.padding = '8px 10px';
    card.style.cursor = 'pointer';
    card.style.position = 'relative';
    card.style.transition = 'all 0.15s ease';

    card.innerHTML = `
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
        <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--secondary-accent-text, #c084fc); font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px;" title="${note.selectedText.replace(/"/g, '&quot;')}">
          "${note.selectedText}"
        </span>
        <button class="pn-note-delete-btn" type="button" style="background: none; border: none; padding: 0; color: var(--text-muted, #94a3b8); cursor: pointer; font-size: 13px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; hover: { color: #f87171 }">&times;</button>
      </div>
      <div style="font-size: 12px; color: var(--text-primary, #f8fafc); margin-top: 4px; line-height: 1.4; word-break: break-word;">
        ${note.instruction}
      </div>
    `;

    // Click handler to select and highlight the segment in the textarea
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('pn-note-delete-btn')) {
        removeNote(note.id);
        renderNotesSidebar(container, textarea);
        highlightNoteSegment(textarea, null); // Clear selection highlights
        return;
      }

      // Highlight segment in working prompt
      highlightNoteSegment(textarea, note);
    });

    list.appendChild(card);
  });

  container.appendChild(list);
};
