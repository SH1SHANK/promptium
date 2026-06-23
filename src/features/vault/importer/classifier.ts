import { VaultItemType } from '../types';
import { findPreferredType } from './learning-cache';

export interface ClassificationResult {
  type: VaultItemType;
  confidence: number;
}

export function classifyContent(
  title: string,
  content: string,
  source: string
): ClassificationResult {
  // 1. Try local learning cache first
  const cachedPreference = findPreferredType(title, source);
  if (cachedPreference) {
    return { type: cachedPreference, confidence: 0.95 };
  }

  const combined = `${title}\n${content}`.toLowerCase();

  // Heuristics mapping counters
  let skillScore = 0;
  let instructionScore = 0;
  let knowledgeScore = 0;

  // Skill indicators
  if (combined.includes('you are an') || combined.includes('you are a')) skillScore += 30;
  if (combined.includes('act as') || combined.includes('adopt the role')) skillScore += 25;
  if (combined.includes('role:') || combined.includes('persona')) skillScore += 20;
  if (combined.includes('expertise') || combined.includes('specialist')) skillScore += 15;

  // Instruction indicators
  if (combined.includes('always ') || combined.includes('never ')) instructionScore += 30;
  if (combined.includes('prefer ') || combined.includes('avoid ')) instructionScore += 25;
  if (combined.includes('must ') || combined.includes('should ')) instructionScore += 20;
  if (combined.includes('formatting:') || combined.includes('style:')) instructionScore += 15;

  // Knowledge indicators
  if (combined.includes('reference') || combined.includes('documentation')) knowledgeScore += 25;
  if (combined.includes('guide') || combined.includes('notes')) knowledgeScore += 20;
  if (combined.includes('context') || combined.includes('readme')) knowledgeScore += 15;
  if (combined.includes('api signature') || combined.includes('endpoint')) knowledgeScore += 15;

  const total = skillScore + instructionScore + knowledgeScore;

  if (total === 0) {
    // Completely ambiguous, defaults to knowledge with low confidence so user must choose
    return { type: 'knowledge', confidence: 0.5 };
  }

  // Determine winning type
  let winningType: VaultItemType = 'knowledge';
  let maxScore = knowledgeScore;

  if (skillScore > maxScore) {
    winningType = 'skill';
    maxScore = skillScore;
  }
  if (instructionScore > maxScore) {
    winningType = 'instruction';
    maxScore = instructionScore;
  }

  // Calculate confidence based on ratio
  const scoreRatio = maxScore / total;
  // Scale confidence between 0.5 and 0.9 depending on matches
  const confidence = Math.min(0.9, 0.5 + scoreRatio * 0.4);

  return { type: winningType, confidence };
}
