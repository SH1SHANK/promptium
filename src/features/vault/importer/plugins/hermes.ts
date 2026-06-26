import { ImporterPlugin, ParsedImportDraft } from '../types';
import { classifyContent } from '../classifier';

export const hermesPlugin: ImporterPlugin = {
  id: 'hermes',
  name: 'HERMES Specification Parser',
  match: (fileName, content) =>
    fileName.toLowerCase() === 'hermes.md' ||
    content.toLowerCase().includes('# hermes.md') ||
    content.toLowerCase().includes('## hermes'),
  parse: async (fileName, content) => {
    const lines = content.split('\n');
    const drafts: ParsedImportDraft[] = [];

    let currentTitle = 'HERMES Context';
    let currentContent: string[] = [];

    const flush = () => {
      const text = currentContent.join('\n').trim();
      if (!text) return;

      const classification = classifyContent(currentTitle, text, fileName);
      drafts.push({
        id: `draft_${Date.now()}_hermes_${Math.random().toString(36).substr(2, 9)}`,
        originalSource: fileName,
        title: `${fileName} - ${currentTitle}`,
        content: text,
        type: classification.type,
        confidence: classification.confidence,
        tags: ['hermes', 'imported'],
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
