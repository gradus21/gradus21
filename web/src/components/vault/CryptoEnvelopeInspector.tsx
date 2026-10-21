import React, { useState } from 'react';
import {
  KeyRound,
  Lock,
  X,
  Fingerprint,
  Plus,
  Edit2,
  Trash2,
  Shield,
  Printer,
  Copy,
  RefreshCw,
  Smartphone,
  ChevronDown,
  ChevronUp,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  GraduationCap,
  ExternalLink,
  FileText,
} from 'lucide-react';
import { ActiveVaultSession, UserPasskeyItem, LocalPasskeyStoreEntry } from './vaultTypes';
import { LegalModal, LegalTab } from '../LegalModal';
import { useLegalConfig, getDisplayDomain } from '../../utils/legalConfig';

interface CryptoEnvelopeInspectorProps {
  session: ActiveVaultSession;
  sampleEnvelope: {
    entityId: string;
    plaintext: string;
    ciphertext: string;
    decryptedVerify: string;
  } | null;
  onLockVault: () => void;
  onCloseInspector?: () => void;
  cloudSyncEnabled?: boolean;
  onToggleCloudSync?: (enable: boolean) => void | Promise<void | boolean>;
  onPurgeCloudData?: () => void | Promise<void | boolean>;
  userPasskeys: UserPasskeyItem[];
  localPasskeyForEmail: LocalPasskeyStoreEntry | null;
  qrSvgDataUrl: string | null;
  totpVerifyInput: string;
  setTotpVerifyInput: (val: string) => void;
  onSetupPasskey: () => Promise<boolean>;
  onRenamePasskey: (id: string, label: string) => Promise<void>;
  onDeletePasskey: (id: string, credId: string) => Promise<void>;
  onRotateRecoveryKey: () => void;
  onPrintRecoverySheet: () => void;
  onReconfigure2FA: () => void;
  onDisable2FA: () => void;
  onVerify2FAToken: (e?: React.FormEvent) => void | Promise<void>;
  statusMsg: string | null;
  errorMsg: string | null;
  setStatusMsg: (msg: string | null) => void;
  setErrorMsg: (msg: string | null) => void;
}

export const CryptoEnvelopeInspector: React.FC<CryptoEnvelopeInspectorProps> = ({
  session,
  sampleEnvelope,
  onLockVault,
  onCloseInspector,
  cloudSyncEnabled = false,
  onToggleCloudSync,
  onPurgeCloudData,
  userPasskeys,
  localPasskeyForEmail,
  qrSvgDataUrl,
  totpVerifyInput,
  setTotpVerifyInput,
  onSetupPasskey,
  onRenamePasskey,
  onDeletePasskey,
  onRotateRecoveryKey,
  onPrintRecoverySheet,
  onReconfigure2FA,
  onDisable2FA,
  onVerify2FAToken,
  statusMsg,
  errorMsg,
  setStatusMsg,
  setErrorMsg,
}) => {
  const [editingPasskeyId, setEditingPasskeyId] = useState<string | null>(null);
  const [editingPasskeyLabel, setEditingPasskeyLabel] = useState<string>('');
  const [copiedRecoveryKey, setCopiedRecoveryKey] = useState(false);
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [showAvvConfirmation, setShowAvvConfirmation] = useState(false);
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<LegalTab>('impressum');
  const [isTogglingSync, setIsTogglingSync] = useState(false);
  const [isPurgingCloud, setIsPurgingCloud] = useState(false);
  const legalConfig = useLegalConfig();

  const isPasskeyActive = userPasskeys.length > 0 || Boolean(localPasskeyForEmail);

  const handleOpenLegal = (tab: LegalTab) => {
    setLegalTab(tab);
    setLegalModalOpen(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="max-w-2xl w-full rounded-2xl border p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b pb-4"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary-text)' }}
            >
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                Konto & Datenschutz-Einstellungen
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Angemeldet als <strong>{session.email}</strong> · Alle Schülerdaten sind privat verschlüsselt
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onLockVault}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 transition active:scale-[0.98]"
              title="Sperrt die Ansicht, bis du dich wieder per Fingerabdruck oder Passwort anmeldest"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>App jetzt sperren</span>
            </button>
            {onCloseInspector && (
              <button
                onClick={onCloseInspector}
                className="w-10 h-10 rounded-xl border inline-flex items-center justify-center shrink-0"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 text-xs font-semibold">
            {errorMsg}
          </div>
        )}
        {statusMsg && (
          <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-700 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Karte 1: Schnell-Anmeldung per Fingerabdruck / Face ID (Passkeys) */}
        <div
          className="p-5 rounded-2xl border space-y-4"
          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <Fingerprint className="w-4 h-4" style={{ color: 'var(--primary-500)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  1. Schnell-Anmeldung mit Fingerabdruck / Face ID (Passkeys)
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    isPasskeyActive ? 'bg-emerald-100 text-emerald-800' : 'bg-teal-100 text-teal-800'
                  }`}
                >
                  {userPasskeys.length > 0
                    ? `${userPasskeys.length} ${userPasskeys.length === 1 ? 'Passkey' : 'Passkeys'} aktiv`
                    : isPasskeyActive
                    ? 'Eingerichtet'
                    : 'Empfohlen'}
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Öffne deine Notenlisten einfach mit deinem <strong>Fingerabdruck (Touch ID / Windows Hello)</strong>, <strong>Face ID</strong> oder <strong>Sicherheitsschlüssel (YubiKey)</strong>.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onSetupPasskey()}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-sm shrink-0 transition hover:opacity-95"
              style={{ backgroundColor: 'var(--primary-500)' }}
            >
              <Plus className="w-4 h-4" />
              <span>{isPasskeyActive ? 'Weiteren Passkey einrichten' : 'Passkey jetzt aktivieren'}</span>
            </button>
          </div>

          {/* Liste verknüpfter Passkeys */}
          {userPasskeys.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="text-[11px] font-bold tracking-wider uppercase" style={{ color: 'var(--text-tertiary)' }}>
                Hinterlegte Geräte & Sicherheitsschlüssel:
              </div>
              {userPasskeys.map((pk) => {
                const isCurrentDevice = localPasskeyForEmail?.credentialId === pk.credential_id;
                const isEditing = editingPasskeyId === pk.id;

                return (
                  <div
                    key={pk.id}
                    className="p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: 'var(--bg-subtle)' }}
                      >
                        <Fingerprint className="w-4 h-4 text-emerald-600" />
                      </div>

                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingPasskeyLabel}
                              onChange={(e) => setEditingPasskeyLabel(e.target.value)}
                              className="px-2 py-1 text-xs rounded-lg border flex-1"
                              style={{
                                backgroundColor: 'var(--bg-subtle)',
                                borderColor: 'var(--border-primary)',
                                color: 'var(--text-primary)',
                              }}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  onRenamePasskey(pk.id, editingPasskeyLabel);
                                  setEditingPasskeyId(null);
                                }
                                if (e.key === 'Escape') setEditingPasskeyId(null);
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                onRenamePasskey(pk.id, editingPasskeyLabel);
                                setEditingPasskeyId(null);
                              }}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700"
                            >
                              Speichern
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPasskeyId(null)}
                              className="px-2 py-1 text-xs"
                            >
                              Abbrechen
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                              {pk.label}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPasskeyId(pk.id);
                                setEditingPasskeyLabel(pk.label);
                              }}
                              className="p-1 text-slate-400 hover:text-slate-600 transition"
                              title="Namen des Passkeys ändern"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            {isCurrentDevice && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                Dieses Gerät
                              </span>
                            )}
                            {pk.prf_supported && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                                <Shield className="w-2.5 h-2.5" />
                                Hardware PRF (Secure Enclave)
                              </span>
                            )}
                          </div>
                        )}
                        <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                          Registriert am {new Date(pk.created_at).toLocaleDateString('de-DE')}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDeletePasskey(pk.id, pk.credential_id)}
                      className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                      title="Diesen Passkey entfernen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Karte 2: Dein persönliches Notfallblatt */}
        <div
          className="p-5 rounded-2xl border space-y-4"
          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  2. Dein persönliches Notfallblatt (Wichtig!)
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    session.recoveryKeyFormatted
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : 'bg-teal-100 text-teal-800'
                  }`}
                >
                  {session.recoveryKeyFormatted ? 'Neu ausgestellt — bitte jetzt drucken!' : 'Aktiv hinterlegt'}
                </span>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Da deine Noten nur für dich lesbar verschlüsselt sind, kann niemand sonst dein Passwort zurücksetzen.
                Falls du dein Notfallblatt verlegt hast, kannst du hier jederzeit einen frischen Notfall-Code generieren.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onRotateRecoveryKey}
                className="px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition hover:opacity-90 shadow-sm"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <RefreshCw className="w-3.5 h-3.5 text-teal-600" />
                <span>{session.recoveryKeyFormatted ? 'Code neu generieren' : 'Notfallblatt neu ausstellen'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (session.recoveryKeyFormatted) {
                    navigator.clipboard?.writeText(session.recoveryKeyFormatted);
                    setCopiedRecoveryKey(true);
                    setTimeout(() => setCopiedRecoveryKey(false), 2000);
                  }
                }}
                disabled={!session.recoveryKeyFormatted}
                className="px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 disabled:opacity-40"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedRecoveryKey ? 'Kopiert!' : 'Code kopieren'}</span>
              </button>
              <button
                type="button"
                onClick={onPrintRecoverySheet}
                disabled={!session.recoveryKeyFormatted}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-sm disabled:opacity-40 transition hover:opacity-95"
                style={{ backgroundColor: 'var(--primary-500)' }}
              >
                <Printer className="w-4 h-4" />
                <span>Notfallblatt drucken</span>
              </button>
            </div>
          </div>

          <div
            className={`p-3.5 rounded-xl border font-mono text-xs font-bold text-center tracking-wider select-all ${
              session.recoveryKeyFormatted ? 'border-dashed border-teal-500' : ''
            }`}
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: session.recoveryKeyFormatted ? 'var(--primary-500)' : 'var(--border-subtle)',
              color: session.recoveryKeyFormatted ? 'var(--primary-500)' : 'var(--text-secondary)',
            }}
          >
            {session.recoveryKeyFormatted ? (
              <div className="space-y-1">
                <div className="text-[10px] uppercase font-sans font-semibold tracking-normal text-teal-700">
                  Dein neuer Notfall-Code (jetzt sichern oder drucken):
                </div>
                <div className="text-sm font-extrabold text-teal-800">{session.recoveryKeyFormatted}</div>
              </div>
            ) : (
              <span className="font-sans font-normal text-xs opacity-90">
                🔒 Aus Zero-Knowledge-Sicherheitsgründen wird der Klartext-Code nicht dauerhaft im Browser gespeichert. Klicke oben auf <strong>„Notfallblatt neu ausstellen“</strong>, wenn du dein Blatt verloren hast.
              </span>
            )}
          </div>
        </div>

        {/* Karte 3: Zwei-Faktor-Schutz per Smartphone */}
        <div
          className="p-5 rounded-2xl border flex flex-col sm:flex-row gap-5 items-center"
          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
        >
          {qrSvgDataUrl && !session.totpEnabled && (
            <div className="bg-white p-2 rounded-2xl border shadow-sm shrink-0">
              <img
                src={qrSvgDataUrl}
                alt="QR-Code für Handy-App"
                className="w-36 h-36 block"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
          )}
          <div className="space-y-2.5 flex-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                <Smartphone className="w-4 h-4 text-teal-600" />
                <span>3. Zwei-Faktor-Schutz per Smartphone (2FA)</span>
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  session.totpEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {session.totpEnabled ? 'Aktiviert' : 'Optional einrichten'}
              </span>
            </div>

            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {session.totpEnabled
                ? 'Zwei-Faktor-Authentifizierung (TOTP) ist für dein Konto aktiv und schützt deine Anmeldung.'
                : 'Scanne den QR-Code links mit Google Authenticator, Bitwarden, Apple Passwörter oder 2FAS:'}
            </p>

            {session.totpEnabled && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={onReconfigure2FA}
                  className="px-3.5 py-1.5 rounded-xl border text-xs font-bold transition hover:opacity-80"
                  style={{
                    backgroundColor: 'var(--primary-soft)',
                    color: 'var(--primary-text)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  2FA neu konfigurieren
                </button>
                <button
                  type="button"
                  onClick={onDisable2FA}
                  className="px-3 py-1.5 rounded-xl border text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  2FA deaktivieren
                </button>
              </div>
            )}

            {!session.totpEnabled && (
              <form onSubmit={onVerify2FAToken} className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="6-stelliger Code"
                  value={totpVerifyInput}
                  onChange={(e) => setTotpVerifyInput(e.target.value.replace(/\D/g, ''))}
                  className="px-3 py-1.5 rounded-xl border text-xs font-mono font-bold tracking-widest text-center w-36"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="submit"
                  disabled={totpVerifyInput.length !== 6}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white disabled:opacity-50 transition"
                  style={{ backgroundColor: 'var(--primary-500)' }}
                >
                  2FA aktivieren
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Karte 4: E2EE Cloud-Synchronisation */}
        <div
          className="p-5 rounded-2xl border space-y-4"
          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 flex-1">
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                4. Ende-zu-Ende verschlüsselte Cloud-Synchronisation
              </span>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Synchronisiere deine Klassen und Noten nahtlos und sicher zwischen Schul-Laptop, Tablet und Heim-PC.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!cloudSyncEnabled) {
                    setShowAvvConfirmation(true);
                  } else if (onToggleCloudSync) {
                    setIsTogglingSync(true);
                    Promise.resolve(onToggleCloudSync(false))
                      .then(() => setStatusMsg('Cloud-Synchronisation deaktiviert.'))
                      .catch((e) => setErrorMsg(String(e)))
                      .finally(() => setIsTogglingSync(false));
                  }
                }}
                disabled={isTogglingSync}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  cloudSyncEnabled
                    ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                    : 'bg-teal-600 hover:bg-teal-500 text-white'
                }`}
              >
                <span>{cloudSyncEnabled ? 'Cloud-Sync deaktivieren' : 'Cloud-Sync aktivieren'}</span>
              </button>

              {cloudSyncEnabled && onPurgeCloudData && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Möchtest du wirklich alle verschlüsselten Noten-Backups aus der Cloud löschen?')) {
                      setIsPurgingCloud(true);
                      Promise.resolve(onPurgeCloudData())
                        .then(() => setStatusMsg('Cloud-Daten erfolgreich bereinigt.'))
                        .catch((e) => setErrorMsg(String(e)))
                        .finally(() => setIsPurgingCloud(false));
                    }
                  }}
                  disabled={isPurgingCloud}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200 transition flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Cloud-Daten löschen</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Karte 5: Krypto-Inspektor / Technische Details */}
        <div
          className="p-5 rounded-2xl border space-y-3"
          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
        >
          <button
            type="button"
            onClick={() => setShowTechDetails(!showTechDetails)}
            className="w-full flex items-center justify-between text-left font-bold text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>5. Technischer Krypto-Inspektor & Audit-Log</span>
            {showTechDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showTechDetails && (
            <div className="space-y-3 pt-2 text-[11px] font-mono">
              <div
                className="p-3 rounded-xl border space-y-1 break-all"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="font-bold text-teal-600">User-ID:</div>
                <div style={{ color: 'var(--text-primary)' }}>{session.userId}</div>
                <div className="font-bold text-teal-600 pt-1">Argon2id Salt (B64):</div>
                <div style={{ color: 'var(--text-primary)' }}>{session.kdfSaltB64}</div>
                <div className="font-bold text-teal-600 pt-1">Verschlüsselter Master-DEK:</div>
                <div style={{ color: 'var(--text-primary)' }}>{session.encryptedDek}</div>
              </div>

              {sampleEnvelope && (
                <div
                  className="p-3 rounded-xl border space-y-1 break-all"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="font-bold text-teal-600">Test-Umschlag (AES-256-GCM Ciphertext):</div>
                  <div style={{ color: 'var(--text-primary)' }}>{sampleEnvelope.ciphertext}</div>
                  <div className="font-bold text-teal-600 pt-1">Entschlüsselte Verifikation:</div>
                  <div className="text-emerald-600 font-bold">{sampleEnvelope.decryptedVerify}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Legal Links */}
        <div className="pt-2 flex items-center justify-center gap-3 text-xs opacity-70">
          <button
            type="button"
            onClick={() => handleOpenLegal('impressum')}
            className="hover:underline transition hover:opacity-100"
          >
            Impressum
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => handleOpenLegal('privacy')}
            className="hover:underline transition hover:opacity-100"
          >
            Datenschutz
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => handleOpenLegal('school_guide')}
            className="hover:underline transition hover:opacity-100 text-teal-600 dark:text-teal-400 font-semibold"
          >
            Schul-Datenschutz
          </button>
          <span>•</span>
          <a
            href={legalConfig.avv_url || 'https://gradus21.de/avv.html'}
            target="_blank"
            rel="noreferrer"
            className="hover:underline transition hover:opacity-100 inline-flex items-center gap-1 font-semibold"
            style={{ color: 'var(--primary-600)' }}
          >
            <span>AVV-Mustervertrag</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>
        </div>
      </div>

      {/* AVV Bestätigungs-Modal */}
      {showAvvConfirmation && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="max-w-md w-full rounded-2xl border p-6 shadow-2xl space-y-4"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center shrink-0">
                <FileCheck className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Liegt für deine Schule bereits ein AVV vor?
                </h4>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Gemäß Art. 28 DSGVO ist für die verschlüsselte Cloud-Synchronisation von Noten- und Schülerdaten ein Auftragsverarbeitungsvertrag (AVV) erforderlich.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
              Falls deine Schulleitung noch nicht zugestimmt hat, leiten wir dich gerne direkt zur Mustervorlage weiter.
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAvvConfirmation(false)}
                className="px-3.5 py-2 rounded-xl border text-xs font-semibold hover:opacity-80 transition"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
              >
                Abbrechen
              </button>

              <a
                href={legalConfig.avv_url || 'https://gradus21.de/avv.html'}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-500/20 transition flex items-center justify-center gap-1.5"
                title={`AVV-Mustervertrag online auf ${getDisplayDomain(legalConfig.avv_url)} öffnen`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>AVV-Muster ({getDisplayDomain(legalConfig.avv_url)})</span>
                <ExternalLink className="w-3 h-3 opacity-70" />
              </a>

              <button
                type="button"
                onClick={() => {
                  setShowAvvConfirmation(false);
                  handleOpenLegal('school_guide');
                }}
                className="px-3.5 py-2 rounded-xl border border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300 text-xs font-bold hover:bg-teal-500/20 transition flex items-center justify-center gap-1.5"
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Leitfaden</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  setShowAvvConfirmation(false);
                  if (onToggleCloudSync) {
                    setIsTogglingSync(true);
                    try {
                      await onToggleCloudSync(true);
                      setStatusMsg('E2EE Cloud-Synchronisation wurde aktiviert.');
                    } catch (err: any) {
                      setErrorMsg('Fehler beim Aktivieren der Synchronisation: ' + String(err));
                    } finally {
                      setIsTogglingSync(false);
                    }
                  }
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition hover:opacity-95 flex items-center justify-center gap-1.5"
                style={{ backgroundColor: 'var(--primary-500)' }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Ja, AVV liegt vor / genehmigt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legal Modal */}
      <LegalModal
        isOpen={legalModalOpen}
        initialTab={legalTab}
        onClose={() => setLegalModalOpen(false)}
      />
    </div>
  );
};
