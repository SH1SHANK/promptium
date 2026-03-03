(() => {
/**
 * File: sidepanel/template-fill.js
 * Purpose: Variable extraction and fill-in workflow for prompt templates.
 */

const PANEL_ID = 'pn-template-fill-panel';
const FORM_ID = 'pn-template-fill-form';
const PREVIEW_ID = 'pn-template-fill-preview';
const ERROR_ID = 'pn-template-fill-error';
let previousSmartHidden = true;
let previousBridgeHidden = true;

const escapeHtml = (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const parseVariables = (text) => {
  const source = String(text || '');
  const matches = Array.from(source.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g));
  const out = [];
  const seen = new Set();

  for (const match of matches) {
    const raw = String(match?.[1] || '').trim();
    if (!raw) continue;
    const optional = raw.endsWith('?');
    const name = optional ? raw.slice(0, -1).trim() : raw;
    if (!name) continue;

    const key = `${name}::${optional ? '1' : '0'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, optional });
  }

  return out;
};

const hasVariables = (text) => parseVariables(text).length > 0;

const fillTemplate = (text, values = {}) => String(text || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (full, rawName) => {
  const raw = String(rawName || '').trim();
  const optional = raw.endsWith('?');
  const name = optional ? raw.slice(0, -1).trim() : raw;

  if (!name) return full;

  const value = values[name];
  if (value === undefined || value === null) {
    return optional ? '' : full;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return optional ? '' : full;
  }

  return trimmed;
});

const collectValues = (container) => {
  const values = {};
  container.querySelectorAll('.pn-fill-input').forEach((input) => {
    values[input.dataset.varName] = String(input.value || '').trim();
  });
  return values;
};

const hasMissingRequired = (container) => {
  const required = Array.from(container.querySelectorAll('.pn-fill-input[data-optional="0"]'));
  return required.some((input) => !String(input.value || '').trim());
};

const setPromptListVisibility = (visible) => {
  const list = document.getElementById('prompt-list');
  const smart = document.getElementById('pn-smart-strip');
  const bridge = document.getElementById('pn-bridge-strip');
  const panel = document.getElementById(PANEL_ID);

  if (list) list.classList.toggle('pn-hidden', !visible);
  if (smart) {
    if (!visible) {
      previousSmartHidden = smart.classList.contains('pn-hidden');
      smart.classList.add('pn-hidden');
    } else {
      smart.classList.toggle('pn-hidden', previousSmartHidden);
    }
  }
  if (bridge) {
    if (!visible) {
      previousBridgeHidden = bridge.classList.contains('pn-hidden');
      bridge.classList.add('pn-hidden');
    } else {
      bridge.classList.toggle('pn-hidden', previousBridgeHidden);
    }
  }
  if (panel) panel.classList.toggle('pn-hidden', visible);
};

const updatePreview = (promptText, container) => {
  const preview = container.querySelector(`#${PREVIEW_ID}`);
  const error = container.querySelector(`#${ERROR_ID}`);
  const injectButton = container.querySelector('.pn-fill-inject');

  if (!preview || !error || !injectButton) {
    return;
  }

  const values = collectValues(container);
  const filled = fillTemplate(promptText, values);
  const display = filled.length > 260 ? `${filled.slice(0, 260)}…` : filled;

  preview.textContent = display;

  const missing = hasMissingRequired(container);
  injectButton.disabled = missing;
  error.textContent = missing ? 'Fill all required variables to inject.' : '';
};

const showFillForm = (promptText, promptTitle, onInject, onCancel) => {
  const variables = parseVariables(promptText);

  if (!variables.length) {
    onInject(String(promptText || ''));
    return;
  }

  const panel = document.getElementById(PANEL_ID);
  if (!panel) {
    console.warn('[Promptium] Template fill panel is missing.');
    onInject(String(promptText || ''));
    return;
  }

  panel.innerHTML = `
    <div class="pn-fill-header">
      <span class="pn-fill-title">${escapeHtml(promptTitle || 'Template')}</span>
      <span class="pn-fill-subtitle">Use {{name}} for required and {{name?}} for optional values.</span>
    </div>

    <div class="pn-fill-preview" id="${PREVIEW_ID}">${escapeHtml(String(promptText || '').slice(0, 260))}</div>

    <form id="${FORM_ID}" class="pn-fill-fields" novalidate>
      ${variables.map((variable, index) => `
        <label class="pn-fill-field" for="pn-fill-input-${index}">
          <span class="pn-fill-label">${escapeHtml(variable.name)}${variable.optional ? ' (optional)' : ' *'}</span>
          <input
            id="pn-fill-input-${index}"
            type="text"
            class="pn-fill-input"
            data-var-name="${escapeHtml(variable.name)}"
            data-optional="${variable.optional ? '1' : '0'}"
            placeholder="Enter ${escapeHtml(variable.name)}"
            autocomplete="off"
          />
        </label>
      `).join('')}
    </form>

    <p id="${ERROR_ID}" class="pn-fill-error"></p>

    <div class="pn-fill-actions">
      <button class="pn-fill-cancel" type="button">Cancel</button>
      <button class="pn-fill-inject" type="button" disabled>Inject</button>
    </div>
  `;

  setPromptListVisibility(false);

  const form = panel.querySelector(`#${FORM_ID}`);
  const inputs = Array.from(panel.querySelectorAll('.pn-fill-input'));
  const cancelButton = panel.querySelector('.pn-fill-cancel');
  const injectButton = panel.querySelector('.pn-fill-inject');

  inputs.forEach((input) => {
    input.addEventListener('input', () => {
      updatePreview(promptText, panel);
    });
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (injectButton instanceof HTMLButtonElement) {
      injectButton.click();
    }
  });

  const lastInput = inputs[inputs.length - 1];
  lastInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (!hasMissingRequired(panel) && injectButton instanceof HTMLButtonElement) {
      injectButton.click();
    }
  });

  cancelButton?.addEventListener('click', () => {
    panel.innerHTML = '';
    setPromptListVisibility(true);
    if (typeof onCancel === 'function') onCancel();
  });

  injectButton?.addEventListener('click', () => {
    if (hasMissingRequired(panel)) {
      updatePreview(promptText, panel);
      return;
    }

    const values = collectValues(panel);
    const filled = fillTemplate(promptText, values);
    panel.innerHTML = '';
    setPromptListVisibility(true);
    if (typeof onInject === 'function') onInject(filled);
  });

  inputs[0]?.focus();
  updatePreview(promptText, panel);
};

const TemplateFill = {
  parseVariables,
  hasVariables,
  fillTemplate,
  showFillForm
};

if (typeof window !== 'undefined') {
  window.TemplateFill = TemplateFill;
}
})();
