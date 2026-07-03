// File: src/lib/variables/variable-resolver.ts
import { TemplateVariable } from './variable-types';
import { normalizeLegacy } from './variable-parser';

const BRACKET_VAR_REGEX = /\[([^\[\]]+?)\]/g;

export const fill = (text: string, values: Record<string, string> = {}): string => {
  const source = normalizeLegacy(text);
  const normalizedValues: Record<string, string> = {};

  Object.entries(values || {}).forEach(([key, value]) => {
    normalizedValues[String(key || '').toLowerCase()] = String(value || '').trim();
  });

  const filled = source.replace(BRACKET_VAR_REGEX, (match, inner, offset, full) => {
    if (full[offset - 1] === '[' || full[offset + match.length] === ']') return match;

    const token = String(inner || '').trim();
    if (!token || token.startsWith('?')) return match;

    const optional = token.endsWith('?');
    const label = optional ? token.slice(0, -1).trim() : token;
    if (!label) return match;

    const value = normalizedValues[label.toLowerCase()];
    if (value) return value;
    if (optional) return '';
    return `[${label}]`;
  });

  return filled
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s+\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const toDisplayLabel = (variable: TemplateVariable): string => {
  const raw = String(variable?.label || '').trim();
  if (!raw) return '';
  const first = raw.charAt(0).toUpperCase() + raw.slice(1);
  return variable?.required ? first : `${first} (optional)`;
};
