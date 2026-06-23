/**
 * File: types/domain/prompt.ts
 * Purpose: Centralized domain type for a Prompt library item.
 */

export interface Prompt {
  id: string;
  title: string;
  text: string;
  tags: string[];
  isTemplate: boolean;
  category: string | null;
  embedding: number[] | null;
  clarityScore: number | null;
  clarityExplanation: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  content?: string;
  sourcePlatform?: string | null;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceType?: 'selection';
}
