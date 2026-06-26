/**
 * File: utils/toast.ts
 * Purpose: Decoupled utility for displaying lightweight toast notifications in content scripts.
 */

export interface Toast {
  success(message: string): void;
  error(message: string): void;
  info(message: string): void;
  show(message: string, type?: 'success' | 'error' | 'info'): void;
}

const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
  const normalizedMsg = String(message || '')
    .replace(/!/g, '')
    .trim();

  // If the window has a custom showToast function (e.g. from an app page UI), delegate to it
  const customShowToast = (window as any).showToast;
  if (typeof customShowToast === 'function') {
    void customShowToast(normalizedMsg);
    return;
  }

  // Create lightweight DOM toast element
  const toast = document.createElement('div');
  toast.className = 'pn-toast';
  if (type === 'error') {
    toast.classList.add('pn-toast--error');
  } else if (type === 'success') {
    toast.classList.add('pn-toast--success');
  }

  toast.textContent = normalizedMsg;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2500);
};

export const toast: Toast = {
  success(message: string) {
    showToast(message, 'success');
  },
  error(message: string) {
    showToast(message, 'error');
  },
  info(message: string) {
    showToast(message, 'info');
  },
  show(message: string, type: 'success' | 'error' | 'info' = 'info') {
    showToast(message, type);
  },
};

if (typeof window !== 'undefined') {
  (window as any).toast = toast;
}
