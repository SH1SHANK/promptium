(() => {
/**
 * File: utils/template-parser.js
 * Purpose: Parses and fills Promptium bracket variables with legacy curly-placeholder normalization.
 */

const BRACKET_VAR_REGEX = /\[([^\[\]]+?)\]/g;
const LEGACY_VAR_REGEX = /\{\{\s*([^{}]+?)\s*\}\}/g;

const normalizeLegacy = (text) => {
  const source = String(text || '');
  if (!source) return '';
  return source.replace(LEGACY_VAR_REGEX, (_match, inner) => {
    const label = String(inner || '').trim();
    if (!label) return _match;
    return `[${label}]`;
  });
};

const parse = (text) => {
  const source = normalizeLegacy(text);
  const vars = [];
  const seen = new Set();
  BRACKET_VAR_REGEX.lastIndex = 0;

  let match;
  while ((match = BRACKET_VAR_REGEX.exec(source)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (source[start - 1] === '[' || source[end] === ']') continue;

    const inner = String(match?.[1] || '').trim();
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
      raw: match[0]
    });
  }

  return vars;
};

const hasVariables = (text) => parse(text).length > 0;

const fill = (text, values = {}) => {
  const source = normalizeLegacy(text);
  const normalizedValues = {};

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

const toDisplayLabel = (variable) => {
  const raw = String(variable?.label || '').trim();
  if (!raw) return '';
  const first = raw.charAt(0).toUpperCase() + raw.slice(1);
  return variable?.required ? first : `${first} (optional)`;
};

const convertLegacyToBracket = (text) => normalizeLegacy(text);

const limitVariables = (text, max = 3) => {
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

const TemplateParser = {
  parse,
  hasVariables,
  fill,
  toDisplayLabel,
  convertLegacyToBracket,
  limitVariables,
  normalizeLegacy
};

if (typeof window !== 'undefined') {
  window.TemplateParser = TemplateParser;
}
})();
