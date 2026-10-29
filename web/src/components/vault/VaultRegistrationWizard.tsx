import React from 'react';
import {
  KeyRound,
  Shield,
  Smartphone,
  Fingerprint,
  CheckCircle2,
  Check,
  Copy,
  Printer,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Unlock,
  ExternalLink,
  FileText,
} from 'lucide-react';
import { ActiveVaultSession, RegistrationStep } from './vaultTypes';
import { LegalTab } from '../LegalModal';
import { useLegalConfig, getDisplayDomain } from '../../utils/legalConfig';
import { isTauri } from '../../utils/platform';

interface VaultRegistrationWizardProps {
  step: RegistrationStep;
  setStep: (step: RegistrationStep) => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  confirmPassword: string;
  setConfirmPassword: (password: string) => void;
  optInCloudSync: boolean;
  setOptInCloudSync: (optIn: boolean) => void;
  setShowAvvConfirmation: (show: boolean) => void;
  termsAccepted: boolean;
  setTermsAccepted: (accepted: boolean) => void;
  onOpenTermsModal?: () => void;
  regSession: ActiveVaultSession | null;
  recoverySavedConfirmed: boolean;
  setRecoverySavedConfirmed: (confirmed: boolean) => void;
  regQrDataUrl: string | null;
  showRegTotpManualSecret: boolean;
  setShowRegTotpManualSecret: (show: boolean) => void;
  copiedRegTotpSecret: boolean;
  regTotpCode: string;
  setRegTotpCode: (code: string) => void;
  regTotpVerified: boolean;
  regPasskeyDone: boolean;
  onStartRegistration: (e: React.FormEvent) => void;
  onProceedToTotp: () => void;
  onVerifyRegistration2FA: (e: React.FormEvent) => void;
  onSetupRegistrationPasskey: () => void;
  onSkipPasskey: () => void;
  onFinishRegistration: () => void;
  onCancelRegistration: () => void;
  onCreateLocalOfflineVault: () => void;
  onPrintRecoverySheet: () => void;
  onCopyRecoveryKey: () => void;
  copiedRecoveryKey: boolean;
  onCopyRegSecret: (secret: string) => void;
  onOpenLegal: (tab: LegalTab) => void;
  isLinuxDesktop?: boolean;
  nativeBiometricAvailable?: boolean;
  biometryType?: 'fingerprint' | 'face' | 'iris' | 'touch_id' | 'face_id' | 'none';
}

export const VaultRegistrationWizard: React.FC<VaultRegistrationWizardProps> = ({
  step,
  setStep,
  email,
  setEmail,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  optInCloudSync,
  setOptInCloudSync,
  setShowAvvConfirmation,
  termsAccepted,
  setTermsAccepted,
  onOpenTermsModal,
  regSession,
  recoverySavedConfirmed,
  setRecoverySavedConfirmed,
  regQrDataUrl,
  showRegTotpManualSecret,
  setShowRegTotpManualSecret,
  copiedRegTotpSecret,
  regTotpCode,
  setRegTotpCode,
  regTotpVerified,
  regPasskeyDone,
  onStartRegistration,
  onProceedToTotp,
  onVerifyRegistration2FA,
  onSetupRegistrationPasskey,
  onSkipPasskey,
  onFinishRegistration,
  onCancelRegistration,
  onCreateLocalOfflineVault,
  onPrintRecoverySheet,
  onCopyRecoveryKey,
  copiedRecoveryKey,
  onCopyRegSecret,
  onOpenLegal,
  isLinuxDesktop = false,
  nativeBiometricAvailable = false,
  biometryType = 'none',
}) => {
  const legalConfig = useLegalConfig();

  if (step === 'credentials') {
    return (
      <form onSubmit={onStartRegistration} className="space-y-3.5 text-xs">
        <div>
          <label htmlFor="register-email" className="block font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
            E-Mail-Adresse
          </label>
          <input
            id="register-email"
            name="username"
            type="email"
            autoComplete="username"
            required
            placeholder="name@beispiel.de"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3.5 py-2 rounded-xl border bg-transparent"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
          />
        </div>
        <div>
          <label htmlFor="register-password" className="block font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
            Master-Passwort (mind. 8 Zeichen)
          </label>
          <input
            id="register-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="Master-Passwort (mind. 8 Zeichen)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3.5 py-2 rounded-xl border bg-transparent"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
          />
        </div>
        <div>
          <label htmlFor="register-password-confirm" className="block font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
            Master-Passwort wiederholen
          </label>
          <input
            id="register-password-confirm"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="Master-Passwort wiederholen"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3.5 py-2 rounded-xl border bg-transparent"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
          />
        </div>

        <div
          className="p-3 rounded-xl border flex items-start gap-2.5 transition"
          style={{
            backgroundColor: optInCloudSync ? 'var(--primary-soft)' : 'var(--bg-subtle)',
            borderColor: optInCloudSync ? 'var(--primary-500)' : 'var(--border-subtle)',
          }}
        >
          <input
            type="checkbox"
            id="opt-in-cloud-sync"
            checked={optInCloudSync}
            onChange={(e) => {
              const checked = e.target.checked;
              if (checked) {
                setShowAvvConfirmation(true);
              } else {
                setOptInCloudSync(false);
              }
            }}
            className="mt-0.5 rounded cursor-pointer accent-teal-600"
          />
          <label htmlFor="opt-in-cloud-sync" className="cursor-pointer text-[11px] leading-snug flex-1">
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              E2EE Cloud-Synchronisation aktivieren (Opt-In)
            </span>
            <p className="text-[10px] mt-0.5 opacity-80 leading-normal" style={{ color: 'var(--text-secondary)' }}>
              Standardmäßig <strong>deaktiviert</strong>: Alle Schüler- und Notendaten bleiben zu 100% lokal auf diesem Gerät (bzw. auf deinem Schullaufwerk). Aktiviere dies nur, wenn du mehrere Geräte synchronisieren möchtest.
            </p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <button
                type="button"
                onClick={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  onOpenLegal('school_guide');
                }}
                className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold underline hover:opacity-80"
              >
                Schul-Datenschutz Leitfaden
              </button>
              <span className="text-[10px] opacity-40">•</span>
              <a
                href={legalConfig.avv_url || 'https://gradus21.de/avv.html'}
                target="_blank"
                rel="noreferrer"
                onClick={(ev) => ev.stopPropagation()}
                className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold underline hover:opacity-80 inline-flex items-center gap-1"
                title={`AVV-Mustervertrag online auf ${getDisplayDomain(legalConfig.avv_url)} öffnen`}
              >
                <span>AVV-Mustervertrag ({getDisplayDomain(legalConfig.avv_url)})</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-70" />
              </a>
            </div>
          </label>
        </div>

        <div className="p-2.5 rounded-xl border text-[11px] flex items-start gap-2 text-teal-800 dark:text-teal-300 bg-teal-500/10 border-teal-500/20">
          <Shield className="w-4 h-4 shrink-0 mt-0.5 text-teal-600 dark:text-teal-400" />
          <span className="leading-snug opacity-90">
            Zero-Knowledge: Dein Passwort verlässt dein Gerät niemals unverschlüsselt. Im nächsten Schritt sicherst du deinen Notfall-Schlüssel und richtest 2FA ein.
          </span>
        </div>

        {/* Wichtiger Hinweis zum Speicherort (§ 241 Abs. 2 BGB Belehrung) */}
        <div className="p-3 rounded-xl border text-[11px] leading-snug space-y-1.5 bg-amber-500/10 border-amber-500/25 text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-1.5 font-bold text-xs text-amber-800 dark:text-amber-300">
            <Shield className="w-4 h-4 shrink-0" />
            <span>Wichtiger Hinweis zum Noten-Speicherort:</span>
          </div>
          <p className="leading-relaxed opacity-95">
            „Gradus21 schützt Ihre Daten durch Zero-Knowledge: Standardmäßig verlassen Ihre Noten niemals dieses Gerät. Bitte sichern Sie Ihren Tresor regelmäßig als .gradus21-Datei oder aktivieren Sie den verschlüsselten Cloud-Sync.“
          </p>
        </div>

        {/* Nutzungsbedingungen Bestätigung (Pflichtfeld) */}
        <div
          className="p-3 rounded-xl border flex items-start gap-2.5 transition"
          style={{
            backgroundColor: termsAccepted ? 'var(--primary-soft)' : 'var(--bg-subtle)',
            borderColor: termsAccepted ? 'var(--primary-500)' : 'var(--border-subtle)',
          }}
        >
          <input
            type="checkbox"
            id="terms-accepted"
            checked={termsAccepted}
            onChange={(e) => {
              const checked = e.target.checked;
              if (checked) {
                if (onOpenTermsModal) {
                  onOpenTermsModal();
                } else {
                  setTermsAccepted(true);
                }
              } else {
                setTermsAccepted(false);
              }
            }}
            className="mt-0.5 rounded cursor-pointer accent-teal-600"
            required
          />
          <div className="text-[11px] leading-snug flex-1 select-none">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label
                htmlFor="terms-accepted"
                className="cursor-pointer font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Nutzungsbedingungen akzeptieren (Pflichtfeld)
              </label>
              {onOpenTermsModal && (
                <button
                  type="button"
                  onClick={onOpenTermsModal}
                  className="text-[10px] text-teal-600 dark:text-teal-400 font-bold underline hover:opacity-80 inline-flex items-center gap-1"
                >
                  <FileText className="w-2.5 h-2.5" />
                  <span>Jetzt lesen & prüfen</span>
                </button>
              )}
            </div>
            <p className="text-[10px] mt-0.5 opacity-80 leading-normal" style={{ color: 'var(--text-secondary)' }}>
              Ich habe die{' '}
              {onOpenTermsModal ? (
                <button
                  type="button"
                  onClick={onOpenTermsModal}
                  className="text-teal-600 dark:text-teal-400 font-semibold underline hover:opacity-80 inline-flex items-center gap-0.5"
                >
                  <span>Nutzungsbedingungen</span>
                </button>
              ) : (
                <a
                  href={legalConfig.terms_url || 'https://gradus21.de/nutzungsbedingungen.html'}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(ev) => ev.stopPropagation()}
                  className="text-teal-600 dark:text-teal-400 font-semibold underline hover:opacity-80 inline-flex items-center gap-1"
                >
                  <span>Nutzungsbedingungen</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                </a>
              )}{' '}
              von Gradus21 gelesen und erkläre mich mit ihrer Geltung einverstanden.
            </p>
          </div>
        </div>

        {optInCloudSync ? (
          <button
            type="submit"
            disabled={!termsAccepted}
            className={`w-full py-2.5 rounded-xl text-xs font-bold text-white shadow-sm flex items-center justify-center gap-2 transition ${
              !termsAccepted ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-95'
            }`}
            style={{ backgroundColor: 'var(--primary-500)' }}
          >
            <KeyRound className="w-4 h-4" />
            <span>Konto anlegen & Sicherheit einrichten</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={!termsAccepted}
            onClick={onCreateLocalOfflineVault}
            className={`w-full py-2.5 rounded-xl text-xs font-bold text-white shadow-sm flex items-center justify-center gap-2 transition ${
              !termsAccepted ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-95'
            }`}
            style={{ backgroundColor: 'var(--primary-500)' }}
          >
            <Shield className="w-4 h-4" />
            <span>Rein lokalen Offline-Tresor nutzen (ohne Server)</span>
          </button>
        )}
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {/* SCHRITT 1: WIEDERHERSTELLUNGSSCHLÜSSEL SICHERN */}
      {step === 'recovery' && regSession && (
        <div className="space-y-4 text-xs">
          <div className="p-3.5 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-800 dark:text-teal-300 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 text-xs">
              <KeyRound className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
              <span>Wiederherstellungsschlüssel sichern</span>
            </div>
            <p className="text-[11px] leading-relaxed opacity-90">
              Gradus21 verschlüsselt deine Noten Zero-Knowledge auf deinem Gerät. Wenn du dein Master-Passwort vergisst,
              ist dieser Code die <strong>einzige Möglichkeit</strong>, wieder an deine Schülerdaten zu gelangen.
            </p>
          </div>

          <div>
            <label className="block font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Dein persönlicher 24-stelliger Notfall-Code:
            </label>
            <div
              className="p-3.5 rounded-2xl border font-mono font-bold text-center tracking-wider select-all text-sm sm:text-base break-all"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--primary-500)',
                color: 'var(--text-primary)',
              }}
            >
              {regSession.recoveryKeyFormatted || 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX'}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCopyRecoveryKey}
              className="flex-1 min-w-[140px] py-2 px-3 rounded-xl border font-semibold flex items-center justify-center gap-1.5 transition hover:opacity-90"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {copiedRecoveryKey ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700">Code kopiert!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Code kopieren</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onPrintRecoverySheet}
              className="flex-1 min-w-[140px] py-2 px-3 rounded-xl border font-semibold flex items-center justify-center gap-1.5 transition hover:opacity-90"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <Printer className="w-4 h-4 text-teal-600" />
              <span>Notfallblatt drucken</span>
            </button>
          </div>

          <div
            className="p-3 rounded-xl border flex items-start gap-2.5 transition"
            style={{
              backgroundColor: recoverySavedConfirmed ? 'var(--primary-soft)' : 'var(--bg-subtle)',
              borderColor: recoverySavedConfirmed ? 'var(--primary-500)' : 'var(--border-subtle)',
            }}
          >
            <input
              type="checkbox"
              id="reg-recovery-ack"
              checked={recoverySavedConfirmed}
              onChange={(e) => setRecoverySavedConfirmed(e.target.checked)}
              className="mt-0.5 rounded cursor-pointer accent-teal-600"
            />
            <label
              htmlFor="reg-recovery-ack"
              className="cursor-pointer font-medium text-[11px] leading-snug"
              style={{ color: 'var(--text-primary)' }}
            >
              Ich habe diesen Notfall-Code sicher notiert oder das Notfallblatt ausgedruckt und verwahrt.
            </label>
          </div>

          <button
            type="button"
            onClick={onProceedToTotp}
            disabled={!recoverySavedConfirmed}
            className={`w-full py-2.5 rounded-xl text-xs font-bold text-white shadow-sm flex items-center justify-center gap-2 transition ${
              !recoverySavedConfirmed ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-95'
            }`}
            style={{ backgroundColor: 'var(--primary-500)' }}
          >
            <span>Weiter zur 2FA-Einrichtung</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SCHRITT 2: 2-FAKTOR-AUTHENTIFIZIERUNG EINRICHTEN */}
      {step === 'totp' && regSession && (
        <form onSubmit={onVerifyRegistration2FA} className="space-y-4 text-xs">
          <div className="p-3.5 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-800 dark:text-teal-300 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-xs">
              <Smartphone className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
              <span>2-Faktor-Authentifizierung (2FA)</span>
            </div>
            <p className="text-[11px] leading-relaxed opacity-90">
              Scanne diesen QR-Code mit deiner Authenticator-App (z.B. Google Authenticator, Microsoft Authenticator, Apple Passwörter oder 2FAS).
            </p>
          </div>

          <div
            className="flex flex-col items-center justify-center p-3 rounded-2xl border"
            style={{
              backgroundColor: 'var(--bg-subtle)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {regQrDataUrl ? (
              <img
                src={regQrDataUrl}
                alt="2FA QR Code"
                className="w-44 h-44 rounded-xl border p-2 bg-white shadow-sm"
              />
            ) : (
              <div className="w-44 h-44 flex items-center justify-center text-xs text-zinc-400">
                QR-Code wird geladen...
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowRegTotpManualSecret(!showRegTotpManualSecret)}
              className="mt-3 text-[11px] font-semibold flex items-center gap-1 transition hover:underline"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span>Keine Kamera? Schlüssel manuell eingeben</span>
              {showRegTotpManualSecret ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showRegTotpManualSecret && regSession.totpSecretBase32 && (
              <div className="mt-2 w-full p-2.5 rounded-xl border text-center space-y-1.5 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                <div className="font-mono font-bold tracking-wider select-all text-xs text-teal-700 dark:text-teal-400 break-all">
                  {regSession.totpSecretBase32}
                </div>
                <button
                  type="button"
                  onClick={() => onCopyRegSecret(regSession.totpSecretBase32 || '')}
                  className="text-[11px] font-semibold text-teal-600 hover:underline inline-flex items-center gap-1"
                >
                  {copiedRegTotpSecret ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedRegTotpSecret ? 'Schlüssel kopiert!' : 'Schlüssel kopieren'}
                </button>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="reg-totp" className="block font-semibold mb-1 text-center" style={{ color: 'var(--text-secondary)' }}>
              6-stelligen Code aus der Authenticator-App eingeben:
            </label>
            <input
              id="reg-totp"
              name="totp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              value={regTotpCode}
              onChange={(e) => setRegTotpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              autoFocus
              className="w-48 mx-auto block px-3.5 py-2.5 rounded-xl border font-mono text-center tracking-widest text-lg font-bold bg-transparent"
              style={{ borderColor: 'var(--primary-500)', color: 'var(--text-primary)' }}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setStep('recovery')}
              className="py-2.5 px-3 rounded-xl border font-semibold flex items-center justify-center gap-1 transition hover:opacity-90"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Zurück</span>
            </button>

            <button
              type="submit"
              disabled={regTotpCode.length !== 6 || regTotpVerified}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm flex items-center justify-center gap-2 transition ${
                regTotpCode.length !== 6 || regTotpVerified
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:opacity-95'
              }`}
              style={{ backgroundColor: 'var(--primary-500)' }}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Code bestätigen & 2FA aktivieren</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setStep('passkey')}
            className="w-full py-1.5 text-center text-[11px] font-medium transition hover:underline opacity-80"
            style={{ color: 'var(--text-secondary)' }}
          >
            2FA vorerst überspringen & später einrichten
          </button>
        </form>
      )}

      {/* SCHRITT 3: PASSKEY / BIOMETRIE / LINUX-SCHLÜSSELBUND EINRICHTEN (OPTIONAL) */}
      {step === 'passkey' && regSession && (
        <div className="space-y-4 text-xs">
          {isTauri() && !nativeBiometricAvailable && !isLinuxDesktop ? (
            <div className="p-3.5 rounded-2xl bg-zinc-500/10 border border-zinc-500/20 text-zinc-800 dark:text-zinc-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-xs">
                <Fingerprint className="w-4 h-4 text-zinc-500 shrink-0" />
                <span>Biometrische Schnell-Anmeldung nicht verfügbar</span>
              </div>
              <p className="text-[11px] leading-relaxed opacity-90">
                Auf diesem Gerät ist aktuell keine Hardware-Biometrie (Face ID / Fingerabdruck) eingerichtet oder aktiv. Du kannst die Registrierung nun abschließen und dich jederzeit sicher mit deinem Master-Passwort anmelden.
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-800 dark:text-teal-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-xs">
                <Fingerprint className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                <span>
                  {isLinuxDesktop
                    ? 'Schnell-Anmeldung per Linux-Schlüsselbund (Optional)'
                    : nativeBiometricAvailable
                    ? biometryType === 'face' || biometryType === 'face_id'
                      ? 'Schnell-Anmeldung per Face ID (Optional)'
                      : 'Schnell-Anmeldung per Fingerabdruck (Optional)'
                    : 'Schnell-Anmeldung per Passkey (Optional)'}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed opacity-90">
                {isLinuxDesktop
                  ? 'Hinterlegt deinen Tresorschlüssel sicher im systemeigenen Linux-Schlüsselbund (GNOME Keyring / KWallet via Secret Service API). Unterstützt System-Fingerabdruck (fprintd) oder automatisches Entsperren bei Desktop-Login.'
                  : nativeBiometricAvailable
                  ? 'Entsperre Gradus21 in Zukunft per Fingerabdruck oder Face ID – ganz ohne langes Passwort. Der Schlüssel wird hardware-verschlüsselt im Sicherheitschip (Android Keystore / Apple Secure Enclave) dieses Geräts verankert.'
                  : 'Entsperre Gradus21 in Zukunft per Fingerabdruck, Face ID oder PIN – ganz ohne langes Passwort. Der Schlüssel wird sicher im Hardware-Sicherheitschip (TPM / Secure Enclave) dieses Geräts verankert.'}
              </p>
            </div>
          )}

          {isLinuxDesktop && (
            <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-[11px] leading-relaxed flex items-start gap-2">
              <Shield className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>Sicherheitshinweis für Linux:</strong> Der Schlüsselbund schützt deinen Tresor auf Benutzerebene. Für vollständigen Hardware-Diebstahlschutz wird eine Festplattenverschlüsselung (LUKS / dm-crypt) empfohlen.
              </span>
            </div>
          )}

          {regPasskeyDone ? (
            <div className="p-4 rounded-2xl border text-center space-y-2 bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <div className="font-bold text-xs">
                {isLinuxDesktop
                  ? 'Im Linux-Schlüsselbund erfolgreich hinterlegt!'
                  : nativeBiometricAvailable
                  ? 'Biometrische Schnell-Anmeldung erfolgreich eingerichtet!'
                  : 'Passkey erfolgreich eingerichtet!'}
              </div>
              <p className="text-[11px] opacity-90">
                {isLinuxDesktop
                  ? 'Gradus21 kann auf diesem Rechner ab sofort bequem über den Linux-Schlüsselbund entsperrt werden.'
                  : 'Du kannst Gradus21 auf diesem Gerät ab sofort mit nur einem Klick entsperren.'}
              </p>
            </div>
          ) : isTauri() && !nativeBiometricAvailable && !isLinuxDesktop ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={onSkipPasskey}
                className="w-full py-3 px-4 rounded-2xl text-xs font-bold text-white flex items-center justify-center gap-2.5 shadow-md transition hover:opacity-95"
                style={{ backgroundColor: 'var(--primary-500)' }}
              >
                <span>Weiter zum Abschluss (Überspringen)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={onSetupRegistrationPasskey}
                className="w-full py-3 px-4 rounded-2xl text-xs font-bold text-white flex items-center justify-center gap-2.5 shadow-md transition hover:opacity-95"
                style={{ backgroundColor: 'var(--primary-500)' }}
              >
                <Fingerprint className="w-5 h-5" />
                <span>
                  {isLinuxDesktop
                    ? 'Im Linux-Schlüsselbund hinterlegen'
                    : nativeBiometricAvailable
                    ? biometryType === 'face' || biometryType === 'face_id'
                      ? 'Face ID auf diesem Gerät einrichten'
                      : 'Fingerabdruck auf diesem Gerät einrichten'
                    : 'Passkey auf diesem Gerät einrichten'}
                </span>
              </button>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setStep('totp')}
              className="py-2.5 px-3 rounded-xl border font-semibold flex items-center justify-center gap-1 transition hover:opacity-90"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Zurück</span>
            </button>

            {regPasskeyDone || (isTauri() && !nativeBiometricAvailable && !isLinuxDesktop) ? (
              <button
                type="button"
                onClick={() => setStep('complete')}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm flex items-center justify-center gap-2 transition hover:opacity-95"
                style={{ backgroundColor: 'var(--primary-500)' }}
              >
                <span>Weiter zum Abschluss</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSkipPasskey}
                className="flex-1 py-2.5 rounded-xl border font-semibold flex items-center justify-center gap-1 transition hover:opacity-90"
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <span>Diesen Schritt überspringen</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* SCHRITT 4: REGISTRIERUNG ABGESCHLOSSEN */}
      {step === 'complete' && regSession && (
        <div className="space-y-4 text-xs">
          <div className="text-center space-y-1.5 py-1">
            <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
              Registrierung abgeschlossen!
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              Dein Gradus21-Notentresor ist vollständig eingerichtet und geschützt.
            </p>
          </div>

          <div
            className="p-3.5 rounded-2xl border space-y-2.5 text-[11px]"
            style={{
              backgroundColor: 'var(--bg-subtle)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold">
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Konto angelegt & Zero-Knowledge verschlüsselt</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold">
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Wiederherstellungsschlüssel für den Notfall gesichert</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold">
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Zwei-Faktor-Authentifizierung (2FA) aktiv</span>
            </div>
            {optInCloudSync ? (
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold">
                <Check className="w-4 h-4 stroke-[3]" />
                <span>E2EE Cloud-Synchronisation aktiviert</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                <div className="w-4 h-4 rounded-full border border-dashed border-zinc-400 flex items-center justify-center text-[9px] text-zinc-400">
                  ○
                </div>
                <span>Rein lokaler Offline-Modus (Cloud-Sync deaktiviert)</span>
              </div>
            )}
            <div className="flex items-center gap-2 font-semibold">
              {regPasskeyDone ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {isLinuxDesktop
                      ? 'Linux-Schlüsselbund für Schnell-Entsperrung eingerichtet'
                      : nativeBiometricAvailable
                      ? 'Biometrische Schnell-Entsperrung eingerichtet'
                      : 'Passkey für 1-Klick-Entsperrung eingerichtet'}
                  </span>
                </>
              ) : (
                <>
                  <div className="w-4 h-4 rounded-full border border-dashed border-zinc-400 flex items-center justify-center text-[9px] text-zinc-400">
                    ○
                  </div>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {isLinuxDesktop
                      ? 'Linux-Schlüsselbund übersprungen (in den Einstellungen jederzeit möglich)'
                      : nativeBiometricAvailable
                      ? 'Biometrie übersprungen (in den Einstellungen jederzeit möglich)'
                      : 'Passkey übersprungen (in den Einstellungen jederzeit möglich)'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Speicherort & Datensicherheit Belehrung (§ 241 Abs. 2 BGB) */}
          <div className="p-3.5 rounded-2xl border space-y-1.5 text-[11px] bg-amber-500/10 border-amber-500/25 text-amber-950 dark:text-amber-200">
            <div className="flex items-center gap-1.5 font-bold text-xs text-amber-800 dark:text-amber-300">
              <Shield className="w-4 h-4 shrink-0" />
              <span>Wichtiger Hinweis zum Noten-Speicherort:</span>
            </div>
            <p className="leading-relaxed opacity-95">
              „Gradus21 schützt Ihre Daten durch Zero-Knowledge: Standardmäßig verlassen Ihre Noten niemals dieses Gerät. Bitte sichern Sie Ihren Tresor regelmäßig als .gradus21-Datei oder aktivieren Sie den verschlüsselten Cloud-Sync.“
            </p>
          </div>

          <button
            type="button"
            onClick={onFinishRegistration}
            className="w-full py-3 rounded-2xl text-xs font-bold text-white shadow-md flex items-center justify-center gap-2.5 transition hover:opacity-95"
            style={{ backgroundColor: 'var(--primary-500)' }}
          >
            <Unlock className="w-4 h-4" />
            <span>Gradus21 starten & Noten verwalten</span>
          </button>
        </div>
      )}

      {/* Link: Registrierung abbrechen */}
      <div className="text-center pt-1">
        <button
          type="button"
          onClick={onCancelRegistration}
          className="text-[11px] font-medium transition hover:underline"
          style={{ color: 'var(--text-secondary)' }}
        >
          Registrierung abbrechen & zum Login zurückkehren
        </button>
      </div>
    </div>
  );
};
