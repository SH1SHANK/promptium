import { ImporterPlugin, ParsedImportDraft } from '../types';
import { classifyContent } from '../classifier';

export const markdownPlugin: ImporterPlugin = {
  id: 'markdown',
  name: 'Markdown Document Parser',
  match: (fileName) => fileName.toLowerCase().endsWith('.md'),
  parse: async (fileName, content) => {
    const lines = content.split('\n');
    const drafts: ParsedImportDraft[] = [];
    
    let currentTitle = fileName.split('.').slice(0, -1).join('.') || 'Markdown Section';
    let currentContent: string[] = [];
    
    const flushDraft = () => {
      const parsedText = currentContent.join('\n').trim();
      if (!parsedText) return;
      
      const classification = classifyContent(currentTitle, parsedText, fileName);
      drafts.push({
        id: `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        originalSource: fileName,
        title: currentTitle,
        content: parsedText,
        type: classification.type,
        confidence: classification.confidence,
        tags: ['imported', 'markdown']
      });
      currentContent = [];
    };

    for (const line of lines) {
      if (line.startsWith('# ') || line.startsWith('## ')) {
        flushDraft();
        currentTitle = line.replace(/^#+\s+/, '').trim();
      } else {
        currentContent.push(line);
      }
    }
    flushDraft();

    if (drafts.length === 0 && content.trim()) {
      const title = fileName.split('.').slice(0, -1).join('.') || 'Markdown Document';
      const classification = classifyContent(title, content, fileName);
      drafts.push({
        id: `draft_${Date.now()}_fallback`,
        originalSource: fileName,
        title,
        content: content.trim(),
        type: classification.type,
        confidence: classification.confidence,
        tags: ['imported', 'markdown']
      });
    }

    return drafts;
  }
};
