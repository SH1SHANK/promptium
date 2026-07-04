// File: src/utils/similarity.ts

export const SimilarityEngine = {
  /**
   * Tokenizes text into lowercase words.
   */
  tokenizeWords(text: string): Set<string> {
    const normalized = text.toLowerCase().replace(/[^\w\s]/g, ' ');
    const tokens = normalized.split(/\s+/).filter(Boolean);
    return new Set(tokens);
  },

  /**
   * Computes Jaccard word similarity between two texts.
   */
  jaccardWords(textA: string, textB: string): number {
    const wordsA = this.tokenizeWords(textA);
    const wordsB = this.tokenizeWords(textB);
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    wordsA.forEach((w) => {
      if (wordsB.has(w)) intersection++;
    });

    const union = wordsA.size + wordsB.size - intersection;
    return intersection / union;
  },

  /**
   * Extracts character n-grams of size n.
   */
  getCharNgrams(text: string, n = 3): Set<string> {
    const normalized = text.toLowerCase().replace(/\s+/g, ' ');
    const ngrams = new Set<string>();
    for (let i = 0; i <= normalized.length - n; i++) {
      ngrams.add(normalized.slice(i, i + n));
    }
    return ngrams;
  },

  /**
   * Computes n-gram character overlap.
   */
  ngramSimilarity(textA: string, textB: string, n = 3): number {
    const ngramsA = this.getCharNgrams(textA, n);
    const ngramsB = this.getCharNgrams(textB, n);
    if (ngramsA.size === 0 || ngramsB.size === 0) return 0;

    let intersection = 0;
    ngramsA.forEach((g) => {
      if (ngramsB.has(g)) intersection++;
    });

    const union = ngramsA.size + ngramsB.size - intersection;
    return intersection / union;
  },

  /**
   * Compares normalized versions of the texts.
   */
  compareNormalized(textA: string, textB: string): boolean {
    const norm = (t: string) => t.toLowerCase().replace(/\s+/g, '');
    return norm(textA) === norm(textB);
  },

  /**
   * Full multi-stage similarity check.
   * Returns similarity percentage (0-100).
   */
  checkSimilarity(textA: string, textB: string): number {
    if (textA === textB) return 100;
    if (this.compareNormalized(textA, textB)) return 100;

    const jaccard = this.jaccardWords(textA, textB);
    const ngram = this.ngramSimilarity(textA, textB, 3);

    // Average Jaccard word-level and 3-gram character-level overlap for balance
    return Math.round(((jaccard + ngram) / 2) * 100);
  },
};
