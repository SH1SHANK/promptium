export interface SelectionContext {
  selectedText: string;
  startOffset: number;
  endOffset: number;
}

export const getSelectionContext = (): SelectionContext | null => {
  const textArea = document.getElementById('pn-improve-text-area') as HTMLTextAreaElement | null;
  if (!textArea) return null;

  const start = textArea.selectionStart;
  const end = textArea.selectionEnd;

  if (start === end || start === null || end === null) {
    return null;
  }

  const selectedText = textArea.value.slice(start, end).trim();

  // Ignore empty/whitespace only selections
  if (!selectedText) {
    return null;
  }

  // Maximum note target size: 1000 characters
  if (selectedText.length > 1000) {
    return null;
  }

  return {
    selectedText,
    startOffset: start,
    endOffset: end,
  };
};
