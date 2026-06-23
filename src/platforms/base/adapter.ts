import { Conversation, PlatformCapabilities, ValidationFailureReason, MessageElement } from './types';

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
}
