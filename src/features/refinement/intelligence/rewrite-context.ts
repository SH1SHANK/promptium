import { PromptRefinementContext, PromptRecommendation } from './types';
import { classifyPromptWithConfidence } from './category';
import { getRecommendedPattern, getRankedPatterns } from './patterns';
import { getSkillPack, getRankedSkills } from './skills';
import { getModelGuidance } from './knowledge/models';
import { getAgentRecommendations } from './knowledge/agents';
import { runIntelligencePipeline } from './analyzer';
import { calculateEffectivenessScore } from './scoring';
import { upgradePrompt } from './upgrade';
import { getNotes } from '../notes/store';
import { retrieveContext } from './cre/engine';

export const generateRewriteContext = async (text: string): Promise<PromptRefinementContext> => {
  const trimmed = String(text || '').trim();
  
  // 1. Run integrated pipeline (returns issues, intent extraction, token metrics)
  const analysis = await runIntelligencePipeline(trimmed);

  // 2. Category Classification with confidence metrics
  const categoryResult = await classifyPromptWithConfidence(trimmed, analysis.intent);
  const category = categoryResult.category;

  // 3. Pattern and Skill Pack retrieval utilizing Fuse.js rankings
  const pattern = getRecommendedPattern(category, trimmed);
  const skillPack = getSkillPack(category, trimmed);

  const recommendedPatterns = await getRankedPatterns(trimmed);
  const recommendedSkills = await getRankedSkills(trimmed);

  // 4. Model Guidance mapping based on keyword detection
  const normalized = trimmed.toLowerCase();
  let targetModel = 'chatgpt'; // default fallback
  if (normalized.includes('claude code') || normalized.includes('claudecode')) {
    targetModel = 'claudecode';
  } else if (normalized.includes('cursor')) {
    targetModel = 'cursor';
  } else if (normalized.includes('claude')) {
    targetModel = 'claude';
  } else if (normalized.includes('gemini')) {
    targetModel = 'gemini';
  } else if (normalized.includes('deepseek')) {
    targetModel = 'deepseek';
  } else if (normalized.includes('perplexity')) {
    targetModel = 'perplexity';
  } else if (normalized.includes('grok')) {
    targetModel = 'grok';
  } else if (normalized.includes('qwen')) {
    targetModel = 'qwen';
  } else if (normalized.includes('kimi')) {
    targetModel = 'kimi';
  } else if (normalized.includes('codex')) {
    targetModel = 'codex';
  } else if (normalized.includes('agent') && (normalized.includes('openai') || normalized.includes('gpt'))) {
    targetModel = 'openaiagents';
  }

  const modelGuidance = getModelGuidance(targetModel);
  const modelRecommendations = [
    ...modelGuidance.formattingRecommendations,
    ...modelGuidance.reasoningRecommendations
  ];

  // 5. Developer Agent Specific Workflow recommendations
  const agentRecommendations = getAgentRecommendations(trimmed);

  const scoreBreakdown = calculateEffectivenessScore(trimmed, analysis.issues);

  // 6. Local Upgraded Prompt Template
  const upgradedPrompt = upgradePrompt(trimmed);

  // 7. Compile and Prioritize Recommendations List
  const recommendations: PromptRecommendation[] = [];

  // A. Add Rule check cards
  const ruleIssues = analysis.issues.filter(i => i.id.startsWith('rule_'));
  ruleIssues.forEach(issue => {
    let title = 'Optimize Prompt Segment';
    let categoryName: PromptRecommendation['category'] = 'Clarity';
    let priority: PromptRecommendation['priority'] = 'important';
    let impact = 0.7;
    let afterPreview = trimmed;

    if (issue.id === 'rule_missing_objective') {
      categoryName = 'Clarity';
      title = 'Define Clear Objective';
      priority = 'critical';
      impact = 0.9;
      afterPreview = `Objective: [Enter task objective here]\n\n${trimmed}`;
    } else if (issue.id === 'rule_missing_context') {
      categoryName = 'Context';
      title = 'Provide Context';
      priority = 'important';
      impact = 0.8;
      afterPreview = `${trimmed}\n\nContext: [Provide details about your project or goal]`;
    } else if (issue.id === 'rule_missing_constraints') {
      categoryName = 'Constraints';
      title = 'Establish Constraints';
      priority = 'important';
      impact = 0.85;
      afterPreview = `${trimmed}\n\nConstraints:\n- Limit the response to key details.\n- Avoid unnecessary preamble.`;
    } else if (issue.id === 'rule_missing_format') {
      categoryName = 'Output Format';
      title = 'Specify Output Format';
      priority = 'important';
      impact = 0.8;
      afterPreview = `${trimmed}\n\nOutput Format:\n- Format response using markdown headings/lists.`;
    } else if (issue.id === 'rule_contains_placeholder') {
      categoryName = 'Clarity';
      title = 'Replace Placeholder';
      priority = 'critical';
      impact = 0.9;
      afterPreview = trimmed.replace(issue.original, '[value]');
    }

    recommendations.push({
      id: issue.id,
      category: categoryName,
      title,
      description: issue.explanation,
      why: getWhyExplanation(issue.id),
      priority,
      confidence: 0.95,
      impact,
      beforePreview: issue.id === 'rule_contains_placeholder' ? issue.original : undefined,
      afterPreview: issue.id === 'rule_contains_placeholder' ? '[value]' : afterPreview,
      applyId: issue.id
    });
  });

  // B. Add Model Optimization Card
  if (targetModel === 'claude') {
    recommendations.push({
      id: 'model_claude_xml',
      category: 'Model Optimization',
      title: 'Wrap with XML Tags',
      description: 'Claude performs better with explicit XML-style structure and clearly separated sections.',
      why: 'Claude models are natively trained on XML tags to parse parameter arguments and instruction borders.',
      priority: 'important',
      confidence: 0.9,
      impact: 0.8,
      beforePreview: trimmed.slice(0, 40) + '...',
      afterPreview: `<context>\n${trimmed.slice(0, 40)}...\n</context>`,
      applyId: 'model_claude_xml'
    });
  } else if (targetModel === 'chatgpt') {
    recommendations.push({
      id: 'model_chatgpt_criteria',
      category: 'Model Optimization',
      title: 'Add Consistency Constraints',
      description: 'Adding output constraints and evaluation criteria may improve consistency in ChatGPT responses.',
      why: 'Explicit success criteria primes instruction weights to prevent chat loop drift.',
      priority: 'important',
      confidence: 0.85,
      impact: 0.75,
      beforePreview: trimmed.slice(0, 40) + '...',
      afterPreview: `${trimmed.slice(0, 40)}...\n\nCriteria:\n- Output must follow instructions strictly.`,
      applyId: 'model_chatgpt_criteria'
    });
  } else if (targetModel === 'codex') {
    recommendations.push({
      id: 'model_codex_api',
      category: 'Model Optimization',
      title: 'Define API Signatures',
      description: 'Include repository constraints, API signatures, and testing requirements in Codex prompts.',
      why: 'Codex models require structured inline signatures to correctly predict function boundaries.',
      priority: 'important',
      confidence: 0.9,
      impact: 0.8,
      beforePreview: trimmed.slice(0, 40) + '...',
      afterPreview: `${trimmed.slice(0, 40)}...\n\n// API Signature:\n// function init()`,
      applyId: 'model_codex_api'
    });
  }

  // C. Add Agent-Aware Cards
  if (agentRecommendations.length > 0) {
    agentRecommendations.forEach((rec, idx) => {
      const parts = rec.split(':');
      const title = parts[0]?.trim() || 'Agent Specification';
      const desc = parts[1]?.trim() || rec;
      
      let why = 'Agents require strict parameters to limit workspace command execution risks.';
      if (title.includes('Structure')) why = 'Providing directory references decreases background tool loop lookup overhead.';
      else if (title.includes('Standards')) why = 'Specifying TS/ESLint rules avoids syntax regression during background compilation.';
      else if (title.includes('Testing')) why = 'Asserting test verify suites stops agents from completing code that does not build.';

      recommendations.push({
        id: `agent_rec_${idx}`,
        category: 'Agent Workflow',
        title,
        description: desc,
        why,
        priority: 'important',
        confidence: 0.9,
        impact: 0.8,
        beforePreview: trimmed.slice(0, 40) + '...',
        afterPreview: `${trimmed.slice(0, 40)}...\n\n// ${title}: ${desc.slice(0, 40)}...`,
        applyId: `agent_rec_${idx}`
      });
    });
  }

  // D. Add Pattern structure card if structure score is low
  if (scoreBreakdown.structure < 75) {
    recommendations.push({
      id: 'apply_pattern',
      category: 'Structure',
      title: `Structure with ${pattern.name}`,
      description: `Format this prompt into structured instruction segments following the ${pattern.name} pattern.`,
      why: 'Organizing instructions into standard frameworks like CRISPE/RISEN significantly increases instruction-following accuracy.',
      priority: 'important',
      confidence: 0.85,
      impact: 0.8,
      beforePreview: trimmed.slice(0, 40) + '...',
      afterPreview: `### Role\n${skillPack.role}\n\n### Task\n${trimmed.slice(0, 40)}...`,
      applyId: 'apply_pattern'
    });
  }

  // E. Add Skill Persona card if not present
  if (!normalized.includes(skillPack.role.toLowerCase())) {
    recommendations.push({
      id: 'apply_role',
      category: 'Clarity',
      title: `Adopt ${skillPack.name} Persona`,
      description: `Priming the prompt with a role persona adapts the model's vocabularies: "${skillPack.role}".`,
      why: 'Explicit role prompting focuses model semantic weights on domain standards.',
      priority: 'optional',
      confidence: 0.8,
      impact: 0.7,
      beforePreview: trimmed.slice(0, 40) + '...',
      afterPreview: `### Role\n${skillPack.role}\n\n${trimmed.slice(0, 40)}...`,
      applyId: 'apply_role'
    });
  }

  // Prioritize and Sort: critical = 100, important = 50, optional = 10
  const getPriorityVal = (p: PromptRecommendation['priority']) => {
    if (p === 'critical') return 100;
    if (p === 'important') return 50;
    return 10;
  };

  const prioritized = recommendations
    .sort((a, b) => {
      const weightA = getPriorityVal(a.priority) * a.impact * a.confidence;
      const weightB = getPriorityVal(b.priority) * b.impact * b.confidence;
      return weightB - weightA;
    })
    .slice(0, 4); // Display maximum of 3-5 recommendations (we target 4)

  // 8. Fetch dynamic Vault entries using CRE
  const retrievalResult = await retrieveContext(trimmed);
  const vaultKnowledge = retrievalResult.knowledge.map(r => r.item);
  const vaultSkill = retrievalResult.skill ? retrievalResult.skill.item : null;
  const vaultInstructions = retrievalResult.instructions.map(r => r.item);

  // Local upgraded prompt with async execution support
  const asyncUpgradedPrompt = await upgradePrompt(trimmed);

  return {
    promptText: trimmed,
    category,
    skillPack,
    pattern,
    modelRecommendations,
    agentRecommendations,
    promptIssues: analysis.issues,
    scoreBreakdown,
    upgradedPrompt: asyncUpgradedPrompt,
    recommendations: prioritized,
    notes: getNotes(),
    intent: analysis.intent,
    tokenMetrics: analysis.tokenMetrics,
    recommendedPatterns,
    recommendedSkills,
    vaultKnowledge,
    vaultSkill,
    vaultInstructions,
    retrievalResult
  };
};

const getWhyExplanation = (ruleId: string): string => {
  switch (ruleId) {
    case 'rule_missing_objective':
      return 'Structured goals prevent text engines from diverging onto generic tangents.';
    case 'rule_missing_context':
      return 'Details about target variables and scenarios customize answers for your workspace environment.';
    case 'rule_missing_constraints':
      return 'Setting boundaries removes common compiler or writing outputs that clutter results.';
    case 'rule_missing_format':
      return 'Requesting tables or JSON lists ensures outputs are immediately parsable.';
    case 'rule_contains_placeholder':
      return 'Replacing bracket symbols ensures queries don\'t ask questions back to you.';
    default:
      return 'Following prompt engineering best practices ensures optimal model context prime.';
  }
};
