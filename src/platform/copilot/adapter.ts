import { PlatformAdapter } from '../base/adapter';
import {
  Conversation,
  PlatformCapabilities,
  ValidationFailureReason,
  MessageElement,
} from '../base/types';
import { SELECTORS } from './selectors';
import { extractConversation } from './extractor';
import { injectPrompt, focusComposer } from './injector';
import { sortNodesByDomOrder } from '../base/helpers';

export class CopilotAdapter implements PlatformAdapter {
  readonly id = 'copilot';
  readonly version = '1.0';
  readonly hosts = ['copilot.microsoft.com'];

  detect(hostname: string): boolean {
    return this.hosts.some((host) => hostname.includes(host));
  }

  async getConversation(): Promise<Conversation> {
    return extractConversation();
  }

  async focusComposer(): Promise<void> {
    return focusComposer();
  }

  async injectPrompt(prompt: string): Promise<void> {
    return injectPrompt(prompt);
  }

  getSelectedText(): string {
    if (typeof window === 'undefined') return '';
    return window.getSelection()?.toString() || '';
  }

  getCurrentUrl(): string {
    if (typeof window === 'undefined') return '';
    return window.location.href;
  }

  getCapabilities(): PlatformCapabilities {
    return {
      conversationExtraction: true,
      promptInjection: true,
      textSelection: true,
      reasoningExtraction: true,
      markdownSupport: true,
    };
  }

  validate(): { healthy: boolean; reason?: ValidationFailureReason } {
    if (typeof document === 'undefined') {
      return { healthy: false, reason: 'unknown' };
    }
    const hasComposer = this.getComposerElement() !== null;
    if (!hasComposer) {
      return { healthy: false, reason: 'composer_not_found' };
    }
    const hasInputParent = document.querySelector(SELECTORS.inputParent) !== null;
    if (!hasInputParent) {
      return { healthy: false, reason: 'unsupported_layout' };
    }
    return { healthy: true };
  }

  async getMessageElements(): Promise<MessageElement[]> {
    if (typeof document === 'undefined') return [];
    const userNodes = Array.from(document.querySelectorAll<HTMLElement>(SELECTORS.userMsg));
    const botNodes = Array.from(document.querySelectorAll<HTMLElement>(SELECTORS.botMsg));

    const mergedMap = new Map<HTMLElement, 'user' | 'assistant'>();
    for (const node of userNodes) {
      mergedMap.set(node, 'user');
    }
    for (const node of botNodes) {
      if (!mergedMap.has(node)) {
        mergedMap.set(node, 'assistant');
      }
    }

    const sortedNodes = sortNodesByDomOrder(Array.from(mergedMap.keys()));
    return sortedNodes.map((node) => ({
      element: node,
      role: mergedMap.get(node)!,
    }));
  }

  getComposerElement(): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    return document.querySelector<HTMLElement>(SELECTORS.input);
  }

  isComposerFocused(): boolean {
    const composer = this.getComposerElement();
    return composer !== null && document.activeElement === composer;
  }

  getComposerText(): string {
    const composer = this.getComposerElement();
    if (!composer) return '';
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      return composer.value;
    }
    return composer.textContent || '';
  }

  async setComposerText(text: string): Promise<void> {
    const composer = this.getComposerElement();
    if (!composer) return;
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      composer.value = text;
      composer.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      composer.textContent = text;
      composer.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  getSelection(): string {
    return this.getSelectedText();
  }

  isAssistantMessage(node: HTMLElement): boolean {
    return node.matches(SELECTORS.botMsg) || node.closest(SELECTORS.botMsg) !== null;
  }

  isUserMessage(node: HTMLElement): boolean {
    return node.matches(SELECTORS.userMsg) || node.closest(SELECTORS.userMsg) !== null;
  }

  supportsSelection(): boolean {
    return true;
  }
}
