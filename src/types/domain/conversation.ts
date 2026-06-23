/**
 * File: types/domain/conversation.ts
 * Purpose: Centralized domain type for conversations, messages, and platform adapters.
 */

export interface ExportPreferences {
  fontStyle?: string;
  fontSize?: number;
  background?: string;
  customBackground?: string;
  contentMode?: string;
  includeTimestamps?: boolean;
  includeExportDate?: boolean;
  includePlatformLabel?: boolean;
  includeMessageNumbers?: boolean;
  includeThinking?: boolean;
  trimFollowUps?: boolean;
  metadataPosition?: string;
  headerText?: string;
  bookmarkedIndices?: Set<number> | number[];
  fallbackMessages?: any[];
}

export interface ExportMessage {
  index?: number;
  role: string;
  text: string;
  timestamp?: string;
  bookmarked?: boolean;
}

export interface ExportChat {
  title: string;
  platform: string;
  createdAt: string;
  messages: ExportMessage[];
}

export interface Conversation {
  id?: string;
  title: string;
  platform: string;
  messages: ExportMessage[];
}
