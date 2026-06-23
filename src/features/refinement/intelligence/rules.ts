import { PromptIssue } from './types';

export const checkPromptRules = (text: string): PromptIssue[] => {
  const normalized = String(text || '').toLowerCase().trim();
  const issues: PromptIssue[] = [];

  if (normalized.length === 0) {
    return [];
  }

  // 1. Goal / Objective check
  const actionKeywords = ["write", "explain", "create", "design", "refactor", "how to", "what is", "build", "generate", "analyze", "summarize", "improve", "test", "develop"];
  const hasAction = actionKeywords.some(keyword => normalized.includes(keyword));
  if (normalized.length < 25 && !hasAction) {
    issues.push({
      id: "rule_missing_objective",
      category: "rule",
      severity: "high",
      original: text,
      explanation: "Objective is unclear or too short. Prompts perform best when they begin with a clear, active verb specifying the exact task (e.g., 'Write a blog post about...', 'Refactor the following function...')."
    });
  }

  // 2. Context check
  const contextKeywords = ["context", "background", "because", "situation", "project", "work", "dataset", "environment", "system", "file", "repo", "codebase"];
  const hasContext = contextKeywords.some(keyword => normalized.includes(keyword)) || normalized.length > 150;
  if (!hasContext) {
    issues.push({
      id: "rule_missing_context",
      category: "rule",
      severity: "medium",
      original: text,
      explanation: "Missing background or context. Providing context (e.g., details about the project, the audience, or the current state) significantly reduces generic outputs."
    });
  }

  // 3. Constraints check
  const constraintKeywords = ["do not", "don't", "avoid", "limit", "restrict", "must", "should", "prevent", "never", "only", "rules", "constraint"];
  const hasConstraints = constraintKeywords.some(keyword => normalized.includes(keyword));
  if (!hasConstraints) {
    issues.push({
      id: "rule_missing_constraints",
      category: "rule",
      severity: "medium",
      original: text,
      explanation: "No negative constraints or limits defined. Mentioning what to avoid (e.g., 'Avoid using library X', 'Do not write any introductory text') helps guide the model away from common pitfalls."
    });
  }

  // 4. Output Format check
  const formatKeywords = ["format", "json", "markdown", "table", "bullet", "list", "schema", "output", "csv", "xml", "yaml"];
  const hasFormat = formatKeywords.some(keyword => normalized.includes(keyword));
  if (!hasFormat) {
    issues.push({
      id: "rule_missing_format",
      category: "rule",
      severity: "medium",
      original: text,
      explanation: "Output structure is not specified. Instruct the AI on how to format the response (e.g., 'Return the output in a markdown table', 'Provide the response as a valid JSON object')."
    });
  }

  // 5. Placeholders check
  const placeholderRegex = /\[[^\]\n]+\]|<[^>\n]+>|\{[^\}\n]+\}/g;
  let match;
  while ((match = placeholderRegex.exec(text)) !== null) {
    const placeholder = match[0];
    if (placeholder.length > 50) continue;
    
    // Avoid matching typical JSON or code blocks
    if (placeholder === '{}' || placeholder === '[]') continue;
    if (placeholder.startsWith('{') && (placeholder.includes('"') || placeholder.includes(':') || placeholder.includes(';'))) continue;
    if (placeholder.startsWith('<') && (placeholder.includes('/') || placeholder.includes('='))) continue; // HTML tags
    
    issues.push({
      id: "rule_contains_placeholder",
      category: "rule",
      severity: "high",
      original: placeholder,
      explanation: `Placeholder '${placeholder}' detected. Replace it with your actual data before running the prompt.`,
      span: { start: match.index, end: match.index + placeholder.length }
    });
  }

  return issues;
};
