(() => {
/**
 * File: utils/platform.js
 * Purpose: Defines platform-specific selectors and detection logic for supported LLM websites.
 * Communicates with: content/content.js, content/scraper.js, content/injector.js, content/toolbar.js, popup/popup.js.
 */

const SELECTORS = {
  chatgpt: {
    // Multiple fallback selectors as comma-separated CSS (querySelector picks the first match).
    // ChatGPT migrated from a plain <textarea> to a ProseMirror contenteditable in 2024-25.
    userMsg: '[data-message-author-role="user"], .text-message[data-message-author-role="user"]',
    botMsg: '[data-message-author-role="assistant"], .text-message[data-message-author-role="assistant"]',
    input: '#prompt-textarea, div[contenteditable="true"][data-id], div[contenteditable="true"].ProseMirror',
    inputParent: 'div.relative.flex, form'
  },
  claude: {
    userMsg: '[data-testid="user-message"], .human-turn, [data-is-human="true"]',
    botMsg: '[data-testid="assistant-message"], .assistant-turn, [data-is-assistant="true"]',
    input: 'div[contenteditable="true"]',
    inputParent: 'form, div:has(> div[contenteditable="true"])'
  },
  gemini: {
    userMsg: '.user-query-bubble-with-background, [data-turn-role="user"]',
    botMsg: '.model-response-text, [data-turn-role="model"]',
    input: 'div[contenteditable="true"].ql-editor, rich-textarea div[contenteditable="true"]',
    inputParent: 'div.input-area-container, form'
  },
  perplexity: {
    userMsg: '[data-message-author-role="user"], .break-words:not([class*="assistant"])',
    botMsg: '[data-message-author-role="assistant"]',
    input: 'textarea[placeholder]',
    inputParent: 'form, div.grow'
  },
  copilot: {
    userMsg: '[data-content="user-message"]',
    botMsg: '[data-content="ai-message"]',
    input: 'textarea#userInput, div[contenteditable="true"]',
    inputParent: 'form, div.input-container'
  },
  deepseek: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="model" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  qwen: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="qwen-user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="qwen-assistant" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="qwen" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  mistral: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="human" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="mistral" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="mistral" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  kimi: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="kimi-user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="kimi-assistant" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="kimi" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  moonshot: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="moonshot-user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="moonshot-assistant" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="moonshot" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  grok: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="grok-user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="grok-assistant" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="grok" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  huggingchat: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="human" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="model" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="huggingchat" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  poe: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="poe-user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="poe-assistant" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="poe" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  you: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="you-user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="you-assistant" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="you" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  phind: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="phind-user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="phind-assistant" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="phind" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  characterai: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="character-user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="character-assistant" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="character" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  pi: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="pi-user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="pi-assistant" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="pi" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  metaai: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="meta-user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="meta-assistant" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="meta" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  amazonq: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="amazonq-user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="amazonq-assistant" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="amazonq" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  ernie: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="ernie-user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="ernie-assistant" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="ernie" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  doubao: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="doubao-user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="doubao-assistant" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="doubao" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  yichat: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="yi-user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="yi-assistant" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="yi" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  coherecoral: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="coral-user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="coral-assistant" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="coral" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  groq: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="groq-user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="groq-assistant" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="groq" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  fireworks: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="fireworks-user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="fireworks-assistant" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="fireworks" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  },
  together: {
    userMsg: '[data-message-author-role="user"], [data-role="user"], [data-author-role="user"], [data-testid*="user" i], [data-testid*="together-user" i], [aria-label*="user" i][role="article"], article[aria-label*="user" i], [role="listitem"][aria-label*="user" i]',
    botMsg: '[data-message-author-role="assistant"], [data-role="assistant"], [data-role="bot"], [data-author-role="assistant"], [data-testid*="assistant" i], [data-testid*="bot" i], [data-testid*="together-assistant" i], [aria-label*="assistant" i][role="article"], [aria-label*="ai" i][role="article"], article[aria-label*="assistant" i], article[aria-label*="ai" i], [role="listitem"][aria-label*="assistant" i], [role="listitem"][aria-label*="ai" i]',
    input: 'textarea[placeholder], textarea[aria-label], textarea[data-testid], div[contenteditable="true"][role="textbox"], div[contenteditable="plaintext-only"][role="textbox"], div[contenteditable="true"][aria-label], div[contenteditable="plaintext-only"][aria-label], div[contenteditable="true"][data-testid], div[contenteditable="plaintext-only"][data-testid]',
    inputParent: 'form, [role="form"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="prompt" i], [data-testid*="together" i], div:has(> textarea), div:has(> div[contenteditable="true"]), div:has(> div[contenteditable="plaintext-only"])'
  }
};

const SETTINGS_KEY = 'promptiumSettings';

const slugify = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const matchWildcard = (pattern, value) => {
  const source = String(pattern || '').trim();
  const input = String(value || '').trim();
  if (!source || !input) return false;

  const escaped = source
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const re = new RegExp(`^${escaped}$`, 'i');
  return re.test(input);
};

const getSettingsSnapshot = async () => {
  try {
    const snapshot = await chrome.storage.local.get([SETTINGS_KEY]);
    return snapshot?.[SETTINGS_KEY] && typeof snapshot[SETTINGS_KEY] === 'object'
      ? snapshot[SETTINGS_KEY]
      : {};
  } catch (_error) {
    return {};
  }
};

const getCustomPlatformEntries = async () => {
  const settings = await getSettingsSnapshot();
  const custom = Array.isArray(settings?.customPlatforms) ? settings.customPlatforms : [];
  return custom
    .map((entry, index) => {
      const keyBase = slugify(entry?.name || `custom-${index + 1}`) || `custom-${index + 1}`;
      return {
        key: `custom:${keyBase}`,
        name: String(entry?.name || `Custom ${index + 1}`),
        urlPattern: String(entry?.urlPattern || '').trim(),
        selectors: {
          userMsg: String(entry?.userMsg || '').trim(),
          botMsg: String(entry?.botMsg || '').trim(),
          input: String(entry?.input || '').trim(),
          inputParent: String(entry?.inputParent || 'form, body').trim()
        }
      };
    })
    .filter((entry) => entry.urlPattern && entry.selectors.userMsg && entry.selectors.botMsg && entry.selectors.input);
};

const isEnabled = async (platform) => {
  const key = String(platform || '').trim().toLowerCase();
  if (!key) return false;
  const settings = await getSettingsSnapshot();
  const enabledPlatforms = settings?.enabledPlatforms && typeof settings.enabledPlatforms === 'object'
    ? settings.enabledPlatforms
    : {};

  if (Object.prototype.hasOwnProperty.call(enabledPlatforms, key)) {
    return Boolean(enabledPlatforms[key]);
  }
  return true;
};

/** Returns true when a selector config contains all required shape keys. */
const hasRequiredSelectors = async (config) => {
  if (!config) {
    return false;
  }

  const requiredKeys = ['userMsg', 'botMsg', 'input', 'inputParent'];
  return requiredKeys.every((key) => typeof config[key] === 'string' && config[key].trim().length > 0);
};

/** Detects the current platform from hostname and path, returning null when unsupported. */
const detectProvider = async () => {
  const host = window.location.hostname.toLowerCase();
  const path = String(window.location.pathname || '').toLowerCase();
  const href = String(window.location.href || '');

  if (host.includes('chatgpt.com')) {
    return (await isEnabled('chatgpt')) ? 'chatgpt' : null;
  }

  if (host.includes('claude.ai')) {
    return (await isEnabled('claude')) ? 'claude' : null;
  }

  if (host.includes('gemini.google.com')) {
    return (await isEnabled('gemini')) ? 'gemini' : null;
  }

  if (host.includes('perplexity.ai')) {
    return (await isEnabled('perplexity')) ? 'perplexity' : null;
  }

  if (host.includes('copilot.microsoft.com')) {
    return (await isEnabled('copilot')) ? 'copilot' : null;
  }

  if (host.includes('deepseek.com')) {
    return (await isEnabled('deepseek')) ? 'deepseek' : null;
  }

  if (
    host.includes('qwen.ai')
    || host.includes('qwenlm.ai')
    || host.includes('tongyi.aliyun.com')
    || host.includes('qianwen.aliyun.com')
  ) {
    return (await isEnabled('qwen')) ? 'qwen' : null;
  }

  if (host.includes('chat.mistral.ai') || host.includes('lechat.mistral.ai')) {
    return (await isEnabled('mistral')) ? 'mistral' : null;
  }

  if (host.includes('kimi.moonshot.cn')) {
    return (await isEnabled('kimi')) ? 'kimi' : null;
  }

  if (host.includes('moonshot.cn') || host.includes('moonshot.ai')) {
    return (await isEnabled('moonshot')) ? 'moonshot' : null;
  }

  const isGrokPath = path.includes('/i/grok') || path.startsWith('/grok');
  if (host.includes('grok.com') || ((host.includes('x.com') || host.includes('twitter.com')) && isGrokPath)) {
    return (await isEnabled('grok')) ? 'grok' : null;
  }

  if (host.includes('huggingchat.com') || (host.includes('huggingface.co') && path.startsWith('/chat'))) {
    return (await isEnabled('huggingchat')) ? 'huggingchat' : null;
  }

  if (host.includes('poe.com')) {
    return (await isEnabled('poe')) ? 'poe' : null;
  }

  if (host.includes('you.com') && (path.startsWith('/chat') || path.startsWith('/search'))) {
    return (await isEnabled('you')) ? 'you' : null;
  }

  if (host.includes('phind.com')) {
    return (await isEnabled('phind')) ? 'phind' : null;
  }

  if (host.includes('character.ai')) {
    return (await isEnabled('characterai')) ? 'characterai' : null;
  }

  if (host.includes('pi.ai')) {
    return (await isEnabled('pi')) ? 'pi' : null;
  }

  if (host.includes('meta.ai')) {
    return (await isEnabled('metaai')) ? 'metaai' : null;
  }

  if (host.includes('chat.console.aws.amazon.com')) {
    return (await isEnabled('amazonq')) ? 'amazonq' : null;
  }

  if (host.includes('yiyan.baidu.com') || host.includes('ernie.baidu.com')) {
    return (await isEnabled('ernie')) ? 'ernie' : null;
  }

  if (host.includes('doubao.com')) {
    return (await isEnabled('doubao')) ? 'doubao' : null;
  }

  if (host.includes('01.ai') && (path.startsWith('/chat') || path.startsWith('/app') || path.startsWith('/playground'))) {
    return (await isEnabled('yichat')) ? 'yichat' : null;
  }

  if (
    host.includes('coral.cohere.com')
    || (host.includes('cohere.com') && (path.includes('/coral') || path.includes('/chat')))
  ) {
    return (await isEnabled('coherecoral')) ? 'coherecoral' : null;
  }

  if (host.includes('chat.groq.com') || (host.includes('groq.com') && path.startsWith('/chat'))) {
    return (await isEnabled('groq')) ? 'groq' : null;
  }

  if (host.includes('fireworks.ai') && (path.includes('/chat') || path.includes('/playground'))) {
    return (await isEnabled('fireworks')) ? 'fireworks' : null;
  }

  if (host.includes('together.ai') && (path.includes('/chat') || path.includes('/playground'))) {
    return (await isEnabled('together')) ? 'together' : null;
  }

  const customEntries = await getCustomPlatformEntries();
  for (const entry of customEntries) {
    if (!matchWildcard(entry.urlPattern, href)) continue;
    if (!(await isEnabled(entry.key))) continue;
    return entry.key;
  }

  return null;
};

const detect = detectProvider;

/** Returns selector config for a supplied or detected platform. */
const getSelectors = async (platform = null) => {
  const resolvedPlatform = platform || (await detect());

  if (!resolvedPlatform) {
    return null;
  }

  if (resolvedPlatform.startsWith('custom:')) {
    const customEntries = await getCustomPlatformEntries();
    const match = customEntries.find((entry) => entry.key === resolvedPlatform);
    if (!match) return null;
    return (await hasRequiredSelectors(match.selectors)) ? match.selectors : null;
  }

  if (!SELECTORS[resolvedPlatform]) {
    return null;
  }

  const config = SELECTORS[resolvedPlatform];
  return (await hasRequiredSelectors(config)) ? config : null;
};

const Platform = {
  SELECTORS,
  detectProvider,
  detect,
  getSelectors,
  isEnabled,
  getCustomPlatformEntries
};

if (typeof window !== 'undefined') {
  Object.assign(window, Platform);
  window.Platform = Platform;
}

})();
