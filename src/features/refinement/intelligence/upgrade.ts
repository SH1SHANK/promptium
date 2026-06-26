import { classifyPrompt } from './category';
import { getRecommendedPattern } from './patterns';
import { findRelevantSkill, getEnabledInstructions } from './recommendation/search';

/**
 * Locally structures the prompt context using Vault Skill definitions
 * and user-enabled Instruction preferences.
 */
export const upgradePrompt = async (text: string): Promise<string> => {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';

  const category = classifyPrompt(trimmed);
  const pattern = getRecommendedPattern(category, trimmed);

  // 1. Fetch relevant skill from Vault (falls back to category default if none matches)
  const matchedSkill = await findRelevantSkill(trimmed);
  let skillRole = '';
  let skillGuidance = '';

  if (matchedSkill) {
    skillRole = matchedSkill.title;
    skillGuidance = matchedSkill.content;
  } else {
    // Category default role fallback mapping
    if (category === 'coding') {
      skillRole = 'Senior Software Architect & System Designer';
    } else if (category === 'business') {
      skillRole = 'Senior Product Manager';
    } else if (category === 'marketing') {
      skillRole = 'Creative Growth Marketer';
    } else if (category === 'research') {
      skillRole = 'Expert Academic Researcher';
    } else if (category === 'writing') {
      skillRole = 'Professional Content Writer';
    } else {
      skillRole = 'Expert AI Assistant';
    }
  }

  // 2. Fetch enabled instructions from Vault
  const instructions = getEnabledInstructions();
  let instructionsSection = '';
  if (instructions.length > 0) {
    instructionsSection =
      `### Preferences & Style Constraints\n` +
      instructions.map((ins) => `- ${ins.content}`).join('\n') +
      `\n\n`;
  }

  let upgraded = `### Role\nAdopt the persona of: ${skillRole}\n\n`;
  if (skillGuidance) {
    upgraded += `### Role Guidelines\n${skillGuidance}\n\n`;
  }

  // Inject instructions
  upgraded += instructionsSection;

  // Apply layout pattern sections
  if (pattern.name === 'CRISPE') {
    upgraded += `### Context\n[Provide background or details here]\n\n`;
    upgraded += `### Instruction / Task\n${trimmed}\n\n`;
    upgraded += `### Output Schema & Format\n- Format the response with clear headings or as requested.\n\n`;
    upgraded += `### Persona & Tone\nMaintain a professional and objective tone.\n\n`;
    upgraded += `### Example\n[Insert few-shot example if applicable]`;
  } else if (pattern.name === 'RISEN') {
    upgraded += `### Instructions & Steps\n1. Analyze the requirements.\n2. Execute the primary task: ${trimmed}\n3. Format findings.\n\n`;
    upgraded += `### End Goal\n[State what success looks like]\n\n`;
    upgraded += `### Constraints & Narrowing\n- Do not include placeholders.\n- Rely only on verified information.`;
  } else if (pattern.name === 'CARE') {
    upgraded += `### Context\n[Provide context or situation description]\n\n`;
    upgraded += `### Action\n${trimmed}\n\n`;
    upgraded += `### Desired Result\n[Outline the final deliverable or outcome expected]\n\n`;
    upgraded += `### Reference Example\n[Insert reference details or example if available]`;
  } else if (pattern.name === 'ReAct') {
    upgraded += `### Objective / Task\n${trimmed}\n\n`;
    upgraded += `### Instructions\nFor this task, adopt a ReAct (Reasoning and Acting) execution style. For each step, output:\n`;
    upgraded += `1. **Thought**: Reason step-by-step about what to do next.\n`;
    upgraded += `2. **Action**: Propose a specific action or command to execute.\n`;
    upgraded += `3. **Observation**: Describe the result or check the data before proceeding.`;
  } else if (pattern.name === 'Tree of Thought') {
    upgraded += `### Problem / Objective\n${trimmed}\n\n`;
    upgraded += `### Instructions\nEvaluate at least 3 distinct candidates or approaches to solve this problem. For each candidate:\n`;
    upgraded += `- State the core approach details.\n`;
    upgraded += `- List the advantages (Pros) and drawbacks (Cons).\n`;
    upgraded += `- Compare them side-by-side.\n\n`;
    upgraded += `Finally, select the optimal path and execute it to present the final solution.`;
  } else {
    // TAG
    upgraded += `### Task\n${trimmed}\n\n`;
    upgraded += `### Action / Steps\n[Describe specific action steps to take]\n\n`;
    upgraded += `### Ultimate Goal\n[Describe what the final outcome should achieve]`;
  }

  return upgraded;
};
