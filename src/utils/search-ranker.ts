/**
 * Smart Search Ranking System
 *
 * Ranks search results using:
 * - Title match (exact, starts-with, contains)
 * - Tag match
 * - Category match
 * - Usage frequency
 * - Favorite status
 * - Recent usage
 * - No AI/embeddings needed
 */

export interface SearchableItem {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  category?: string;
  usageCount?: number;
  lastUsed?: number;
  isFavorite?: boolean;
}

export interface RankedResult {
  item: SearchableItem;
  score: number;
  matchReason: string;
}

class SmartSearchRanker {
  /**
   * Rank items based on query
   */
  rankResults(items: SearchableItem[], query: string): RankedResult[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const results = items
      .map((item) => ({
        item,
        score: this.calculateScore(item, q),
        matchReason: this.getMatchReason(item, q),
      }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * Calculate relevance score (0-100)
   */
  private calculateScore(item: SearchableItem, query: string): number {
    let score = 0;

    // Title match scoring (40 points max)
    const titleScore = this.scoreTitleMatch(item.title, query);
    score += titleScore * 0.4;

    // Tag match scoring (20 points max)
    if (item.tags?.length) {
      const tagScore = this.scoreTagMatch(item.tags, query);
      score += tagScore * 0.2;
    }

    // Category match scoring (10 points max)
    if (item.category) {
      const categoryScore = this.scoreCategoryMatch(item.category, query);
      score += categoryScore * 0.1;
    }

    // Description match scoring (15 points max)
    if (item.description) {
      const descScore = this.scoreDescriptionMatch(item.description, query);
      score += descScore * 0.15;
    }

    // Usage frequency bonus (10 points max)
    if (item.usageCount) {
      const frequencyBonus = this.scoreFrequencyBonus(item.usageCount);
      score += frequencyBonus * 0.1;
    }

    // Favorite status bonus (5 points max)
    if (item.isFavorite) {
      score += 5;
    }

    // Recent usage bonus (3 points max)
    if (item.lastUsed) {
      const recencyBonus = this.scoreRecencyBonus(item.lastUsed);
      score += recencyBonus * 0.03;
    }

    return Math.min(100, Math.round(score));
  }

  /**
   * Score title match
   * Exact match > starts with > contains
   */
  private scoreTitleMatch(title: string, query: string): number {
    const t = title.toLowerCase();
    const q = query.toLowerCase();

    if (t === q) return 100; // Exact match
    if (t.startsWith(q)) return 85; // Starts with
    if (t.includes(q)) {
      // Word boundary match preferred
      const words = t.split(/\s+/);
      if (words.some((w) => w.startsWith(q))) return 75;
      return 50; // Contains anywhere
    }

    return 0;
  }

  /**
   * Score tag matches
   */
  private scoreTagMatch(tags: string[], query: string): number {
    if (!tags?.length) return 0;

    const q = query.toLowerCase();
    const matches = tags.filter((tag) => tag.toLowerCase().includes(q));

    if (matches.length === 0) return 0;
    if (tags.some((tag) => tag.toLowerCase() === q)) return 100; // Exact tag match
    return (matches.length / tags.length) * 80; // Partial tag matches
  }

  /**
   * Score category match
   */
  private scoreCategoryMatch(category: string, query: string): number {
    const c = category.toLowerCase();
    const q = query.toLowerCase();

    if (c === q) return 100;
    if (c.includes(q)) return 60;
    return 0;
  }

  /**
   * Score description match
   */
  private scoreDescriptionMatch(description: string, query: string): number {
    if (!description) return 0;

    const d = description.toLowerCase();
    const q = query.toLowerCase();

    if (d.includes(q)) {
      // Check if it's a word boundary match
      const words = d.split(/\s+/);
      if (words.some((w) => w.includes(q))) return 50;
      return 30;
    }

    return 0;
  }

  /**
   * Score frequency bonus (logarithmic scale)
   * Higher usage = higher bonus
   */
  private scoreFrequencyBonus(usageCount: number): number {
    if (usageCount <= 0) return 0;
    if (usageCount === 1) return 20;
    if (usageCount <= 5) return 40;
    if (usageCount <= 10) return 60;
    if (usageCount <= 20) return 80;
    return 100;
  }

  /**
   * Score recency bonus (time decay)
   * Recent usage = higher bonus
   */
  private scoreRecencyBonus(lastUsed: number): number {
    if (!lastUsed) return 0;

    const now = Date.now();
    const ageMs = now - lastUsed;
    const ageHours = ageMs / (1000 * 60 * 60);
    const ageDays = ageHours / 24;

    // Decay: recent items (< 1 hour) get 100, older items decay
    if (ageHours < 1) return 100;
    if (ageHours < 6) return 80;
    if (ageHours < 24) return 60;
    if (ageDays < 7) return 40;
    if (ageDays < 30) return 20;
    return 0;
  }

  /**
   * Get reason for match (for UI display)
   */
  private getMatchReason(item: SearchableItem, query: string): string {
    const q = query.toLowerCase();
    const t = item.title.toLowerCase();

    if (t === q) return 'Exact title match';
    if (t.startsWith(q)) return 'Title starts with search';
    if (t.includes(q)) return 'Title contains search';

    if (item.tags?.some((tag) => tag.toLowerCase().includes(q))) {
      return 'Matches tags';
    }

    if (item.category?.toLowerCase().includes(q)) {
      return 'Category match';
    }

    if (item.isFavorite) return 'Favorite';
    if (item.usageCount && item.usageCount > 5) return 'Frequently used';

    return 'Matches description';
  }

  /**
   * Fuzzy search - useful for typos
   */
  fuzzyMatch(text: string, pattern: string): boolean {
    const t = text.toLowerCase();
    const p = pattern.toLowerCase();

    let tIndex = 0;
    let pIndex = 0;

    while (tIndex < t.length && pIndex < p.length) {
      if (t[tIndex] === p[pIndex]) {
        pIndex++;
      }
      tIndex++;
    }

    return pIndex === p.length;
  }

  /**
   * Filter items that could match (before full ranking)
   */
  prefilterResults(
    items: SearchableItem[],
    query: string,
    threshold: number = 0.3
  ): SearchableItem[] {
    const q = query.toLowerCase();

    return items.filter((item) => {
      // Title contains
      if (item.title.toLowerCase().includes(q)) return true;

      // Tag contains
      if (item.tags?.some((tag) => tag.toLowerCase().includes(q))) return true;

      // Category contains
      if (item.category?.toLowerCase().includes(q)) return true;

      // Description contains
      if (item.description?.toLowerCase().includes(q)) return true;

      // Fuzzy match (for typo tolerance)
      if (this.fuzzyMatch(item.title, q)) return true;

      return false;
    });
  }
}

export const searchRanker = new SmartSearchRanker();
