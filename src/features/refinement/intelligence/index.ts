import { analyzePrompt, analyzePrompts } from './analyzer';
import { upgradePrompt } from './upgrade';
import { generateRewriteContext } from './rewrite-context';

export * from './types';

export const PromptIntelligenceEngine = {
  analyzePrompt,
  analyzePrompts,
  upgradePrompt,
  generateRewriteContext,
};
