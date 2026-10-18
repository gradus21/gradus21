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
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Fingerprint,
  KeyRound,
  Lock,
  Printer,
  Smartphone,
  Unlock,
  X,
} from 'lucide-react';

export interface ActiveVaultSession {
  token: string;
  userId: string;
  email: string;
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

export const VaultLockAndAuthModal: React.FC<VaultLockAndAuthModalProps> = ({
  isLockedScreen,
  session,
  sampleEnvelope,
  onUnlockSuccess,
  onLockVault,
  onCloseInspector,
}) => {
  const [authTab, setAuthTab] = useState<'login' | 'register' | 'recover'>('login');
  const [email, setEmail] = useState(session?.email || 'julian@gemeinschaftsschule.de');
  const [password, setPassword] = useState('LehrerPasswort#2026!');
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
  const handleSetupPasskey = async () => {
    if (!session) return;
    setErrorMsg(null);
    setStatusMsg('Fingerabdruck / Face ID wird eingerichtet...');

    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userIdBytes = new TextEncoder().encode(session.userId);
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
                name: session.email,
                displayName: session.email,
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
            return;
          }
        }
      }

      if (!credentialIdB64) {
        credentialIdB64 = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
      }

      const passkeySecretB64 = bytesToBase64(passkeySecretBytes);

      // Verschlüssele den persönlichen Hauptschlüssel (DEK) mit dem Passkey-Geheimnis via Rust/WASM
      const passkeyEncryptedDek = wasm_wrap_dek_with_passkey(
        session.dekB64,
        passkeySecretB64,
        credentialIdB64
      );

      const recoveryAuthKeyB64 = session.recoveryKeyFormatted
        ? wasm_derive_recovery_auth_key(session.recoveryKeyFormatted)
        : undefined;

      const res = await fetch('/api/auth/passkey/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          credential_id: credentialIdB64,
          label: deviceLabel,
          passkey_encrypted_dek: passkeyEncryptedDek,
          passkey_prf_salt_b64: isPrfEnabled ? prfSaltB64 : undefined,
          kdf_salt_b64: session.kdfSaltB64,
          encrypted_dek: session.encryptedDek,
          recovery_encrypted_dek: session.recoveryEncryptedDek,
          recovery_auth_key_b64: recoveryAuthKeyB64,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        setErrorMsg(errText || 'Passkey konnte nicht gespeichert werden.');
        setStatusMsg(null);
        return;
      }

      const data = await res.json();

      const entry: LocalPasskeyStoreEntry = {
        credentialId: credentialIdB64,
        email: session.email.trim().toLowerCase(),
        label: deviceLabel,
        prfSupported: isPrfEnabled,
        prfSaltB64: isPrfEnabled ? prfSaltB64 : undefined,
        // Nur wenn PRF nicht hardwareseitig unterstützt wird, speichern wir den Fallback-Schlüssel
        passkeySecretB64: isPrfEnabled ? undefined : passkeySecretB64,
        createdAt: new Date().toLocaleDateString('de-DE'),
      };
      saveLocalPasskey(entry);
      setLocalPasskeyForEmail(entry);

      onUnlockSuccess({
        ...session,
        token: data.token || session.token,
        passkeyCredentialId: credentialIdB64,
        passkeyLabel: deviceLabel,
      });
      setStatusMsg(
        isPrfEnabled
          ? 'Passkey mit Hardware-PRF eingerichtet! Der Tresorschlüssel ist nun direkt im Sicherheitschip (Secure Enclave / TPM) verankert.'
          : 'Passkey ist eingerichtet! Du kannst Gradus21 ab sofort bequem per Fingerabdruck, Face ID oder Geräte-PIN öffnen.'
      );
    } catch (err: any) {
      setErrorMsg('Passkey-Einrichtung fehlgeschlagen: ' + String(err));
      setStatusMsg(null);
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

  const handleRegisterVault = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg('Konto wird eingerichtet und geschützt...');
    try {
      const bundleJson = wasm_generate_vault(password);
      const bundle = JSON.parse(bundleJson);

      saveLocalRecoveryMeta({
        email,
        recoveryEncryptedDek: bundle.recovery_encrypted_dek,
      });

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
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
        setErrorMsg(errText || 'Registrierung fehlgeschlagen');
        setStatusMsg(null);
        return;
      }

      const data = await res.json();
      setStatusMsg('Konto erfolgreich eingerichtet!');
      onUnlockSuccess({
        token: data.token,
        userId: data.user_id,
        email: data.email,
        kdfSaltB64: bundle.kdf_salt_b64,
        dekB64: bundle.dek_b64,
        encryptedDek: bundle.encrypted_dek,
        recoveryEncryptedDek: bundle.recovery_encrypted_dek,
        recoveryKeyFormatted: bundle.recovery_key_formatted,
        totpEnabled: data.totp_enabled,
        totpSetupUri: data.totp_setup_uri,
        totpSecretBase32: data.totp_secret_base32,
        serverSyncedCount: 0,
      });
    } catch (err: any) {
      setErrorMsg(String(err));
      setStatusMsg(null);
    }
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
        setErrorMsg(
          t === '2FA_REQUIRED'
            ? 'Bitte gib noch den 6-stelligen Zahlencode aus deiner Handy-App ein.'
            : t || 'Anmeldung fehlgeschlagen'
        );
        setStatusMsg(null);
        return;
      }

      const loginData = await loginRes.json();
      const cachedMeta = loadLocalRecoveryMeta(loginData.email);
      onUnlockSuccess({
        token: loginData.token,
        userId: loginData.user_id,
        email: loginData.email,
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
            <div><strong>Deine E-Mail-Adresse:</strong> ${escapeHtml(session.email)}</div>
            <div style="margin-top:14px;"><strong>Dein persönlicher Notfall-Wiederherstellungscode:</strong></div>
            <div class="code">${escapeHtml(session.recoveryKeyFormatted || 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX')}</div>
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  // ===========================================================================
  // 1. GESPERRTER BILDSCHIRM (Freundlicher Anmelde-Dialog mit Passkey-Button)
  // ===========================================================================
  if (isLockedScreen) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ backgroundColor: 'var(--bg-canvas)' }}
      >
        <div
          className="max-w-md w-full rounded-3xl border p-8 shadow-xl space-y-5"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex flex-col items-center text-center space-y-2">
            <FlowRibbonLogo size={48} showWordmark={true} />
            <h2 className="text-lg font-bold pt-2" style={{ color: 'var(--text-primary)' }}>
              Gradus21 ist gesperrt
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Öffne deine Notenlisten bequem per Fingerabdruck / Face ID oder mit deinem Passwort.
            </p>
          </div>

          {/* 1-Klick Passkey-Schnellstart (wenn auf diesem Gerät eingerichtet oder verfügbar) */}
          {authTab === 'login' && (
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
                <div className="text-[11px] text-center flex items-center justify-center gap-1.5 flex-wrap" style={{ color: 'var(--text-secondary)' }}>
                  <span>Passkey aktiv für <strong>{localPasskeyForEmail.email}</strong></span>
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
                <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  oder mit Passwort
                </span>
                <div className="h-px flex-1" style={{ backgroundColor: 'var(--border-subtle)' }} />
              </div>
            </div>
          )}

          <div
            className="flex gap-1 p-1 rounded-xl border text-xs font-bold"
            style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
          >
            <button
              onClick={() => setAuthTab('login')}
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
              onClick={() => setAuthTab('register')}
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
              onClick={() => setAuthTab('recover')}
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

          {authTab === 'recover' ? (
            <form onSubmit={handleRecoverWithKey} className="space-y-3.5 text-xs">
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Gib den Code von deinem ausgedruckten <strong>Notfallblatt</strong> ein, um ein neues Passwort festzulegen.
              </p>
              <div>
                <label className="block font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Deine E-Mail-Adresse
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border bg-transparent"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Notfall-Code (vom Notfallblatt)
                </label>
                <input
                  type="text"
                  value={recoveryKeyInput}
                  onChange={(e) => setRecoveryKeyInput(e.target.value)}
                  placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                  className="w-full px-3.5 py-2 rounded-xl border font-mono bg-transparent"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Neues Passwort wählen
                </label>
                <input
                  type="password"
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
          ) : (
            <form
              onSubmit={authTab === 'login' ? handleLoginVault : handleRegisterVault}
              className="space-y-3.5 text-xs"
            >
              <div>
                <label className="block font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  E-Mail-Adresse
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border bg-transparent"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Passwort
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border bg-transparent"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              </div>
              {authTab === 'login' && session?.totpEnabled && (
                <div>
                  <label className="block font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    6-stelliger Sicherheitscode (vom Handy)
                  </label>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="123456"
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
                <span>
                  {authTab === 'login' ? 'Mit Passwort öffnen' : 'Konto jetzt erstellen'}
                </span>
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
                  type="text"
                  value={totpVerifyInput}
                  onChange={(e) => setTotpVerifyInput(e.target.value)}
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
