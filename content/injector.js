(() => {
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

/** Sets a React-managed input value through the native setter API. */
const injectIntoReactTextarea = async (textarea, text) => {
  if (!textarea) {
    return false;
  }

  const proto = textarea instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : Element.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');

  if (descriptor && typeof descriptor.set === 'function') {
    descriptor.set.call(textarea, text);
  } else if (textarea.hasAttribute('contenteditable')) {
    textarea.textContent = text;
  } else {
    textarea.value = text;
  }

  await dispatchInput(textarea);
  textarea.classList.add('pn-injected-flash');
  setTimeout(() => textarea.classList.remove('pn-injected-flash'), 600);
  return true;
};

/** Uses legacy execCommand editing flow for contenteditable chat composers. */
const injectIntoEditable = async (editable, text) => {
  const isEditable = editable && (editable.getAttribute('contenteditable') === 'true' || editable.getAttribute('contenteditable') === 'plaintext-only');
  if (!isEditable) {
    return false;
  }

  editable.focus();
  document.execCommand('selectAll');
  document.execCommand('insertText', false, text);
  await dispatchInput(editable);
  editable.classList.add('pn-injected-flash');
  setTimeout(() => editable.classList.remove('pn-injected-flash'), 600);
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
  textarea.classList.add('pn-injected-flash');
  setTimeout(() => textarea.classList.remove('pn-injected-flash'), 600);
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

    // For React platforms, sometimes they still use a normal contenteditable but have React state tied to it.
    // So we'll try the normal contenteditable flow first for modern ChatGPT if it's not a textarea.
    const isEditable = input.getAttribute('contenteditable') === 'true' || input.getAttribute('contenteditable') === 'plaintext-only';

    if (isEditable) {
      if (reactPlatforms.includes(resolvedPlatform)) {
         // ChatGPT requires both inner content setting AND input events
         input.focus();
         document.execCommand('selectAll');
         document.execCommand('insertText', false, text);
         await dispatchInput(input);
         input.classList.add('pn-injected-flash');
         setTimeout(() => input.classList.remove('pn-injected-flash'), 600);
         return true;
      }
      return injectIntoEditable(input, text);
    }

    if (reactPlatforms.includes(resolvedPlatform) && input instanceof HTMLTextAreaElement) {
      return injectIntoReactTextarea(input, text);
    }

    if (input instanceof HTMLTextAreaElement) {
      return injectIntoPlainTextarea(input, text);
    }

    return false;
  } catch (error) {
    console.error('[Promptium][Injector] Failed to inject prompt.', error);
    return false;
  }
};

const Injector = {
  inject
};

if (typeof window !== 'undefined') {
  window.Injector = Injector;
}

})();
