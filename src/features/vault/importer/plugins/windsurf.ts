import { ImporterPlugin, ParsedImportDraft } from '../types';

export const windsurfPlugin: ImporterPlugin = {
  id: 'windsurf',
  name: 'Windsurf Rules Parser',
  match: (fileName, content) =>
    fileName.toLowerCase() === '.windsurfrules' ||
    fileName.toLowerCase().endsWith('.windsurfrules'),
  parse: async (fileName, content) => {
    return [
      {
        id: `draft_${Date.now()}_windsurf`,
        originalSource: fileName,
        title: `${fileName} Rules`,
        content: content.trim(),
        type: 'instruction',
        confidence: 0.95,
        tags: ['windsurf', 'imported']
      }
    ];
  }
};
