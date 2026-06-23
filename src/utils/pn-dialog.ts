(() => {
  /**
   * File: utils/pn-dialog.js
   * Purpose: Lightweight custom dialog replacement for window.prompt/window.confirm/window.alert.
   * Matches the Promptium dark theme design system.
   */

  const DIALOG_WRAPPER_ID = 'pn-dialog-overlay';

  const removeExisting = () => {
    document.getElementById(DIALOG_WRAPPER_ID)?.remove();
  };

  const createOverlay = () => {
    removeExisting();

    const overlay = document.createElement('div');
    overlay.id = DIALOG_WRAPPER_ID;
    overlay.className = 'pn-dialog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('pn-dialog-overlay--visible'));
    return overlay;
  };

  const createDialog = (title: string, body: string | HTMLElement, actions: HTMLElement[]) => {
    const overlay = createOverlay();

    const dialog = document.createElement('div');
    dialog.className = 'pn-dialog';

    const titleEl = document.createElement('h3');
    titleEl.className = 'pn-dialog__title';
    titleEl.textContent = String(title || '');
    dialog.appendChild(titleEl);

    if (typeof body === 'string') {
      const msg = document.createElement('p');
      msg.className = 'pn-dialog__message';
      msg.textContent = body;
      dialog.appendChild(msg);
    } else if (body instanceof HTMLElement) {
      dialog.appendChild(body);
    }

    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'pn-dialog__actions';
    actions.forEach((action) => actionsWrap.appendChild(action));
    dialog.appendChild(actionsWrap);

    overlay.appendChild(dialog);
    return { overlay, dialog };
  };

  /**
   * Replacement for window.alert().
   * Returns a Promise that resolves when the user closes the dialog.
   */
  const alert = (message: string, { title = '' } = {}): Promise<void> =>
    new Promise<void>((resolve) => {
      const okBtn = document.createElement('button');
      okBtn.className = 'pn-btn pn-btn--primary pn-dialog__btn';
      okBtn.textContent = 'OK';
      okBtn.addEventListener('click', () => {
        removeExisting();
        resolve();
      });

      createDialog(title || 'Notice', message, [okBtn]);
      okBtn.focus();
    });

  /**
   * Replacement for window.confirm().
   * Returns a Promise<boolean>.
   */
  const confirm = (
    message: string,
    { title = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}
  ): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'pn-btn pn-btn--ghost pn-dialog__btn';
      cancelBtn.textContent = cancelLabel;
      cancelBtn.addEventListener('click', () => {
        removeExisting();
        resolve(false);
      });

      const confirmBtn = document.createElement('button');
      confirmBtn.className = `pn-btn ${danger ? 'pn-btn--danger' : 'pn-btn--primary'} pn-dialog__btn`;
      confirmBtn.textContent = confirmLabel;
      confirmBtn.addEventListener('click', () => {
        removeExisting();
        resolve(true);
      });

      const { overlay } = createDialog(title || 'Confirm', message, [cancelBtn, confirmBtn]);
      confirmBtn.focus();

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          removeExisting();
          resolve(false);
        }
      });
    });

  /**
   * Replacement for window.prompt().
   * Returns a Promise<string|null>. Resolves null on cancel.
   */
  const prompt = (message: string, defaultValue = '', { title = '', placeholder = '' } = {}): Promise<string | null> =>
    new Promise<string | null>((resolve) => {
      const body = document.createElement('div');
      body.className = 'pn-dialog__body';

      const label = document.createElement('p');
      label.className = 'pn-dialog__message';
      label.textContent = String(message || '');
      body.appendChild(label);

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'pn-dialog__input';
      input.value = String(defaultValue || '');
      input.placeholder = String(placeholder || '');
      body.appendChild(input);

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'pn-btn pn-btn--ghost pn-dialog__btn';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => {
        removeExisting();
        resolve(null);
      });

      const okBtn = document.createElement('button');
      okBtn.className = 'pn-btn pn-btn--primary pn-dialog__btn';
      okBtn.textContent = 'OK';
      okBtn.addEventListener('click', () => {
        removeExisting();
        resolve(input.value);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          removeExisting();
          resolve(input.value);
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          removeExisting();
          resolve(null);
        }
      });

      const { overlay } = createDialog(title || 'Input', body, [cancelBtn, okBtn]);
      input.focus();
      input.select();

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          removeExisting();
          resolve(null);
        }
      });
    });

  const PnDialog = { alert, confirm, prompt };

  if (typeof window !== 'undefined') {
    (window as any).PnDialog = PnDialog;
  }
})();
