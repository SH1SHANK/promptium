import { ImporterPlugin, ParsedImportDraft } from '../types';

export const aiderPlugin: ImporterPlugin = {
  id: 'aider',
  name: 'Aider Rules Parser',
  match: (fileName, content) =>
    fileName.toLowerCase() === '.aider.md' ||
    fileName.toLowerCase() === '.aider.conf.yml' ||
    fileName.toLowerCase().includes('.aider'),
  parse: async (fileName, content) => {
    // Treat Aider rules mostly as instructions
    return [
      {
        id: `draft_${Date.now()}_aider`,
        originalSource: fileName,
        title: `${fileName} Rules`,
        content: content.trim(),
        type: 'instruction',
        confidence: 0.90,
        tags: ['aider', 'imported']
      }
    ];
  }
};
