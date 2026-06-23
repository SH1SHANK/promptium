export type VaultItemType = 'knowledge' | 'skill' | 'instruction';

export interface VaultItem {
  id: string;
  type: VaultItemType;
  title: string;
  content: string; // For skills, stores a string description / role instructions
  tags: string[];
  createdAt: number;
  updatedAt: number;
  enabled: boolean;
}
