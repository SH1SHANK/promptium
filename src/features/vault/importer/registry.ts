import { ImporterPlugin, ImportSource } from './types';

const registry = new Map<ImportSource, ImporterPlugin>();

export function registerPlugin(plugin: ImporterPlugin): void {
  registry.set(plugin.id, plugin);
}

export function getPluginFor(fileName: string, content: string): ImporterPlugin {
  const normName = fileName.toLowerCase();

  // High-priority match for explicit filenames
  for (const plugin of registry.values()) {
    if (plugin.id !== 'generic' && plugin.id !== 'markdown' && plugin.match(fileName, content)) {
      return plugin;
    }
  }

  // Fallback to markdown or generic
  if (normName.endsWith('.md') || content.trim().startsWith('#')) {
    return registry.get('markdown') || registry.get('generic')!;
  }

  return registry.get('generic')!;
}

export function getRegisteredPlugins(): ImporterPlugin[] {
  return Array.from(registry.values());
}
