export const SELECTORS = {
  userMsg: '[data-message-author-role="user"], .text-message[data-message-author-role="user"]',
  botMsg: '[data-message-author-role="assistant"], .text-message[data-message-author-role="assistant"]',
  input: '#prompt-textarea, div[contenteditable="true"][data-id], div[contenteditable="true"].ProseMirror',
  inputParent: 'div.relative.flex, form',
};
