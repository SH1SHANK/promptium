export interface Message {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  html?: string;
}

export interface Conversation {
  messages: Message[];
}

export interface PlatformCapabilities {
  conversationExtraction: boolean;
  promptInjection: boolean;
  textSelection: boolean;
  reasoningExtraction: boolean;
  markdownSupport: boolean;
}

export type ValidationFailureReason =
  | 'composer_not_found'
  | 'message_container_not_found'
  | 'unsupported_layout'
  | 'dom_changed'
  | 'unknown';

export interface MessageElement {
  element: HTMLElement;
  role: 'user' | 'assistant';
}
