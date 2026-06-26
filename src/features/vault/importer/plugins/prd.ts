import { ImporterPlugin, ParsedImportDraft } from '../types';
import { classifyContent } from '../classifier';

export const prdPlugin: ImporterPlugin = {
  id: 'prd',
  name: 'PRD & Spec Parser',
  match: (fileName, content) =>
    fileName.toLowerCase().endsWith('prd.md') ||
    fileName.toLowerCase().endsWith('requirements.md') ||
    fileName.toLowerCase().endsWith('spec.md') ||
    content.toLowerCase().includes('# prd') ||
    content.toLowerCase().includes('# product requirements document'),
  parse: async (fileName, content) => {
    const lines = content.split('\n');
    const drafts: ParsedImportDraft[] = [];

    let currentTitle = 'Requirements Context';
    let currentContent: string[] = [];

    const flush = () => {
      const text = currentContent.join('\n').trim();
      if (!text) return;

      const classification = classifyContent(currentTitle, text, fileName);
      drafts.push({
        id: `draft_${Date.now()}_prd_${Math.random().toString(36).substr(2, 9)}`,
        originalSource: fileName,
        title: `${fileName} - ${currentTitle}`,
        content: text,
        type: classification.type,
        confidence: classification.confidence,
        tags: ['prd', 'requirements', 'imported'],
      });
      currentContent = [];
    };

    for (const line of lines) {
      if (line.startsWith('# ') || line.startsWith('## ')) {
        flush();
        currentTitle = line.replace(/^#+\s+/, '').trim();
      } else {
        currentContent.push(line);
      }
    }
    flush();

    return drafts;
  },
};
