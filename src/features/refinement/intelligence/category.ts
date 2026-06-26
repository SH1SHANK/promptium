import { PromptCategory, CategoryResult, PromptIntent } from './types';

const CATEGORY_KEYWORDS: Record<Exclude<PromptCategory, 'general'>, string[]> = {
  coding: [
    'code',
    'program',
    'function',
    'class',
    'algorithm',
    'developer',
    'javascript',
    'typescript',
    'python',
    'css',
    'html',
    'react',
    'angular',
    'vue',
    'database',
    'sql',
    'api',
    'json',
    'git',
    'bug',
    'error',
    'exception',
    'compile',
    'lint',
    'refactor',
    'unittest',
    'test',
    'backend',
    'frontend',
    'fullstack',
    'docker',
    'kubernetes',
    'aws',
    'deploy',
    'server',
    'compiler',
    'bash',
    'shell',
    'regex',
    'c++',
    'java',
    'rust',
    'go-lang',
    'golang',
  ],
  business: [
    'business',
    'startup',
    'founder',
    'pm',
    'product manager',
    'prd',
    'roadmap',
    'pitch',
    'investor',
    'roi',
    'revenue',
    'cost',
    'profit',
    'strategy',
    'finance',
    'accounting',
    'venture',
    'market',
    'competitor',
    'swot',
    'okr',
    'kpi',
    'launch',
    'pricing',
    'acquisition',
    'metrics',
    'financial',
  ],
  marketing: [
    'marketing',
    'campaign',
    'ads',
    'advertising',
    'copywriting',
    'seo',
    'brand',
    'audience',
    'social media',
    'newsletter',
    'leads',
    'funnel',
    'conversion',
    'headline',
    'slogan',
    'promo',
    'sales',
    'ctr',
    'instagram',
    'facebook',
    'linkedin',
    'tiktok',
    'twitter',
    'pitch deck',
    'demographics',
    'copywriter',
  ],
  research: [
    'research',
    'academic',
    'thesis',
    'paper',
    'literature review',
    'methodology',
    'hypothesis',
    'study',
    'experiment',
    'data analysis',
    'statistics',
    'science',
    'scientific',
    'citation',
    'bibliography',
    'empirical',
    'investigate',
    'source',
    'journal',
    'abstract',
    'academic writing',
  ],
  writing: [
    'write',
    'blog',
    'article',
    'essay',
    'story',
    'novel',
    'poem',
    'draft',
    'editor',
    'grammar',
    'creative writing',
    'dialogue',
    'paragraph',
    'script',
    'content',
    'summarize',
    'paraphrase',
    'rewrite',
    'proofread',
    'tone',
    'style',
  ],
};

export const classifyPrompt = (text: string): PromptCategory => {
  const normalized = String(text || '').toLowerCase();

  let bestCategory: PromptCategory = 'general';
  let maxScore = 0;

  for (const category of Object.keys(CATEGORY_KEYWORDS) as Array<
    Exclude<PromptCategory, 'general'>
  >) {
    let score = 0;
    for (const keyword of CATEGORY_KEYWORDS[category]) {
      const matches = normalized.split(keyword).length - 1;
      if (matches > 0) {
        score += matches;
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
};

/**
 * Classifies the prompt with NLP intent features and returns a confidence ratio.
 */
export const classifyPromptWithConfidence = async (
  text: string,
  intent?: PromptIntent
): Promise<CategoryResult> => {
  const normalized = String(text || '').toLowerCase();
  const activeIntent =
    intent || (await (await import('./analysis/compromise')).extractIntent(text));

  let bestCategory: PromptCategory = 'general';
  let maxScore = 0;
  let totalScore = 0;

  const keywordCounts: Record<PromptCategory, number> = {
    coding: 0,
    business: 0,
    marketing: 0,
    research: 0,
    writing: 0,
    general: 0,
  };

  // 1. Calculate matching keyword points
  for (const category of Object.keys(CATEGORY_KEYWORDS) as Array<
    Exclude<PromptCategory, 'general'>
  >) {
    let score = 0;
    for (const keyword of CATEGORY_KEYWORDS[category]) {
      const matches = normalized.split(keyword).length - 1;
      if (matches > 0) {
        score += matches;
      }
    }

    // Boost based on NLP parsed entities and keywords
    activeIntent.keywords.forEach((kw) => {
      if (CATEGORY_KEYWORDS[category].includes(kw)) {
        score += 2; // intent keyword match boost
      }
    });

    keywordCounts[category] = score;
    totalScore += score;

    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  }

  // 2. Resolve confidence calculation
  if (totalScore === 0) {
    return {
      category: 'general',
      confidence: 1.0,
    };
  }

  const confidence = parseFloat((maxScore / totalScore).toFixed(2));
  return {
    category: bestCategory,
    confidence,
  };
};
