import { PromptPattern, PromptCategory } from './types';

export const PATTERNS_DB: Record<string, PromptPattern> = {
  crispe: {
    name: "CRISPE",
    structure: [
      "**Context**: Provide background details or the current situation.",
      "**Role**: Define the persona or expertise level the AI should adopt.",
      "**Instruction**: State the core action or task to perform.",
      "**Schema**: Outline the structure or format of the output.",
      "**Persona/Tone**: Clarify the voice, style, or behavioral rules.",
      "**Example**: Provide one or more few-shot exemplars."
    ],
    example: "Context: Launching a new feature.\nRole: Growth Marketer.\nInstruction: Write 3 email subject lines.\nSchema: Bullet points.\nPersona: Engaging and urgent.\nExample: 'Unlock [Feature] today!'"
  },
  risen: {
    name: "RISEN",
    structure: [
      "**Role**: The perspective or identity of the AI.",
      "**Instructions**: Detailed steps or operations to perform.",
      "**Steps**: The logical breakdown of activities.",
      "**End Goal**: The ultimate outcome or metric of success.",
      "**Narrowing**: Constraints, limits, and exclusions."
    ],
    example: "Role: Financial Analyst.\nInstructions: Project Q3 revenue.\nSteps: 1. Read input CSV. 2. Calculate CAGR. 3. Adjust for seasonality.\nEnd Goal: A concise executive summary.\nNarrowing: Limit to standard GAAP rules; do not include non-operating income."
  },
  care: {
    name: "CARE",
    structure: [
      "**Context**: The environment or situation.",
      "**Action**: What needs to be done.",
      "**Result**: The desired deliverable or change.",
      "**Example**: Reference cases or exemplars."
    ],
    example: "Context: Customer support response backlog.\nAction: Draft a template response for delayed packages.\nResult: A polite email calming the customer while offering a 10% discount code.\nExample: 'Dear [Name], We apologize for...'"
  },
  react: {
    name: "ReAct",
    structure: [
      "**Thought**: Reason about the current state of the task.",
      "**Action**: Execute an action (e.g. read file, search API).",
      "**Observation**: Gather and analyze the result of the action.",
      "**Repeat**: Loop Thought-Action-Observation until completion."
    ],
    example: "Thought: I need to calculate the sum of active users. First, I must read the database logs.\nAction: Read file 'users.log'.\nObservation: Found 120 lines total, 80 with 'status: active'.\nThought: The number of active users is 80. Now I can format the final answer."
  },
  tot: {
    name: "Tree of Thought",
    structure: [
      "**Initial Prompt**: State the complex problem.",
      "**Brainstorming**: Generate multiple distinct candidate approaches.",
      "**Evaluation**: Assess the pros, cons, and viability of each candidate.",
      "**Synthesis**: Select the best path and expand it into a final answer."
    ],
    example: "Problem: Optimize a SQL query that takes 10 seconds to run.\nApproach A: Add indexes. Pros: Simple. Cons: Slows down writes.\nApproach B: Denormalize data. Pros: Fastest reads. Cons: Complex sync.\nApproach C: Add a Redis cache. Pros: No DB load. Cons: Cache invalidation.\nDecision: Implement Approach C first for read-heavy flows, followed by index tuning in A."
  },
  tag: {
    name: "TAG",
    structure: [
      "**Task**: The primary action or job to be completed.",
      "**Action**: The steps or approach to achieve the task.",
      "**Goal**: The target objective or ultimate result."
    ],
    example: "Task: Clean a messy list of names.\nAction: Remove duplicates, correct capitalization, and sort alphabetically.\nGoal: A clean, sorted JSON array of unique names."
  }
};

export const getRecommendedPattern = (category: PromptCategory, promptText?: string): PromptPattern => {
  const text = String(promptText || '').toLowerCase();
  
  if (category === 'coding') {
    if (text.includes('architecture') || text.includes('design') || text.includes('optim') || text.includes('debug')) {
      return PATTERNS_DB.tot!;
    }
    return PATTERNS_DB.react!;
  }
  
  if (category === 'research') {
    return PATTERNS_DB.tot!;
  }
  
  if (category === 'writing') {
    return PATTERNS_DB.care!;
  }
  
  if (category === 'marketing') {
    return PATTERNS_DB.crispe!;
  }
  
  if (category === 'business') {
    return PATTERNS_DB.risen!;
  }
  
  return PATTERNS_DB.tag!;
};

/**
 * Renders Fuse-ranked pattern recommendations sorted by search match score.
 */
export async function getRankedPatterns(promptText: string): Promise<any[]> {
  const patternList = Object.values(PATTERNS_DB);
  const { findRelevantPatterns } = await import('./recommendation/search');
  return await findRelevantPatterns(promptText, patternList);
}
