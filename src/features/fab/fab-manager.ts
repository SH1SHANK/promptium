/**
 * File: src/features/fab/fab-manager.ts
 * Purpose: Manages mounting lifecycle of the FAB.
 *
 * Navigation is handled by the shared navigationObserver — no inline
 * pushState/replaceState patching lives here.
 */

import { getCurrentAdapter, navigationObserver } from '../../platforms';
import { mountFab, destroyFab, isFabMounted } from './fab';

let retryTimers: Array<ReturnType<typeof setTimeout>> = [];
let bodyObserver: MutationObserver | null = null;
let unsubscribeNavigation: (() => void) | null = null;

export const fabManager = {
  /** Initializes the FAB manager — install navigation observer, mount FAB, wire observers. */
  initialize() {
    this.destroy();

    // Ensure the shared navigation observer is active (idempotent)
    navigationObserver.install();

    // Subscribe to route changes
    unsubscribeNavigation = navigationObserver.subscribe(() => {
      fabManager.handleNavigation();
    });

    // Watch document body for external DOM removals (e.g. platform-driven full re-renders)
    bodyObserver = new MutationObserver(() => {
      fabManager.ensureFabMounted();
    });
    bodyObserver.observe(document.body, { childList: true });

    // Initial mount + scheduled retries for late-loading composers
    this.ensureFabMounted();
    this.setupRetries();
  },

  /** Validates the current adapter health and mounts the FAB if appropriate. */
  ensureFabMounted() {
    const adapter = getCurrentAdapter();
    if (!adapter) {
      destroyFab();
      return;
    }

    const validation = adapter.validate();
    if (!validation.healthy) {
      destroyFab();
      return;
    }

    if (!isFabMounted()) {
      mountFab();
    }
  },

  /** Called on every navigation event — re-evaluates mount state with fresh retries. */
  handleNavigation() {
    fabManager.clearRetries();
    fabManager.ensureFabMounted();
    fabManager.setupRetries();
  },

  /** Schedules lightweight re-checks for late-loading SPA composers. */
  setupRetries() {
    this.clearRetries();
    const delays = [500, 1000, 2500, 5000];
    retryTimers = delays.map((ms) =>
      setTimeout(() => {
        fabManager.ensureFabMounted();
      }, ms)
    );
  },

  /** Cancels any pending retry timers. */
  clearRetries() {
    retryTimers.forEach(clearTimeout);
    retryTimers = [];
  },

  /** Full teardown — unsubscribes from navigation, disconnects observers, removes the FAB. */
  destroy() {
    this.clearRetries();

    if (unsubscribeNavigation) {
      unsubscribeNavigation();
      unsubscribeNavigation = null;
    }

    if (bodyObserver) {
      bodyObserver.disconnect();
      bodyObserver = null;
    }

    destroyFab();
  },
};
