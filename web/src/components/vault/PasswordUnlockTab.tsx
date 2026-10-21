import React from 'react';
import { Lock, Mail, KeyRound, Smartphone, ShieldCheck, Loader2, Fingerprint } from 'lucide-react';

interface PasswordUnlockTabProps {
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  totpCode: string;
  setTotpCode: (code: string) => void;
  requiresTotp: boolean;
  isLoading: boolean;
  hasCachedVault: boolean;
  onUnlock: (e: React.FormEvent) => void;
  onSwitchToPasskey?: () => void;
  onSwitchToRecovery: () => void;
  onSwitchToRegister: () => void;
}

export const PasswordUnlockTab: React.FC<PasswordUnlockTabProps> = ({
  email,
  setEmail,
  password,
  setPassword,
  totpCode,
  setTotpCode,
  requiresTotp,
  isLoading,
  hasCachedVault,
  onUnlock,
  onSwitchToPasskey,
  onSwitchToRecovery,
  onSwitchToRegister,
}) => {
  return (
    <form onSubmit={onUnlock} className="space-y-4">
      <div className="space-y-3">
        {/* Email Field */}
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
            E-Mail-Adresse
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="lehrkraft@schule.de"
              required
              disabled={isLoading}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs focus:ring-2 focus:ring-teal-500 outline-none transition"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        {/* Master Password Field */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Master-Passwort
            </label>
            <button
              type="button"
              onClick={onSwitchToRecovery}
              className="text-[11px] font-medium text-teal-600 dark:text-teal-400 hover:underline"
            >
              Passwort vergessen?
            </button>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              disabled={isLoading}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs focus:ring-2 focus:ring-teal-500 outline-none transition"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        {/* TOTP 2FA Input (if prompted or required) */}
        {requiresTotp && (
          <div className="p-3.5 rounded-xl border space-y-2 bg-amber-500/5 border-amber-500/20">
            <label className="block text-xs font-bold text-amber-800 dark:text-amber-300">
              Zwei-Faktor-Code (Authenticator-App)
            </label>
            <div className="relative">
              <Smartphone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-amber-500" />
              <input
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000 000"
                maxLength={6}
                required
                disabled={isLoading}
                autoFocus
                className="w-full pl-9 pr-3 py-2 font-mono text-center tracking-widest text-sm font-bold rounded-lg border focus:ring-2 focus:ring-amber-500 outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
              Gib den 6-stelligen Code aus deiner Authenticator-App (Google, Apple, Microsoft) ein.
            </p>
          </div>
        )}
      </div>

      {hasCachedVault && (
        <div className="flex items-center gap-1.5 text-[11px] text-teal-700 dark:text-teal-300 bg-teal-500/10 px-3 py-1.5 rounded-lg">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span>Offline-Tresor für schnellen lokalen Login vorhanden</span>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 active:scale-[0.98] transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Krypto-Schlüssel wird abgeleitet...</span>
          </>
        ) : (
          <>
            <KeyRound className="w-4 h-4" />
            <span>Gradus21 entsperren</span>
          </>
        )}
      </button>

      {/* Secondary Options */}
      <div className="pt-2 flex flex-col items-center gap-2 text-xs">
        {onSwitchToPasskey && (
          <button
            type="button"
            onClick={onSwitchToPasskey}
            className="font-medium text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1.5"
          >
            <Fingerprint className="w-3.5 h-3.5" />
            <span>Per Fingerabdruck / Face ID entsperren</span>
          </button>
        )}

        <button
          type="button"
          onClick={onSwitchToRegister}
          className="hover:underline transition text-[11px]"
          style={{ color: 'var(--text-secondary)' }}
        >
          Noch kein Konto? Jetzt neuen Tresor anlegen
        </button>
      </div>
    </form>
  );
};
