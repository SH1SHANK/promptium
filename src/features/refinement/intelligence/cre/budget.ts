import { RetrievedItem } from './types';

export const CONTEXT_TOKEN_LIMIT = 2500;

export async function budgetItems<T>(
  items: RetrievedItem<T>[],
  currentTotal: number,
  limit: number = CONTEXT_TOKEN_LIMIT
): Promise<{ budgeted: RetrievedItem<T>[]; totalTokens: number; isTruncated: boolean }> {
  // Sort items by score descending
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const budgeted: RetrievedItem<T>[] = [];
  let total = currentTotal;
  let isTruncated = false;

  for (const item of sorted) {
    if (total + item.tokenCount <= limit) {
      budgeted.push(item);
      total += item.tokenCount;
    } else {
      isTruncated = true;
    }
  }

  return {
    budgeted,
    totalTokens: total,
    isTruncated,
  };
}
