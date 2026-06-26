import { RetrievalDiagnostics } from './types';
export function emptyDiagnostics(): RetrievalDiagnostics {
  return {
    retrievalTimeMs: 0,
    rankingTimeMs: 0,
    budgetTimeMs: 0,
    candidateCount: 0,
    cacheHit: false,
    cacheMiss: true,
    availableBudget: 2500,
    consumedBudget: 0,
    droppedItems: [],
  };
}
