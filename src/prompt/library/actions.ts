import { fill } from '../variables/index';

export const callbacks = {
  onOpenImprove: null as
    | ((promptId: string | null, text: string, tags: string[], options?: any) => void)
    | null,
  onPromptsMutated: null as (() => void) | null,
};

export const setCallbacks = (nextCallbacks: any = {}): void => {
  callbacks.onOpenImprove = nextCallbacks.onOpenImprove || null;
  callbacks.onPromptsMutated = nextCallbacks.onPromptsMutated || null;
};

export const doInject = async (
  textToInject: string,
  injectedAsIs = false,
  button: HTMLButtonElement | null = null
): Promise<void> => {
  if (button) {
    button.classList.add('pn-loading-state');
    button.disabled = true;
  }
  try {
    const response = await (chrome.tabs
      ? chrome.runtime.sendMessage({
          action: 'injectPrompt',
          text: textToInject,
        })
      : Promise.resolve({ ok: true }));

    if (!response?.ok) {
      console.error(response?.error || 'Inject failed.');
      return;
    }
  } finally {
    if (button) {
      button.classList.remove('pn-loading-state');
      button.disabled = false;
    }
  }
};
