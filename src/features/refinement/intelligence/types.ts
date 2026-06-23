import { RefinementNote } from '../notes/types';
import { VaultItem } from '../../vault/types';
import { ContextRetrievalResult } from './cre/types';

export interface PromptIssue {
  id: string;
  category: "grammar" | "clarity" | "style" | "redundancy" | "rule";
  severity: "low" | "medium" | "high";
  original: string;
  replacement?: string;
  explanation: string;
  span?: { start: number; end: number };
}

export interface PromptEffectivenessScore {
  grammar: number;
  clarity: number;
  conciseness: number;
  structure: number;
  rules: number;
  overall: number;
}

export type PromptCategory = "coding" | "writing" | "marketing" | "research" | "business" | "general";

export interface ModelGuidance {
  name: string;
  strengths: string;
  weaknesses: string;
  preferredStyle: string;
  formattingRecommendations: string[];
  reasoningRecommendations: string[];
  agentRecommendations: string[];
}

export interface SkillPack {
  name: string;
  role: string;
  templates: string[];
  guidance: string[];
}

export interface PromptPattern {
  name: string;
  structure: string[];
  example: string;
}

export interface PromptRecommendation {
  id: string;
  category: "Clarity" | "Structure" | "Constraints" | "Context" | "Output Format" | "Agent Workflow" | "Model Optimization";
  title: string;
  description: string;
  why: string;
  priority: "critical" | "important" | "optional";
  confidence: number;
  impact: number;
  beforePreview?: string | undefined;
  afterPreview?: string | undefined;
  applyId: string;
}

export interface RankedPattern {
  id: string;
  name: string;
  score: number;
}

export interface RankedSkill {
  id: string;
  name: string;
  score: number;
}

export interface CategoryResult {
  category: PromptCategory;
  confidence: number;
}

export interface PromptIntent {
  action?: string | undefined;
  subject?: string | undefined;
  entities: string[];
  keywords: string[];
}

export interface TokenMetrics {
  tokenCount: number;
  estimatedWords: number;
  estimatedCharacters: number;
}

export interface PromptRefinementContext {
  promptText: string;
  category: PromptCategory;
  skillPack: SkillPack;
  pattern: PromptPattern;
  modelRecommendations: string[];
  agentRecommendations: string[];
  promptIssues: PromptIssue[];
  scoreBreakdown: PromptEffectivenessScore;
  upgradedPrompt: string;
  recommendations: PromptRecommendation[];
  notes?: RefinementNote[];
  intent?: PromptIntent;
  tokenMetrics?: TokenMetrics;
  recommendedPatterns?: RankedPattern[];
  recommendedSkills?: RankedSkill[];
  
  // Vault additions for guided rewriting
  vaultKnowledge?: VaultItem[];
  vaultSkill?: VaultItem | null;
  vaultInstructions?: VaultItem[];
  retrievalResult?: ContextRetrievalResult;
}
