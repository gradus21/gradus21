/**
 * Accessible Toast & Notification Dispatcher (Issue #40, #41).
 *
 * Kann sowohl aus React-Komponenten als auch aus Hooks und Util-Funktionen
 * aufgerufen werden (z. B. `toast.success('Gespeichert')`, `toast.error('Fehler...')`).
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  action?: ToastAction;
  duration?: number;
  createdAt: number;
}

type ToastListener = (toasts: ToastItem[]) => void;

class ToastManager {
  private toasts: ToastItem[] = [];
  private listeners: Set<ToastListener> = new Set();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  public subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    listener([...this.toasts]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const copy = [...this.toasts];
    this.listeners.forEach((listener) => listener(copy));
  }

  public show(
    message: string,
    type: ToastType = 'info',
    options?: { action?: ToastAction; duration?: number }
  ): string {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const duration = options?.duration ?? (type === 'error' ? 6000 : 4000);

    const item: ToastItem = {
      id,
      type,
      message,
      action: options?.action,
      duration,
      createdAt: Date.now(),
    };

    // Maximal 4 sichtbare Toasts gleichzeitig
    this.toasts = [...this.toasts.slice(-3), item];
    this.notify();

    if (duration > 0) {
      const timer = setTimeout(() => {
        this.dismiss(id);
      }, duration);
      this.timers.set(id, timer);
    }

    return id;
  }

  public dismiss(id: string) {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  public clearAll() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.toasts = [];
    this.notify();
  }
}

export const toastManager = new ToastManager();

export const toast = {
  success: (message: string, options?: { action?: ToastAction; duration?: number }) =>
    toastManager.show(message, 'success', options),
  error: (message: string, options?: { action?: ToastAction; duration?: number }) =>
    toastManager.show(message, 'error', options),
  warning: (message: string, options?: { action?: ToastAction; duration?: number }) =>
    toastManager.show(message, 'warning', options),
  info: (message: string, options?: { action?: ToastAction; duration?: number }) =>
    toastManager.show(message, 'info', options),
  dismiss: (id: string) => toastManager.dismiss(id),
  clearAll: () => toastManager.clearAll(),
};
