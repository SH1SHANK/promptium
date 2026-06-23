import { RefinementNote } from './types';

let notesDb: RefinementNote[] = [];

export const addNote = (note: RefinementNote): void => {
  // Check if note with same ID or overlapping spans exists (standard validation)
  const existingIdx = notesDb.findIndex(n => n.id === note.id);
  if (existingIdx !== -1) {
    notesDb[existingIdx] = note;
  } else {
    notesDb.push(note);
  }
};

export const updateNote = (id: string, instruction: string): void => {
  const note = notesDb.find(n => n.id === id);
  if (note) {
    note.instruction = instruction;
  }
};

export const removeNote = (id: string): void => {
  notesDb = notesDb.filter(n => n.id !== id);
};

export const getNotes = (): RefinementNote[] => {
  return [...notesDb];
};

export const clear = (): void => {
  notesDb = [];
};

/**
 * Adjusts note selection offsets after text modifications (such as Fix/Upgrade/Replace operations).
 * Compares characters surrounding the original selections to map them to the new text where possible,
 * or shifts/drops them if the edit overlaps the selection.
 */
export const adjustOffsetsAfterTextChange = (oldText: string, newText: string): void => {
  if (oldText === newText) return;

  const adjusted: RefinementNote[] = [];

  for (const note of notesDb) {
    // 1. Exact match search in the neighborhood of the old offset
    const targetText = note.selectedText;
    let foundIndex = -1;

    // Check if the exact substring is still present at the same startOffset
    if (newText.substring(note.startOffset, note.startOffset + targetText.length) === targetText) {
      foundIndex = note.startOffset;
    } else {
      // Look for the exact substring nearby or anywhere in the new text
      // We prioritize the match closest to the old offset.
      let bestDist = Infinity;
      let pos = newText.indexOf(targetText);
      while (pos !== -1) {
        const dist = Math.abs(pos - note.startOffset);
        if (dist < bestDist) {
          bestDist = dist;
          foundIndex = pos;
        }
        pos = newText.indexOf(targetText, pos + 1);
      }
    }

    if (foundIndex !== -1) {
      adjusted.push({
        ...note,
        startOffset: foundIndex,
        endOffset: foundIndex + targetText.length
      });
    } else {
      // 2. Substring not found exactly, try to find a partial match or discard/shift
      // For safety, if a note's text is completely edited out or cannot be matched, we omit it.
    }
  }

  notesDb = adjusted;
};
