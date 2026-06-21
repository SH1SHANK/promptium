// Barrel file for templates feature
export * from './template-form';
export * from './template-list';
export * from './template-preview';

import * as form from './template-form';

const TemplateFill = {
  showFillForm: form.showFillForm,
  isOpen: () => {
    const panel = document.getElementById('pn-template-fill-panel');
    return panel ? !panel.classList.contains('pn-hidden') : false;
  },
};

const PromptForm = {
  open: form.open,
  close: form.close,
  openForEdit: () => {},
  openPlainPrefilled: () => {},
  saveFromModal: () => {},
  saveDuplicateAnyway: () => {},
  prefillSuggestedTags: () => Promise.resolve(),
  showImproveInlineError: () => {},
  clearImproveInlineErrors: () => {},
  bindEvents: form.bindEvents,
  setCallbacks: form.setCallbacks,
  setMode: () => {},
  updateDetectedVars: () => {},
};

if (typeof window !== 'undefined') {
  (window as any).TemplateFill = TemplateFill;
  (window as any).PromptForm = PromptForm;
}

export { TemplateFill, PromptForm };
