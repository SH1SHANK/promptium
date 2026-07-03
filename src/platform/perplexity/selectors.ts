export const SELECTORS = {
  userMsg:
    '[data-message-author-role="user"], div[data-testid*="user"], div.break-words.font-display',
  botMsg:
    '[data-message-author-role="assistant"], div.prose.dark\\:prose-invert, div[data-testid*="assistant"], div.mb-md .prose',
  input: '#ask-input, textarea[placeholder], div[contenteditable="true"][role="textbox"]',
  inputParent: 'form, div.grow, div:has(> #ask-input)',
};
