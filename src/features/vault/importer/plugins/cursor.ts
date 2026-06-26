import { ImporterPlugin, ParsedImportDraft } from '../types';
import { classifyContent } from '../classifier';

export const cursorPlugin: ImporterPlugin = {
  id: 'cursor',
  name: 'Cursor Rules Parser',
  match: (fileName, content) =>
    fileName.toLowerCase() === '.cursorrules' ||
    fileName.toLowerCase().includes('.cursor/rules') ||
    content.toLowerCase().includes('.cursorrules') ||
    (content.trim().startsWith('{') && content.toLowerCase().includes('rules')),
  parse: async (fileName, content) => {
    const drafts: ParsedImportDraft[] = [];

    // Try parsing as JSON first (Cursor rules can be JSON)
    try {
      if (content.trim().startsWith('{')) {
        const parsed = JSON.parse(content);

        // Extract instruction rules
        if (parsed.rules && Array.isArray(parsed.rules)) {
          parsed.rules.forEach((rule: any, idx: number) => {
            const ruleText = typeof rule === 'string' ? rule : JSON.stringify(rule, null, 2);
            drafts.push({
              id: `draft_${Date.now()}_cursor_${idx}`,
              originalSource: fileName,
              title: `${fileName} rule #${idx + 1}`,
              content: ruleText,
              type: 'instruction',
              confidence: 0.95,
              tags: ['cursor', 'imported'],
            });
          });
        }

        // Extract project context description
        if (parsed.context || parsed.description) {
          drafts.push({
            id: `draft_${Date.now()}_cursor_context`,
            originalSource: fileName,
            title: `${fileName} Context`,
            content: parsed.context || parsed.description,
            type: 'knowledge',
            confidence: 0.9,
            tags: ['cursor', 'imported', 'context'],
          });
        }
      }
    } catch (e) {
      // Failed JSON parse, fallback to markdown parsing
    }

    // If no JSON drafts extracted, parse as markdown
    if (drafts.length === 0) {
      const lines = content.split('\n');
      let currentTitle = 'Cursor Instructions';
      let currentContent: string[] = [];

      const flush = () => {
        const text = currentContent.join('\n').trim();
        if (!text) return;

        const classification = classifyContent(currentTitle, text, fileName);

        drafts.push({
          id: `draft_${Date.now()}_cursor_md_${Math.random().toString(36).substr(2, 9)}`,
          originalSource: fileName,
          title: `${fileName} - ${currentTitle}`,
          content: text,
          type: classification.type,
          confidence: classification.confidence,
          tags: ['cursor', 'imported'],
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
    }

    return drafts;
  },
};
