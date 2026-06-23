import { ImporterPlugin, ParsedImportDraft } from '../types';
import { classifyContent } from '../classifier';

export const designPlugin: ImporterPlugin = {
  id: 'design',
  name: 'Design Assets Parser',
  match: (fileName, content) =>
    fileName.toLowerCase().endsWith('design.md') ||
    content.toLowerCase().includes('# design.md') ||
    content.toLowerCase().includes('## design guidelines'),
  parse: async (fileName, content) => {
    const lines = content.split('\n');
    const drafts: ParsedImportDraft[] = [];
    
    let currentTitle = 'Design Specifications';
    let currentContent: string[] = [];

    const flush = () => {
      const text = currentContent.join('\n').trim();
      if (!text) return;

      const classification = classifyContent(currentTitle, text, fileName);
      drafts.push({
        id: `draft_${Date.now()}_design_${Math.random().toString(36).substr(2, 9)}`,
        originalSource: fileName,
        title: `${fileName} - ${currentTitle}`,
        content: text,
        type: classification.type,
        confidence: classification.confidence,
        tags: ['design', 'imported']
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
  }
};
