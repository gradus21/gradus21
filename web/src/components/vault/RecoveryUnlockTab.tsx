import React from 'react';
import { Mail, KeyRound, Lock, ArrowLeft, Loader2, ShieldAlert } from 'lucide-react';

interface RecoveryUnlockTabProps {
  email: string;
  setEmail: (email: string) => void;
  recoveryKey: string;
  setRecoveryKey: (key: string) => void;
  newPassword: string;
  setNewPassword: (password: string) => void;
  isLoading: boolean;
  onRecover: (e: React.FormEvent) => void;
  onBackToLogin: () => void;
}

export const RecoveryUnlockTab: React.FC<RecoveryUnlockTabProps> = ({
  email,
  setEmail,
  recoveryKey,
  setRecoveryKey,
  newPassword,
  setNewPassword,
  isLoading,
  onRecover,
  onBackToLogin,
}) => {
  return (
    <form onSubmit={onRecover} className="space-y-4">
      <div className="p-3.5 rounded-xl border space-y-1.5 bg-amber-500/10 border-amber-500/20 text-amber-900 dark:text-amber-200">
        <div className="flex items-center gap-2 font-bold text-xs">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Notfall-Wiederherstellung</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          Gib deinen 24-stelligen Notfall-Schlüssel vom ausgedruckten Wiederherstellungsbogen ein,
          um deinen Tresor zu entschlüsseln und ein neues Master-Passwort festzulegen.
        </p>
      </div>

      <div className="space-y-3">
        {/* Email */}
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
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs focus:ring-2 focus:ring-teal-500 outline-none"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        {/* Recovery Key */}
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
            Notfall-Wiederherstellungscode
          </label>
          <div className="relative">
            <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={recoveryKey}
              onChange={(e) => setRecoveryKey(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              required
              disabled={isLoading}
              className="w-full pl-9 pr-3 py-2.5 font-mono uppercase tracking-wider rounded-xl border text-xs focus:ring-2 focus:ring-teal-500 outline-none"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        {/* New Password */}
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
            Neues Master-Passwort
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mindestens 10 Zeichen"
              minLength={10}
              required
              disabled={isLoading}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs focus:ring-2 focus:ring-teal-500 outline-none"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 active:scale-[0.98] transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Tresor wird wiederhergestellt...</span>
          </>
        ) : (
          <>
            <KeyRound className="w-4 h-4" />
            <span>Tresor wiederherstellen & neues Passwort setzen</span>
          </>
        )}
      </button>

      <div className="text-center pt-2">
        <button
          type="button"
          onClick={onBackToLogin}
          className="text-xs font-semibold hover:underline transition flex items-center justify-center gap-1.5 mx-auto"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Zurück zur Anmeldung</span>
        </button>
      </div>
    </form>
  );
};
