// File: src/prompt/diagnostics/diagnostics.ts
import { VariableConfig } from '../types/types';
import { VariablesManager } from '../variables/variables';

export interface DiagnosticIssue {
  severity: 'error' | 'warning' | 'info';
  type: string;
  message: string;
}

export interface DiagnosticsResult {
  score: number;
  issues: DiagnosticIssue[];
}

const GENERIC_TITLES = new Set([
  'untitled',
  'untitled prompt',
  'new prompt',
  'draft',
  'new template',
  'untitled template',
]);

const ACTION_VERBS = new Set([
  'generate',
  'explain',
  'write',
  'create',
  'analyze',
  'summarize',
  'review',
  'translate',
  'simulate',
  'develop',
  'format',
  'compare',
  'help',
  'act',
  'draft',
]);

export const PromptDiagnostics = {
  /**
   * Run live diagnostics checks on prompt title, text, tags, description, and variables.
   */
  run(
    title: string,
    text: string,
    tags: string[] = [],
    description = '',
    configs: VariableConfig[] = []
  ): DiagnosticsResult {
    const issues: DiagnosticIssue[] = [];
    let score = 100;

    const trimmedText = (text || '').trim();
    const cleanTitle = (title || '').trim().toLowerCase();

    // 1. Empty Prompt Check
    if (!trimmedText) {
      issues.push({
        severity: 'error',
        type: 'empty_prompt',
        message: 'Prompt content is empty.',
      });
      score -= 30;
    } else if (trimmedText.length < 15) {
      issues.push({
        severity: 'warning',
        type: 'short_prompt',
        message: 'Prompt content is extremely short (< 15 characters).',
      });
      score -= 10;
    }

    // 2. Generic Title Check
    if (!cleanTitle) {
      issues.push({
        severity: 'warning',
        type: 'generic_title',
        message: 'Title is empty.',
      });
      score -= 20;
    } else if (GENERIC_TITLES.has(cleanTitle)) {
      issues.push({
        severity: 'warning',
        type: 'generic_title',
        message: `Title is generic ("${title}").`,
      });
      score -= 20;
    }

    // 3. Variable Linting
    const detectedVars = VariablesManager.detectVariables(text);

    // Malformed double curly braces (e.g. {{var} or {var}})
    const malformedLeft = text.match(/\{\{[a-zA-Z0-9_-]+(?!\}\})/g);
    const malformedRight = text.match(/(?<!\{\{)[a-zA-Z0-9_-]+\}\}/g);
    // Single brace syntax detection: {var} but not {{var}}
    const singleBraces = text.match(/(?<!\{)\{[a-zA-Z0-9_-]+\}(?!\})/g);

    if (malformedLeft || malformedRight) {
      issues.push({
        severity: 'error',
        type: 'malformed_variables',
        message: 'Malformed double curly braces (e.g. unclosed {{var).',
      });
      score -= 15;
    }

    if (singleBraces) {
      issues.push({
        severity: 'warning',
        type: 'single_brace',
        message: 'Found single brace placeholders {var}. Promptium uses double braces {{var}}.',
      });
      score -= 10;
    }

    // Mixed placeholder syntax check
    if (singleBraces && detectedVars.length > 0) {
      issues.push({
        severity: 'warning',
        type: 'mixed_placeholder_syntax',
        message: 'Mixed placeholder syntax: using both {var} and {{var}}.',
      });
      score -= 5;
    }

    // Duplicate variable names check (case-insensitive clash)
    const seenLower = new Set<string>();
    const duplicateVars = new Set<string>();
    detectedVars.forEach((v: string) => {
      const lower = v.toLowerCase();
      if (seenLower.has(lower)) {
        duplicateVars.add(lower);
      } else {
        seenLower.add(lower);
      }
    });

    if (duplicateVars.size > 0) {
      issues.push({
        severity: 'error',
        type: 'duplicate_variables',
        message: `Duplicate variable names detected: ${Array.from(duplicateVars).join(', ')}.`,
      });
      score -= 15;
    }

    // Unused variables (configured in database but not in text)
    const detectedSet = new Set(detectedVars.map((v: string) => v.toLowerCase()));
    const unusedConfigs = configs.filter((c) => !detectedSet.has(c.name.toLowerCase()));
    if (unusedConfigs.length > 0) {
      issues.push({
        severity: 'info',
        type: 'unused_variables',
        message: `Unused variable configurations: ${unusedConfigs.map((c) => c.name).join(', ')}.`,
      });
      score -= 5;
    }

    // 4. White-space Styling checks
    if (/\s{3,}/.test(text) && !/```/.test(text)) {
      issues.push({
        severity: 'info',
        type: 'repeated_whitespace',
        message: 'Contains repeated spaces (3+ spaces in a row).',
      });
      score -= 2;
    }

    if (/\n{3,}/.test(text)) {
      issues.push({
        severity: 'info',
        type: 'repeated_newlines',
        message: 'Contains repeated blank lines (3+ newlines in a row).',
      });
      score -= 3;
    }

    const lines = text.split('\n');
    const hasTrailing = lines.some((line) => /\s+$/.test(line) && !/^\s+$/.test(line));
    if (hasTrailing) {
      issues.push({
        severity: 'info',
        type: 'trailing_whitespace',
        message: 'Contains trailing whitespace at the end of lines.',
      });
      score -= 2;
    }

    // 5. Secondary metadata checklist
    if (!description || !description.trim()) {
      issues.push({
        severity: 'info',
        type: 'missing_description',
        message: 'Add a description to document this prompt.',
      });
      score -= 10;
    }

    if (!tags || tags.length === 0) {
      issues.push({
        severity: 'info',
        type: 'missing_tags',
        message: 'Add tags to help organize search results.',
      });
      score -= 10;
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      issues,
    };
  },

  /**
   * Generates a descriptive title suggestion based on prompt text heuristics.
   */
  suggestTitle(text: string): string {
    const raw = String(text || '').trim();
    if (!raw) return 'Untitled Prompt';

    // Heuristic 1: Markdown H1 Header
    const h1Match = raw.match(/^#\s+(.+)$/m);
    if (h1Match && h1Match[1] && h1Match[1].trim()) {
      return h1Match[1].trim().slice(0, 50);
    }

    // Heuristic 2: First quoted sentence
    const quoteMatch = raw.match(/"([^"]{10,60})"/);
    if (quoteMatch && quoteMatch[1] && quoteMatch[1].trim()) {
      return quoteMatch[1].trim();
    }

    // Heuristic 3: First imperative sentence starting with action verbs
    const sentences = raw
      .split(/[.!?\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const sentence of sentences) {
      const firstWord = sentence.split(/\s+/)[0]?.toLowerCase().replace(/[^\w]/g, '');
      if (firstWord && ACTION_VERBS.has(firstWord)) {
        // Return sentence slice up to 50 characters
        return sentence.slice(0, 50);
      }
    }

    // Fallback: First 60 characters with ellipses
    const fallbackText = sentences[0] || raw;
    if (fallbackText.length > 50) {
      return fallbackText.slice(0, 47) + '...';
    }
    return fallbackText;
  },
};
