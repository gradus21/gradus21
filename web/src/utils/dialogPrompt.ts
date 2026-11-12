/**
 * Accessible Promise-based Replacement for window.confirm() & window.prompt() (Issue #40).
 *
 * Öffnet einen echten, barrierefreien Dialog über DialogOverlay (#39)
 * und löst ein Promise auf, wenn der Nutzer bestätigt oder abbricht.
 */

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  variant?: 'primary' | 'danger';
}

export interface PromptDialogOptions {
  title: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  inputType?: 'text' | 'email' | 'password';
  inputMode?: 'text' | 'numeric' | 'email' | 'decimal';
  maxLength?: number;
  autoComplete?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  variant?: 'primary' | 'danger';
}

export type ActiveDialogState =
  | {
      type: 'confirm';
      options: ConfirmDialogOptions;
      resolve: (value: boolean) => void;
    }
  | {
      type: 'prompt';
      options: PromptDialogOptions;
      resolve: (value: string | null) => void;
    }
  | null;

type DialogListener = (state: ActiveDialogState) => void;

class DialogPromptManager {
  private current: ActiveDialogState = null;
  private listeners: Set<DialogListener> = new Set();

  public subscribe(listener: DialogListener): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.current));
  }

  public confirm(options: ConfirmDialogOptions): Promise<boolean> {
    return new Promise((resolve) => {
      this.current = {
        type: 'confirm',
        options,
        resolve: (val: boolean) => {
          this.current = null;
          this.notify();
          resolve(val);
        },
      };
      this.notify();
    });
  }

  public prompt(options: PromptDialogOptions): Promise<string | null> {
    return new Promise((resolve) => {
      this.current = {
        type: 'prompt',
        options,
        resolve: (val: string | null) => {
          this.current = null;
          this.notify();
          resolve(val);
        },
      };
      this.notify();
    });
  }

  public closeCurrent() {
    if (this.current) {
      if (this.current.type === 'confirm') {
        this.current.resolve(false);
      } else {
        this.current.resolve(null);
      }
    }
  }
}

export const dialogPromptManager = new DialogPromptManager();

export const confirmDialog = (options: ConfirmDialogOptions): Promise<boolean> =>
  dialogPromptManager.confirm(options);

export const promptDialog = (options: PromptDialogOptions): Promise<string | null> =>
  dialogPromptManager.prompt(options);
