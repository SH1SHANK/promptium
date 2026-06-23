const AGENT_KEYWORDS = [
  "agent",
  "cursor",
  "claude code",
  "claudecode",
  "workspace",
  "copilot",
  "coder",
  "codebase",
  "repository",
  "lint",
  "compile",
  "run command",
  "terminal",
  "test file",
  "rules",
  "claudemd",
  "cursorrules",
  "pbxproj",
  "package.json",
  "tsconfig.json",
  "github action",
  "ci/cd",
  "subagent"
];

/**
 * Detects if the prompt is intended for developer agent workflows.
 * If so, generates structured recommendations to supply missing context,
 * coding standards, repo guidance, test criteria, and boundaries.
 */
export const getAgentRecommendations = (text: string): string[] => {
  const normalized = String(text || '').toLowerCase();
  const isAgentPrompt = AGENT_KEYWORDS.some(keyword => normalized.includes(keyword));

  if (!isAgentPrompt) {
    return [];
  }

  const recommendations: string[] = [];

  // Rule 1: Missing Repo Context check
  if (!normalized.includes("repo") && !normalized.includes("context") && !normalized.includes("structure")) {
    recommendations.push("Repository Structure: Recommed including a directory tree or referring to files like `CLAUDE.md` or `.cursorrules` to define workspace context.");
  }

  // Rule 2: Coding standards
  if (!normalized.includes("style") && !normalized.includes("standard") && !normalized.includes("eslint") && !normalized.includes("lint")) {
    recommendations.push("Coding Standards: Specify the desired style guidelines (e.g. TypeScript strict rules, ESLint definitions, comment preservation).");
  }

  // Rule 3: Testing requirements
  if (!normalized.includes("test") && !normalized.includes("verify") && !normalized.includes("assert") && !normalized.includes("spec")) {
    recommendations.push("Verification & Testing: Instruct the agent to run verify commands (e.g., `npm run test`, `pnpm verify`) to confirm changes do not introduce regressions.");
  }

  // Rule 4: Action boundaries
  if (!normalized.includes("limit") && !normalized.includes("boundary") && !normalized.includes("do not") && !normalized.includes("avoid")) {
    recommendations.push("Safety Boundaries: Add clear constraints on command line execution (e.g., 'Do not run destructive script commands' or 'Only write to directories X/Y').");
  }

  // Rule 5: Acceptance criteria
  if (!normalized.includes("criteria") && !normalized.includes("definition of done") && !normalized.includes("done when")) {
    recommendations.push("Acceptance Criteria: Provide an explicit checklist of what constitutes a successful implementation (Definition of Done).");
  }

  return recommendations;
};
