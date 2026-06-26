/**
 * File: utils/terminology.ts
 * Purpose: Centralized terminology dictionary to ensure consistent usage of
 * user-facing strings across all features, modals, tooltips, and toasts.
 */

export const TERMINOLOGY = {
  // Core Entities
  PROMPT: 'Prompt',
  VAULT: 'Vault',
  CLIPPING: 'Clipping',
  KNOWLEDGE: 'Knowledge',
  SKILL: 'Skill',
  INSTRUCTION: 'Instruction',

  // Core Actions
  CONTINUE: 'Continue Chat',
  REWRITE: 'Rewrite',
  UPGRADE: 'Upgrade',
  FIX: 'Fix',
  EXPORT: 'Export',
  SAVE: 'Save',
  CREATE: 'Create',

  // Derived UI labels/actions
  SAVE_TO_VAULT: 'Save to Vault',
  SAVE_CLIPPING: 'Save Clipping',
  CREATE_PROMPT: 'Create Prompt',
  ADD_KNOWLEDGE: 'Add Knowledge',
  ADD_SKILL: 'Add Skill',
} as const;
