/**
 * File: utils/dialog.ts
 * Purpose: Lightweight custom dialog replacement for window.prompt/window.confirm/window.alert.
 * Implements strict keyboard trapping, Escape handling, Enter defaults, and focus restoration.
 */

const DIALOG_WRAPPER_ID = 'dialog-overlay';
let previousActiveElement: HTMLElement | null = null;

const removeExisting = () => {
  document.getElementById(DIALOG_WRAPPER_ID)?.remove();
  if (previousActiveElement) {
    previousActiveElement.focus();
    previousActiveElement = null;
  }
};

const createOverlay = () => {
  previousActiveElement = document.activeElement as HTMLElement | null;
  removeExisting();

  const overlay = document.createElement('div');
  overlay.id = DIALOG_WRAPPER_ID;
  overlay.className = 'dialog-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  (document.querySelector('.runtime-dialogs') || document.body).appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('dialog-overlay--visible'));
  return overlay;
};

const setupKeyboardTrap = (
  overlay: HTMLElement,
  dialog: HTMLElement,
  onCancel: () => void,
  onConfirm?: () => void
) => {
  const getFocusable = () => {
    return Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => {
      return !el.hasAttribute('disabled') && el.style.display !== 'none';
    });
  };

  overlay.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }

    if (e.key === 'Enter' && onConfirm) {
      const active = document.activeElement;
      // If we are focused on a button, let the default click happen. Otherwise, trigger default confirm.
      if (active && active.tagName === 'BUTTON') {
        return;
      }
      e.preventDefault();
      onConfirm();
      return;
    }

    if (e.key === 'Tab') {
      const focusables = getFocusable();
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          last.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    }
  });
};

const createDialog = (
  title: string,
  body: string | HTMLElement,
  actions: HTMLElement[],
  onCancel: () => void,
  onConfirm?: () => void
) => {
  const overlay = createOverlay();

  const dialog = document.createElement('div');
  dialog.className = 'dialog';

  const titleEl = document.createElement('h3');
  titleEl.className = 'dialog__title';
  titleEl.textContent = String(title || '');
  dialog.appendChild(titleEl);

  if (typeof body === 'string') {
    const msg = document.createElement('p');
    msg.className = 'dialog__message';
    msg.textContent = body;
    dialog.appendChild(msg);
  } else if (body instanceof HTMLElement) {
    dialog.appendChild(body);
  }

  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'dialog__actions';
  actions.forEach((action) => actionsWrap.appendChild(action));
  dialog.appendChild(actionsWrap);

  overlay.appendChild(dialog);

  setupKeyboardTrap(overlay, dialog, onCancel, onConfirm);

  return { overlay, dialog };
};

/**
 * Replacement for window.alert().
 */
export const alert = (message: string, { title = 'Notice' } = {}): Promise<void> =>
  new Promise<void>((resolve) => {
    const okBtn = document.createElement('button');
    okBtn.className = 'button button--primary dialog__btn';
    okBtn.textContent = 'OK';
    const closeAlert = () => {
      removeExisting();
      resolve();
    };
    okBtn.addEventListener('click', closeAlert);

    createDialog(title, message, [okBtn], closeAlert, closeAlert);
    okBtn.focus();
  });

/**
 * Replacement for window.confirm().
 */
export const confirm = (
  message: string,
  { title = 'Confirm', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}
): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'button button--ghost dialog__btn';
    cancelBtn.textContent = cancelLabel;
    const doCancel = () => {
      removeExisting();
      resolve(false);
    };
    cancelBtn.addEventListener('click', doCancel);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = `button ${danger ? 'button--danger' : 'button--primary'} dialog__btn`;
    confirmBtn.textContent = confirmLabel;
    const doConfirm = () => {
      removeExisting();
      resolve(true);
    };
    confirmBtn.addEventListener('click', doConfirm);

    const { overlay } = createDialog(title, message, [cancelBtn, confirmBtn], doCancel, doConfirm);
    confirmBtn.focus();

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        doCancel();
      }
    });
  });

/**
 * Replacement for window.prompt().
 */
export const prompt = (
  message: string,
  defaultValue = '',
  { title = 'Input', placeholder = '' } = {}
): Promise<string | null> =>
  new Promise<string | null>((resolve) => {
    const body = document.createElement('div');
    body.className = 'dialog__body';

    const label = document.createElement('p');
    label.className = 'dialog__message';
    label.textContent = String(message || '');
    body.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dialog__input';
    input.value = String(defaultValue || '');
    input.placeholder = String(placeholder || '');
    body.appendChild(input);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'button button--ghost dialog__btn';
    cancelBtn.textContent = 'Cancel';
    const doCancel = () => {
      removeExisting();
      resolve(null);
    };
    cancelBtn.addEventListener('click', doCancel);

    const okBtn = document.createElement('button');
    okBtn.className = 'button button--primary dialog__btn';
    okBtn.textContent = 'OK';
    const doConfirm = () => {
      removeExisting();
      resolve(input.value);
    };
    okBtn.addEventListener('click', doConfirm);

    const { overlay } = createDialog(title, body, [cancelBtn, okBtn], doCancel, doConfirm);
    input.focus();
    input.select();

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        doCancel();
      }
    });
  });

export const PnDialog = { alert, confirm, prompt };

if (typeof window !== 'undefined') {
  (window as any).PnDialog = PnDialog;
}
