import { PromptEffectivenessScore, PromptIssue } from './types';

export const calculateEffectivenessScore = (
  text: string,
  issues: PromptIssue[]
): PromptEffectivenessScore => {
  const normalized = String(text || '').trim();

  if (normalized.length === 0) {
    return {
      grammar: 0,
      clarity: 0,
      conciseness: 0,
      structure: 0,
      rules: 0,
      overall: 0,
    };
  }

  // 1. Grammar (10% weight)
  // Deduct based on grammar issues
  let grammar = 100;
  const grammarIssues = issues.filter((i) => i.category === 'grammar');
  for (const issue of grammarIssues) {
    if (issue.severity === 'high') grammar -= 25;
    else if (issue.severity === 'medium') grammar -= 15;
    else grammar -= 5;
  }
  grammar = Math.max(0, Math.min(100, grammar));

  // 2. Clarity (25% weight)
  // Deduct for clarity issues, unclear objectives, etc.
  let clarity = 100;
  const clarityIssues = issues.filter((i) => i.category === 'clarity');
  for (const issue of clarityIssues) {
    if (issue.severity === 'high') clarity -= 20;
    else if (issue.severity === 'medium') clarity -= 10;
    else clarity -= 5;
  }
  // If missing objective rule is triggered
  if (issues.some((i) => i.id === 'rule_missing_objective')) {
    clarity -= 30;
  }
  clarity = Math.max(0, Math.min(100, clarity));

  // 3. Conciseness (15% weight)
  // Deduct for redundancies, styling fillers, or excessive length without structure
  let conciseness = 100;
  const redundancyIssues = issues.filter(
    (i) => i.category === 'redundancy' || i.category === 'style'
  );
  for (const issue of redundancyIssues) {
    if (issue.severity === 'high') conciseness -= 15;
    else if (issue.severity === 'medium') conciseness -= 10;
    else conciseness -= 5;
  }
  // Penalize extreme length (> 1500 chars) if not structured
  const hasStructureElements = /###|#|- |\* |\d\.|```|<[a-zA-Z0-9_-]+>/.test(normalized);
  if (normalized.length > 1500 && !hasStructureElements) {
    conciseness -= 20;
  }
  conciseness = Math.max(0, Math.min(100, conciseness));

  // 4. Structure (20% weight)
  // Evaluates formatting structure, headers, lists, code blocks, xml tags
  let structure = 50; // baseline

  if (/#|##|###/.test(normalized)) {
    structure += 20; // uses headers
  }
  if (/- |\* |\d+\./.test(normalized)) {
    structure += 15; // uses lists
  }
  if (/```/.test(normalized)) {
    structure += 10; // uses code blocks/delimiters
  }
  if (/<[a-zA-Z0-9_-]+>.*<\/[a-zA-Z0-9_-]+>/.test(normalized)) {
    structure += 15; // uses XML tags
  }

  // Deduct if it's long but has absolutely no structural separators
  if (normalized.length > 250 && !hasStructureElements) {
    structure -= 30;
  }
  structure = Math.max(0, Math.min(100, structure));

  // 5. Rules (30% weight)
  // Deduct directly for missing prompt engineering rules
  let rules = 100;
  if (issues.some((i) => i.id === 'rule_missing_objective')) rules -= 30;
  if (issues.some((i) => i.id === 'rule_missing_context')) rules -= 25;
  if (issues.some((i) => i.id === 'rule_missing_constraints')) rules -= 25;
  if (issues.some((i) => i.id === 'rule_missing_format')) rules -= 20;
  if (issues.some((i) => i.id === 'rule_contains_placeholder')) rules -= 15;
  rules = Math.max(0, Math.min(100, rules));

  // Overall Score Calculation
  const overall = Math.round(
    grammar * 0.1 + conciseness * 0.15 + clarity * 0.25 + structure * 0.2 + rules * 0.3
  );

  return {
    grammar,
    clarity,
    conciseness,
    structure,
    rules,
    overall,
  };
};
