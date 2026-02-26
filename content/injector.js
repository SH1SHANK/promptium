/**
 * File: content/injector.js
 * Purpose: Injects prompt text into platform-specific chat composers.
 * Communicates with: utils/platform.js, content/content.js, popup/popup.js.
 */

const reactPlatforms = ['chatgpt'];

/** Dispatches an input event that host editors use to sync model state. */
const dispatchInput = async (element) => {
  if (!element || typeof element.dispatchEvent !== 'function') {
    return;
  }

  element.dispatchEvent(new Event('input', { bubbles: true }));
};

/** Sets a React-managed textarea value through the native setter API. */
const injectIntoReactTextarea = async (textarea, text) => {
  if (!(textarea instanceof HTMLTextAreaElement)) {
    return false;
  }

  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');

  if (descriptor && typeof descriptor.set === 'function') {
    descriptor.set.call(textarea, text);
  } else {
    textarea.value = text;
  }

  await dispatchInput(textarea);
  return true;
};

/** Uses legacy execCommand editing flow for contenteditable chat composers. */
const injectIntoEditable = async (editable, text) => {
  if (!editable || editable.getAttribute('contenteditable') !== 'true') {
    return false;
  }

  editable.focus();
  document.execCommand('selectAll');
  document.execCommand('insertText', false, text);
  await dispatchInput(editable);
  return true;
};

/** Uses direct value assignment for plain textareas outside React control. */
const injectIntoPlainTextarea = async (textarea, text) => {
  if (!(textarea instanceof HTMLTextAreaElement)) {
    return false;
  }

  textarea.focus();
  textarea.value = text;
  await dispatchInput(textarea);
  return true;
};

/** Injects text into the active platform input and reports whether it succeeded. */
const inject = async (text, platform = null) => {
  try {
    const resolvedPlatform = platform || (await window.Platform.detect());
    const sel = await window.Platform.getSelectors(resolvedPlatform);

    if (!resolvedPlatform || !sel || !sel.input || typeof sel.input !== 'string') {
      return false;
    }

    let input = null;

    try {
      input = document.querySelector(sel.input);
    } catch (_error) {
      input = null;
    }

    if (!input) {
      return false;
    }

    if (reactPlatforms.includes(resolvedPlatform)) {
      return injectIntoReactTextarea(input, text);
    }

    if (input.getAttribute('contenteditable') === 'true') {
      return injectIntoEditable(input, text);
    }

    if (input instanceof HTMLTextAreaElement) {
      return injectIntoPlainTextarea(input, text);
    }

    return false;
  } catch (error) {
    console.error('[PromptNest][Injector] Failed to inject prompt.', error);
    return false;
  }
};

const Injector = {
  inject
};

if (typeof window !== 'undefined') {
  window.Injector = Injector;
}
