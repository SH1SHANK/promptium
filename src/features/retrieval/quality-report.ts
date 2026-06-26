import { ContextRetrievalResult } from './types';
export function buildQualityReport(result: ContextRetrievalResult) {
  const items = [result.skill, ...result.knowledge, ...result.instructions].filter(
    Boolean
  ) as any[];
  const types = new Set(items.map((item) => item.item.type));
  return {
    precisionScore: items.length
      ? items.reduce((sum, item) => sum + item.score, 0) / items.length
      : 0,
    diversityScore: types.size / 3,
    budgetUtilization: result.budget.totalTokens / result.budget.limit,
    retrievalCoverage: items.length / Math.max(1, result.diagnostics.candidateCount),
    conflictPenalty: result.diagnostics.droppedItems.filter((item) =>
      item.reason.includes('conflict')
    ).length,
  };
}
