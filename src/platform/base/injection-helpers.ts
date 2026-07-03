export async function dispatchInput(element: HTMLElement) {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export async function injectIntoReactTextarea(
  textarea: HTMLTextAreaElement,
  text: string
): Promise<boolean> {
  const proto = HTMLTextAreaElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');

  if (descriptor && typeof descriptor.set === 'function') {
    descriptor.set.call(textarea, text);
  } else {
    textarea.value = text;
  }

  await dispatchInput(textarea);
  textarea.classList.add('pn-injected-flash');
  setTimeout(() => textarea.classList.remove('pn-injected-flash'), 600);
  return true;
}

export async function injectIntoEditable(editable: HTMLElement, text: string): Promise<boolean> {
  editable.focus();
  // Allow a tick for React editors to initialize after focus
  await new Promise((r) => setTimeout(r, 50));

  let execSuccess = false;
  try {
    execSuccess =
      document.execCommand('selectAll') && document.execCommand('insertText', false, text);
  } catch {
    execSuccess = false;
  }

  if (!execSuccess || !editable.textContent?.trim()) {
    editable.textContent = text;
  }

  await dispatchInput(editable);
  editable.classList.add('pn-injected-flash');
  setTimeout(() => editable.classList.remove('pn-injected-flash'), 600);
  return true;
}

export async function injectIntoPlainTextarea(
  textarea: HTMLTextAreaElement,
  text: string
): Promise<boolean> {
  textarea.focus();
  textarea.value = text;
  await dispatchInput(textarea);
  textarea.classList.add('pn-injected-flash');
  setTimeout(() => textarea.classList.remove('pn-injected-flash'), 600);
  return true;
}
