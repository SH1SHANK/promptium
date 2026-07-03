import { PlatformAdapter } from '../base/adapter';

export function validateAdapter(adapter: PlatformAdapter): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!adapter.id || typeof adapter.id !== 'string') {
    errors.push('id is missing or not a string');
  }
  if (!adapter.version || typeof adapter.version !== 'string') {
    errors.push('version is missing or not a string');
  }
  if (!Array.isArray(adapter.hosts)) {
    errors.push('hosts must be an array of strings');
  }

  const expectedMethods: (keyof PlatformAdapter)[] = [
    'detect',
    'getConversation',
    'focusComposer',
    'injectPrompt',
    'getSelectedText',
    'getCurrentUrl',
    'getCapabilities',
    'validate',
    'getMessageElements',
    'getComposerElement',
  ];

  for (const method of expectedMethods) {
    if (typeof adapter[method] !== 'function') {
      errors.push(`Method ${method} is not implemented or not a function`);
    }
  }

  try {
    const caps = adapter.getCapabilities();
    if (!caps || typeof caps !== 'object') {
      errors.push('getCapabilities() must return a capabilities object');
    } else {
      const keys = [
        'conversationExtraction',
        'promptInjection',
        'textSelection',
        'reasoningExtraction',
        'markdownSupport',
      ];
      for (const key of keys) {
        if (typeof (caps as any)[key] !== 'boolean') {
          errors.push(`Capability ${key} is missing or not a boolean`);
        }
      }
    }
  } catch (e) {
    errors.push(`Failed to invoke getCapabilities(): ${String(e)}`);
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
