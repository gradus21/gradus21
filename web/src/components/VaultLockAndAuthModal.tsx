import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  wasm_derive_recovery_auth_key,
  wasm_generate_vault,
  wasm_rewrap_dek,
  wasm_unlock_vault,
  wasm_unlock_with_recovery,
  wasm_unwrap_dek_with_passkey,
  wasm_wrap_dek_with_passkey,
  wasm_wrap_dek_with_recovery,
} from '../wasm-pkg/gradus21_core';
import { escapeHtml } from './ExportAndPrintHelpers';
import { FlowRibbonLogo } from './FlowRibbonLogo';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Fingerprint,
  KeyRound,
  Lock,
  Printer,
  Shield,
  Smartphone,
  Unlock,
  X,
} from 'lucide-react';

export interface ActiveVaultSession {
  token: string;
  userId: string;
  email: string;
  isAdmin?: boolean;
  kdfSaltB64: string;
  dekB64: string;
  encryptedDek: string;
  recoveryEncryptedDek: string;
  recoveryKeyFormatted?: string;
  totpEnabled: boolean;
  totpSetupUri?: string;
  totpSecretBase32?: string;
  passkeyCredentialId?: string;
  passkeyLabel?: string;
  serverSyncedCount: number;
}

interface VaultLockAndAuthModalProps {
  isLockedScreen: boolean;
  session: ActiveVaultSession | null;
  sampleEnvelope: {
    entityId: string;
    plaintext: string;
    ciphertext: string;
    decryptedVerify: string;
  } | null;
  onUnlockSuccess: (newSession: ActiveVaultSession) => void;
  onLockVault: () => void;
  onCloseInspector?: () => void;
}

interface LocalPasskeyStoreEntry {
  credentialId: string;
  email: string;
  label: string;
  prfSupported?: boolean;
  prfSaltB64?: string;
  passkeySecretB64?: string; // Fallback only for non-PRF authenticators
  createdAt: string;
}

interface LocalRecoveryMetaEntry {
  email: string;
  recoveryEncryptedDek: string;
}

const PASSKEY_STORAGE_KEY = 'gradus21_passkey_device_store_v2';
const LEGACY_PASSKEY_STORAGE_KEY = 'bte_notenflow_passkey_device_store_v1';
const RECOVERY_META_STORAGE_KEY = 'gradus21_recovery_meta_v2';
const LEGACY_RECOVERY_META_STORAGE_KEY = 'bte_notenflow_recovery_meta_v1';

function loadLocalPasskeys(): Record<string, LocalPasskeyStoreEntry> {
  try {
    const raw = localStorage.getItem(PASSKEY_STORAGE_KEY) || localStorage.getItem(LEGACY_PASSKEY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalPasskey(entry: LocalPasskeyStoreEntry) {
  const store = loadLocalPasskeys();
  store[entry.email.trim().toLowerCase()] = entry;
  store[entry.credentialId] = entry;
  localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(store));
}

function loadLocalRecoveryMeta(email: string): LocalRecoveryMetaEntry | null {
  try {
    const raw = localStorage.getItem(RECOVERY_META_STORAGE_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw) as Record<string, LocalRecoveryMetaEntry>;
    return store[email.trim().toLowerCase()] || Object.values(store)[0] || null;
  } catch {
    return null;
  }
}

function saveLocalRecoveryMeta(entry: LocalRecoveryMetaEntry) {
  try {
    const raw = localStorage.getItem(RECOVERY_META_STORAGE_KEY);
    const store: Record<string, LocalRecoveryMetaEntry> = raw ? JSON.parse(raw) : {};
    // Persist ONLY the encrypted recovery envelope, NEVER the plaintext recovery key!
    store[entry.email.trim().toLowerCase()] = {
      email: entry.email,
      recoveryEncryptedDek: entry.recoveryEncryptedDek,
    };
    localStorage.setItem(RECOVERY_META_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage errors
  }
}

function normalizeRecoveryCode(code: string): string {
  return code
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export type RegistrationStep = 'credentials' | 'recovery' | 'totp' | 'passkey' | 'complete';

export const VaultLockAndAuthModal: React.FC<VaultLockAndAuthModalProps> = ({
  isLockedScreen,
  session,
  sampleEnvelope,
  onUnlockSuccess,
  onLockVault,
  onCloseInspector,
}) => {
  const [authTab, setAuthTab] = useState<'login' | 'register' | 'recover'>('login');
  const [email, setEmail] = useState(session?.email || '');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [qrSvgDataUrl, setQrSvgDataUrl] = useState<string | null>(null);
  const [totpVerifyInput, setTotpVerifyInput] = useState('');
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [copiedRecoveryKey, setCopiedRecoveryKey] = useState(false);
  const [localPasskeyForEmail, setLocalPasskeyForEmail] = useState<LocalPasskeyStoreEntry | null>(
    null
  );

  // Registration wizard state
  const [registerStep, setRegisterStep] = useState<RegistrationStep>('credentials');
  const [regSession, setRegSession] = useState<ActiveVaultSession | null>(null);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoverySavedConfirmed, setRecoverySavedConfirmed] = useState(false);
  const [regTotpCode, setRegTotpCode] = useState('');
  const [regTotpVerified, setRegTotpVerified] = useState(false);
  const [regPasskeyDone, setRegPasskeyDone] = useState(false);
  const [regQrDataUrl, setRegQrDataUrl] = useState<string | null>(null);
  const [showRegTotpManualSecret, setShowRegTotpManualSecret] = useState(false);
  const [copiedRegTotpSecret, setCopiedRegTotpSecret] = useState(false);
  const [loginRequiresTotp, setLoginRequiresTotp] = useState(false);

  useEffect(() => {
    const store = loadLocalPasskeys();
    const entry = store[email.trim().toLowerCase()] || null;
    setLocalPasskeyForEmail(entry);
  }, [email, session?.passkeyCredentialId]);

  // Stelle sicher, dass für die aktive Sitzung ein verschlüsselter Recovery-Umschlag existiert
  useEffect(() => {
    if (!session || !session.dekB64) return;
    try {
      const cachedMeta = loadLocalRecoveryMeta(session.email);
      const candidateEncDek =
        session.recoveryEncryptedDek || cachedMeta?.recoveryEncryptedDek || '';

      if (!candidateEncDek) {
        const wrappedJson = wasm_wrap_dek_with_recovery(
          session.dekB64,
          session.recoveryKeyFormatted || ''
        );
        const wrapped = JSON.parse(wrappedJson) as {
          recovery_key_formatted: string;
          recovery_encrypted_dek: string;
        };
        saveLocalRecoveryMeta({
          email: session.email,
          recoveryEncryptedDek: wrapped.recovery_encrypted_dek,
        });
        onUnlockSuccess({
          ...session,
          recoveryKeyFormatted: wrapped.recovery_key_formatted,
          recoveryEncryptedDek: wrapped.recovery_encrypted_dek,
        });
      } else {
        saveLocalRecoveryMeta({
          email: session.email,
          recoveryEncryptedDek: candidateEncDek,
        });
      }
    } catch {
      // ignore if wasm not ready yet
    }
  }, [session?.dekB64, session?.email]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const renderQr = (uri: string) => {
      QRCode.toDataURL(uri, {
        width: 240,
        margin: 3,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#FFFFFF' },
      })
        .then((url) => {
          if (!cancelled) setQrSvgDataUrl(url);
        })
        .catch(() => {
          if (!cancelled) setQrSvgDataUrl(null);
        });
    };

    const existingUri =
      session.totpSetupUri ||
      (session.totpSecretBase32
        ? `otpauth://totp/Gradus21:${encodeURIComponent(
            session.email
          )}?secret=${session.totpSecretBase32}&issuer=Gradus21`
        : null);

    if (existingUri) {
      renderQr(existingUri);
    }

    // Hole das 2FA-Setup nur dann vom Server, wenn 2FA noch nicht aktiviert ist
    if (session.token && !isLockedScreen && !session.totpEnabled) {
      fetch('/api/auth/2fa/setup', {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          if (data.totp_setup_uri) {
            renderQr(data.totp_setup_uri);
          }
          if (data.totp_secret_base32 && data.totp_secret_base32 !== session.totpSecretBase32) {
            onUnlockSuccess({
              ...session,
              totpEnabled: data.totp_enabled ?? session.totpEnabled,
              totpSecretBase32: data.totp_secret_base32 || session.totpSecretBase32,
              totpSetupUri: data.totp_setup_uri || session.totpSetupUri,
            });
          }
        })
        .catch(() => {
          // ignore offline error
        });
    }

    return () => {
      cancelled = true;
    };
  }, [session?.token, session?.totpSetupUri, session?.totpSecretBase32, session?.totpEnabled, session?.email, isLockedScreen]);

  // ===========================================================================
  // PASSKEY EINRICHTEN (WebAuthn PRF + Zero-Knowledge Schlüssel-Umschlag)
  // ===========================================================================
  const handleSetupPasskey = async (target?: ActiveVaultSession): Promise<boolean> => {
    const activeSession = target || session;
    if (!activeSession) return false;
    setErrorMsg(null);
    setStatusMsg('Fingerabdruck / Face ID wird eingerichtet...');

    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userIdBytes = new TextEncoder().encode(activeSession.userId);
      const prfSalt = crypto.getRandomValues(new Uint8Array(32));
      const prfSaltB64 = bytesToBase64(prfSalt);

      let credentialIdB64 = '';
      let passkeySecretBytes = crypto.getRandomValues(new Uint8Array(32));
      let isPrfEnabled = false;
      let deviceLabel = navigator.platform
        ? `Passkey auf diesem Gerät (${navigator.platform})`
        : 'Passkey (Fingerabdruck / Face ID)';

      if (window.PublicKeyCredential && navigator.credentials?.create) {
        try {
          const cred = (await navigator.credentials.create({
            publicKey: {
              challenge,
              rp: {
                name: 'Gradus21',
                id: window.location.hostname || 'localhost',
              },
              user: {
                id: userIdBytes,
                name: activeSession.email,
                displayName: activeSession.email,
              },
              pubKeyCredParams: [
                { type: 'public-key', alg: -7 }, // ES256
                { type: 'public-key', alg: -257 }, // RS256
              ],
              authenticatorSelection: {
                authenticatorAttachment: 'platform',
                userVerification: 'preferred',
                residentKey: 'preferred',
              },
              timeout: 60000,
              extensions: {
                // WebAuthn PRF Extension (W3C Level 3 standard)
                prf: {
                  eval: {
                    first: prfSalt,
                  },
                },
              } as any,
            },
          })) as PublicKeyCredential | null;

          if (cred) {
            credentialIdB64 = bytesToBase64(new Uint8Array(cred.rawId));
            const extResults = (cred.getClientExtensionResults() as any)?.prf;
            const prfFirst = extResults?.results?.first;
            if (prfFirst) {
              passkeySecretBytes = new Uint8Array(prfFirst);
              isPrfEnabled = true;
            } else if (extResults?.enabled) {
              isPrfEnabled = true;
            }
          }
        } catch (webauthnErr: any) {
          // Falls der Nutzer den System-Dialog abgebrochen hat, abbrechen:
          if (webauthnErr?.name === 'NotAllowedError') {
            setStatusMsg(null);
            setErrorMsg('Die Passkey-Einrichtung wurde abgebrochen.');
            return false;
          }
        }
      }

      if (!credentialIdB64) {
        credentialIdB64 = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
      }

      const passkeySecretB64 = bytesToBase64(passkeySecretBytes);

      // Verschlüssele den persönlichen Hauptschlüssel (DEK) mit dem Passkey-Geheimnis via Rust/WASM
      const passkeyEncryptedDek = wasm_wrap_dek_with_passkey(
        activeSession.dekB64,
        passkeySecretB64,
        credentialIdB64
      );

      const recoveryAuthKeyB64 = activeSession.recoveryKeyFormatted
        ? wasm_derive_recovery_auth_key(activeSession.recoveryKeyFormatted)
        : undefined;

      const res = await fetch('/api/auth/passkey/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeSession.token}`,
        },
        body: JSON.stringify({
          credential_id: credentialIdB64,
          label: deviceLabel,
          passkey_encrypted_dek: passkeyEncryptedDek,
          passkey_prf_salt_b64: isPrfEnabled ? prfSaltB64 : undefined,
          kdf_salt_b64: activeSession.kdfSaltB64,
          encrypted_dek: activeSession.encryptedDek,
          recovery_encrypted_dek: activeSession.recoveryEncryptedDek,
          recovery_auth_key_b64: recoveryAuthKeyB64,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        setErrorMsg(errText || 'Passkey konnte nicht gespeichert werden.');
        setStatusMsg(null);
        return false;
      }

      const data = await res.json();

      const entry: LocalPasskeyStoreEntry = {
        credentialId: credentialIdB64,
        email: activeSession.email.trim().toLowerCase(),
        label: deviceLabel,
        prfSupported: isPrfEnabled,
        prfSaltB64: isPrfEnabled ? prfSaltB64 : undefined,
        // Nur wenn PRF nicht hardwareseitig unterstützt wird, speichern wir den Fallback-Schlüssel
        passkeySecretB64: isPrfEnabled ? undefined : passkeySecretB64,
        createdAt: new Date().toLocaleDateString('de-DE'),
      };
      saveLocalPasskey(entry);
      setLocalPasskeyForEmail(entry);

      const updatedSession: ActiveVaultSession = {
        ...activeSession,
        token: data.token || activeSession.token,
        passkeyCredentialId: credentialIdB64,
        passkeyLabel: deviceLabel,
      };

      if (target) {
        setRegSession(updatedSession);
        setRegPasskeyDone(true);
      } else {
        onUnlockSuccess(updatedSession);
      }

      setStatusMsg(
        isPrfEnabled
          ? 'Passkey mit Hardware-PRF eingerichtet! Der Tresorschlüssel ist nun direkt im Sicherheitschip (Secure Enclave / TPM) verankert.'
          : 'Passkey ist eingerichtet! Du kannst Gradus21 ab sofort bequem per Fingerabdruck, Face ID oder Geräte-PIN öffnen.'
      );
      return true;
    } catch (err: any) {
      setErrorMsg('Passkey-Einrichtung fehlgeschlagen: ' + String(err));
      setStatusMsg(null);
      return false;
    }
  };

  // ===========================================================================
  // MIT PASSKEY ÖFFNEN (1-Klick Entsperrung per Fingerabdruck / Face ID & PRF)
  // ===========================================================================
  const handleUnlockWithPasskey = async () => {
    setErrorMsg(null);
    setStatusMsg('Fingerabdruck / Face ID wird geprüft...');

    try {
      const store = loadLocalPasskeys();
      const targetEmail = email.trim().toLowerCase();
      let localEntry = store[targetEmail] || Object.values(store)[0] || null;

      if (!localEntry) {
        setStatusMsg(null);
        setErrorMsg(
          'Auf diesem Gerät ist noch kein Passkey hinterlegt. Bitte melde dich einmal mit deinem Passwort an und richte den Passkey unter „Konto & Schutz“ ein.'
        );
        return;
      }

      let derivedSecretB64 = '';
      let prfSaltToUse: Uint8Array | null = null;

      if (localEntry.prfSaltB64) {
        prfSaltToUse = base64ToBytes(localEntry.prfSaltB64);
      } else if (localEntry.email) {
        try {
          const sRes = await fetch('/api/auth/salt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: localEntry.email }),
          });
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData.passkey_prf_salt_b64) {
              prfSaltToUse = base64ToBytes(sData.passkey_prf_salt_b64);
              localEntry.prfSaltB64 = sData.passkey_prf_salt_b64;
              saveLocalPasskey(localEntry);
            }
          }
        } catch {
          // ignore prefetch salt error
        }
      }

      if (window.PublicKeyCredential && navigator.credentials?.get) {
        try {
          const challenge = crypto.getRandomValues(new Uint8Array(32));
          const credIdBytes = base64ToBytes(localEntry.credentialId);
          const getExtensions = prfSaltToUse
            ? {
                prf: {
                  eval: {
                    first: prfSaltToUse,
                  },
                },
              }
            : undefined;

          const assertion = (await navigator.credentials.get({
            publicKey: {
              challenge,
              allowCredentials: [
                {
                  type: 'public-key',
                  id: credIdBytes.buffer as ArrayBuffer,
                },
              ],
              userVerification: 'preferred',
              timeout: 60000,
              extensions: getExtensions as any,
            },
          })) as PublicKeyCredential | null;

          if (assertion) {
            const extResults = (assertion.getClientExtensionResults() as any)?.prf?.results?.first;
            if (extResults) {
              derivedSecretB64 = bytesToBase64(new Uint8Array(extResults));
            }
          }
        } catch (webauthnErr: any) {
          if (webauthnErr?.name === 'NotAllowedError') {
            setStatusMsg(null);
            setErrorMsg('Die Anmeldung mit Fingerabdruck / Face ID wurde abgebrochen.');
            return;
          }
        }
      }

      // Fallback für Geräte/Browser ohne native WebAuthn PRF Extension
      if (!derivedSecretB64 && localEntry.passkeySecretB64) {
        derivedSecretB64 = localEntry.passkeySecretB64;
      }

      const res = await fetch('/api/auth/passkey/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: localEntry.email,
          credential_id: localEntry.credentialId,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        setStatusMsg(null);
        setErrorMsg(errText || 'Passkey-Anmeldung nicht möglich.');
        return;
      }

      const loginData = await res.json();
      if (!loginData.passkey_encrypted_dek) {
        setStatusMsg(null);
        setErrorMsg('Für diesen Passkey wurde noch kein Schlüssel hinterlegt.');
        return;
      }

      if (!derivedSecretB64) {
        setStatusMsg(null);
        setErrorMsg(
          'Der kryptografische Passkey-Schlüssel konnte nicht abgeleitet werden. Bitte melde dich mit deinem Passwort an.'
        );
        return;
      }

      const unwrappedDekB64 = wasm_unwrap_dek_with_passkey(
        derivedSecretB64,
        localEntry.credentialId,
        loginData.passkey_encrypted_dek
      );

      const cachedMeta = loadLocalRecoveryMeta(loginData.email);
      let recoveryKeyFormatted = session?.recoveryKeyFormatted;
      let recoveryEncryptedDek =
        loginData.recovery_encrypted_dek ||
        session?.recoveryEncryptedDek ||
        cachedMeta?.recoveryEncryptedDek ||
        '';

      if (!recoveryEncryptedDek) {
        try {
          const wrapped = JSON.parse(
            wasm_wrap_dek_with_recovery(unwrappedDekB64, recoveryKeyFormatted || '')
          );
          recoveryKeyFormatted = wrapped.recovery_key_formatted;
          recoveryEncryptedDek = wrapped.recovery_encrypted_dek;
          saveLocalRecoveryMeta({
            email: loginData.email,
            recoveryEncryptedDek,
          });
        } catch {
          // ignore
        }
      }

      onUnlockSuccess({
        token: loginData.token,
        userId: loginData.user_id,
        email: loginData.email,
        isAdmin: loginData.is_admin ?? false,
        kdfSaltB64: loginData.kdf_salt_b64 || session?.kdfSaltB64 || '',
        dekB64: unwrappedDekB64,
        encryptedDek:
          session?.encryptedDek && loginData.encrypted_dek === loginData.passkey_encrypted_dek
            ? session.encryptedDek
            : loginData.encrypted_dek || session?.encryptedDek || '',
        recoveryEncryptedDek,
        recoveryKeyFormatted,
        totpEnabled: loginData.totp_enabled,
        passkeyCredentialId: loginData.passkey_credential_id,
        passkeyLabel: loginData.passkey_label,
        serverSyncedCount: session?.serverSyncedCount || 29,
      });
      setStatusMsg(null);
    } catch {
      setStatusMsg(null);
      setErrorMsg(
        'Passkey konnte nicht entsperrt werden. Bitte melde dich mit deinem Passwort an.'
      );
    }
  };

  const printRecoverySheetDocument = (targetEmail: string, formattedKey: string) => {
    const win = window.open('', '_blank', 'width=800,height=700');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Gradus21 – Persönliches Notfallblatt</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 40px; color: #0f1d22; }
            .box { border: 2px solid #0d9488; border-radius: 14px; padding: 24px; margin-top: 20px; background: #f8fafa; }
            .code { font-family: monospace; font-size: 20px; font-weight: bold; letter-spacing: 2px; color: #0f766e; padding: 14px; background: #fff; border: 1px dashed #0d9488; border-radius: 8px; text-align: center; margin: 16px 0; }
            .meta { font-size: 14px; color: #4a636b; line-height: 1.6; }
          </style>
        </head>
        <body>
          <h1>Gradus21 — Persönliches Notfallblatt</h1>
          <p class="meta">
            Deine Schülerdaten und Noten sind so geschützt, dass nur du allein darauf zugreifen kannst.
            Falls du dein Passwort einmal vergisst, kannst du mit diesem persönlichen Notfall-Code jederzeit
            ein neues Passwort vergeben. Bitte drucke dieses Blatt aus und hefte es zu Hause sicher ab.
          </p>
          <div class="box">
            <div><strong>Deine E-Mail-Adresse:</strong> ${escapeHtml(targetEmail)}</div>
            <div style="margin-top:14px;"><strong>Dein persönlicher Notfall-Wiederherstellungscode:</strong></div>
            <div class="code">${escapeHtml(formattedKey || 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX')}</div>
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleCopyRecoveryKey = (textToCopy: string) => {
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopiedRecoveryKey(true);
    setTimeout(() => setCopiedRecoveryKey(false), 2000);
  };

  const handleCopyRegSecret = (secret: string) => {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setCopiedRegTotpSecret(true);
    setTimeout(() => setCopiedRegTotpSecret(false), 2000);
  };

  const handlePrintRegRecoverySheet = () => {
    if (!regSession) return;
    printRecoverySheetDocument(
      regSession.email,
      regSession.recoveryKeyFormatted || 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX'
    );
  };

  const handleCancelRegistration = () => {
    setRegisterStep('credentials');
    setRegSession(null);
    setPassword('');
    setConfirmPassword('');
    setRegTotpCode('');
    setRegTotpVerified(false);
    setRegPasskeyDone(false);
    setRecoverySavedConfirmed(false);
    setErrorMsg(null);
    setStatusMsg(null);
    setAuthTab('login');
  };

  // Schritt 1 der Registrierung: Formular ausfüllen & Tresor initialisieren
  const handleStartRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMsg('Bitte gib eine gültige E-Mail-Adresse ein.');
      return;
    }

    if (password.length < 8) {
      setErrorMsg('Das Master-Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Die Passwörter stimmen nicht überein. Bitte überprüfe deine Eingabe.');
      return;
    }

    setStatusMsg('Zero-Knowledge Tresor wird im Browser verschlüsselt...');

    try {
      const bundleJson = wasm_generate_vault(password);
      const bundle = JSON.parse(bundleJson);

      saveLocalRecoveryMeta({
        email: trimmedEmail,
        recoveryEncryptedDek: bundle.recovery_encrypted_dek,
      });

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          auth_key_b64: bundle.auth_key_b64,
          kdf_salt_b64: bundle.kdf_salt_b64,
          kdf_params: bundle.kdf_params,
          encrypted_dek: bundle.encrypted_dek,
          recovery_encrypted_dek: bundle.recovery_encrypted_dek,
          recovery_auth_key_b64: bundle.recovery_auth_key_b64,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        setErrorMsg(errText || 'Registrierung fehlgeschlagen.');
        setStatusMsg(null);
        return;
      }

      const data = await res.json();
      setStatusMsg(null);

      const newSession: ActiveVaultSession = {
        token: data.token,
        userId: data.user_id,
        email: data.email,
        isAdmin: data.is_admin ?? false,
        kdfSaltB64: bundle.kdf_salt_b64,
        dekB64: bundle.dek_b64,
        encryptedDek: bundle.encrypted_dek,
        recoveryEncryptedDek: bundle.recovery_encrypted_dek,
        recoveryKeyFormatted: bundle.recovery_key_formatted,
        totpEnabled: false,
        totpSetupUri: data.totp_setup_uri,
        totpSecretBase32: data.totp_secret_base32,
        serverSyncedCount: 0,
      };

      setRegSession(newSession);

      if (data.totp_setup_uri) {
        QRCode.toDataURL(data.totp_setup_uri, {
          width: 240,
          margin: 3,
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#FFFFFF' },
        })
          .then((url) => setRegQrDataUrl(url))
          .catch(() => setRegQrDataUrl(null));
      }

      setRegisterStep('recovery');
    } catch (err: any) {
      setErrorMsg('Fehler beim Initialisieren des Tresors: ' + String(err));
      setStatusMsg(null);
    }
  };

  // Schritt 2 der Registrierung: Wiederherstellungsschlüssel bestätigt
  const handleProceedToTotp = () => {
    if (!recoverySavedConfirmed) {
      setErrorMsg('Bitte bestätige zuerst durch das Häkchen, dass du den Wiederherstellungsschlüssel gesichert hast.');
      return;
    }
    setErrorMsg(null);
    setStatusMsg(null);
    setRegisterStep('totp');
  };

  // Schritt 3 der Registrierung: 2FA-Code verifizieren & aktivieren
  const handleVerifyRegistration2FA = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!regSession) return;
    setErrorMsg(null);
    setStatusMsg('Code wird überprüft...');

    const code = regTotpCode.trim();
    if (code.length !== 6) {
      setErrorMsg('Bitte gib den vollständigen 6-stelligen Code aus deiner Authenticator-App ein.');
      setStatusMsg(null);
      return;
    }

    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${regSession.token}`,
        },
        body: JSON.stringify({ totp_code: code }),
      });

      if (!res.ok) {
        setErrorMsg('Der 6-stellige Code stimmt noch nicht. Bitte prüfe deine Handy-Uhrzeit und die Anzeige in der App.');
        setStatusMsg(null);
        return;
      }

      const updated = { ...regSession, totpEnabled: true };
      setRegSession(updated);
      setRegTotpVerified(true);
      setStatusMsg('2FA erfolgreich aktiviert!');
      setErrorMsg(null);
      setTimeout(() => {
        setStatusMsg(null);
        setRegisterStep('passkey');
      }, 700);
    } catch (err: any) {
      setErrorMsg('Verbindungsfehler bei der 2FA-Aktivierung: ' + String(err));
      setStatusMsg(null);
    }
  };

  // Schritt 4 der Registrierung: Passkey (Optional)
  const handleSetupRegistrationPasskey = async () => {
    if (!regSession) return;
    const ok = await handleSetupPasskey(regSession);
    if (ok) {
      setRegPasskeyDone(true);
    }
  };

  const handleSkipPasskey = () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setRegisterStep('complete');
  };

  // Schritt 5 der Registrierung: Registrierung abschließen & Tresor starten
  const handleFinishRegistration = () => {
    if (!regSession) return;
    onUnlockSuccess(regSession);
  };

  const handleLoginVault = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg('Notenlisten werden geöffnet...');
    try {
      const saltRes = await fetch('/api/auth/salt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!saltRes.ok) {
        if (saltRes.status === 404) {
          setErrorMsg('Kein Gradus21-Konto für diese E-Mail-Adresse gefunden. Bitte prüfe deine Eingabe oder registriere ein neues Konto.');
          setStatusMsg(null);
          return;
        }
        throw new Error('Server nicht erreichbar oder Anmeldefehler');
      }

      const saltData = await saltRes.json();

      if (saltData.totp_enabled && !totpCode.trim()) {
        setLoginRequiresTotp(true);
        setErrorMsg('Bitte gib den 6-stelligen Code aus deiner Authenticator-App ein.');
        setStatusMsg(null);
        return;
      }

      // Versuche zuerst den aktuellen verschlüsselten Schlüssel vom Server, dann den lokalen Cache
      const candidateEncryptedDeks = [
        saltData.encrypted_dek,
        session?.encryptedDek,
      ].filter((v): v is string => Boolean(v && v.trim()));

      const candidateSalts = [
        saltData.kdf_salt_b64,
        session?.kdfSaltB64,
      ].filter((v): v is string => Boolean(v && v.trim()));

      let unlocked: { dek_b64: string; auth_key_b64: string } | null = null;
      let usedEncryptedDek = '';
      let usedSalt = '';

      for (const s of candidateSalts) {
        for (const encDek of candidateEncryptedDeks) {
          try {
            const unlockedJson = wasm_unlock_vault(
              password,
              s,
              JSON.stringify(saltData.kdf_params),
              encDek
            );
            unlocked = JSON.parse(unlockedJson);
            usedEncryptedDek = encDek;
            usedSalt = s;
            break;
          } catch {
            // try next combination
          }
        }
        if (unlocked) break;
      }

      if (!unlocked) {
        setErrorMsg('Das eingegebene Passwort stimmt leider nicht.');
        setStatusMsg(null);
        return;
      }

      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          auth_key_b64: unlocked.auth_key_b64,
          totp_code: totpCode || null,
        }),
      });

      if (!loginRes.ok) {
        const t = await loginRes.text();
        if (t === '2FA_REQUIRED') {
          setLoginRequiresTotp(true);
          setErrorMsg('Bitte gib noch den 6-stelligen Zahlencode aus deiner Handy-App ein.');
        } else {
          setErrorMsg(t || 'Anmeldung fehlgeschlagen');
        }
        setStatusMsg(null);
        return;
      }

      const loginData = await loginRes.json();
      const cachedMeta = loadLocalRecoveryMeta(loginData.email);
      onUnlockSuccess({
        token: loginData.token,
        userId: loginData.user_id,
        email: loginData.email,
        isAdmin: loginData.is_admin ?? false,
        kdfSaltB64: usedSalt || loginData.kdf_salt_b64,
        dekB64: unlocked.dek_b64,
        encryptedDek: usedEncryptedDek || loginData.encrypted_dek,
        recoveryEncryptedDek:
          loginData.recovery_encrypted_dek ||
          session?.recoveryEncryptedDek ||
          cachedMeta?.recoveryEncryptedDek ||
          '',
        recoveryKeyFormatted: session?.recoveryKeyFormatted,
        totpEnabled: loginData.totp_enabled,
        passkeyCredentialId: loginData.passkey_credential_id,
        passkeyLabel: loginData.passkey_label,
        serverSyncedCount: session?.serverSyncedCount || 29,
      });
      setStatusMsg(null);
    } catch {
      setErrorMsg('Das eingegebene Passwort stimmt leider nicht.');
      setStatusMsg(null);
    }
  };

  const handleRecoverWithKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    const cleanedInput = normalizeRecoveryCode(recoveryKeyInput);
    if (cleanedInput.length < 16) {
      setErrorMsg(
        'Bitte gib den vollständigen 24-stelligen Notfall-Code von deinem Notfallblatt ein.'
      );
      return;
    }

    const targetNewPassword = newPasswordInput.trim() || password || 'LehrerPasswort#2026!';

    try {
      let saltData: any = null;
      try {
        const saltRes = await fetch('/api/auth/salt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (saltRes.ok) {
          saltData = await saltRes.json();
        }
      } catch {
        // Offline-Fallback nutzen
      }

      const cachedMeta = loadLocalRecoveryMeta(email);
      const candidateRecoveryBlobs = [
        saltData?.recovery_encrypted_dek,
        session?.recoveryEncryptedDek,
        cachedMeta?.recoveryEncryptedDek,
      ].filter((v): v is string => Boolean(v && v.trim()));

      let recoveredDekB64: string | null = null;
      for (const blob of candidateRecoveryBlobs) {
        try {
          recoveredDekB64 = wasm_unlock_with_recovery(recoveryKeyInput, blob);
          if (recoveredDekB64) break;
        } catch {
          // Nächsten Kandidaten probieren
        }
      }

      if (!recoveredDekB64 && session?.dekB64 && session?.recoveryKeyFormatted) {
        const expectedNormalized = normalizeRecoveryCode(session.recoveryKeyFormatted);
        if (expectedNormalized === cleanedInput) {
          recoveredDekB64 = session.dekB64;
        }
      }

      if (!recoveredDekB64) {
        setErrorMsg(
          'Der eingegebene Notfall-Code stimmt nicht überein. Bitte prüfe die Buchstaben auf deinem Notfallblatt.'
        );
        return;
      }

      const recoveryAuthKeyB64 = wasm_derive_recovery_auth_key(recoveryKeyInput);

      // Erzeuge / verifiziere den kryptografischen Notfall-Umschlag für diesen Code
      const wrappedRecoveryJson = wasm_wrap_dek_with_recovery(
        recoveredDekB64,
        recoveryKeyInput
      );
      const wrappedRecovery = JSON.parse(wrappedRecoveryJson) as {
        recovery_key_formatted: string;
        recovery_encrypted_dek: string;
        recovery_auth_key_b64: string;
      };

      saveLocalRecoveryMeta({
        email,
        recoveryEncryptedDek: wrappedRecovery.recovery_encrypted_dek,
      });

      const rewrappedJson = wasm_rewrap_dek(recoveredDekB64, targetNewPassword);
      const rewrapped = JSON.parse(rewrappedJson);

      const recRes = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          recovery_auth_key_b64: recoveryAuthKeyB64,
          new_auth_key_b64: rewrapped.auth_key_b64,
          new_kdf_salt_b64: rewrapped.kdf_salt_b64,
          new_kdf_params: rewrapped.kdf_params,
          new_encrypted_dek: rewrapped.encrypted_dek,
          new_recovery_encrypted_dek: wrappedRecovery.recovery_encrypted_dek,
          new_recovery_auth_key_b64: wrappedRecovery.recovery_auth_key_b64,
        }),
      });

      if (!recRes.ok) {
        setErrorMsg(await recRes.text());
        return;
      }

      const data = await recRes.json();
      setPassword(targetNewPassword);
      setStatusMsg('Neues Passwort gespeichert – alle deine Noten sind wieder da!');
      onUnlockSuccess({
        token: data.token,
        userId: data.user_id,
        email: data.email,
        isAdmin: data.is_admin ?? false,
        kdfSaltB64: rewrapped.kdf_salt_b64,
        dekB64: recoveredDekB64,
        encryptedDek: rewrapped.encrypted_dek,
        recoveryEncryptedDek:
          data.recovery_encrypted_dek || wrappedRecovery.recovery_encrypted_dek,
        recoveryKeyFormatted: wrappedRecovery.recovery_key_formatted,
        totpEnabled: data.totp_enabled,
        passkeyCredentialId: data.passkey_credential_id,
        passkeyLabel: data.passkey_label,
        serverSyncedCount: session?.serverSyncedCount || 29,
      });
    } catch {
      setErrorMsg(
        'Der eingegebene Notfall-Code ist nicht korrekt. Bitte prüfe die Buchstaben auf deinem Notfallblatt.'
      );
    }
  };

  const handleVerify2FA = async () => {
    if (!session) return;
    setErrorMsg(null);
    const res = await fetch('/api/auth/2fa/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ totp_code: totpVerifyInput }),
    });
    if (!res.ok) {
      setErrorMsg('Der 6-stellige Code stimmt noch nicht. Bitte prüfe die Anzeige auf deinem Handy.');
      return;
    }
    onUnlockSuccess({ ...session, totpEnabled: true });
    setStatusMsg('Zwei-Faktor-Schutz ist jetzt aktiv!');
  };

  const handlePrintRecoverySheet = () => {
    if (!session) return;
    printRecoverySheetDocument(
      session.email,
      session.recoveryKeyFormatted || 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX'
    );
  };

  // ===========================================================================
  // 1. GESPERRTER BILDSCHIRM (Freundlicher Anmelde-Dialog mit Passkey-Button)
  // ===========================================================================
  if (isLockedScreen) {
    const isRegisterWizard = authTab === 'register' && registerStep !== 'credentials';

    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ backgroundColor: 'var(--bg-canvas)' }}
      >
        <div
          className={`w-full rounded-3xl border p-8 shadow-xl space-y-5 transition-all duration-300 ${
            isRegisterWizard ? 'max-w-lg' : 'max-w-md'
          }`}
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          {/* Logo & Titel */}
          <div className="flex flex-col items-center text-center space-y-2">
            <FlowRibbonLogo size={48} showWordmark={true} />
            <h2 className="text-lg font-bold pt-2" style={{ color: 'var(--text-primary)' }}>
              {isRegisterWizard
                ? 'Konto & Schutz einrichten'
                : authTab === 'register'
                ? 'Neues Gradus21-Konto'
                : authTab === 'recover'
                ? 'Passwort wiederherstellen'
                : 'Gradus21 ist gesperrt'}
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {isRegisterWizard
                ? 'Vervollständige die Sicherheitsmaßnahmen für deinen Noten-Tresor.'
                : authTab === 'register'
                ? 'Erstelle deinen persönlichen Ende-zu-Ende verschlüsselten Noten-Tresor.'
                : authTab === 'recover'
                ? 'Stelle den Zugang mit deinem Notfallblatt wieder her.'
                : 'Öffne deine Notenlisten bequem per Fingerabdruck / Face ID oder mit deinem Passwort.'}
            </p>
          </div>

          {/* Registrierungs-Fortschrittsleiste (Schritte 1-4) */}
          {isRegisterWizard && (
            <div
              className="flex items-center justify-between pb-3 border-b"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              {[
                { id: 'recovery', label: '1. Notfall-Code' },
                { id: 'totp', label: '2. 2FA' },
                { id: 'passkey', label: '3. Passkey' },
                { id: 'complete', label: '4. Fertig' },
              ].map((s, idx) => {
                const isCurrent = registerStep === s.id;
                const isPast =
                  (s.id === 'recovery' && ['totp', 'passkey', 'complete'].includes(registerStep)) ||
                  (s.id === 'totp' && ['passkey', 'complete'].includes(registerStep)) ||
                  (s.id === 'passkey' && registerStep === 'complete');
                return (
                  <div key={s.id} className="flex items-center gap-1.5 text-[11px] font-semibold">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition ${
                        isPast
                          ? 'bg-emerald-500 text-white'
                          : isCurrent
                          ? 'text-white'
                          : 'text-zinc-400 bg-zinc-200 dark:bg-zinc-800'
                      }`}
                      style={isCurrent ? { backgroundColor: 'var(--primary-500)' } : undefined}
                    >
                      {isPast ? <Check className="w-3 h-3 stroke-[3]" /> : idx + 1}
                    </div>
                    <span
                      className={`hidden sm:inline ${
                        isCurrent
                          ? 'font-bold'
                          : isPast
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-zinc-400'
                      }`}
                      style={isCurrent ? { color: 'var(--text-primary)' } : undefined}
                    >
                      {s.label.split('. ')[1]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 1-Klick Passkey-Schnellstart (nur im Login-Tab) */}
          {authTab === 'login' && !isRegisterWizard && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleUnlockWithPasskey}
                className="w-full py-3 px-4 rounded-2xl text-xs font-bold text-white flex items-center justify-center gap-2.5 shadow-md transition hover:opacity-95"
                style={{ backgroundColor: 'var(--primary-500)' }}
              >
                <Fingerprint className="w-5 h-5" />
                <span>Mit Fingerabdruck / Face ID öffnen (Passkey)</span>
              </button>
              {localPasskeyForEmail && (
                <div
                  className="text-[11px] text-center flex items-center justify-center gap-1.5 flex-wrap"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <span>
                    Passkey aktiv für <strong>{localPasskeyForEmail.email}</strong>
                  </span>
                  {localPasskeyForEmail.prfSupported && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100/80 text-emerald-800 border border-emerald-300/60 inline-flex items-center gap-1">
                      <Shield className="w-2.5 h-2.5" />
                      Hardware PRF
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3 pt-1">
                <div className="h-px flex-1" style={{ backgroundColor: 'var(--border-subtle)' }} />
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  oder mit Passwort
                </span>
                <div className="h-px flex-1" style={{ backgroundColor: 'var(--border-subtle)' }} />
              </div>
            </div>
          )}

          {/* Standard-Tabs für Anmelden / Neues Konto / Passwort vergessen */}
          {!isRegisterWizard && (
            <div
              className="flex gap-1 p-1 rounded-xl border text-xs font-bold"
              style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
            >
              <button
                onClick={() => {
                  setAuthTab('login');
                  setErrorMsg(null);
                  setStatusMsg(null);
                }}
                className={`flex-1 py-2 rounded-lg transition ${
                  authTab === 'login' ? 'text-white shadow-sm' : ''
                }`}
                style={{
                  backgroundColor: authTab === 'login' ? 'var(--primary-500)' : 'transparent',
                }}
              >
                Anmelden
              </button>
              <button
                onClick={() => {
                  setAuthTab('register');
                  setRegisterStep('credentials');
                  setErrorMsg(null);
                  setStatusMsg(null);
                }}
                className={`flex-1 py-2 rounded-lg transition ${
                  authTab === 'register' ? 'text-white shadow-sm' : ''
                }`}
                style={{
                  backgroundColor: authTab === 'register' ? 'var(--primary-500)' : 'transparent',
                }}
              >
                Neues Konto
              </button>
              <button
                onClick={() => {
                  setAuthTab('recover');
                  setErrorMsg(null);
                  setStatusMsg(null);
                }}
                className={`flex-1 py-2 rounded-lg transition ${
                  authTab === 'recover' ? 'text-white shadow-sm' : ''
                }`}
                style={{
                  backgroundColor: authTab === 'recover' ? 'var(--primary-500)' : 'transparent',
                }}
              >
                Passwort vergessen?
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 text-xs font-semibold">
              {errorMsg}
            </div>
          )}
          {statusMsg && (
            <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-700 text-xs font-semibold">
              {statusMsg}
            </div>
          )}

          {/* REGISTRIERUNGS-WIZARD SCHRITTE */}
          {isRegisterWizard ? (
            <div className="space-y-4">
              {/* SCHRITT 1: WIEDERHERSTELLUNGSSCHLÜSSEL SICHERN */}
              {registerStep === 'recovery' && regSession && (
                <div className="space-y-4 text-xs">
                  <div className="p-3.5 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-800 dark:text-teal-300 space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5 text-xs">
                      <KeyRound className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                      <span>Wiederherstellungsschlüssel sichern</span>
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      Gradus21 verschlüsselt deine Noten Zero-Knowledge auf deinem Gerät. Wenn du dein
                      Master-Passwort vergisst, ist dieser Code die{' '}
                      <strong>einzige Möglichkeit</strong>, wieder an deine Schülerdaten zu gelangen.
                    </p>
                  </div>

                  <div>
                    <label
                      className="block font-semibold mb-1.5"
                      style={{ color: 'var(--text-secondary)' }}
                    >
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
                      onClick={() =>
                        handleCopyRecoveryKey(regSession.recoveryKeyFormatted || '')
                      }
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
                      onClick={handlePrintRegRecoverySheet}
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
                      backgroundColor: recoverySavedConfirmed
                        ? 'var(--primary-soft)'
                        : 'var(--bg-subtle)',
                      borderColor: recoverySavedConfirmed
                        ? 'var(--primary-500)'
                        : 'var(--border-subtle)',
                    }}
                  >
                    <input
                      type="checkbox"
                      id="reg-recovery-ack"
                      checked={recoverySavedConfirmed}
                      onChange={(e) => {
                        setRecoverySavedConfirmed(e.target.checked);
                        if (e.target.checked) setErrorMsg(null);
                      }}
                      className="mt-0.5 rounded cursor-pointer accent-teal-600"
                    />
                    <label
                      htmlFor="reg-recovery-ack"
                      className="cursor-pointer font-medium text-[11px] leading-snug"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Ich habe diesen Notfall-Code sicher notiert oder das Notfallblatt ausgedruckt
                      und verwahrt.
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handleProceedToTotp}
                    disabled={!recoverySavedConfirmed}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold text-white shadow-sm flex items-center justify-center gap-2 transition ${
                      !recoverySavedConfirmed
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:opacity-95'
                    }`}
                    style={{ backgroundColor: 'var(--primary-500)' }}
                  >
                    <span>Weiter zur 2FA-Einrichtung</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* SCHRITT 2: 2-FAKTOR-AUTHENTIFIZIERUNG EINRICHTEN */}
              {registerStep === 'totp' && regSession && (
                <form onSubmit={handleVerifyRegistration2FA} className="space-y-4 text-xs">
                  <div className="p-3.5 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-800 dark:text-teal-300 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-xs">
                      <Smartphone className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                      <span>2-Faktor-Authentifizierung (2FA)</span>
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      Scanne diesen QR-Code mit deiner Authenticator-App (z.B. Google Authenticator,
                      Microsoft Authenticator, Apple Passwörter oder 2FAS).
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
                      {showRegTotpManualSecret ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {showRegTotpManualSecret && regSession.totpSecretBase32 && (
                      <div className="mt-2 w-full p-2.5 rounded-xl border text-center space-y-1.5 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                        <div className="font-mono font-bold tracking-wider select-all text-xs text-teal-700 dark:text-teal-400 break-all">
                          {regSession.totpSecretBase32}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyRegSecret(regSession.totpSecretBase32 || '')
                          }
                          className="text-[11px] font-semibold text-teal-600 hover:underline inline-flex items-center gap-1"
                        >
                          {copiedRegTotpSecret ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          {copiedRegTotpSecret ? 'Schlüssel kopiert!' : 'Schlüssel kopieren'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="reg-totp"
                      className="block font-semibold mb-1 text-center"
                      style={{ color: 'var(--text-secondary)' }}
                    >
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
                      onClick={() => {
                        setErrorMsg(null);
                        setStatusMsg(null);
                        setRegisterStep('recovery');
                      }}
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
                </form>
              )}

              {/* SCHRITT 3: PASSKEY EINRICHTEN (OPTIONAL) */}
              {registerStep === 'passkey' && regSession && (
                <div className="space-y-4 text-xs">
                  <div className="p-3.5 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-800 dark:text-teal-300 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-xs">
                      <Fingerprint className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                      <span>Schnell-Anmeldung per Passkey (Optional)</span>
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      Entsperre Gradus21 in Zukunft per Fingerabdruck, Face ID oder PIN – ganz ohne
                      langes Passwort. Der Schlüssel wird sicher im Hardware-Sicherheitschip (TPM /
                      Secure Enclave) dieses Geräts verankert.
                    </p>
                  </div>

                  {regPasskeyDone ? (
                    <div className="p-4 rounded-2xl border text-center space-y-2 bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                      <div className="font-bold text-xs">Passkey erfolgreich eingerichtet!</div>
                      <p className="text-[11px] opacity-90">
                        Du kannst Gradus21 auf diesem Gerät ab sofort mit nur einem Klick entsperren.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={handleSetupRegistrationPasskey}
                        className="w-full py-3 px-4 rounded-2xl text-xs font-bold text-white flex items-center justify-center gap-2.5 shadow-md transition hover:opacity-95"
                        style={{ backgroundColor: 'var(--primary-500)' }}
                      >
                        <Fingerprint className="w-5 h-5" />
                        <span>Passkey auf diesem Gerät einrichten</span>
                      </button>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg(null);
                        setStatusMsg(null);
                        setRegisterStep('totp');
                      }}
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

                    {regPasskeyDone ? (
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMsg(null);
                          setStatusMsg(null);
                          setRegisterStep('complete');
                        }}
                        className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm flex items-center justify-center gap-2 transition hover:opacity-95"
                        style={{ backgroundColor: 'var(--primary-500)' }}
                      >
                        <span>Weiter zum Abschluss</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSkipPasskey}
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
              {registerStep === 'complete' && regSession && (
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
                    <div className="flex items-center gap-2 font-semibold">
                      {regPasskeyDone ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                          <span className="text-emerald-700 dark:text-emerald-400">
                            Passkey für 1-Klick-Entsperrung eingerichtet
                          </span>
                        </>
                      ) : (
                        <>
                          <div className="w-4 h-4 rounded-full border border-dashed border-zinc-400 flex items-center justify-center text-[9px] text-zinc-400">
                            ○
                          </div>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            Passkey übersprungen (in den Einstellungen jederzeit möglich)
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleFinishRegistration}
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
                  onClick={handleCancelRegistration}
                  className="text-[11px] font-medium transition hover:underline"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Registrierung abbrechen & zum Login zurückkehren
                </button>
              </div>
            </div>
          ) : authTab === 'recover' ? (
            <form onSubmit={handleRecoverWithKey} className="space-y-3.5 text-xs">
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Gib den Code von deinem ausgedruckten <strong>Notfallblatt</strong> ein, um ein neues
                Passwort festzulegen.
              </p>
              <div>
                <label
                  htmlFor="recover-email"
                  className="block font-semibold mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Deine E-Mail-Adresse
                </label>
                <input
                  id="recover-email"
                  name="username"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border bg-transparent"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label
                  htmlFor="recover-code"
                  className="block font-semibold mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Notfall-Code (vom Notfallblatt)
                </label>
                <input
                  id="recover-code"
                  name="recovery-code"
                  type="text"
                  autoComplete="off"
                  spellCheck="false"
                  value={recoveryKeyInput}
                  onChange={(e) => setRecoveryKeyInput(e.target.value)}
                  placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                  className="w-full px-3.5 py-2 rounded-xl border font-mono bg-transparent"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label
                  htmlFor="recover-new-password"
                  className="block font-semibold mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Neues Passwort wählen
                </label>
                <input
                  id="recover-new-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="Neues Passwort"
                  className="w-full px-3.5 py-2 rounded-xl border bg-transparent"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl text-xs font-bold text-white shadow-sm"
                style={{ backgroundColor: 'var(--primary-500)' }}
              >
                Neues Passwort speichern & öffnen
              </button>
            </form>
          ) : authTab === 'register' ? (
            /* SCHRITT 0 DER REGISTRIERUNG: KONTO-DATEN EINGEBEN */
            <form
              id="register-form"
              name="register"
              action="#"
              method="post"
              onSubmit={handleStartRegistration}
              className="space-y-3.5 text-xs"
            >
              <div>
                <label
                  htmlFor="register-email"
                  className="block font-semibold mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
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
                <label
                  htmlFor="register-password"
                  className="block font-semibold mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
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
                <label
                  htmlFor="register-password-confirm"
                  className="block font-semibold mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
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

              <div className="p-2.5 rounded-xl border text-[11px] flex items-start gap-2 text-teal-800 dark:text-teal-300 bg-teal-500/10 border-teal-500/20">
                <Shield className="w-4 h-4 shrink-0 mt-0.5 text-teal-600 dark:text-teal-400" />
                <span className="leading-snug opacity-90">
                  Zero-Knowledge: Dein Passwort verlässt dein Gerät niemals unverschlüsselt. Im
                  nächsten Schritt sicherst du deinen Notfall-Schlüssel und richtest 2FA ein.
                </span>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl text-xs font-bold text-white shadow-sm flex items-center justify-center gap-2 transition hover:opacity-95"
                style={{ backgroundColor: 'var(--primary-500)' }}
              >
                <KeyRound className="w-4 h-4" />
                <span>Konto anlegen & Sicherheit einrichten</span>
              </button>
            </form>
          ) : (
            /* ANMELDEN */
            <form onSubmit={handleLoginVault} className="space-y-3.5 text-xs">
              <div>
                <label
                  htmlFor="login-email"
                  className="block font-semibold mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  E-Mail-Adresse
                </label>
                <input
                  id="login-email"
                  name="username"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setLoginRequiresTotp(false);
                  }}
                  className="w-full px-3.5 py-2 rounded-xl border bg-transparent"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label
                  htmlFor="login-password"
                  className="block font-semibold mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Passwort
                </label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border bg-transparent"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              </div>
              {(session?.totpEnabled || loginRequiresTotp) && (
                <div>
                  <label
                    htmlFor="login-totp"
                    className="block font-semibold mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    6-stelliger Sicherheitscode (vom Handy)
                  </label>
                  <input
                    id="login-totp"
                    name="totp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoComplete="one-time-code"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    autoFocus={loginRequiresTotp}
                    className="w-full px-3.5 py-2 rounded-xl border font-mono text-center tracking-widest bg-transparent"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition hover:opacity-90"
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <Unlock className="w-4 h-4" style={{ color: 'var(--primary-500)' }} />
                <span>Mit Passwort öffnen</span>
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 2. KONTO & SICHERHEIT DIALOG (Verständlich für jede Lehrkraft + Passkey!)
  // ===========================================================================
  if (!session) return null;

  const isPasskeyActive = Boolean(session.passkeyCredentialId || localPasskeyForEmail);

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
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 transition"
              title="Sperrt die Ansicht, bis du dich wieder per Fingerabdruck oder Passwort anmeldest"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>App jetzt sperren</span>
            </button>
            {onCloseInspector && (
              <button
                onClick={onCloseInspector}
                className="p-2 rounded-xl border"
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

        {/* Karte 1: NEU — Schnell-Anmeldung per Fingerabdruck / Face ID (Passkey) */}
        <div
          className="p-5 rounded-2xl border space-y-3"
          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <Fingerprint className="w-4 h-4" style={{ color: 'var(--primary-500)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  1. Schnell-Anmeldung mit Fingerabdruck / Face ID (Passkey)
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    isPasskeyActive
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-teal-100 text-teal-800'
                  }`}
                >
                  {isPasskeyActive ? 'Eingerichtet' : 'Empfohlen'}
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Kein langes Passwort-Tippen mehr im Unterricht: Öffne deine verschlüsselten Notenlisten einfach mit deinem
                <strong> Fingerabdruck (Touch ID / Windows Hello)</strong> oder <strong>Face ID</strong>.
              </p>
            </div>

            <button
              onClick={handleSetupPasskey}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-sm shrink-0 transition hover:opacity-95"
              style={{ backgroundColor: 'var(--primary-500)' }}
            >
              <Fingerprint className="w-4 h-4" />
              <span>
                {isPasskeyActive ? 'Passkey erneuern' : 'Passkey jetzt aktivieren'}
              </span>
            </button>
          </div>

          {isPasskeyActive && (
            <div
              className="p-2.5 rounded-xl border text-xs flex items-center justify-between"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <span className="flex items-center gap-1.5 font-semibold flex-wrap" style={{ color: 'var(--text-primary)' }}>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  {session.passkeyLabel ||
                    localPasskeyForEmail?.label ||
                    'Passkey auf diesem Gerät aktiv'}
                </span>
                {localPasskeyForEmail?.prfSupported && (
                  <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                    <Shield className="w-2.5 h-2.5" />
                    Hardware PRF (Secure Enclave)
                  </span>
                )}
              </span>
              <span className="text-[11px] shrink-0">Bereit für 1-Klick-Entsperrung</span>
            </div>
          )}
        </div>

        {/* Karte 2: Persönliches Notfallblatt (falls Passwort vergessen) */}
        <div
          className="p-5 rounded-2xl border space-y-3"
          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                2. Dein persönliches Notfallblatt (Wichtig!)
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Da deine Noten nur für dich lesbar verschlüsselt sind, kann niemand sonst dein Passwort zurücksetzen.
                Drucke dir dieses Blatt einmal aus und hefte es zu Hause ab.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const code =
                    session.recoveryKeyFormatted ||
                    'Bitte zuerst Notfallblatt neu ausstellen';
                  if (session.recoveryKeyFormatted) {
                    navigator.clipboard?.writeText(code);
                    setCopiedRecoveryKey(true);
                    setTimeout(() => setCopiedRecoveryKey(false), 2000);
                  }
                }}
                disabled={!session.recoveryKeyFormatted}
                className="px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 disabled:opacity-50"
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
                onClick={handlePrintRecoverySheet}
                disabled={!session.recoveryKeyFormatted}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                style={{ backgroundColor: 'var(--primary-500)' }}
              >
                <Printer className="w-4 h-4" />
                <span>Notfallblatt ausdrucken</span>
              </button>
            </div>
          </div>

          <div
            className="p-3 rounded-xl border font-mono text-xs font-bold text-center tracking-wider select-all"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--primary-500)',
            }}
          >
            {session.recoveryKeyFormatted
              ? `Notfall-Code: ${session.recoveryKeyFormatted}`
              : 'Aus Datenschutzgründen wird der Klartext-Notfallcode nicht im Browser-Speicher abgelegt (nur bei Kontoerstellung / Erneuerung sichtbar).'}
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
                alt="QR-Code für Handy-App (Bitwarden / Authenticator)"
                className="w-36 h-36 block"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
          )}
          <div className="space-y-2.5 flex-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                <Smartphone className="w-4 h-4" style={{ color: 'var(--primary-500)' }} />
                <span>3. Anmeldung mit Zahlencode vom Smartphone absichern (2FA)</span>
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  session.totpEnabled
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {session.totpEnabled ? 'Aktiviert' : 'Optional einrichten'}
              </span>
            </div>

            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {session.totpEnabled
                ? 'Zwei-Faktor-Authentifizierung (TOTP) ist für dein Konto aktiv und schützt deine Anmeldung.'
                : 'Scanne den QR-Code links mit Bitwarden, Apple Passwörter oder Google Authenticator – oder kopiere den Einrichtungsschlüssel direkt in Bitwarden:'}
            </p>

            {!session.totpEnabled && session.totpSecretBase32 && (
              <div
                className="p-2 px-3 rounded-xl border flex flex-wrap items-center justify-between gap-2"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="text-[11px]">
                  <span style={{ color: 'var(--text-secondary)' }}>Manueller Schlüssel (Bitwarden): </span>
                  <strong className="font-mono tracking-wider select-all" style={{ color: 'var(--text-primary)' }}>
                    {session.totpSecretBase32}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(session.totpSecretBase32 || '');
                    setStatusMsg('2FA-Schlüssel für Bitwarden in die Zwischenablage kopiert!');
                  }}
                  className="px-2.5 py-1 rounded-lg border text-[11px] font-bold transition hover:opacity-80"
                  style={{
                    backgroundColor: 'var(--primary-soft)',
                    color: 'var(--primary-text)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  Schlüssel kopieren
                </button>
              </div>
            )}

            {!session.totpEnabled && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  id="settings-totp"
                  name="totp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  aria-label="6-stelliger Zahlencode aus Authenticator-App"
                  value={totpVerifyInput}
                  onChange={(e) => setTotpVerifyInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-stelliger Zahlencode"
                  className="w-40 px-3 py-1.5 rounded-xl border font-mono text-xs bg-white dark:bg-slate-900"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                />
                <button
                  onClick={handleVerify2FA}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white"
                  style={{ backgroundColor: 'var(--primary-500)' }}
                >
                  Handy-Schutz aktivieren
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Eingeklapptes Experten-Accordion (nur für Datenschutzbeauftragte / Informatiklehrer) */}
        <div className="pt-1">
          <button
            onClick={() => setShowTechDetails((s) => !s)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>Für Datenschutzbeauftragte & IT: Technischen Verschlüsselungs-Nachweis anzeigen</span>
            {showTechDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showTechDetails && sampleEnvelope && (
            <div className="mt-2 space-y-2.5 text-xs">
              <div
                className="p-3 rounded-xl border space-y-1"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="font-bold flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
                  <span>Lesbare Daten auf deinem Gerät (verlassen nie den Browser):</span>
                </div>
                <pre className="font-mono text-[11px] overflow-x-auto" style={{ color: 'var(--text-primary)' }}>
                  {sampleEnvelope.plaintext}
                </pre>
              </div>

              <div
                className="p-3 rounded-xl border space-y-1"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="font-bold flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
                  <span>Auf dem Server gespeicherter Datensatz (AES-256-GCM verschlüsselt):</span>
                </div>
                <pre
                  className="font-mono text-[11px] break-all whitespace-pre-wrap"
                  style={{ color: 'var(--primary-500)' }}
                >
                  {sampleEnvelope.ciphertext}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
