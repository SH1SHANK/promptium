// File: src/lib/variables/variable-parser.ts
import { TemplateVariable } from './variable-types';

const BRACKET_VAR_REGEX = /\[([^\[\]]+?)\]/g;
const LEGACY_VAR_REGEX = /\{\{\s*([^{}]+?)\s*\}\}/g;

export const normalizeLegacy = (text: string): string => {
  const source = String(text || '');
  if (!source) return '';
  return source.replace(LEGACY_VAR_REGEX, (_match, inner) => {
    const label = String(inner || '').trim();
    if (!label) return _match;
    return `[${label}]`;
  });
};

export const parse = (text: string): TemplateVariable[] => {
  const source = normalizeLegacy(text);
  const vars: TemplateVariable[] = [];
  const seen = new Set<string>();
  BRACKET_VAR_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = BRACKET_VAR_REGEX.exec(source)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (source[start - 1] === '[' || source[end] === ']') continue;

    const inner = String(match[1] || '').trim();
    if (!inner || inner.startsWith('?')) continue;

    const optional = inner.endsWith('?');
    const label = optional ? inner.slice(0, -1).trim() : inner;
    if (!label || /^\?+$/.test(label)) continue;

    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    vars.push({
      label,
      required: !optional,
      raw: match[0],
    });
  }

  return vars;
};

export const hasVariables = (text: string): boolean => parse(text).length > 0;

export const convertLegacyToBracket = (text: string): string => normalizeLegacy(text);

export const limitVariables = (text: string, max = 3): string => {
  const source = normalizeLegacy(text);
  const limit = Number(max);
  if (!Number.isFinite(limit) || limit < 1) return source;

  let seen = 0;
  return source.replace(BRACKET_VAR_REGEX, (match, inner) => {
    const token = String(inner || '').trim();
    if (!token || token.startsWith('?')) return match;

    const optional = token.endsWith('?');
    const label = optional ? token.slice(0, -1).trim() : token;
    if (!label) return match;

    seen += 1;
    if (seen <= limit) return `[${label}${optional ? '?' : ''}]`;
    return `(${label}${optional ? ' optional' : ''})`;
  });
};
