import {
  Conversation,
  PlatformCapabilities,
  ValidationFailureReason,
  MessageElement,
} from './types';

export interface PlatformAdapter {
  readonly id: string;
  readonly version: string;
  readonly hosts: string[];

  detect(hostname: string): boolean;

  getConversation(): Promise<Conversation>;

  focusComposer(): Promise<void>;

  injectPrompt(prompt: string): Promise<void>;

  getSelectedText(): string;

  getCurrentUrl(): string;

  getCapabilities(): PlatformCapabilities;

  validate(): { healthy: boolean; reason?: ValidationFailureReason };

  getMessageElements(): Promise<MessageElement[]>;

  getComposerElement(): HTMLElement | null;

  isComposerFocused(): boolean;
  getComposerText(): string;
  setComposerText(text: string): Promise<void>;
  getSelection(): string;
  isAssistantMessage(node: HTMLElement): boolean;
  isUserMessage(node: HTMLElement): boolean;
  supportsSelection(): boolean;
}
