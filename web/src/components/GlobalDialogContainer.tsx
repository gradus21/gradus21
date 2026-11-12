import React, { useEffect, useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { DialogOverlay } from './DialogOverlay';
import { dialogPromptManager, ActiveDialogState } from '../utils/dialogPrompt';

export const GlobalDialogContainer: React.FC = () => {
  const [state, setState] = useState<ActiveDialogState>(null);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    return dialogPromptManager.subscribe((next) => {
      setState(next);
      if (next?.type === 'prompt') {
        setInputValue(next.options.defaultValue ?? '');
      } else {
        setInputValue('');
      }
    });
  }, []);

  if (!state) return null;

  const isConfirm = state.type === 'confirm';
  const isPrompt = state.type === 'prompt';

  const handleCancel = () => {
    if (isConfirm) {
      state.resolve(false);
    } else if (isPrompt) {
      state.resolve(null);
    }
  };

  const handleConfirm = () => {
    if (isConfirm) {
      state.resolve(true);
    } else if (isPrompt) {
      state.resolve(inputValue);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleConfirm();
  };

  const title = state.options.title;
  const message = state.options.message;
  const confirmText = state.options.confirmText || (isConfirm ? 'Bestätigen' : 'Speichern');
  const cancelText = state.options.cancelText || 'Abbrechen';
  const isDanger = Boolean(state.options.danger || state.options.variant === 'danger');

  return (
    <DialogOverlay
      isOpen={true}
      onClose={handleCancel}
      size="sm"
      titleId="global-dialog-title"
      className="p-5 sm:p-6 space-y-4"
    >
      <div className="flex items-start gap-3.5">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isDanger
              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              : 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
          }`}
        >
          {isDanger ? <AlertTriangle className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
        </div>
        <div className="space-y-1 min-w-0 flex-1">
          <h3
            id="global-dialog-title"
            className="text-base font-bold leading-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </h3>
          <p className="text-xs sm:text-sm whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
            {message}
          </p>
        </div>
      </div>

      {isPrompt && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type={state.options.inputType || 'text'}
            inputMode={state.options.inputMode}
            maxLength={state.options.maxLength}
            autoComplete={state.options.autoComplete}
            autoFocus
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={state.options.placeholder}
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-teal-500/40 ${
              state.options.inputMode === 'numeric' ? 'font-mono text-center tracking-widest text-base' : ''
            }`}
            style={{
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 rounded-xl text-xs font-semibold border transition hover:bg-black/5 dark:hover:bg-white/5"
              style={{
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {cancelText}
            </button>
            <button
              type="submit"
              className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition hover:opacity-95 ${
                isDanger ? 'bg-rose-600 hover:bg-rose-700' : ''
              }`}
              style={{ backgroundColor: isDanger ? undefined : 'var(--primary-500)' }}
            >
              {confirmText}
            </button>
          </div>
        </form>
      )}

      {isConfirm && (
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded-xl text-xs font-semibold border transition hover:bg-black/5 dark:hover:bg-white/5"
            style={{
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition hover:opacity-95 ${
              isDanger ? 'bg-rose-600 hover:bg-rose-700' : ''
            }`}
            style={{ backgroundColor: isDanger ? undefined : 'var(--primary-500)' }}
          >
            {confirmText}
          </button>
        </div>
      )}
    </DialogOverlay>
  );
};
