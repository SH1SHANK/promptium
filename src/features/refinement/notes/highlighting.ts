import { RefinementNote } from './types';

/**
 * Highlights a note's selected segment inside the textarea by scrolling it into view and highlighting it.
 */
export const highlightNoteSegment = (textarea: HTMLTextAreaElement, note: RefinementNote | null): void => {
  if (!note) {
    // Clear selection
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    return;
  }

  // Set the textarea selection bounds to trigger native text selection highlighting
  textarea.focus();
  textarea.setSelectionRange(note.startOffset, note.endOffset);

  // Scroll textarea to the selection context (best-effort scroll calculation)
  const lineCountBefore = textarea.value.substring(0, note.startOffset).split('\n').length;
  const lineHeight = 19; // Average line height in px
  textarea.scrollTop = Math.max(0, (lineCountBefore - 3) * lineHeight);
};
