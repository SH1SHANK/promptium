// File: src/features/conversation/types.ts

export interface Message {
  role: 'human' | 'assistant';
  text: string;
  thinking?: string;
  html?: string;
  index: number;
}

export interface ConversationPayload {
  title: string;
  platform: string;
  url: string;
  createdAt: string;
  messages: Message[];
}

export interface ConversationAnalysis {
  categories: string[];
  goals: string[];
  openQuestions: string[];
  decisions: string[];
  summary: string;
}

export type ContinuationMode = 'natural' | 'expand' | 'challenge' | 'fork';

export interface ContextChip {
  id: string;
  title: string;
  type: 'knowledge' | 'skill' | 'instruction';
  score: number;
}
