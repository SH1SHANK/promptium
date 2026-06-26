// File: src/features/conversation/extractor.ts

import { KEYS } from '../../sidepanel/state';
import { ConversationPayload, Message } from './types';

export const Extractor = {
  async extractActivePayload(): Promise<ConversationPayload | null> {
    const sessionSnapshot = await chrome.storage.session.get([KEYS.SIDEPANEL_SESSION_KEY]);
    const localSnapshot = await chrome.storage.local.get([KEYS.SIDEPANEL_SESSION_KEY]);
    const rawPayload =
      sessionSnapshot?.[KEYS.SIDEPANEL_SESSION_KEY] || localSnapshot?.[KEYS.SIDEPANEL_SESSION_KEY];

    if (!rawPayload) return null;
    return this.normalize(rawPayload);
  },

  normalize(raw: any): ConversationPayload {
    const value = raw && typeof raw === 'object' ? raw : {};
    const messages = Array.isArray(value.messages) ? value.messages : [];
    const url = String(value.url || '').trim();

    const normalizedMessages: Message[] = messages
      .map((message: any, fallbackIndex: number) => {
        const indexCandidate = Number(message?.index);
        const sourceIndex = Number.isFinite(indexCandidate) ? indexCandidate : fallbackIndex;
        const text = String(message?.text || '').trim();

        return {
          role:
            String(message?.role || 'assistant').toLowerCase() === 'human' ? 'human' : 'assistant',
          text,
          thinking: String(message?.thinking || '').trim(),
          html: String(message?.html || '').trim(),
          index: sourceIndex,
        } as Message;
      })
      .filter((message: Message) => message.text.length > 0);

    return {
      title: String(value.title || 'Promptium Chat').trim(),
      platform: String(value.platform || 'unknown').trim(),
      url,
      createdAt: String(value.createdAt || new Date().toISOString()),
      messages: normalizedMessages,
    };
  },
};
