import { TokenMetrics } from '../types';
import { getTokenizer } from '../loaders/intelligence-loader';

/**
 * Computes exact GPT CL100k token counts using js-tiktoken.
 */
export async function calculateTokens(text: string): Promise<TokenMetrics> {
  const normalized = String(text || '');
  const estimatedWords = normalized.trim().split(/\s+/).filter(Boolean).length;
  const estimatedCharacters = normalized.length;

  if (!normalized.trim()) {
    return { tokenCount: 0, estimatedWords: 0, estimatedCharacters: 0 };
  }

  try {
    const tiktoken = await getTokenizer();
    // Get cl100k_base tokenizer encoding which Gemini/GPT-4 models target
    const encoder = tiktoken.getEncoding('cl100k_base');
    const tokens = encoder.encode(normalized);

    return {
      tokenCount: tokens.length,
      estimatedWords,
      estimatedCharacters
    };
  } catch (err) {
    console.error("Tokenization calculation error:", err);
    // Simple fallback estimate (approx 4 characters per token)
    return {
      tokenCount: Math.round(estimatedCharacters / 4),
      estimatedWords,
      estimatedCharacters
    };
  }
}
