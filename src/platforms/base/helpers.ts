export function decodeHtmlEntities(str: string): string {
  try {
    if (typeof DOMParser === 'undefined') return str;
    const parser = new DOMParser();
    const doc = parser.parseFromString(str, 'text/html');
    return doc.documentElement.textContent || '';
  } catch {
    return str;
  }
}

export const THINKING_SELECTORS = [
  'details.thinking',
  'details:has(summary)',
  'div.think',
  'div[class*="think"]',
  '[data-thinking]',
  '.reasoning-content',
  '.thought-container',
  '[data-testid*="thinking"]',
  '[data-testid*="reasoning"]',
];

export function extractThinkingText(node: HTMLElement): { thinking: string; text: string } {
  const thinkingParts: string[] = [];
  const cache = new Set<Element>();

  for (const sel of THINKING_SELECTORS) {
    try {
      const els = node.querySelectorAll(sel);
      for (let j = 0; j < els.length; j++) {
        const el = els[j];
        if (el && !cache.has(el)) {
          const content = (el.textContent || '').trim();
          if (content) {
            thinkingParts.push(content);
            cache.add(el);
          }
        }
      }
    } catch {
      // Skip invalid selectors silently
    }
  }

  let text = (node.textContent || '').trim();

  for (const part of thinkingParts) {
    if (text.includes(part)) {
      text = text
        .replace(part, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
  }

  return {
    thinking: thinkingParts.join('\n\n'),
    text,
  };
}

export function sortNodesByDomOrder(nodes: HTMLElement[]): HTMLElement[] {
  const sorted = [...nodes];
  sorted.sort((left, right) => {
    if (left === right) return 0;
    const relation = left.compareDocumentPosition(right);
    if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    return 0;
  });
  return sorted;
}
