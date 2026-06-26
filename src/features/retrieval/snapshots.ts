import { ContextRetrievalResult } from './types';
import { hashPrompt } from './cache';
export interface RetrievalSnapshot {
  promptHash: string;
  retrievedKnowledge: string[];
  retrievedSkill: string | null;
  instructions: string[];
  timestamp: number;
  budget: ContextRetrievalResult['budget'];
}
const snapshots: RetrievalSnapshot[] = [];
export function recordRetrievalSnapshot(prompt: string, result: ContextRetrievalResult): void {
  snapshots.unshift({
    promptHash: hashPrompt(prompt),
    retrievedKnowledge: result.knowledge.map((value) => value.item.id),
    retrievedSkill: result.skill?.item.id || null,
    instructions: result.instructions.map((value) => value.item.id),
    timestamp: Date.now(),
    budget: result.budget,
  });
  if (snapshots.length > 30) snapshots.pop();
}
export function getRetrievalSnapshots(): readonly RetrievalSnapshot[] {
  return snapshots;
}
