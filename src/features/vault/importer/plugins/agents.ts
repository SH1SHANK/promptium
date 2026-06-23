import { ImporterPlugin, ParsedImportDraft } from '../types';
import { classifyContent } from '../classifier';

export const agentsPlugin: ImporterPlugin = {
  id: 'agents',
  name: 'Agents Configuration Parser',
  match: (fileName, content) =>
    fileName.toLowerCase() === 'agents.md' ||
    content.toLowerCase().includes('# agents.md') ||
    content.toLowerCase().includes('# agents') ||
    content.toLowerCase().includes('you are an ai coding assistant'),
  parse: async (fileName, content) => {
    const lines = content.split('\n');
    const drafts: ParsedImportDraft[] = [];
    
    let currentTitle = 'Agent Context';
    let currentContent: string[] = [];

    const flush = () => {
      const text = currentContent.join('\n').trim();
      if (!text) return;

      const lowerTitle = currentTitle.toLowerCase();
      let type: 'knowledge' | 'instruction' | 'skill' = 'knowledge';
      let confidence = 0.85;

      if (lowerTitle.includes('responsibility') || lowerTitle.includes('role') || lowerTitle.includes('persona')) {
        type = 'skill';
        confidence = 0.90;
      } else if (lowerTitle.includes('guideline') || lowerTitle.includes('workflow') || lowerTitle.includes('criteria')) {
        type = 'instruction';
        confidence = 0.90;
      } else {
        const fallback = classifyContent(currentTitle, text, fileName);
        type = fallback.type;
        confidence = fallback.confidence;
      }

      drafts.push({
        id: `draft_${Date.now()}_agents_${Math.random().toString(36).substr(2, 9)}`,
        originalSource: fileName,
        title: `${fileName} - ${currentTitle}`,
        content: text,
        type,
        confidence,
        tags: ['agents', 'imported']
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
