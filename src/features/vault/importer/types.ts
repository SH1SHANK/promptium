import { VaultItemType } from '../types';

export type ImportSource =
  | 'markdown'
  | 'claude'
  | 'agents'
  | 'cursor'
  | 'skills'
  | 'hermes'
  | 'design'
  | 'architecture'
  | 'prd'
  | 'aider'
  | 'cline'
  | 'windsurf'
  | 'codex'
  | 'generic'
  | 'unknown';

export interface ParsedImportDraft {
  id: string;
  originalSource: string; // e.g. "CLAUDE.md"
  title: string;
  content: string;
  type: VaultItemType;
  confidence: number; // 0.0 to 1.0
  tags: string[];
}

export interface ImporterPlugin {
  id: ImportSource;
  name: string;
  match(fileName: string, content: string): boolean;
  parse(fileName: string, content: string): Promise<ParsedImportDraft[]>;
}

export interface LearningPreference {
  titlePattern?: string;
  sourcePattern?: string;
  preferredType: VaultItemType;
}
