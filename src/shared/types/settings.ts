/**
 * File: types/domain/settings.ts
 * Purpose: Centralized domain type for Promptium user settings.
 */

export interface UserSettings {
  enableAI: boolean;
  activeProvider: string;
  geminiApiKey?: string;
  customModelName?: string;
  enabledPlatforms?: Record<string, boolean>;
  theme?: string;
  defaultRefinementAction?: 'fix' | 'upgrade' | 'rewrite';
}
