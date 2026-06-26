import { ImporterPlugin, ParsedImportDraft } from '../types';
import { classifyContent } from '../classifier';

export const genericPlugin: ImporterPlugin = {
  id: 'generic',
  name: 'Generic Text Importer',
  match: () => true, // Fallback match
  parse: async (fileName, content) => {
    const title = fileName.split('.').slice(0, -1).join('.') || 'Imported Asset';
    const classification = classifyContent(title, content, fileName);

    return [
      {
        id: `draft_${Date.now()}_generic`,
        originalSource: fileName,
        title,
        content: content.trim(),
        type: classification.type,
        confidence: classification.confidence,
        tags: ['imported', 'generic'],
      },
    ];
  },
};
