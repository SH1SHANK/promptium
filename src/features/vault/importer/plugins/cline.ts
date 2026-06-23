import { ImporterPlugin, ParsedImportDraft } from '../types';

export const clinePlugin: ImporterPlugin = {
  id: 'cline',
  name: 'Cline Rules Parser',
  match: (fileName, content) =>
    fileName.toLowerCase() === '.clinerules' ||
    fileName.toLowerCase().endsWith('.clinerules'),
  parse: async (fileName, content) => {
    return [
      {
        id: `draft_${Date.now()}_cline`,
        originalSource: fileName,
        title: `${fileName} Rules`,
        content: content.trim(),
        type: 'instruction',
        confidence: 0.95,
        tags: ['cline', 'imported']
      }
    ];
  }
};
