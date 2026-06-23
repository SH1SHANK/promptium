import { ParsedImportDraft } from './types';
import { getPluginFor } from './registry';
import { genericPlugin } from './plugins/generic';

export async function parseImportFile(fileName: string, content: string): Promise<ParsedImportDraft[]> {
  const plugin = getPluginFor(fileName, content);
  try {
    return await plugin.parse(fileName, content);
  } catch (err) {
    console.error(`Importer parser plugin error for ${fileName} via ${plugin.name}:`, err);
    // Fall back to generic plugin parsing
    return await genericPlugin.parse(fileName, content);
  }
}
