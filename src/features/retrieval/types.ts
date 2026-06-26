import { VaultItem } from '../vault/types';
import { RefinementNote } from '../refinement/notes/types';
import { PromptIntent } from '../refinement/intelligence/types';

export type RetrievalSource = 'retrieved' | 'pinned' | 'manual';

export interface RetrievalReason {
  matchedKeywords: string[];
  category: string;
  source: RetrievalSource;
}

export interface SectionMetadata {
  parentVaultItemId: string;
  chunkId: string;
  headingPath: string[];
}

export interface RetrievedItem<T> {
  item: T;
  score: number;
  explanation: string;
  tokenCount: number;
  retrievalReason: RetrievalReason;
  confidence: 'High' | 'Medium' | 'Low';
  section?: SectionMetadata;
}

export interface DroppedItem {
  id: string;
  title: string;
  reason: string;
}
export interface RetrievalDiagnostics {
  retrievalTimeMs: number;
  rankingTimeMs: number;
  budgetTimeMs: number;
  candidateCount: number;
  cacheHit: boolean;
  cacheMiss: boolean;
  availableBudget: number;
  consumedBudget: number;
  droppedItems: DroppedItem[];
}

export interface ContextRetrievalResult {
  skill: RetrievedItem<VaultItem> | null;
  knowledge: RetrievedItem<VaultItem>[];
  instructions: RetrievedItem<VaultItem>[];
  notes: RetrievedItem<RefinementNote>[];
  budget: { totalTokens: number; limit: number; isTruncated: boolean };
  diagnostics: RetrievalDiagnostics;
}

export interface QueryAnalysis {
  category: string;
  intent: PromptIntent;
  keywords: string[];
  promptTokens: number;
}
export interface RetrievalOptions {
  manualItemIds?: string[];
  removedItemIds?: string[];
}
export interface RetrievalProvider {
  retrieve(query: string, options?: RetrievalOptions): Promise<ContextRetrievalResult>;
}
