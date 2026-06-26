import { VaultItem } from '../vault/types';
export interface VaultHealthIssue {
  kind: 'duplicate-title' | 'duplicate-content' | 'disabled' | 'oversized' | 'missing-tags';
  itemId: string;
}
export function inspectVaultHealth(items: VaultItem[]): VaultHealthIssue[] {
  const issues: VaultHealthIssue[] = [];
  const titles = new Map<string, string>();
  const content = new Map<string, string>();
  for (const item of items) {
    const title = item.title.trim().toLowerCase();
    const body = item.content.trim().toLowerCase();
    if (titles.has(title)) issues.push({ kind: 'duplicate-title', itemId: item.id });
    else titles.set(title, item.id);
    if (content.has(body)) issues.push({ kind: 'duplicate-content', itemId: item.id });
    else content.set(body, item.id);
    if (!item.enabled) issues.push({ kind: 'disabled', itemId: item.id });
    if (item.type === 'knowledge' && item.content.length > 10000)
      issues.push({ kind: 'oversized', itemId: item.id });
    if (!item.tags.length) issues.push({ kind: 'missing-tags', itemId: item.id });
  }
  return issues;
}
