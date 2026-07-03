// File: src/lib/variables/variables-manager.ts
import { VariableConfig } from '../types/types';

const DOUBLE_BRACE_REGEX = /\{\{\s*([a-zA-Z0-9_-]+?)\s*\}\}/g;

export const VariablesManager = {
  /**
   * Scans a prompt string for {{variable}} declarations and returns unique variable names.
   */
  detectVariables(text: string): string[] {
    const source = String(text || '');
    const vars: string[] = [];
    const seen = new Set<string>();
    DOUBLE_BRACE_REGEX.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = DOUBLE_BRACE_REGEX.exec(source)) !== null) {
      const name = String(match[1] || '').trim();
      if (!name) continue;
      const lower = name.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        vars.push(name);
      }
    }
    return vars;
  },

  /**
   * Syncs detected variable names against a list of existing variable configurations.
   * Preserves existing metadata configurations if the variable is still present.
   */
  syncConfigurations(detected: string[], currentConfigs: VariableConfig[]): VariableConfig[] {
    const existingMap = new Map<string, VariableConfig>();
    (currentConfigs || []).forEach((c) => {
      existingMap.set(c.name.toLowerCase(), c);
    });

    return detected.map((name) => {
      const lower = name.toLowerCase();
      const existing = existingMap.get(lower);
      if (existing) {
        return { ...existing, name }; // Keep configurations, update name casing if changed
      }
      // Return default config
      return {
        name,
        type: 'text',
        defaultValue: '',
        placeholder: `Enter ${name}...`,
        required: true,
        example: '',
        choices: [],
      };
    });
  },

  /**
   * Compiles template prompt replacing all {{variable}} instances with provided inputs.
   */
  compile(text: string, values: Record<string, string>, configs: VariableConfig[] = []): string {
    const source = String(text || '');
    const normalizedValues: Record<string, string> = {};

    // Load defaults first
    configs.forEach((c) => {
      if (c.defaultValue) {
        normalizedValues[c.name.toLowerCase()] = c.defaultValue;
      }
    });

    // Merge actual values
    Object.entries(values || {}).forEach(([key, val]) => {
      normalizedValues[String(key || '').toLowerCase()] = String(val);
    });

    return source.replace(DOUBLE_BRACE_REGEX, (match, inner) => {
      const name = String(inner || '')
        .trim()
        .toLowerCase();
      const val = normalizedValues[name];
      if (val !== undefined && val !== '') {
        return val;
      }
      // If optional config exists and value is empty, return empty string
      const config = configs.find((c) => c.name.toLowerCase() === name);
      if (config && !config.required) {
        return '';
      }
      return match; // Return {{var}} as-is if required and missing
    });
  },
};

if (typeof window !== 'undefined') {
  (window as any).VariablesManager = VariablesManager;
}
export default VariablesManager;
