import { VaultItem } from '../../../vault/types';
import { RefinementNote } from '../../notes/types';

export interface RetrievedItem<T> {
  item: T;
  score: number;
  explanation: string;
  tokenCount: number;
}

export interface ContextRetrievalResult {
  skill: RetrievedItem<VaultItem> | null;
  knowledge: RetrievedItem<VaultItem>[];
  instructions: RetrievedItem<VaultItem>[];
  notes: RetrievedItem<RefinementNote>[];
  budget: {
    totalTokens: number;
    limit: number;
    isTruncated: boolean;
  };
}
