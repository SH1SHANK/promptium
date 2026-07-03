/**
 * File: types/continuation.ts
 * Purpose: Defines core continuation payloads.
 */

export interface ContinuationState {
  lastChatUrl?: string;
  activeTargetIndex?: number;
  timestamp?: string;
}
