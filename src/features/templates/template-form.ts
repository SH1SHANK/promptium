// File: src/features/templates/template-form.ts
import { state } from '../../sidepanel/state';
import { parse as parseVars, fill, toDisplayLabel } from '../../lib/variables';

const callbacks = {
  onPromptSaved: null as (() => void) | null,
  onOpenImprove: null as (() => void) | null,
};

let activeMode = 'selector';
let editingPromptId: number | null = null;
const textareaMinHeights = new Map<string, number>();

const byIdSafe = (id: string): HTMLElement | null => document.getElementById(id);

const updateCounter = (counterId: string, inputId: string): void => {
  const counter = byIdSafe(counterId);
  const input = byIdSafe(inputId) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!counter || !input) return;

  const value = String(input.value || '');
  const max = Number(input.getAttribute('maxlength') || 0);
  counter.textContent = max > 0 ? `${value.length}/${max}` : String(value.length);
};

const autoGrowTextarea = (textareaId: string): void => {
  const textarea = byIdSafe(textareaId) as HTMLTextAreaElement | null;
  if (!textarea) return;

  if (!textareaMinHeights.has(textareaId)) {
    textareaMinHeights.set(textareaId, textarea.offsetHeight || 0);
  }

  textarea.style.height = 'auto';
  const minHeight = textareaMinHeights.get(textareaId) || 0;
  const nextHeight = Math.max(minHeight, textarea.scrollHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = nextHeight > 420 ? 'auto' : 'hidden';
};

export const syncFormMetrics = (): void => {
  updateCounter('pn-count-prompt-title', 'prompt-title');
  updateCounter('pn-count-prompt-text', 'prompt-text');
  updateCounter('pn-count-template-title', 'pn-template-title');
  updateCounter('pn-count-template-text', 'pn-template-text');
  autoGrowTextarea('prompt-text');
  autoGrowTextarea('pn-template-text');
};

export const open = (): void => {
  const modal = byIdSafe('pn-add-modal');
  if (modal) modal.classList.remove('pn-hidden');
};

export const close = (): void => {
  const modal = byIdSafe('pn-add-modal');
  if (modal) modal.classList.add('pn-hidden');
};

export const setCallbacks = (nextCallbacks: any = {}): void => {
  callbacks.onPromptSaved = nextCallbacks.onPromptSaved || null;
  callbacks.onOpenImprove = nextCallbacks.onOpenImprove || null;
};

export const bindEvents = (): void => {
  const closeBtn = byIdSafe('cancel-modal');
  if (closeBtn) {
    closeBtn.addEventListener('click', close);
  }
};

export const showFillForm = (
  prompt: { title: string; text: string; id?: number },
  onInject: (val: string) => void,
  onCancel?: () => void
): void => {
  const variables = parseVars(prompt.text);
  if (!variables.length) {
    onInject(prompt.text);
    return;
  }

  const panel = document.getElementById('pn-template-fill-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="pn-fill-header">
      <div class="pn-form-header">
        <button class="pn-back-btn" id="pn-fill-back" type="button">← Back</button>
        <span class="pn-form-title">${prompt.title}</span>
      </div>
    </div>
    <div class="pn-fill-preview-wrap">
      <span class="pn-fill-preview-label">Preview</span>
      <div class="pn-fill-preview" id="pn-template-fill-preview"></div>
    </div>
    <div class="pn-fill-fields">
      ${variables
        .map(
          (variable, idx) => `
        <label class="pn-fill-field" for="pn-fill-input-${idx}">
          <span class="pn-fill-label">${toDisplayLabel(variable)}</span>
          <input
            id="pn-fill-input-${idx}"
            type="text"
            class="pn-fill-input"
            data-label="${variable.label.toLowerCase()}"
            data-required="${variable.required ? 'true' : 'false'}"
            placeholder="${variable.required ? 'Required' : 'Optional'}"
            autocomplete="off"
          />
        </label>
      `
        )
        .join('')}
    </div>
    <div class="pn-fill-actions">
      <button class="pn-fill-cancel" id="pn-fill-cancel" type="button">Cancel</button>
      <button class="pn-fill-inject" id="pn-fill-inject" type="button" disabled>Inject</button>
    </div>
  `;

  panel.classList.remove('pn-hidden');

  const closePanel = () => {
    panel.innerHTML = '';
    panel.classList.add('pn-hidden');
  };

  panel.querySelector('#pn-fill-back')?.addEventListener('click', () => {
    closePanel();
    if (onCancel) onCancel();
  });

  panel.querySelector('#pn-fill-cancel')?.addEventListener('click', () => {
    closePanel();
    if (onCancel) onCancel();
  });

  const inputs = panel.querySelectorAll('.pn-fill-input') as NodeListOf<HTMLInputElement>;
  const injectButton = panel.querySelector('#pn-fill-inject') as HTMLButtonElement;

  const updatePreview = () => {
    const vals: Record<string, string> = {};
    let missingRequired = false;

    inputs.forEach((input) => {
      const label = input.getAttribute('data-label') || '';
      vals[label] = input.value;
      if (input.getAttribute('data-required') === 'true' && !input.value.trim()) {
        missingRequired = true;
      }
    });

    const preview = panel.querySelector('#pn-template-fill-preview');
    if (preview) {
      preview.textContent = fill(prompt.text, vals);
    }
    injectButton.disabled = missingRequired;
  };

  inputs.forEach((input) => {
    input.addEventListener('input', updatePreview);
  });

  injectButton.addEventListener('click', () => {
    const vals: Record<string, string> = {};
    inputs.forEach((input) => {
      const label = input.getAttribute('data-label') || '';
      vals[label] = input.value;
    });
    closePanel();
    onInject(fill(prompt.text, vals));
  });

  updatePreview();
};
