import { PromptIssue, PromptIntent, TokenMetrics } from './types';
import { checkPromptRules } from './rules';

let harperInstance: any = null;

export interface PromptAnalysis {
  issues: PromptIssue[];
  intent: PromptIntent;
  tokenMetrics: TokenMetrics;
}

async function getHarperLinter() {
  if (harperInstance) {
    return harperInstance;
  }

  // Lazy-load Harper.js package modules dynamically
  const { LocalLinter } = await import('harper.js');
  const { binary } = await import('harper.js/binary');

  harperInstance = new LocalLinter({ binary });
  await harperInstance.setup();
  return harperInstance;
}

export const analyzePrompt = async (text: string): Promise<PromptIssue[]> => {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return [];
  }

  // 1. Run local heuristics-based rules checks (fast, on-device)
  const localIssues = checkPromptRules(text);

  // 2. Run Harper WebAssembly linter
  try {
    const linter = await getHarperLinter();
    const lints = await linter.lint(text);
    
    const harperIssues: PromptIssue[] = lints.map((lint: any, idx: number) => {
      const lintKind = lint.lint_kind();
      
      let category: PromptIssue['category'] = 'clarity';
      if (['Grammar', 'Agreement', 'Capitalization', 'Punctuation', 'Spelling', 'Typo'].includes(lintKind)) {
        category = 'grammar';
      } else if (['Redundancy', 'Repetition'].includes(lintKind)) {
        category = 'redundancy';
      } else if (['Style', 'Nonstandard', 'Usage', 'Regionalism'].includes(lintKind)) {
        category = 'style';
      } else if (['Readability', 'WordChoice', 'Enhancement'].includes(lintKind)) {
        category = 'clarity';
      }
      
      let severity: PromptIssue['severity'] = 'low';
      if (category === 'grammar') {
        severity = 'medium';
      } else if (category === 'clarity') {
        severity = 'medium';
      }
      
      const suggestions = lint.suggestions();
      const replacement = suggestions.length > 0 ? suggestions[0].get_replacement_text() : undefined;
      const span = lint.span();

      return {
        id: `harper_${idx}_${span.start}`,
        category,
        severity,
        original: lint.get_problem_text(),
        replacement,
        explanation: lint.message(),
        span: { start: span.start, end: span.end }
      };
    });

    return [...localIssues, ...harperIssues];
  } catch (error) {
    console.error("Failed to run Harper linter, fallback to local rules:", error);
    return localIssues;
  }
};

/**
 * Single integrated pipeline running linter, intent classification, and token counts.
 */
export const runIntelligencePipeline = async (text: string): Promise<PromptAnalysis> => {
  const { extractIntent } = await import('./analysis/compromise');
  const { calculateTokens } = await import('./tokenization/tokenizer');

  const [issues, intent, tokenMetrics] = await Promise.all([
    analyzePrompt(text),
    extractIntent(text),
    calculateTokens(text)
  ]);

  return {
    issues,
    intent,
    tokenMetrics
  };
};

export const analyzePrompts = async (texts: string[]): Promise<PromptIssue[][]> => {
  return Promise.all(texts.map(text => analyzePrompt(text)));
};
