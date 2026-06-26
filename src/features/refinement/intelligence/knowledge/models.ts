import { ModelGuidance } from '../types';

const MODELS_DB: Record<string, ModelGuidance> = {
  chatgpt: {
    name: 'ChatGPT',
    strengths: 'Conversational versatility, instruction-following, structured data formatting.',
    weaknesses: 'Can be wordy, prone to hallucinating niche coding APIs, overly polite.',
    preferredStyle: 'Direct, instructional, context-rich with explicit system role boundaries.',
    formattingRecommendations: [
      'Use clear Markdown headers (`###`) to separate system sections.',
      'Wrap input text in triple backticks or quotes to avoid prompt injection.',
    ],
    reasoningRecommendations: [
      "Incorporate 'Think step-by-step' for logic, math, and architectural tasks.",
      'Provide few-shot examples showing the reasoning steps before the final answer.',
    ],
    agentRecommendations: [
      "Define strict system constraints (e.g. 'DO NOT use library X').",
      "Explicitly state format constraints like 'Return raw JSON only, no markdown wrappers'.",
    ],
  },
  claude: {
    name: 'Claude',
    strengths:
      'Long-context reasoning, detailed coding accuracy, document analysis, tone consistency.',
    weaknesses:
      'Strict alignment/safety refusals, sometimes verbose, sensitive to structure order.',
    preferredStyle:
      'XML tags (`<context>`, `<instructions>`, `<example>`) for structured arguments.',
    formattingRecommendations: [
      'Wrap structured parameters in XML tags to optimize parser parsing.',
      'Present guidelines and rules at the very end of the prompt context.',
    ],
    reasoningRecommendations: [
      'Use `<thinking>` blocks to allow pre-computation reasoning.',
      'Instruct to analyze the source materials first before drawing conclusions.',
    ],
    agentRecommendations: [
      "Specify clear execution rules: 'If unsure, output null and ask for details'.",
      'Provide precise API documentation inside `<api-reference>` tags.',
    ],
  },
  gemini: {
    name: 'Gemini',
    strengths:
      'Multimodality, native Google tools integrations, fast reasoning, creative structuring.',
    weaknesses:
      'Fails on highly nested code logic tasks, safety filters can trigger on coding templates.',
    preferredStyle: 'Markdown-focused, prompt engineering with clear system role instructions.',
    formattingRecommendations: [
      'Use bolding (`**`) and bullet points to highlight constraints.',
      'Separate input data from guidelines using clear dividers like `---`.',
    ],
    reasoningRecommendations: [
      'Provide clear logical steps for analyzing complex input schemas.',
      'Ask for a breakdown of assumptions before providing answers.',
    ],
    agentRecommendations: [
      'Structure tool-use prompts with explicit JSON schema formats.',
      'Instruct Gemini to avoid placeholder outputs in code generation.',
    ],
  },
  perplexity: {
    name: 'Perplexity',
    strengths: 'Real-time search consolidation, citation validation, news/academic summaries.',
    weaknesses: 'Prone to synthesizing contradictory sources, weak on creative writing tasks.',
    preferredStyle: 'Search query engineering combined with extraction directives.',
    formattingRecommendations: [
      'Use direct keyword queries and search scopes.',
      'Specify date ranges or preferred domains (e.g. `site:github.com`).',
    ],
    reasoningRecommendations: [
      'Instruct Perplexity to cross-reference multiple search results.',
      'Ask it to identify discrepancies between search findings.',
    ],
    agentRecommendations: [
      'Ask for explicit URL citations for every major claim.',
      'Limit search query scope to prevent irrelevant web results.',
    ],
  },
  deepseek: {
    name: 'DeepSeek',
    strengths: 'Deep mathematical reasoning, coding architecture, low-cost API efficiency.',
    weaknesses:
      'Can be slow during high-concurrency periods, slight bias in English phrasing patterns.',
    preferredStyle: 'Logical, code-first specifications with structured parameters.',
    formattingRecommendations: [
      'Use pseudocode or input-output schemas.',
      'State data types and constraints clearly.',
    ],
    reasoningRecommendations: [
      'Leverage reasoning models (R1) by providing broad goals and letting the model expand steps.',
      'Ask the model to double-check its math logic before displaying output.',
    ],
    agentRecommendations: [
      'Format code-agent requests with step-by-step compiler directives.',
      'Request inline code comments explaining complex algorithmic decisions.',
    ],
  },
  grok: {
    name: 'Grok',
    strengths: 'Real-time context integration, witty/fun tone adaptation, code logic.',
    weaknesses: 'Prone to sarcasm or informalities when not restricted, volatile outputs.',
    preferredStyle: 'Direct, objective commands with explicit style limits.',
    formattingRecommendations: [
      'Specify if a professional, non-witty tone is strictly required.',
      'List rules clearly using numeric order.',
    ],
    reasoningRecommendations: [
      'Ask Grok to verify current facts using real-time search context.',
      'Request logical justifications for current event conclusions.',
    ],
    agentRecommendations: [
      'Enforce standard system role overrides to bypass joke outputs.',
      'Define strict format schemas for structured tool parameters.',
    ],
  },
  qwen: {
    name: 'Qwen',
    strengths: 'Multilingual logic, coding tasks, Chinese-English translation, structured outputs.',
    weaknesses:
      'Subtle grammar artifacts in long English paragraphs, safety limits on localized topics.',
    preferredStyle: 'Bilingual friendly instructions with direct commands.',
    formattingRecommendations: [
      'Use plain standard English/Chinese syntax.',
      'Provide structured JSON schemas.',
    ],
    reasoningRecommendations: [
      'Ask Qwen to explain reasoning steps in simple languages.',
      'Provide step-by-step code trace requests.',
    ],
    agentRecommendations: [
      'Specify localized formatting targets explicitly.',
      'Request outputs formatted to standardized JSON objects.',
    ],
  },
  kimi: {
    name: 'Kimi',
    strengths: 'Massive context windows, Chinese document summarization, PDF extraction.',
    weaknesses: 'Fails on niche developer coding logic, localized speed limitations.',
    preferredStyle: 'Detailed document analysis prompts with specific references.',
    formattingRecommendations: [
      'Reference specific pages or sections of input documents.',
      'Request output formatted as a summary table.',
    ],
    reasoningRecommendations: [
      'Ask Kimi to check document parts for inconsistencies.',
      'Instruct to outline the document context before writing summaries.',
    ],
    agentRecommendations: [
      'Specify files or document segments to inspect.',
      'Provide a clean dictionary for translated terms.',
    ],
  },
  codex: {
    name: 'Codex',
    strengths: 'Legacy code completion, simple inline editing, docstring generation.',
    weaknesses: 'Weak logical reasoning, easily gets stuck in repetition loops.',
    preferredStyle: 'Comments-to-code style prompts with explicit API signatures.',
    formattingRecommendations: [
      'Start prompts with language comments (e.g. `# JavaScript`).',
      'Provide helper functions or imports before the target edit.',
    ],
    reasoningRecommendations: [
      'Avoid asking Codex to solve complex architecture decisions.',
      'Provide explicit, small sub-tasks inside comments.',
    ],
    agentRecommendations: [
      'Specify exact library/API versions inside instructions.',
      'Define expected returns clearly (e.g. `// Returns: number`).',
    ],
  },
  cursor: {
    name: 'Cursor',
    strengths: 'Repository-wide file edits, inline code generation, fast refactor suggestions.',
    weaknesses: 'Prone to modifying unrelated lines if context window gets filled with noise.',
    preferredStyle: 'File references (`@file.ts`) and clear, targeted instructions.',
    formattingRecommendations: [
      'Reference files explicitly using workspace links.',
      'State exactly which functions or components to modify.',
    ],
    reasoningRecommendations: [
      'Ask Cursor to inspect type definitions before writing implementation code.',
      'Describe dependencies and side-effects in detail.',
    ],
    agentRecommendations: [
      "Specify 'Do not change other functions unless required'.",
      "Include rules like 'Preserve all existing comment blocks'.",
    ],
  },
  claudecode: {
    name: 'Claude Code',
    strengths: 'Terminal command line execution, interactive debugging, multi-file refactoring.',
    weaknesses: 'Slow on large git diff processing, safety refusals on shell tools usage.',
    preferredStyle: 'Precise task descriptions, environment definitions, and constraints.',
    formattingRecommendations: [
      'State the goal in a single, clear command context.',
      'Provide direct directory paths for planned edits.',
    ],
    reasoningRecommendations: [
      'Instruct to run build or test checks after edits.',
      'Ask to summarize modifications before modifying files.',
    ],
    agentRecommendations: [
      "Enforce 'Do not run destructive command lines'.",
      'Provide clear commands to run verification tests (e.g. `npm run test`).',
    ],
  },
  openaiagents: {
    name: 'OpenAI Agents',
    strengths: 'Agent tool-use routing, function calling, state management, persistent threads.',
    weaknesses: 'Tool loop errors, slow multi-agent handoffs, state sync issues.',
    preferredStyle: 'Strict schemas for tool parameters and clear state targets.',
    formattingRecommendations: [
      'Provide a clear list of available tools and definitions.',
      'Structure tool inputs to match expected type shapes.',
    ],
    reasoningRecommendations: [
      'Instruct agent to stop and request confirmation for high-risk actions.',
      'Provide execution pathways for when tool calls fail.',
    ],
    agentRecommendations: [
      'Define strict boundaries for state mutations.',
      'Expose standard error responses for tool timeout conditions.',
    ],
  },
};

export const getModelGuidance = (modelName: string): ModelGuidance => {
  const normalized = String(modelName || '')
    .toLowerCase()
    .trim();
  for (const key of Object.keys(MODELS_DB)) {
    if (normalized.includes(key)) {
      return MODELS_DB[key]!;
    }
  }
  return MODELS_DB.chatgpt!; // Default fallback
};
