/**
 * File: src/features/fab/fab.ts
 * Purpose: Controls creation, removal, visibility status, click listeners, and message dispatch.
 */

import { createFabElement } from './fab-view';

let fabButton: HTMLButtonElement | null = null;

/** Checks if the FAB is currently mounted to the document body. */
export function isFabMounted(): boolean {
  return fabButton !== null && document.body.contains(fabButton);
}

/** Instantiates the FAB view, binds events, and appends it to the DOM. */
export function mountFab(): HTMLButtonElement {
  if (fabButton) {
    if (document.body.contains(fabButton)) {
      return fabButton;
    }
    destroyFab();
  }

  fabButton = createFabElement();

  // Click event listener
  fabButton.addEventListener('click', handleFabClick);

  // Space/Enter keydown listener (standard <button> handles this, but explicitly binding is safe)
  fabButton.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleFabClick();
    }
  });

  document.body.appendChild(fabButton);
  return fabButton;
}

/** Removes the FAB from the DOM and releases event listeners. */
export function destroyFab(): void {
  if (fabButton) {
    fabButton.removeEventListener('click', handleFabClick);
    if (fabButton.parentNode) {
      fabButton.parentNode.removeChild(fabButton);
    }
    fabButton = null;
  }
}

/** Updates the display styling of the FAB button element. */
export function setFabVisibility(visible: boolean): void {
  if (fabButton) {
    fabButton.style.display = visible ? 'flex' : 'none';
  }
}

/** Sends background action to open or focus the Promptium pop-up window. */
function handleFabClick(): void {
  chrome.runtime.sendMessage({
    action: 'OPEN_PROMPTIUM_WINDOW',
    source: 'fab',
  }).catch((err) => {
    console.error('[Promptium FAB] Failed to open Promptium window:', err);
  });
}
