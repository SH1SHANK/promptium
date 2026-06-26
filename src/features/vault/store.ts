import { VaultItem, VaultItemType } from './types';
import { SEED_SKILLS } from '../refinement/intelligence/skills';
import { createLogger } from '../../core/logger';

const logger = createLogger('VaultStore');

// Storage keys
const VAULT_STORAGE_KEY = 'promptium_vault_items';
const VAULT_REVISION_KEY = 'promptium_vault_revision';

// In-memory cache synced with storage
let vaultItems: VaultItem[] = [];
let vaultRevision = 0;

export async function initVaultStore(): Promise<void> {
  try {
    const res = await chrome.storage.local.get([VAULT_STORAGE_KEY, VAULT_REVISION_KEY]);
    const stored = res[VAULT_STORAGE_KEY];
    vaultRevision = Number(res[VAULT_REVISION_KEY] || 0);
    if (Array.isArray(stored)) {
      let changed = false;
      vaultItems = stored.map((item: VaultItem) => {
        const normalized = { ...item, pinned: Boolean(item.pinned) };
        if (normalized.type === 'instruction' && !normalized.priority) {
          normalized.priority = 'medium';
          changed = true;
        }
        return normalized;
      });
      if (changed) await syncToStorage();
    } else {
      // First launch: Seed initial skills
      const now = Date.now();
      vaultItems = SEED_SKILLS.map((item) => ({
        ...item,
        createdAt: now,
        updatedAt: now,
      }));
      await syncToStorage();
    }
  } catch (err) {
    logger.error('Failed to initialize Vault storage.', err);
  }
}

async function syncToStorage(): Promise<void> {
  await chrome.storage.local.set({
    [VAULT_STORAGE_KEY]: vaultItems,
    [VAULT_REVISION_KEY]: vaultRevision,
  });
}

async function commitVaultChange(): Promise<void> {
  vaultRevision += 1;
  await syncToStorage();
}

export function getVaultRevision(): number {
  return vaultRevision;
}

export function getItems(type?: VaultItemType): VaultItem[] {
  if (type) {
    return vaultItems.filter((item) => item.type === type);
  }
  return [...vaultItems];
}

export async function createItem(
  item: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>
): Promise<VaultItem> {
  const now = Date.now();
  const newItem: VaultItem = {
    ...item,
    id: `${item.type}_${now}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: now,
    updatedAt: now,
  };
  vaultItems.push(newItem);
  await commitVaultChange();
  return newItem;
}

export async function updateItem(
  id: string,
  updates: Partial<Omit<VaultItem, 'id' | 'type' | 'createdAt' | 'updatedAt'>>
): Promise<VaultItem | null> {
  const itemIndex = vaultItems.findIndex((i) => i.id === id);
  if (itemIndex === -1) return null;

  const item = vaultItems[itemIndex]!;
  const updatedItem: VaultItem = {
    ...item,
    ...updates,
    updatedAt: Date.now(),
  };

  vaultItems[itemIndex] = updatedItem;
  await commitVaultChange();
  return updatedItem;
}

export async function deleteItem(id: string): Promise<boolean> {
  const originalLen = vaultItems.length;
  vaultItems = vaultItems.filter((i) => i.id !== id);
  const deleted = vaultItems.length < originalLen;
  if (deleted) {
    await commitVaultChange();
  }
  return deleted;
}

export async function toggleItem(id: string): Promise<boolean> {
  const item = vaultItems.find((i) => i.id === id);
  if (!item) return false;
  item.enabled = !item.enabled;
  item.updatedAt = Date.now();
  await commitVaultChange();
  return true;
}
