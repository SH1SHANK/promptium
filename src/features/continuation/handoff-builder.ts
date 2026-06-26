import { getGeminiApiKey, callGemini } from '../../services/gemini-service';
import { getItems } from '../vault/store';

const CONTINUATION_WORD_LIMIT = 300;
const BYPASS_TURN_THRESHOLD = 4;

export const normalizeRole = (role?: string): string => {
  const value = String(role || '')
    .trim()
    .toLowerCase();
  if (['user', 'you', 'human'].includes(value)) return 'Human';
  if (['assistant', 'model', 'bot', 'ai'].includes(value)) return 'Assistant';
  return value.includes('user') ? 'Human' : 'Assistant';
};

export const cleanContinuationText = (text: string): string => {
  let cleaned = String(text || '').trim();
  // 1. Remove leaked thinking blocks
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/\[Thinking\][\s\S]*?\[\/Thinking\]/gi, '');
  // 2. Clean excess whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/ {2,}/g, ' ');
  return cleaned.trim();
};

export const buildDeterministicHandoff = (messages: any[]): string => {
  const logLines = messages.map((m) => {
    const role = normalizeRole(m.role || m.author);
    const content = cleanContinuationText(m.text || m.content || '');
    return `${role}: ${content}`;
  });
  return [
    'We were working on this conversation and need to continue in this new chat.',
    '',
    ...logLines,
    '',
    'Continue from here:',
  ].join('\n');
};

export const detectIntent = (text: string): 'coding' | 'writing' | 'general' => {
  const normalized = text.toLowerCase();
  const codingIndicators = [
    'function',
    'const',
    'import',
    'class',
    'def ',
    'fn ',
    'rust',
    'compile',
    'debug',
    'git',
  ];
  const writingIndicators = [
    'essay',
    'paraphrase',
    'rewrite',
    'summary',
    'tone',
    'grammar',
    'article',
    'draft',
  ];
  if (codingIndicators.some((ind) => normalized.includes(ind))) return 'coding';
  if (writingIndicators.some((ind) => normalized.includes(ind))) return 'writing';
  return 'general';
};

export const constructPrompt = (
  messages: any[],
  vaultContext: string,
  clippingsContext: string,
  intent: string
): string => {
  const formattedTranscript = messages
    .map((m) => {
      const role = normalizeRole(m.role || m.author);
      const content = cleanContinuationText(m.text || m.content || '');
      return `${role}: ${content}`;
    })
    .join('\n\n');

  let styleNotes = 'Summarize the handoff context clearly.';
  if (intent === 'coding') {
    styleNotes =
      'Optimize for software engineering. Highlight patterns, active code blocks, and system constraints.';
  } else if (intent === 'writing') {
    styleNotes =
      'Optimize for narrative composition. Focus on style directions, formatting choices, and character context.';
  }

  const sections = [
    'You are helping a user continue a conversation in a new chat window.',
    clippingsContext ? `<relevant_clippings>\n${clippingsContext}\n</relevant_clippings>` : '',
    vaultContext ? `<vault_knowledge>\n${vaultContext}\n</vault_knowledge>` : '',
    `<conversation_summary_source>\n${formattedTranscript}\n</conversation_summary_source>`,
    styleNotes,
    'Do not prefix with introductory remarks. Summarize the handoff context clearly.',
  ];

  return sections.filter(Boolean).join('\n\n');
};

export const generateContinuationHandoff = async (
  messages: any[],
  userNote = '',
  key = ''
): Promise<{ ok: boolean; text: string; mode: string }> => {
  const normalizedMessages = messages.filter(
    (m) => String(m.text || m.content || '').trim().length > 0
  );
  if (!normalizedMessages.length) {
    return { ok: false, text: 'No conversation turns available.', mode: 'error' };
  }

  // 1. Bypass check for short conversations
  if (normalizedMessages.length < BYPASS_TURN_THRESHOLD) {
    return { ok: true, text: buildDeterministicHandoff(normalizedMessages), mode: 'bypass' };
  }

  const apiKey = String(key || (await getGeminiApiKey()) || '').trim();
  if (!apiKey) {
    return { ok: true, text: buildDeterministicHandoff(normalizedMessages), mode: 'fallback' };
  }

  try {
    // 2. Intent Detection
    const lastTurnText = String(normalizedMessages[normalizedMessages.length - 1]?.text || '');
    const intent = detectIntent(lastTurnText);

    // 3. Vault Integration
    const vaultItems = getItems().filter((item) => item.enabled);
    const vaultContext = vaultItems.map((v) => `[${v.title}]: ${v.content}`).join('\n');

    // 4. Ingest active clippings
    let clippingsContext = '';
    try {
      const snap = await chrome.storage.local.get(['clippings']);
      const clippings = Array.isArray(snap.clippings) ? snap.clippings : [];
      clippingsContext = clippings
        .map((c: any) => `- Highlight: "${c.selectedText}"\n  Note: ${c.note || 'None'}`)
        .join('\n');
    } catch (_) {}

    const systemPrompt = 'Generate a summary for a continuation handoff.';
    const finalPrompt = constructPrompt(normalizedMessages, vaultContext, clippingsContext, intent);

    const result = await callGemini(systemPrompt, finalPrompt, 'gemini-2.0-flash', apiKey);
    if (!result) {
      return { ok: true, text: buildDeterministicHandoff(normalizedMessages), mode: 'fallback' };
    }

    const words = result.trim().split(/\s+/);
    const limitedText =
      words.length > CONTINUATION_WORD_LIMIT
        ? words.slice(0, CONTINUATION_WORD_LIMIT).join(' ') + '…'
        : result.trim();

    return { ok: true, text: limitedText, mode: 'cloud' };
  } catch (error) {
    return { ok: true, text: buildDeterministicHandoff(normalizedMessages), mode: 'fallback' };
  }
};
