import React, { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { toastManager, ToastItem, ToastType } from '../utils/toast';

const ICONS: Record<ToastType, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TYPE_STYLES: Record<
  ToastType,
  {
    border: string;
    bg: string;
    iconColor: string;
  }
> = {
  success: {
    border: 'rgba(16, 185, 129, 0.3)',
    bg: 'rgba(16, 185, 129, 0.08)',
    iconColor: '#10B981',
  },
  error: {
    border: 'rgba(244, 63, 94, 0.35)',
    bg: 'rgba(244, 63, 94, 0.08)',
    iconColor: '#F43F5E',
  },
  warning: {
    border: 'rgba(245, 158, 11, 0.35)',
    bg: 'rgba(245, 158, 11, 0.08)',
    iconColor: '#F59E0B',
  },
  info: {
    border: 'var(--border-subtle)',
    bg: 'var(--primary-soft)',
    iconColor: 'var(--primary-500)',
  },
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return toastManager.subscribe((items) => {
      setToasts(items);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed z-[120] bottom-16 sm:bottom-6 inset-x-3 sm:inset-x-auto sm:right-6 flex flex-col gap-2.5 max-w-md pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((item) => {
        const Icon = ICONS[item.type];
        const style = TYPE_STYLES[item.type];

        return (
          <div
            key={item.id}
            role={item.type === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex items-start gap-3 p-3.5 sm:p-4 rounded-2xl shadow-xl border backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150 transition-all"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: style.border,
              color: 'var(--text-primary)',
            }}
          >
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
              style={{ backgroundColor: style.bg, color: style.iconColor }}
            >
              <Icon className="w-4 h-4" />
            </div>

            <div className="flex-1 min-w-0 pr-1">
              <p className="text-xs sm:text-sm font-medium leading-snug break-words">
                {item.message}
              </p>
              {item.action && (
                <button
                  type="button"
                  onClick={() => {
                    item.action?.onClick();
                    toastManager.dismiss(item.id);
                  }}
                  className="mt-2 text-xs font-bold px-2.5 py-1 rounded-lg transition hover:opacity-90 inline-flex items-center gap-1"
                  style={{
                    backgroundColor: 'var(--primary-500)',
                    color: '#ffffff',
                  }}
                >
                  {item.action.label}
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => toastManager.dismiss(item.id)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition shrink-0"
              aria-label="Schließen"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
