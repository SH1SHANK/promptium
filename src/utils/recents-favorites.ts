/**
 * Recents & Favorites Tracking System
 *
 * Tracks:
 * - Recently used prompts/templates
 * - Most used (frequency-based)
 * - Favorites (user-marked)
 * - All local storage, no cloud sync
 */

export interface UsageRecord {
  id: string;
  type: 'prompt' | 'template' | 'bookmark';
  title: string;
  lastUsed: number;
  usageCount: number;
  isFavorite: boolean;
}

const STORAGE_KEYS = {
  recents: 'promptiumRecents',
  favorites: 'promptiumFavorites',
  usage: 'promptiumUsage',
};

const MAX_RECENTS = 20;
const MAX_FAVORITES = 50;

class RecentsAndFavorites {
  /**
   * Record a usage event for an item
   */
  async recordUsage(
    id: string,
    type: 'prompt' | 'template' | 'bookmark',
    title?: string
  ): Promise<void> {
    try {
      const data = await chrome.storage.local.get([STORAGE_KEYS.usage]);
      const usage: Record<string, UsageRecord> = data[STORAGE_KEYS.usage] || {};

      const existing = usage[id] || {
        id,
        type,
        title: title || '',
        lastUsed: 0,
        usageCount: 0,
        isFavorite: false,
      };

      usage[id] = {
        ...existing,
        title: title || existing.title,
        lastUsed: Date.now(),
        usageCount: (existing.usageCount || 0) + 1,
      };

      await chrome.storage.local.set({ [STORAGE_KEYS.usage]: usage });

      // Update recents list
      await this.updateRecents(id);
    } catch (error) {
      console.warn('[Promptium][RecentsAndFavorites] Failed to record usage:', error);
    }
  }

  /**
   * Mark an item as favorite
   */
  async toggleFavorite(
    id: string,
    type: 'prompt' | 'template' | 'bookmark',
    title?: string
  ): Promise<boolean> {
    try {
      const data = await chrome.storage.local.get([STORAGE_KEYS.usage, STORAGE_KEYS.favorites]);
      const usage: Record<string, UsageRecord> = data[STORAGE_KEYS.usage] || {};
      const favorites: Set<string> = new Set(data[STORAGE_KEYS.favorites] || []);

      if (favorites.has(id)) {
        favorites.delete(id);
      } else {
        if (favorites.size >= MAX_FAVORITES) {
          // Remove oldest favorite
          const firstFavorite = Array.from(favorites)[0];
          favorites.delete(firstFavorite);
        }
        favorites.add(id);
      }

      // Update usage record
      const existing = usage[id] || {
        id,
        type,
        title: title || '',
        lastUsed: 0,
        usageCount: 0,
      };

      usage[id] = {
        ...existing,
        title: title || existing.title,
        isFavorite: favorites.has(id),
      };

      await chrome.storage.local.set({
        [STORAGE_KEYS.usage]: usage,
        [STORAGE_KEYS.favorites]: Array.from(favorites),
      });

      return favorites.has(id);
    } catch (error) {
      console.warn('[Promptium][RecentsAndFavorites] Failed to toggle favorite:', error);
      return false;
    }
  }

  /**
   * Get recently used items
   */
  async getRecents(
    type?: 'prompt' | 'template' | 'bookmark',
    limit: number = 10
  ): Promise<UsageRecord[]> {
    try {
      const data = await chrome.storage.local.get([STORAGE_KEYS.recents, STORAGE_KEYS.usage]);
      const recentIds: string[] = data[STORAGE_KEYS.recents] || [];
      const usage: Record<string, UsageRecord> = data[STORAGE_KEYS.usage] || {};

      let recents = recentIds.map((id) => usage[id]).filter((item): item is UsageRecord => !!item);

      if (type) {
        recents = recents.filter((item) => item.type === type);
      }

      return recents.slice(0, limit);
    } catch (error) {
      console.warn('[Promptium][RecentsAndFavorites] Failed to get recents:', error);
      return [];
    }
  }

  /**
   * Get most used items
   */
  async getMostUsed(
    type?: 'prompt' | 'template' | 'bookmark',
    limit: number = 10
  ): Promise<UsageRecord[]> {
    try {
      const data = await chrome.storage.local.get([STORAGE_KEYS.usage]);
      const usage: Record<string, UsageRecord> = data[STORAGE_KEYS.usage] || {};

      let items = Object.values(usage).filter(
        (item): item is UsageRecord => !!item && item.usageCount > 0
      );

      if (type) {
        items = items.filter((item) => item.type === type);
      }

      return items.sort((a, b) => b.usageCount - a.usageCount).slice(0, limit);
    } catch (error) {
      console.warn('[Promptium][RecentsAndFavorites] Failed to get most used:', error);
      return [];
    }
  }

  /**
   * Get favorite items
   */
  async getFavorites(
    type?: 'prompt' | 'template' | 'bookmark',
    limit: number = 20
  ): Promise<UsageRecord[]> {
    try {
      const data = await chrome.storage.local.get([STORAGE_KEYS.favorites, STORAGE_KEYS.usage]);
      const favorites: string[] = data[STORAGE_KEYS.favorites] || [];
      const usage: Record<string, UsageRecord> = data[STORAGE_KEYS.usage] || {};

      let items = favorites
        .map((id) => usage[id])
        .filter((item): item is UsageRecord => !!item && item.isFavorite);

      if (type) {
        items = items.filter((item) => item.type === type);
      }

      return items.slice(0, limit);
    } catch (error) {
      console.warn('[Promptium][RecentsAndFavorites] Failed to get favorites:', error);
      return [];
    }
  }

  /**
   * Get usage statistics for an item
   */
  async getUsageStats(id: string): Promise<UsageRecord | null> {
    try {
      const data = await chrome.storage.local.get([STORAGE_KEYS.usage]);
      const usage: Record<string, UsageRecord> = data[STORAGE_KEYS.usage] || {};
      return usage[id] || null;
    } catch (error) {
      console.warn('[Promptium][RecentsAndFavorites] Failed to get usage stats:', error);
      return null;
    }
  }

  /**
   * Is item favorite
   */
  async isFavorite(id: string): Promise<boolean> {
    try {
      const data = await chrome.storage.local.get([STORAGE_KEYS.favorites]);
      const favorites: string[] = data[STORAGE_KEYS.favorites] || [];
      return favorites.includes(id);
    } catch {
      return false;
    }
  }

  /**
   * Clear all recents and usage data
   */
  async clearAllData(): Promise<void> {
    try {
      await chrome.storage.local.remove([
        STORAGE_KEYS.recents,
        STORAGE_KEYS.favorites,
        STORAGE_KEYS.usage,
      ]);
    } catch (error) {
      console.warn('[Promptium][RecentsAndFavorites] Failed to clear data:', error);
    }
  }

  /**
   * Private: Update recents list
   */
  private async updateRecents(id: string): Promise<void> {
    try {
      const data = await chrome.storage.local.get([STORAGE_KEYS.recents]);
      const recents: string[] = data[STORAGE_KEYS.recents] || [];

      // Remove if exists
      const index = recents.indexOf(id);
      if (index > -1) {
        recents.splice(index, 1);
      }

      // Add to front
      recents.unshift(id);

      // Keep only max
      if (recents.length > MAX_RECENTS) {
        recents.length = MAX_RECENTS;
      }

      await chrome.storage.local.set({ [STORAGE_KEYS.recents]: recents });
    } catch (error) {
      console.warn('[Promptium][RecentsAndFavorites] Failed to update recents:', error);
    }
  }
}

export const recentsAndFavorites = new RecentsAndFavorites();
