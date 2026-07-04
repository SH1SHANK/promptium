/**
 * content/observer/observer.ts
 * Manages MutationObservers for DOM changes.
 * Owns: resolveObserverRoot, attachSelectionObserver, scheduleSelectionScan.
 */
import { exportSelectionState, OBSERVER_DEBOUNCE_MS } from '../state';
import { collectChatMessageNodes, scanSelectionTargets } from '../selection/selection';

export const resolveObserverRoot = async (selectors: any) => {
  if (!selectors?.messageContainer) return document.body;
  for (const sel of Array.isArray(selectors.messageContainer)
    ? selectors.messageContainer
    : [selectors.messageContainer]) {
    try {
      const node = document.querySelector(sel);
      if (node) return node;
    } catch (_) {}
  }
  return document.body;
};

export const scheduleSelectionScan = async () => {
  if (exportSelectionState.scanTimer) {
    clearTimeout(exportSelectionState.scanTimer);
  }
  exportSelectionState.scanTimer = setTimeout(async () => {
    exportSelectionState.scanTimer = null;
    await scanSelectionTargets();
  }, OBSERVER_DEBOUNCE_MS) as any;
};

export const attachSelectionObserver = async () => {
  if (exportSelectionState.observer) {
    exportSelectionState.observer.disconnect();
    exportSelectionState.observer = null;
    exportSelectionState.observerRoot = null;
  }

  const root = await resolveObserverRoot(exportSelectionState.selectors);
  exportSelectionState.observerRoot = root as Element;

  const observer = new MutationObserver(async (mutations) => {
    const relevant = mutations.some((m) => m.addedNodes.length > 0 || m.removedNodes.length > 0);
    if (relevant) {
      await scheduleSelectionScan();
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  exportSelectionState.observer = observer;
  await scheduleSelectionScan();
};
