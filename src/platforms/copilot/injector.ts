import { SELECTORS } from './selectors';
import { injectIntoEditable, injectIntoReactTextarea } from '../base/injection-helpers';

export async function injectPrompt(prompt: string): Promise<void> {
  const input = document.querySelector<HTMLElement>(SELECTORS.input);
  if (!input) throw new Error('Composer input not found');

  const isEditable =
    input.getAttribute('contenteditable') === 'true' ||
    input.getAttribute('contenteditable') === 'plaintext-only';

  if (isEditable) {
    await injectIntoEditable(input, prompt);
    return;
  }

  if (input instanceof HTMLTextAreaElement) {
    await injectIntoReactTextarea(input, prompt);
    return;
  }

  throw new Error('Unsupported composer element type');
}

export async function focusComposer(): Promise<void> {
  const input = document.querySelector<HTMLElement>(SELECTORS.input);
  if (input) {
    input.focus();
  }
}
