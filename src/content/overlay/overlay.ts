/**
 * content/overlay/overlay.ts
 * Manages lightweight in-page toast overlays, "Already Saved" prompts,
 * and the injection undo toast affordance.
 * Owns: showUndoToast, showAlreadySavedToast, showInjectionUndoToast.
 */
import { toast } from '../../shared/utils/toast';
import { injectionUndoState, INJECTION_CONFIRMATION_DELAY_MS, INJECTION_UNDO_TTL_MS } from '../state';

export const showAlreadySavedToast = (existingPrompt: any, currentText: string) => {
  document.getElementById('pn-toast-already-saved')?.remove();
  const toastEl = document.createElement('div');
  toastEl.id = 'pn-toast-already-saved';
  toastEl.className = 'pn-toast pn-toast--undo';
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');

  const message = document.createElement('span');
  message.textContent = 'Already saved.';

  const updateBtn = document.createElement('button');
  updateBtn.className = 'pn-toast-undo-btn';
  updateBtn.type = 'button';
  updateBtn.textContent = 'Update';
  updateBtn.style.color = '#14b8a6';
  updateBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const snap = await chrome.storage.local.get(['prompts']);
    const list = Array.isArray(snap.prompts) ? snap.prompts : [];
    const idx = list.findIndex((p: any) => p.id === existingPrompt.id);
    if (idx >= 0) {
      list[idx].text = currentText;
      list[idx].updatedAt = new Date().toISOString();
      await chrome.storage.local.set({ prompts: list });
      toastEl.remove();
      toast.success('Prompt updated.');
    }
  });

  const openBtn = document.createElement('button');
  openBtn.className = 'pn-toast-undo-btn';
  openBtn.type = 'button';
  openBtn.textContent = 'Open';
  openBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({ action: 'OPEN_PROMPTIUM_WINDOW', source: 'fab' });
    toastEl.remove();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'pn-toast-undo-btn';
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.color = '#71717a';
  cancelBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toastEl.remove();
  });

  toastEl.append(message, document.createTextNode(' '), updateBtn, document.createTextNode(' '), openBtn, document.createTextNode(' '), cancelBtn);
  document.body.appendChild(toastEl);
  setTimeout(() => toastEl.remove(), 6000);
};

export const clearInjectionUndoState = () => {
  if (injectionUndoState.timer) {
    clearTimeout(injectionUndoState.timer);
    injectionUndoState.timer = null;
  }
  injectionUndoState.toast?.remove();
  injectionUndoState.toast = null;
  if (injectionUndoState.toastTimer) {
    clearTimeout(injectionUndoState.toastTimer);
    injectionUndoState.toastTimer = null;
  }
  injectionUndoState.previousText = '';
  injectionUndoState.injectedText = '';
  injectionUndoState.platform = null;
  injectionUndoState.createdAt = 0;
  injectionUndoState.consumed = true;
};

const showInjectionUndoToastEl = (undoCallback: () => void): HTMLElement => {
  document.querySelectorAll('.pn-toast').forEach((n) => n.remove());
  const el = document.createElement('div');
  el.className = 'pn-toast pn-toast--undo';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');

  const message = document.createElement('span');
  message.textContent = 'Prompt injected.';

  const undoButton = document.createElement('button');
  undoButton.className = 'pn-toast-undo-btn';
  undoButton.type = 'button';
  undoButton.textContent = 'Undo';
  undoButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    undoCallback();
  });

  el.append(message, document.createTextNode(' '), undoButton);
  document.body.appendChild(el);
  return el;
};

export const stageInjectionUndo = (
  platform: any,
  previousText: any,
  injectedText: any,
  undoCallback: () => void
) => {
  clearInjectionUndoState();
  injectionUndoState.previousText = String(previousText || '');
  injectionUndoState.injectedText = String(injectedText || '');
  injectionUndoState.platform = String(platform || '');
  injectionUndoState.createdAt = Date.now();
  injectionUndoState.consumed = false;

  injectionUndoState.toastTimer = setTimeout(() => {
    if (injectionUndoState.consumed) return;
    injectionUndoState.toast = showInjectionUndoToastEl(undoCallback);
    injectionUndoState.toastTimer = null;
  }, INJECTION_CONFIRMATION_DELAY_MS);

  injectionUndoState.timer = setTimeout(() => {
    clearInjectionUndoState();
  }, INJECTION_UNDO_TTL_MS);
};
