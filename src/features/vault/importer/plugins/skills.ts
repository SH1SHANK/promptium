import { ImporterPlugin, ParsedImportDraft } from '../types';

export const skillsPlugin: ImporterPlugin = {
  id: 'skills',
  name: 'skills.sh Parser',
  match: (fileName, content) =>
    fileName.toLowerCase().endsWith('skills.sh') ||
    (content.toLowerCase().includes('name:') && content.toLowerCase().includes('description:')),
  parse: async (fileName, content) => {
    // Parse YAML-like block
    const lines = content.split('\n');
    let title = 'Imported Skill';
    let role = '';
    let description = '';
    const instructions: string[] = [];
    const examples: string[] = [];

    let currentSection: 'frontmatter' | 'instructions' | 'examples' | 'none' = 'frontmatter';

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Parse sections/headers
      if (trimmed.toLowerCase().startsWith('instructions:') || trimmed.toLowerCase().startsWith('guidance:')) {
        currentSection = 'instructions';
        continue;
      } else if (trimmed.toLowerCase().startsWith('examples:') || trimmed.toLowerCase().startsWith('templates:')) {
        currentSection = 'examples';
        continue;
      }

      // Parse YAML keys in frontmatter
      if (currentSection === 'frontmatter') {
        if (trimmed.toLowerCase().startsWith('name:')) {
          title = trimmed.slice(5).replace(/['"]/g, '').trim();
        } else if (trimmed.toLowerCase().startsWith('description:')) {
          description = trimmed.slice(12).replace(/['"]/g, '').trim();
        } else if (trimmed.toLowerCase().startsWith('role:')) {
          role = trimmed.slice(5).replace(/['"]/g, '').trim();
        }
      } else if (currentSection === 'instructions') {
        if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
          instructions.push(trimmed.slice(1).trim());
        } else if (trimmed) {
          instructions.push(trimmed);
        }
      } else if (currentSection === 'examples') {
        if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
          examples.push(trimmed.slice(1).trim());
        } else if (trimmed) {
          examples.push(trimmed);
        }
      }
    }

    // Format clean markdown output for the skill
    const skillContentLines: string[] = [];
    skillContentLines.push(`Role: ${role || description || title}`);
    
    if (instructions.length > 0) {
      skillContentLines.push('Guidance:');
      instructions.forEach(ins => skillContentLines.push(`- ${ins}`));
    }

    if (examples.length > 0) {
      skillContentLines.push('Examples:');
      examples.forEach(ex => skillContentLines.push(`- ${ex}`));
    }

    return [
      {
        id: `draft_${Date.now()}_skill`,
        originalSource: fileName,
        title,
        content: skillContentLines.join('\n'),
        type: 'skill',
        confidence: 0.95,
        tags: ['skills.sh', 'imported']
      }
    ];
  }
};
