import { SkillPack, PromptCategory } from './types';
import { findRelevantSkills } from './recommendation/search';
import { getItems } from '../../vault/store';
import { VaultItem } from '../../vault/types';

// Seed Data for first launch, exported to be loaded by Vault Store
export const SEED_SKILLS: Omit<VaultItem, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'skill_architect',
    type: 'skill',
    title: 'Software Architect',
    content: 'Role: Senior Software Architect & System Designer\nGuidance:\n- Specify technology stack constraints.\n- Explain system boundaries and external integrations.\n- List non-functional requirements such as performance, security, and scalability.',
    tags: ['coding', 'architecture'],
    enabled: true
  },
  {
    id: 'skill_founder',
    type: 'skill',
    title: 'Startup Founder',
    content: 'Role: Visionary Tech Startup Founder & Product Strategist\nGuidance:\n- Define the core problem and solution clearly.\n- Quantify market opportunity and financial unit economics where possible.\n- Include a SWOT analysis (Strengths, Weaknesses, Opportunities, Threats).',
    tags: ['business', 'startup'],
    enabled: true
  },
  {
    id: 'skill_pm',
    type: 'skill',
    title: 'Product Manager',
    content: 'Role: Senior Product Manager\nGuidance:\n- Focus on the \'why\' and \'what\', leaving the \'how\' to engineering.\n- Incorporate user persona insights and qualitative/quantitative goals.\n- Define explicit out-of-scope boundaries to prevent scope creep.',
    tags: ['business', 'product'],
    enabled: true
  },
  {
    id: 'skill_researcher',
    type: 'skill',
    title: 'Academic Research',
    content: 'Role: Expert Academic Researcher & Technical Writer\nGuidance:\n- Maintain an objective, academic, and analytical tone.\n- Verify citations, source credibility, and empirical evidence.\n- Clarify research limitations, methodologies, and potential biases.',
    tags: ['research', 'academia'],
    enabled: true
  },
  {
    id: 'skill_marketing',
    type: 'skill',
    title: 'Marketing',
    content: 'Role: Creative Growth Marketer & Copywriter\nGuidance:\n- Highlight the unique value proposition and emotional hooks.\n- Adapt voice and style to the specific platform (e.g. LinkedIn professional, TikTok casual).\n- Include clear Calls to Action (CTAs).',
    tags: ['marketing', 'sales'],
    enabled: true
  },
  {
    id: 'skill_writer',
    type: 'skill',
    title: 'Content Writer',
    content: 'Role: Professional Content Writer & Editor\nGuidance:\n- Use active voice and avoid jargon unless targeting an expert audience.\n- Incorporate transition phrases to maintain readable flow.\n- Optimize title and headings for readability and engagement.',
    tags: ['writing', 'blogging'],
    enabled: true
  },
  {
    id: 'skill_engineer',
    type: 'skill',
    title: 'Prompt Engineer',
    content: 'Role: Expert Prompt Engineer & AI Specialist\nGuidance:\n- Use clear delimiters (XML tags, triple backticks) for prompt sections.\n- Provide few-shot examples of desired input-output behavior.\n- Specify fallback instructions if the primary request cannot be met.',
    tags: ['prompt engineering', 'general'],
    enabled: true
  }
];

function parseVaultSkillToSkillPack(item: Omit<VaultItem, 'createdAt' | 'updatedAt'>): SkillPack {
  const content = item.content || '';
  let role = item.title || 'Expert';
  const guidance: string[] = [];

  const lines = content.split('\n');
  let inGuidance = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith('role:')) {
      role = trimmed.slice(5).trim();
    } else if (trimmed.toLowerCase().startsWith('guidance:')) {
      inGuidance = true;
    } else if (inGuidance && (trimmed.startsWith('-') || trimmed.startsWith('*'))) {
      guidance.push(trimmed.slice(1).trim());
    } else if (trimmed && !trimmed.toLowerCase().startsWith('role:') && !trimmed.toLowerCase().startsWith('guidance:')) {
      if (!inGuidance && guidance.length === 0) {
        guidance.push(trimmed);
      } else if (inGuidance) {
        guidance.push(trimmed);
      }
    }
  }

  if (guidance.length === 0 && content) {
    guidance.push(content);
  }

  return {
    name: item.title,
    role: role,
    templates: [],
    guidance: guidance
  };
}

export const getSkillPack = (category: PromptCategory, promptText?: string): SkillPack => {
  const normalizedText = String(promptText || '').toLowerCase();
  const vaultSkills = getItems('skill');

  const findSkill = (titleKeyword: string, fallbackId: string) => {
    // 1. Try to find enabled skill in vault matching titleKeyword
    const matched = vaultSkills.find(s => s.enabled && s.title.toLowerCase().includes(titleKeyword));
    if (matched) return matched;
    
    // 2. Try to find any skill in vault matching titleKeyword (even if disabled)
    const matchedAny = vaultSkills.find(s => s.title.toLowerCase().includes(titleKeyword));
    if (matchedAny) return matchedAny;

    // 3. Try fallback by id from vault
    const byId = vaultSkills.find(s => s.id === fallbackId);
    if (byId) return byId;

    // 4. Default fallback from SEED_SKILLS
    const seed = SEED_SKILLS.find(s => s.id === fallbackId);
    return seed || SEED_SKILLS[0]!;
  };

  let selectedVaultSkill: any;

  switch (category) {
    case 'coding':
      selectedVaultSkill = findSkill('architect', 'skill_architect');
      break;
    case 'business':
      if (normalizedText.includes('startup') || normalizedText.includes('pitch') || normalizedText.includes('funding') || normalizedText.includes('venture') || normalizedText.includes('investor')) {
        selectedVaultSkill = findSkill('founder', 'skill_founder');
      } else {
        selectedVaultSkill = findSkill('product manager', 'skill_pm');
      }
      break;
    case 'marketing':
      selectedVaultSkill = findSkill('marketing', 'skill_marketing');
      break;
    case 'research':
      selectedVaultSkill = findSkill('research', 'skill_researcher');
      break;
    case 'writing':
      selectedVaultSkill = findSkill('writer', 'skill_writer');
      break;
    case 'general':
    default:
      selectedVaultSkill = findSkill('engineer', 'skill_engineer');
      break;
  }

  return parseVaultSkillToSkillPack(selectedVaultSkill);
};

/**
 * Returns Fuse-ranked skill pack recommendations.
 */
export async function getRankedSkills(promptText: string): Promise<any[]> {
  const vaultSkills = getItems('skill').filter(s => s.enabled);
  return await findRelevantSkills(promptText, vaultSkills);
}

