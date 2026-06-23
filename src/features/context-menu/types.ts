/**
 * File: features/context-menu/types.ts
 * Purpose: Declares TypeScript interfaces for context menu features.
 */

export interface SelectionPayload {
  text: string;
  url: string;
  platform: string | null;
  sourceTitle?: string;
}

export interface PromptSaveMetadata {
  title: string;
  content: string;
  sourcePlatform: string | null;
  sourceUrl: string;
  sourceTitle?: string;
  createdAt: string;
  tags: string[];
  sourceType: 'selection';
}
