import { PromptIntent } from '../types';
import { getCompromise } from '../loaders/intelligence-loader';
import { createLogger } from '../../../../core/logger';

const logger = createLogger('CompromiseAnalysis');

/**
 * Parses verbs, nouns, proper nouns, and keywords to identify intent structures.
 */
export async function extractIntent(text: string): Promise<PromptIntent> {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return { entities: [], keywords: [] };
  }

  try {
    const nlp = await getCompromise();
    const doc = nlp(trimmed);

    // Extract potential verbs (actions)
    const verbs = doc.verbs().out('array');
    const action = verbs.length > 0 ? String(verbs[0]).trim().toLowerCase() : undefined;

    // Extract nouns or noun phrases (subjects)
    const nouns = doc.nouns().out('array');
    const subject = nouns.length > 0 ? String(nouns[0]).trim() : undefined;

    // Extract proper nouns or named entities
    const entities = doc
      .people()
      .out('array')
      .concat(doc.places().out('array'))
      .concat(doc.organizations().out('array'))
      .map((e: string) => String(e).trim())
      .filter((v: string, i: number, a: string[]) => v && a.indexOf(v) === i);

    // General keywords (non-stop words nouns/adjectives)
    const keywords = nouns
      .concat(doc.adjectives().out('array'))
      .map((k: string) => String(k).trim().toLowerCase())
      .filter((v: string, i: number, a: string[]) => v && v.length > 2 && a.indexOf(v) === i)
      .slice(0, 10);

    return {
      action,
      subject,
      entities,
      keywords,
    };
  } catch (err) {
    logger.warn('Compromise parsing failed; using empty intent fallback.', err);
    return {
      entities: [],
      keywords: [],
    };
  }
}
