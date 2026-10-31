import React, { useState } from 'react';
import { KeyRound, Lock, X, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';

interface VaultPasswordPromptModalProps {
  isOpen: boolean;
  email: string;
  onSubmit: (password: string) => Promise<{ success: boolean; error?: string }>;
  onCancel: () => void;
}

export const VaultPasswordPromptModal: React.FC<VaultPasswordPromptModalProps> = ({
  isOpen,
  email,
  onSubmit,
  onCancel,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setErrorMsg('Bitte gib dein Master-Passwort ein.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await onSubmit(password);
      if (!res.success) {
        setErrorMsg(res.error || 'Das eingegebene Master-Passwort ist nicht korrekt.');
      } else {
        setPassword('');
      }
    } catch (err: any) {
      setErrorMsg(String(err?.message || err || 'Fehler beim Entschlüsseln des Tresorschlüssels.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (isLoading) return;
    setPassword('');
    setErrorMsg(null);
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="max-w-md w-full rounded-2xl border p-6 shadow-2xl space-y-4 animate-scale-up"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                Master-Passwort zur Cloud-Verknüpfung
              </h4>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Für das Konto <strong className="font-mono text-teal-600 dark:text-teal-400">{email}</strong> wird dein Master-Passwort benötigt, um deinen kryptografischen Anmeldeschlüssel abzuleiten.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-[11px] text-teal-900 dark:text-teal-200 leading-relaxed">
          <strong>Zero-Knowledge-Sicherheit:</strong> Da dein Tresor mit Face ID entsperrt wurde, verblieb der Anmeldeschlüssel verschlüsselt. Gib einmalig dein Master-Passwort ein, um den Tresor mit dem Cloud-Server zu verbinden.
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Master-Passwort
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Master-Passwort eingeben"
                disabled={isLoading}
                autoFocus
                className="w-full pl-9 pr-10 py-2.5 rounded-xl border text-xs bg-transparent outline-none focus:ring-2 focus:ring-teal-500/40"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-3.5 py-2 rounded-xl border text-xs font-semibold hover:opacity-80 transition"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isLoading || !password.trim()}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{ backgroundColor: 'var(--primary-500)' }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Schlüssel wird berechnet...</span>
                </>
              ) : (
                <span>Tresor mit Cloud verbinden</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
