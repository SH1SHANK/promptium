export const SELECTORS = {
  userMsg: '[data-testid="user-message"], .human-turn, [data-is-human="true"]',
  botMsg: '[data-testid="assistant-message"], .assistant-turn, [data-is-assistant="true"]',
  input: 'div[contenteditable="true"]',
  inputParent: 'form, div:has(> div[contenteditable="true"])',
};
