import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, Mail, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { formatApiErrorMessage } from '../utils/legalConfig';
import { apiUrl } from '../utils/apiConfig';

interface EmailVerificationModalProps {
  isOpen: boolean;
  email: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const EmailVerificationModal: React.FC<EmailVerificationModalProps> = ({
  isOpen,
  email,
  onSuccess,
  onCancel,
}) => {
  const [codeDigits, setCodeDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number>(0);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Timer for cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const requestVerificationCode = async () => {
    if (!email || !email.includes('@')) {
      setErrorMsg('Bitte gib eine gültige E-Mail-Adresse an.');
      return;
    }
    setSendingCode(true);
    setErrorMsg(null);
    try {
      const res = await fetch(apiUrl('/api/auth/verify-email/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const rawText = await res.text();
      let data: any = {};
      let isJson = false;
      try {
        data = JSON.parse(rawText);
        isJson = true;
      } catch {
        // non-JSON response
      }

      if (res.ok && isJson && (data.status === 'code_sent' || data.dev_code)) {
        setCooldown(data.cooldown_seconds || 60);
        setRemainingAttempts(5);
        if (data.dev_code) {
          setSuccessMsg(`Test-Modus: Dein Bestätigungscode lautet: ${data.dev_code}`);
        } else {
          setSuccessMsg(`Ein 6-stelliger Bestätigungscode wurde an ${email} gesendet.`);
        }
        // Focus first input
        setTimeout(() => {
          inputRefs.current[0]?.focus();
        }, 100);
      } else if (res.status === 429) {
        const wait = data.cooldown_secs || data.cooldown_seconds || 60;
        setCooldown(wait);
        setErrorMsg(`Zu viele Anfragen. Bitte warte ${wait} Sekunden, bevor du einen neuen Code anforderst.`);
      } else {
        setErrorMsg(isJson && data.error ? data.error : formatApiErrorMessage(rawText, res.status));
      }
    } catch {
      setErrorMsg('Der Server konnte nicht erreicht werden.');
    } finally {
      setSendingCode(false);
    }
  };

  // Start verification code on initial open
  useEffect(() => {
    if (isOpen) {
      setCodeDigits(['', '', '', '', '', '']);
      setErrorMsg(null);
      setSuccessMsg(null);
      requestVerificationCode();
    }
  }, [isOpen, email]);

  if (!isOpen) return null;

  const handleDigitChange = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '');
    if (!clean) {
      const newDigits = [...codeDigits];
      newDigits[index] = '';
      setCodeDigits(newDigits);
      return;
    }

    if (clean.length > 1) {
      // Pasted full or partial code
      const chars = clean.slice(0, 6).split('');
      const newDigits = [...codeDigits];
      chars.forEach((c, i) => {
        if (index + i < 6) {
          newDigits[index + i] = c;
        }
      });
      setCodeDigits(newDigits);
      const nextIdx = Math.min(index + chars.length, 5);
      inputRefs.current[nextIdx]?.focus();
      return;
    }

    const newDigits = [...codeDigits];
    newDigits[index] = clean;
    setCodeDigits(newDigits);

    if (index < 5 && clean) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const fullCode = codeDigits.join('');
    if (fullCode.length !== 6) {
      setErrorMsg('Bitte gib den vollständigen 6-stelligen Code ein.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(apiUrl('/api/auth/verify-email/confirm'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: fullCode }),
      });
      const rawText = await res.text();
      let data: any = {};
      let isJson = false;
      try {
        data = JSON.parse(rawText);
        isJson = true;
      } catch {
        // non-JSON response
      }

      if (res.ok && isJson && data.verified) {
        setSuccessMsg('E-Mail-Adresse erfolgreich bestätigt!');
        setTimeout(() => {
          onSuccess();
        }, 600);
      } else {
        if (isJson && data.remaining_attempts !== undefined) {
          setRemainingAttempts(data.remaining_attempts);
          setErrorMsg(
            `Ungültiger Bestätigungscode. Noch ${data.remaining_attempts} von 5 Versuchen übrig.`
          );
        } else if (isJson && data.error === 'expired') {
          setErrorMsg('Der Bestätigungscode ist abgelaufen. Bitte fordere einen neuen an.');
        } else if (isJson && data.error === 'max_attempts_exceeded') {
          setErrorMsg('Maximale Fehlversuche (5) erreicht. Bitte fordere einen neuen Code an.');
        } else {
          setErrorMsg((isJson && data.error) || formatApiErrorMessage(rawText, res.status));
        }
      }
    } catch {
      setErrorMsg('Der Server konnte nicht erreicht werden.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl border p-6 flex flex-col relative"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-primary)',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-4 right-4 w-10 h-10 rounded-xl transition-colors inline-flex items-center justify-center shrink-0 hover:bg-black/5 dark:hover:bg-white/10"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Schließen"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center border"
            style={{
              backgroundColor: 'var(--primary-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--primary-text)',
            }}
          >
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
              E-Mail-Eigentum bestätigen
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Erforderlich vor Aktivierung des Cloud-Syncs
            </p>
          </div>
        </div>

        <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Um sicherzustellen, dass nur du Zugriff auf deinen verschlüsselten Cloud-Speicher hast,
          wurde ein 6-stelliger Einmalcode an{' '}
          <span className="font-mono font-semibold" style={{ color: 'var(--primary-text)' }}>
            {email}
          </span>{' '}
          gesendet.
        </p>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && !errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-4">
          <div className="flex justify-between gap-2 my-2">
            {codeDigits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => (inputRefs.current[idx] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                disabled={loading}
                className="w-12 h-14 text-center font-mono text-2xl font-bold rounded-xl border focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-all"
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  borderColor: digit ? 'var(--primary-500)' : 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                  caretColor: 'var(--primary-500)',
                }}
              />
            ))}
          </div>

          <div className="flex items-center justify-between text-xs px-1" style={{ color: 'var(--text-muted)' }}>
            <span>Code 15 Minuten gültig</span>
            {remainingAttempts !== null && (
              <span className={remainingAttempts <= 2 ? 'text-amber-500 font-medium' : ''}>
                {remainingAttempts} / 5 Versuche übrig
              </span>
            )}
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <button
              type="submit"
              disabled={loading || codeDigits.join('').length !== 6}
              className="w-full py-2.5 px-4 rounded-xl font-medium text-sm text-white shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--primary-500)',
              }}
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Wird verifiziert...
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  E-Mail verifizieren
                </>
              )}
            </button>

            <button
              type="button"
              disabled={cooldown > 0 || sendingCode}
              onClick={requestVerificationCode}
              className="w-full py-2 px-4 rounded-xl text-xs hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${sendingCode ? 'animate-spin' : ''}`} />
              {cooldown > 0
                ? `Neuen Code anfordern (${cooldown}s)`
                : 'Keinen Code erhalten? Neu anfordern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
