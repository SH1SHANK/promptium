import { getPluginFor } from './registry';
import { ImportSource } from './types';

export function detectImportSource(fileName: string, content: string): ImportSource {
  const plugin = getPluginFor(fileName, content);
  return plugin.id;
}
