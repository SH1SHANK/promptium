/**
 * File: types/domain/prompt.ts
 * Purpose: Centralized domain type for a Prompt library item.
 */

export interface VariableConfig {
  name: string;
  type:
    | 'text'
    | 'long-text'
    | 'number'
    | 'boolean'
    | 'date'
    | 'url'
    | 'email'
    | 'file'
    | 'json'
    | 'markdown'
    | 'choice'
    | 'multi-choice';
  defaultValue?: string;
  placeholder?: string;
  required: boolean;
  example?: string;
  choices?: string[];
}

export interface Prompt {
  id: string;
  title: string;
  description: string;
  text: string;
  tags: string[];
  isTemplate: boolean;
  category: string | null;
  isFavorite: boolean;
  isPinned: boolean;
  variables: VariableConfig[];
  createdAt: string;
  updatedAt: string;
  usageCount?: number;
  lastUsedAt?: string | null;
  lastEditedAt?: string | null;
  lastOpenedAt?: string | null;
}
