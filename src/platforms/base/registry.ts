import { PlatformAdapter } from './adapter';
import { AdapterDiagnostics } from './diagnostics';

const registry: PlatformAdapter[] = [];

export function registerAdapter(adapter: PlatformAdapter) {
  if (!registry.some((a) => a.id === adapter.id)) {
    registry.push(adapter);
  }
}

export function getAdapters(): PlatformAdapter[] {
  return registry;
}

export function getCurrentAdapter(): PlatformAdapter | null {
  if (typeof window === 'undefined') return null;
  const hostname = window.location.hostname.toLowerCase();
  for (const adapter of registry) {
    if (adapter.detect(hostname)) {
      return adapter;
    }
  }
  return null;
}

export function getAdapterDiagnostics(): AdapterDiagnostics | null {
  const adapter = getCurrentAdapter();
  if (!adapter) return null;

  const validation = adapter.validate();

  return {
    adapter: adapter.id,
    version: adapter.version,
    healthy: validation.healthy,
    supported: true,
    selectors: {
      composer: validation.reason !== 'composer_not_found',
      messages: validation.reason !== 'message_container_not_found',
    },
  };
}
