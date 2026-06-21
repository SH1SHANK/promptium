(() => {
  /**
   * File: utils/token-counter.js
   * Purpose: Approximate token counting using a JavaScript port of the cl100k_base
   *          pre-tokenization regex. Used across prompt cards, the add form, and
   *          the improve modal. No network calls — runs entirely in the browser.
   */

  const CL100K_REGEX =
    /(?:'s|'t|'re|'ve|'m|'ll|'d|'S|'T|'RE|'VE|'M|'LL|'D)|[^\r\n\p{L}\p{N}]?\p{L}+|\p{N}{1,3}| ?[^\s\p{L}\p{N}]+[\r\n]*|\s*[\r\n]+|\s+(?!\S)|\s+/gu;

  /**
   * Count tokens in text using the cl100k_base pre-tokenization pattern.
   *
   * @param {string} text
   * @returns {number} estimated token count
   */
  const countTokens = (text) => {
    if (!text || typeof text !== 'string') return 0;
    const matches = text.match(CL100K_REGEX);
    return matches ? matches.length : 0;
  };

  /**
   * Count tokens for a given text.
   *
   * @param {string} text
   * @returns {{ count: number, isExact: boolean }}
   */
  const count = (text) => {
    const n = countTokens(text);
    return { count: n, isExact: false };
  };

  /**
   * Format a token count for display.
   *
   * @param {number} tokenCount
   * @returns {string}
   */
  const format = (tokenCount) => {
    const n = Math.max(0, Number(tokenCount) || 0);
    return `~${n.toLocaleString()} tokens`;
  };

  /**
   * Tooltip text shown when hovering over the token count badge.
   * @returns {string}
   */
  const tooltip = () =>
    'This is a close estimate — different AI models count tokens slightly differently, but this will get you in the right ballpark.';

  /** Tokens above this threshold trigger a soft warning style on the badge. */
  const TOKEN_WARN_THRESHOLD = 2000;

  window.TokenCounter = {
    count,
    countTokens,
    format,
    tooltip,
    TOKEN_WARN_THRESHOLD,
  };
})();
