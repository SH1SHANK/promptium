export type VaultItemType = 'knowledge' | 'skill' | 'instruction';
export type InstructionPriority = 'low' | 'medium' | 'high';

export interface VaultItem {
  id: string;
  type: VaultItemType;
  title: string;
  content: string; // For skills, stores a string description / role instructions
  tags: string[];
  createdAt: number;
  updatedAt: number;
  enabled: boolean;
  /** Instructions only; legacy instructions are normalized to medium on load. */
  priority?: InstructionPriority;
  /** Bypasses relevance matching, but never the global context budget. */
  pinned?: boolean;
}
