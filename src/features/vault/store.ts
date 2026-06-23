import { VaultItem, VaultItemType } from './types';
import { SEED_SKILLS } from '../refinement/intelligence/skills';

// Storage keys
const VAULT_STORAGE_KEY = 'promptium_vault_items';

// In-memory cache synced with storage
let vaultItems: VaultItem[] = [];


export async function initVaultStore(): Promise<void> {
  try {
    const res = await chrome.storage.local.get([VAULT_STORAGE_KEY]);
    const stored = res[VAULT_STORAGE_KEY];
    if (Array.isArray(stored)) {
      vaultItems = stored;
    } else {
      // First launch: Seed initial skills
      const now = Date.now();
      vaultItems = SEED_SKILLS.map(item => ({
        ...item,
        createdAt: now,
        updatedAt: now
      }));
      await syncToStorage();
    }
  } catch (err) {
    console.error('Failed to initialize Vault storage:', err);
  }
}

async function syncToStorage(): Promise<void> {
  await chrome.storage.local.set({ [VAULT_STORAGE_KEY]: vaultItems });
}

export function getItems(type?: VaultItemType): VaultItem[] {
  if (type) {
    return vaultItems.filter(item => item.type === type);
  }
  return [...vaultItems];
}

export async function createItem(item: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<VaultItem> {
  const now = Date.now();
  const newItem: VaultItem = {
    ...item,
    id: `${item.type}_${now}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: now,
    updatedAt: now
  };
  vaultItems.push(newItem);
  await syncToStorage();
  return newItem;
}

export async function updateItem(id: string, updates: Partial<Omit<VaultItem, 'id' | 'type' | 'createdAt' | 'updatedAt'>>): Promise<VaultItem | null> {
  const itemIndex = vaultItems.findIndex(i => i.id === id);
  if (itemIndex === -1) return null;

  const item = vaultItems[itemIndex]!;
  const updatedItem: VaultItem = {
    ...item,
    ...updates,
    updatedAt: Date.now()
  };

  vaultItems[itemIndex] = updatedItem;
  await syncToStorage();
  return updatedItem;
}

export async function deleteItem(id: string): Promise<boolean> {
  const originalLen = vaultItems.length;
  vaultItems = vaultItems.filter(i => i.id !== id);
  const deleted = vaultItems.length < originalLen;
  if (deleted) {
    await syncToStorage();
  }
  return deleted;
}

export async function toggleItem(id: string): Promise<boolean> {
  const item = vaultItems.find(i => i.id === id);
  if (!item) return false;
  item.enabled = !item.enabled;
  item.updatedAt = Date.now();
  await syncToStorage();
  return true;
}
