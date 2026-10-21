import React from 'react';
import { Fingerprint, Lock, ShieldCheck, Loader2 } from 'lucide-react';

interface PasskeyUnlockTabProps {
  email: string;
  hasPasskey: boolean;
  passkeyLabel?: string;
  isLoading: boolean;
  onUnlockWithPasskey: () => void | Promise<void>;
  onSwitchToPassword: () => void;
}

export const PasskeyUnlockTab: React.FC<PasskeyUnlockTabProps> = ({
  email,
  hasPasskey,
  passkeyLabel,
  isLoading,
  onUnlockWithPasskey,
  onSwitchToPassword,
}) => {
  return (
    <div className="space-y-4">
      <div
        className="p-5 rounded-2xl border text-center space-y-3"
        style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
      >
        <div
          className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center transition-transform hover:scale-105"
          style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary-text)' }}
        >
          {isLoading ? (
            <Loader2 className="w-7 h-7 animate-spin" />
          ) : (
            <Fingerprint className="w-7 h-7" />
          )}
        </div>

        <div className="space-y-1">
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            Biometrische Entsperrung
          </h3>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {hasPasskey
              ? `Entsperre Gradus21 blitzschnell mit ${passkeyLabel || 'deinem Fingerabdruck / Face ID'}`
              : 'Nutze deinen registrierten Passkey oder Sicherheitsschlüssel'}
          </p>
        </div>

        {email && (
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
            <span>{email}</span>
          </div>
        )}

        <button
          type="button"
          onClick={onUnlockWithPasskey}
          disabled={isLoading}
          className="w-full mt-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-teal-600 hover:bg-teal-500 active:scale-[0.98] transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Sensor wird abgefragt...</span>
            </>
          ) : (
            <>
              <Fingerprint className="w-4 h-4" />
              <span>Mit Passkey / Fingerabdruck entsperren</span>
            </>
          )}
        </button>
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={onSwitchToPassword}
          className="text-xs font-semibold hover:underline transition flex items-center justify-center gap-1.5 mx-auto"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Stattdessen mit Master-Passwort anmelden</span>
        </button>
      </div>
    </div>
  );
};
