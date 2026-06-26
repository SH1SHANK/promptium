/**
 * File: src/features/clippings/types.ts
 * Purpose: Central domain model and schema definition for Clippings.
 */

export interface Clipping {
  id: string;
  platform: string;
  conversationId?: string;
  conversationTitle?: string;
  messageId?: string;
  selectedText: string;
  surroundingContext?: string;
  note?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  revisionCount?: number;
  lastReviewedAt?: number;
}
