export * from './refinement-dialog';
export * from './refinement-actions';
export * from './refinement-preview';

import * as dialog from './refinement-dialog';
import * as actions from './refinement-actions';

const ImproveUI = {
  normalizePayload: (p: any) => p,
  open: dialog.open,
  close: dialog.close,
  retry: actions.retry,
  accept: actions.accept,
  bindEvents: dialog.bindEvents,
  setCallbacks: dialog.setCallbacks,
};

if (typeof window !== 'undefined') {
  (window as any).ImproveUI = ImproveUI;
}

export { ImproveUI };
