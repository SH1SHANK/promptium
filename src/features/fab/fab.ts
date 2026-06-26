/**
 * File: src/features/fab/fab.ts
 * Purpose: Controls creation, removal, visibility status, click listeners, and message dispatch.
 */

import { createFabElement } from './fab-view';

let fabButton: HTMLButtonElement | null = null;
let fabMenu: HTMLDivElement | null = null;

type FabWorkflowMode = 'fix' | 'upgrade' | 'rewrite' | 'clipping';

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
  fabMenu = createSelectionMenu();

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
  document.body.appendChild(fabMenu);
  document.addEventListener('selectionchange', updateFabAvailability);
  document.addEventListener('click', handleDocumentClick, true);
  updateFabAvailability();
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
  if (fabMenu?.parentNode) {
    fabMenu.parentNode.removeChild(fabMenu);
  }
  fabMenu = null;
  document.removeEventListener('selectionchange', updateFabAvailability);
  document.removeEventListener('click', handleDocumentClick, true);
}

/** Updates the display styling of the FAB button element. */
export function setFabVisibility(visible: boolean): void {
  if (fabButton) {
    fabButton.style.display = visible ? 'flex' : 'none';
  }
}

/** Sends background action to open or focus the Promptium pop-up window. */
function handleFabClick(): void {
  const selectedText = getSelectedText();
  if (selectedText && fabMenu) {
    const isOpen = fabMenu.classList.toggle('pn-fab-workflow-menu--open');
    fabButton?.setAttribute('aria-expanded', String(isOpen));
    return;
  }

  chrome.runtime
    .sendMessage({
      action: 'OPEN_PROMPTIUM_WINDOW',
      source: 'fab',
    })
    .catch((err) => {
      console.error('[Promptium FAB] Failed to open Promptium window:', err);
    });
}

function createSelectionMenu(): HTMLDivElement {
  const menu = document.createElement('div');
  menu.id = 'pn-fab-workflow-menu';
  menu.className = 'pn-fab-workflow-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Promptium selection actions');

  const actions: Array<{ mode: FabWorkflowMode; label: string; hint: string }> = [
    { mode: 'fix', label: 'Fix', hint: 'Grammar and clarity' },
    { mode: 'upgrade', label: 'Upgrade', hint: 'Prompt intelligence' },
    { mode: 'rewrite', label: 'Rewrite', hint: 'Vault context' },
    { mode: 'clipping', label: 'Save Clipping', hint: 'Add to Clippings' },
  ];

  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pn-fab-workflow-action';
    button.dataset.mode = action.mode;
    button.setAttribute('role', 'menuitem');
    button.setAttribute('aria-label', `${action.label} selected text with Promptium`);
    const label = document.createElement('span');
    label.textContent = action.label;
    const hint = document.createElement('small');
    hint.textContent = action.hint;
    button.append(label, hint);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      launchWorkflow(action.mode);
    });
    menu.appendChild(button);
  }

  return menu;
}

function getSelectedText(): string {
  return String(window.getSelection()?.toString() || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50000);
}

function updateFabAvailability(): void {
  const hasSelection = Boolean(getSelectedText());
  fabButton?.classList.toggle('pn-fab-launcher--selection', hasSelection);
  fabButton?.setAttribute(
    'aria-label',
    hasSelection ? 'Open Promptium selection actions' : 'Open Promptium'
  );
  if (!hasSelection) {
    fabMenu?.classList.remove('pn-fab-workflow-menu--open');
    fabButton?.setAttribute('aria-expanded', 'false');
  }
}

function handleDocumentClick(event: MouseEvent): void {
  if (!fabMenu?.classList.contains('pn-fab-workflow-menu--open')) return;
  const target = event.target as Node | null;
  if (target && (fabMenu.contains(target) || fabButton?.contains(target))) return;
  fabMenu.classList.remove('pn-fab-workflow-menu--open');
  fabButton?.setAttribute('aria-expanded', 'false');
}

function launchWorkflow(mode: FabWorkflowMode): void {
  const content = getSelectedText();
  if (!content) {
    updateFabAvailability();
    return;
  }

  fabMenu?.classList.remove('pn-fab-workflow-menu--open');
  fabButton?.setAttribute('aria-expanded', 'false');

  if (mode === 'clipping') {
    // Save clipping immediately without opening the main window
    const ClippingsObj = (window as any).Clippings;
    if (ClippingsObj?.performSaveFlow) {
      void ClippingsObj.performSaveFlow(content);
    } else {
      console.warn('[Promptium FAB] Clippings module not found on window object.');
    }
    return;
  }

  chrome.runtime
    .sendMessage({
      action: 'OPEN_PROMPTIUM_WINDOW',
      source: 'fab',
      mode,
      content,
    })
    .catch((err) => {
      console.error('[Promptium FAB] Failed to launch Promptium workflow:', err);
    });
}
