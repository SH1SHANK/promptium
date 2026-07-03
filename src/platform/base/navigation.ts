/**
 * File: src/platform/base/navigation.ts
 * Purpose: Reusable SPA navigation observer. Patches history.pushState and
 *          history.replaceState exactly once, then fans out to all registered
 *          subscribers. Any content feature (FAB, context menu, selection
 *          tracking, conversation tracking) can subscribe without duplicating
 *          the monkey-patch logic.
 *
 * Usage:
 *   import { navigationObserver } from '../../platform';
 *
 *   // Call once on script load (idempotent — safe to call multiple times)
 *   navigationObserver.install();
 *
 *   // Subscribe to navigation events
 *   const unsubscribe = navigationObserver.subscribe(() => {
 *     // handle route change
 *   });
 *
 *   // Clean up when the feature is destroyed
 *   unsubscribe();
 */

export type NavigationCallback = () => void;

const subscribers = new Set<NavigationCallback>();
let installed = false;

function notifyAll(): void {
  for (const cb of subscribers) {
    try {
      cb();
    } catch (err) {
      console.error('[Promptium] navigationObserver subscriber threw:', err);
    }
  }
}

export const navigationObserver = {
  /**
   * Installs the history patches and the popstate listener.
   * Idempotent — calling multiple times is safe.
   */
  install(): void {
    if (installed) return;
    installed = true;

    const patchHistoryMethod = (type: 'pushState' | 'replaceState'): void => {
      const orig = history[type];
      history[type] = function (this: History, ...args: Parameters<typeof orig>) {
        (orig as (...a: unknown[]) => unknown).apply(this, args);
        notifyAll();
      };
    };

    patchHistoryMethod('pushState');
    patchHistoryMethod('replaceState');
    window.addEventListener('popstate', notifyAll);
  },

  /**
   * Registers a callback to fire on every navigation event.
   * Returns an unsubscribe function for clean teardown.
   */
  subscribe(cb: NavigationCallback): () => void {
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  },

  /**
   * Removes a previously registered callback.
   */
  unsubscribe(cb: NavigationCallback): void {
    subscribers.delete(cb);
  },

  /** Exposed for testing — returns the current subscriber count. */
  get size(): number {
    return subscribers.size;
  },
};
