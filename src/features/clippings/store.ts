/**
 * File: src/features/clippings/store.ts
 * Purpose: Storage, cache, indexing, and search management for Clippings.
 */

import { Clipping } from './types';
import { getFuse, getCompromise } from '../refinement/intelligence/loaders/intelligence-loader';

class ClippingStoreClass {
  public readonly KEY = 'clippings';
  private cache: Clipping[] = [];
  private isLoaded = false;

  /**
   * Loads clippings from chrome.storage.local into cache
   */
  async load(): Promise<Clipping[]> {
    try {
      const data = (await chrome.storage.local.get([this.KEY]).catch(() => ({}))) as any;
      const raw = data[this.KEY];
      if (Array.isArray(raw)) {
        this.cache = raw;
      } else if (raw && typeof raw === 'object') {
        // Handle map of urlKey -> Clipping[] if it was saved that way previously (unlikely for new clean schema, but safe)
        this.cache = Object.values(raw).flat() as Clipping[];
      } else {
        this.cache = [];
      }
    } catch (error) {
      console.error('[ClippingStore] Failed to load clippings:', error);
      this.cache = [];
    }
    this.isLoaded = true;
    return this.cache;
  }

  /**
   * Gets all clippings, loading if not cached
   */
  async getAll(): Promise<Clipping[]> {
    if (!this.isLoaded) {
      await this.load();
    }
    return this.cache;
  }

  /**
   * Sets all clippings
   */
  async setAll(clippings: Clipping[]): Promise<Clipping[]> {
    this.cache = clippings;
    this.isLoaded = true;
    try {
      await chrome.storage.local.set({ [this.KEY]: clippings });
    } catch (error) {
      console.error('[ClippingStore] Failed to set clippings:', error);
    }
    return this.cache;
  }

  /**
   * Save or update a single clipping
   */
  async save(clipping: Clipping): Promise<Clipping> {
    const all = await this.getAll();
    const index = all.findIndex((c) => c.id === clipping.id);
    const updated = {
      ...clipping,
      updatedAt: Date.now(),
    };

    if (index >= 0) {
      all[index] = updated;
    } else {
      all.push(updated);
    }

    await this.setAll(all);
    return updated;
  }

  /**
   * Delete a clipping by ID
   */
  async delete(id: string): Promise<boolean> {
    const all = await this.getAll();
    const initialLength = all.length;
    const filtered = all.filter((c) => c.id !== id);
    if (filtered.length !== initialLength) {
      await this.setAll(filtered);
      return true;
    }
    return false;
  }

  /**
   * Delete multiple clippings by IDs
   */
  async deleteMultiple(ids: string[]): Promise<number> {
    const all = await this.getAll();
    const initialLength = all.length;
    const filtered = all.filter((c) => !ids.includes(c.id));
    const deletedCount = initialLength - filtered.length;
    if (deletedCount > 0) {
      await this.setAll(filtered);
    }
    return deletedCount;
  }

  /**
   * Merges multiple clippings into a single clipping
   */
  async merge(ids: string[], newNote?: string): Promise<Clipping | null> {
    const all = await this.getAll();
    const toMerge = all.filter((c) => ids.includes(c.id));
    if (toMerge.length === 0) return null;

    // Sort by creation date
    toMerge.sort((a, b) => a.createdAt - b.createdAt);

    // Merge texts and tags
    const mergedText = toMerge.map((c) => c.selectedText).join('\n\n---\n\n');
    const mergedContexts = toMerge
      .map((c) => c.surroundingContext)
      .filter(Boolean)
      .join('\n\n---\n\n');
    const mergedNotes = toMerge
      .map((c) => c.note)
      .filter(Boolean)
      .join('\n\n');
    const combinedTags = Array.from(new Set(toMerge.flatMap((c) => c.tags)));

    const primary = toMerge[0];
    if (!primary) return null;

    const mergedClipping: Clipping = {
      id: crypto.randomUUID(),
      platform: primary.platform,
      selectedText: mergedText,
      tags: combinedTags,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revisionCount: 1,
    };

    if (primary.conversationId) mergedClipping.conversationId = primary.conversationId;
    if (primary.conversationTitle) mergedClipping.conversationTitle = primary.conversationTitle;
    if (mergedContexts) mergedClipping.surroundingContext = mergedContexts;
    const finalNote = newNote || mergedNotes;
    if (finalNote) mergedClipping.note = finalNote;

    // Remove old merged clippings and add the new one
    const remaining = all.filter((c) => !ids.includes(c.id));
    remaining.push(mergedClipping);
    await this.setAll(remaining);

    return mergedClipping;
  }

  /**
   * Search clippings using Fuse.js and Compromise
   */
  async search(query: string): Promise<Clipping[]> {
    const all = await this.getAll();
    const q = query.toLowerCase().trim();
    if (!q) return all;

    const Fuse = await getFuse();
    const nlp = await getCompromise();

    // Leverage Compromise to extract terms/roots from the query for morphology tolerance
    const queryDoc = nlp(q);
    const queryTerms = queryDoc
      .terms()
      .out('array')
      .map((s: string) => s.toLowerCase().trim())
      .filter(Boolean);
    const queryRoots = queryDoc
      .normalize()
      .out('array')
      .map((s: string) => s.toLowerCase().trim());

    // Lightweight stem extraction for prefix morphology tolerance
    const getStems = (text: string) => {
      return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .map((w) => (w.length > 5 ? w.slice(0, 5) : w))
        .filter(Boolean);
    };
    const queryStems = getStems(q);
    const expandedQueryWords = Array.from(new Set([...queryTerms, ...queryRoots, ...queryStems]));

    // We enhance search targets with normalized forms and stems of texts in clippings
    const searchableItems = all.map((clipping) => {
      const textDoc = nlp(clipping.selectedText + ' ' + (clipping.note || ''));
      const textRoots = textDoc
        .normalize()
        .out('array')
        .map((s: string) => s.toLowerCase().trim());
      const textStems = getStems(clipping.selectedText + ' ' + (clipping.note || ''));
      return {
        clipping,
        textRoots: textRoots.join(' '),
        textStems: textStems.join(' '),
      };
    });

    const options = {
      keys: [
        { name: 'clipping.selectedText', weight: 0.5 },
        { name: 'clipping.note', weight: 0.3 },
        { name: 'clipping.tags', weight: 0.2 },
        { name: 'clipping.conversationTitle', weight: 0.1 },
        { name: 'textRoots', weight: 0.4 },
        { name: 'textStems', weight: 0.4 },
      ],
      threshold: 0.8,
      ignoreLocation: true,
    };

    const fuse = new Fuse(searchableItems, options);
    // Search using both direct query and expanded query words
    const searchString = `${q} ${expandedQueryWords.join(' ')}`.trim();
    const results = fuse.search(searchString);

    return results.map((r: any) => r.item.clipping);
  }
}

export const ClippingStore = new ClippingStoreClass();

if (typeof window !== 'undefined') {
  (window as any).ClippingStore = ClippingStore;
}
