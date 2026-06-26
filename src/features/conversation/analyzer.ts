// File: src/features/conversation/analyzer.ts

import { AIBridge } from '../../utils/ai-bridge';
import { ConversationPayload, ConversationAnalysis } from './types';

export const Analyzer = {
  async analyze(payload: ConversationPayload): Promise<ConversationAnalysis> {
    const messages = payload.messages;
    if (!messages || messages.length === 0) {
      return {
        categories: ['General'],
        goals: ['No messages to analyze'],
        openQuestions: [],
        decisions: [],
        summary: 'No messages to analyze.',
      };
    }

    const result = await AIBridge.routeTask('analyze_conversation', {
      messages: messages.map((m) => ({ role: m.role, text: m.text })),
    });

    if (result && result.ok && result.analysis) {
      return result.analysis;
    }

    // Fallback if AI fails or returns invalid json
    return {
      categories: ['General'],
      goals: ['Continue conversation'],
      openQuestions: [],
      decisions: [],
      summary: `Conversation with ${messages.length} messages.`,
    };
  },
};
