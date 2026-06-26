import { ImporterPlugin, ParsedImportDraft } from '../types';
import { classifyContent } from '../classifier';

export const claudePlugin: ImporterPlugin = {
  id: 'claude',
  name: 'CLAUDE.md Parser',
  match: (fileName, content) =>
    fileName.toLowerCase() === 'claude.md' ||
    content.toLowerCase().includes('# claude.md') ||
    content.toLowerCase().includes('## build commands'),
  parse: async (fileName, content) => {
    const lines = content.split('\n');
    const drafts: ParsedImportDraft[] = [];

    let currentTitle = 'CLAUDE Context';
    let currentContent: string[] = [];

    const flush = () => {
      const text = currentContent.join('\n').trim();
      if (!text) return;

      // Smart auto-classification for CLAUDE sections
      let type: 'knowledge' | 'instruction' | 'skill' = 'knowledge';
      let confidence = 0.9;

      const lowerTitle = currentTitle.toLowerCase();
      if (
        lowerTitle.includes('command') ||
        lowerTitle.includes('run') ||
        lowerTitle.includes('test')
      ) {
        type = 'knowledge';
      } else if (
        lowerTitle.includes('style') ||
        lowerTitle.includes('rule') ||
        lowerTitle.includes('guideline') ||
        lowerTitle.includes('standard')
      ) {
        type = 'instruction';
      } else {
        const fallback = classifyContent(currentTitle, text, fileName);
        type = fallback.type;
        confidence = fallback.confidence;
      }

      drafts.push({
        id: `draft_${Date.now()}_claude_${Math.random().toString(36).substr(2, 9)}`,
        originalSource: fileName,
        title: `${fileName} - ${currentTitle}`,
        content: text,
        type,
        confidence,
        tags: ['claude', 'imported'],
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
