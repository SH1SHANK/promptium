// File: src/features/conversation/context-builder.ts

import { KeywordRetrievalProvider } from '../retrieval';
import { ConversationPayload, ContextChip } from './types';

const retrievalProvider = new KeywordRetrievalProvider();

export const ContextBuilder = {
  async buildContext(payload: ConversationPayload): Promise<{
    chips: ContextChip[];
    systemPromptSegments: string[];
    vaultSkillText: string;
    vaultKnowledgeText: string;
    vaultInstructionsText: string;
  }> {
    const messages = payload.messages || [];

    // Use the last 3 messages as the query text for keyword retrieval
    const queryText = messages
      .slice(-3)
      .map((m) => m.text)
      .join('\n');

    if (!queryText.trim()) {
      return {
        chips: [],
        systemPromptSegments: [],
        vaultSkillText: '',
        vaultKnowledgeText: '',
        vaultInstructionsText: '',
      };
    }

    const retrievalResult = await retrievalProvider.retrieve(queryText);
    const chips: ContextChip[] = [];

    if (retrievalResult.skill) {
      chips.push({
        id: retrievalResult.skill.item.id,
        title: retrievalResult.skill.item.title,
        type: 'skill',
        score: retrievalResult.skill.score,
      });
    }

    for (const k of retrievalResult.knowledge) {
      chips.push({
        id: k.item.id,
        title: k.item.title,
        type: 'knowledge',
        score: k.score,
      });
    }

    for (const i of retrievalResult.instructions) {
      chips.push({
        id: i.item.id,
        title: i.item.title,
        type: 'instruction',
        score: i.score,
      });
    }

    // Build standard text segments for inserting into Gemini prompts
    let vaultSkillText = '';
    if (retrievalResult.skill) {
      vaultSkillText = `${retrievalResult.skill.item.title}\nRole Guidelines:\n${retrievalResult.skill.item.content}`;
    }

    let vaultKnowledgeText = '';
    if (retrievalResult.knowledge.length > 0) {
      vaultKnowledgeText =
        `\nRELEVANT KNOWLEDGE DOCUMENTATION REFERENCE:\n` +
        retrievalResult.knowledge
          .map((k) => `### Reference: ${k.item.title}\n${k.item.content}`)
          .join('\n\n') +
        `\n`;
    }

    let vaultInstructionsText = '';
    if (retrievalResult.instructions.length > 0) {
      vaultInstructionsText =
        `\nPERSISTENT USER PREFERENCES & CONSTRAINTS:\n` +
        retrievalResult.instructions.map((i) => `- ${i.item.content}`).join('\n') +
        `\n`;
    }

    const systemPromptSegments: string[] = [];
    if (vaultSkillText) {
      systemPromptSegments.push(`Assigned Role/Skill Persona: ${vaultSkillText}`);
    }
    if (vaultKnowledgeText) {
      systemPromptSegments.push(vaultKnowledgeText);
    }
    if (vaultInstructionsText) {
      systemPromptSegments.push(vaultInstructionsText);
    }

    return {
      chips,
      systemPromptSegments,
      vaultSkillText,
      vaultKnowledgeText,
      vaultInstructionsText,
    };
  },
};
