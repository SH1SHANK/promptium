/**
 * File: content/injector.js
 * Purpose: Injects prompt text into supported platform input controls.
 * Communicates with: popup/popup.js, content/content.js, utils/platform.js.
 */

/** Dispatches common input events to trigger host app listeners. */
const dispatchInputEvents = async (element) => {
  element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
};

/** Injects prompt text into a ChatGPT textarea and updates React-backed value. */
const injectIntoTextarea = async (element, text) => {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

  if (descriptor && typeof descriptor.set === 'function') {
    descriptor.set.call(element, text);
  } else {
    element.value = text;
  }

  await dispatchInputEvents(element);
};

/** Injects prompt text into a contenteditable editor used by Claude. */
const injectIntoEditable = async (element, text) => {
  element.focus();
  element.textContent = text;
  await dispatchInputEvents(element);
};

/** Injects text into the active platform's composer input. */
const inject = async (text) => {
  const platform = await window.PromptNestPlatform.detect();
  const selectors = await window.PromptNestPlatform.getSelectors(platform);

  if (!platform || !selectors) {
    return false;
  }

  const input = document.querySelector(selectors.input);

  if (!input) {
    return false;
  }

  if (platform === 'chatgpt' && input.tagName.toLowerCase() === 'textarea') {
    await injectIntoTextarea(input, text);
    return true;
  }

  if (platform === 'claude' && input.getAttribute('contenteditable') === 'true') {
    await injectIntoEditable(input, text);
    return true;
  }

  return false;
};

const Injector = {
  inject
};

if (typeof window !== 'undefined') {
  window.PromptNestInjector = Injector;
}
