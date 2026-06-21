export * from './continuation-view';
export * from './continuation-generator';
export * from './continuation-targets';
export * from './continuation-dialogs';

import * as view from './continuation-view';
import * as generator from './continuation-generator';
import * as targets from './continuation-targets';
import * as dialogs from './continuation-dialogs';

const ContinuationUI = {
  openFromPayload: () => {},
  openFromActiveTab: () => {},
  openFromExportSelection: () => {},
  refreshTargets: view.renderTargetGrid,
  bindEvents: () => {},
  runContinuation: generator.quickContinue,
};

if (typeof window !== 'undefined') {
  (window as any).ContinuationUI = ContinuationUI;
}

export { ContinuationUI };
