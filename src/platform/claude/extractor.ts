import { Conversation, Message } from '../base/types';
import { SELECTORS } from './selectors';
import { decodeHtmlEntities, sortNodesByDomOrder, extractThinkingText } from '../base/helpers';

export async function extractConversation(): Promise<Conversation> {
  const userNodes = Array.from(document.querySelectorAll<HTMLElement>(SELECTORS.userMsg));
  const botNodes = Array.from(document.querySelectorAll<HTMLElement>(SELECTORS.botMsg));

  const mergedMap = new Map<HTMLElement, 'user' | 'assistant'>();
  for (const node of userNodes) {
    mergedMap.set(node, 'user');
  }
  for (const node of botNodes) {
    if (!mergedMap.has(node)) {
      mergedMap.set(node, 'assistant');
    }
  }

  const sortedNodes = sortNodesByDomOrder(Array.from(mergedMap.keys()));
  const messages: Message[] = [];

  for (const node of sortedNodes) {
    const role = mergedMap.get(node);
    if (!role) continue;

    let text = '';
    let thinking = '';
    if (role === 'assistant') {
      const extracted = extractThinkingText(node);
      text = decodeHtmlEntities(extracted.text);
      thinking = decodeHtmlEntities(extracted.thinking);
    } else {
      text = decodeHtmlEntities((node.innerText || node.textContent || '').trim());
    }
    const html = (node.innerHTML || '').trim();

    if (text) {
      messages.push({
        role,
        content: text,
        thinking,
        html,
      });
    }
  }

  return { messages };
}
