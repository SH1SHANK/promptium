import { ImporterPlugin, ParsedImportDraft } from '../types';
import { classifyContent } from '../classifier';

export const codexPlugin: ImporterPlugin = {
  id: 'codex',
  name: 'Codex Specification Parser',
  match: (fileName, content) =>
    fileName.toLowerCase().endsWith('codex.md') ||
    content.toLowerCase().includes('# codex.md') ||
    content.toLowerCase().includes('## codex'),
  parse: async (fileName, content) => {
    const lines = content.split('\n');
    const drafts: ParsedImportDraft[] = [];
    
    let currentTitle = 'Codex Context';
    let currentContent: string[] = [];

    const flush = () => {
      const text = currentContent.join('\n').trim();
      if (!text) return;

      const classification = classifyContent(currentTitle, text, fileName);
      drafts.push({
        id: `draft_${Date.now()}_codex_${Math.random().toString(36).substr(2, 9)}`,
        originalSource: fileName,
        title: `${fileName} - ${currentTitle}`,
        content: text,
        type: classification.type,
        confidence: classification.confidence,
        tags: ['codex', 'imported']
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
