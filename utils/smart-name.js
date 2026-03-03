(() => {
/**
 * File: utils/smart-name.js
 * Purpose: Human-readable filename generation from conversation content.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'i', 'you',
  'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'my', 'your',
  'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those', 'what',
  'how', 'why', 'when', 'where', 'can', 'could', 'would', 'should', 'do',
  'does', 'did', 'will', 'have', 'has', 'had', 'just', 'also', 'like', 'so',
  'if', 'then', 'than', 'about', 'please', 'help', 'explain', 'write', 'create',
  'make', 'give'
]);

const normalizeRole = (role) => {
  const value = String(role || '').trim().toLowerCase();
  if (['you', 'user', 'human'].includes(value)) return 'user';
  return value;
};

const firstUserMessageText = (messages) => {
  if (!Array.isArray(messages)) return '';
  const row = messages.find((message) => normalizeRole(message?.role) === 'user' && String(message?.text || '').trim());
  return String(row?.text || '').trim();
};

const slugFromText = (text) => {
  const normalized = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return '';
  }

  const words = normalized
    .split(' ')
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .slice(0, 6);

  if (!words.length) {
    return '';
  }

  return words.join('-').slice(0, 64).replace(/-+/g, '-').replace(/^-|-$/g, '');
};

const fallbackName = (platform) => {
  const safePlatform = String(platform || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'unknown';
  const date = new Date().toISOString().slice(0, 10);
  return `${safePlatform}-${date}`;
};

const generateName = (messages, platform, fallbackMessages = []) => {
  const selectedFirst = firstUserMessageText(messages);
  const selectedSlug = slugFromText(selectedFirst);
  if (selectedSlug) {
    return selectedSlug;
  }

  const fallbackFirst = firstUserMessageText(fallbackMessages);
  const fallbackSlug = slugFromText(fallbackFirst);
  if (fallbackSlug) {
    return fallbackSlug;
  }

  return fallbackName(platform);
};

const normalizeExtension = (formatOrExtension) => {
  const raw = String(formatOrExtension || '').trim().toLowerCase();
  if (!raw) return 'md';
  if (raw === 'markdown') return 'md';
  if (raw === 'text') return 'txt';
  if (raw === 'notion' || raw === 'obsidian') return 'md';
  return raw.replace(/^\./, '');
};

const getFilename = (messages, platform, formatOrExtension = 'md', fallbackMessages = []) => {
  const base = generateName(messages, platform, fallbackMessages);
  const extension = normalizeExtension(formatOrExtension);
  return `${base}.${extension}`;
};

const SmartName = {
  generateName,
  getFilename
};

if (typeof window !== 'undefined') {
  window.SmartName = SmartName;
}
})();
