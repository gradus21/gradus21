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
import { LegalModal, LegalTab } from './LegalModal';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Edit2,
  ExternalLink,
  FileCheck,
  Fingerprint,
  GraduationCap,
  KeyRound,
  Lock,
  Plus,
  Printer,
  RefreshCw,
  Shield,
  Smartphone,
  Trash2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';

export * from './vault/vaultTypes';
import {
  ActiveVaultSession,
  VaultLockAndAuthModalProps,
  LocalPasskeyStoreEntry,
  UserPasskeyItem,
  LocalRecoveryMetaEntry,
  LocalCachedVaultMeta,
  RegistrationStep,
  findLocalCachedVault,
  loadLocalPasskeys,
  saveLocalPasskey,
  removeLocalPasskey,
  loadLocalRecoveryMeta,
  saveLocalRecoveryMeta,
  normalizeRecoveryCode,
  bytesToBase64,
  base64ToBytes,
  base64UrlToBytes,
  bytesToBase64Url,
  arrayBufferToBase64Url,
} from './vault/vaultTypes';
import { printRecoverySheetDocument } from './vault/RecoveryKeyPrintSheet';
import { PasswordUnlockTab } from './vault/PasswordUnlockTab';
import { PasskeyUnlockTab } from './vault/PasskeyUnlockTab';
import { RecoveryUnlockTab } from './vault/RecoveryUnlockTab';
import { VaultRegistrationWizard } from './vault/VaultRegistrationWizard';
import { CryptoEnvelopeInspector } from './vault/CryptoEnvelopeInspector';

export const VaultLockAndAuthModal: React.FC<VaultLockAndAuthModalProps> = ({
  isLockedScreen,
  session,
  sampleEnvelope,
  onUnlockSuccess,
  onLockVault,
  onCloseInspector,
  cloudSyncEnabled = false,
  onToggleCloudSync,
  onPurgeCloudData,
  onImportEncryptedBackup,
}) => {
  const [authTab, setAuthTab] = useState<'login' | 'register' | 'recover'>('login');
  const [email, setEmail] = useState(session?.email || '');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (session?.email) {
      setEmail(session.email);
    }
  }, [session?.email]);
  const [totpCode, setTotpCode] = useState('');
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [qrSvgDataUrl, setQrSvgDataUrl] = useState<string | null>(null);
  const [totpVerifyInput, setTotpVerifyInput] = useState('');
  const [copiedRecoveryKey, setCopiedRecoveryKey] = useState(false);
  const [localPasskeyForEmail, setLocalPasskeyForEmail] = useState<LocalPasskeyStoreEntry | null>(
    null
  );
  const [userPasskeys, setUserPasskeys] = useState<UserPasskeyItem[]>([]);
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<LegalTab>('impressum');
  const [optInCloudSync, setOptInCloudSync] = useState(false);
  const [showAvvConfirmation, setShowAvvConfirmation] = useState(false);

  const handleOpenLegal = (tab: LegalTab) => {
    setLegalTab(tab);
    setLegalModalOpen(true);
  };

  const fetchUserPasskeys = async () => {
    if (!session?.token) return;
    try {
      const res = await fetch('/api/auth/passkey/list', {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUserPasskeys(data);
      }
    } catch {
      // offline / ignore
    }
  };

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

  useEffect(() => {
    if (session?.token) {
      fetchUserPasskeys();
    }
  }, [session?.token, session?.passkeyCredentialId]);

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
    // Falls target kein valides ActiveVaultSession-Objekt ist (z.B. React SyntheticEvent), auf session zurückgreifen
    const isRegistrationTarget = Boolean(
      target && typeof target === 'object' && 'userId' in target && typeof (target as any).userId === 'string'
    );
    const activeSession = isRegistrationTarget ? target! : session;
    if (!activeSession) return false;

    // DEK aus der Session oder aus dem sessionStorage laden
    const dek =
      activeSession.dekB64 ||
      sessionStorage.getItem(`gradus21_dek_${activeSession.userId}`) ||
      sessionStorage.getItem(`bte_notenflow_dek_${activeSession.userId}`) ||
      '';
    if (!dek) {
      setErrorMsg('Hauptschlüssel (DEK) nicht im Speicher. Bitte melde dich erneut mit deinem Passwort an.');
      setStatusMsg(null);
      return false;
    }

    setErrorMsg(null);
    setStatusMsg('Fingerabdruck / Face ID wird eingerichtet...');

    try {
      if (!window.PublicKeyCredential || !navigator.credentials?.create) {
        setStatusMsg(null);
        setErrorMsg(
          'Dein Browser oder Betriebssystem unterstützt keine Passkeys (WebAuthn). Bitte stelle sicher, dass du eine sichere Verbindung (HTTPS oder localhost) nutzt.'
        );
        return false;
      }

      let serverSessionId: string | null = null;
      let creationPublicKey: any = null;
      if (activeSession.token) {
        try {
          const startRes = await fetch('/api/auth/passkey/register/start', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${activeSession.token}`,
            },
          });
          if (startRes.ok) {
            const startData = await startRes.json();
            serverSessionId = startData.session_id;
            creationPublicKey = startData.publicKey;
          } else {
            const errText = await startRes.text().catch(() => '');
            setStatusMsg(null);
            setErrorMsg(
              `Fehler bei der Vorbereitung der Passkey-Registrierung: ${errText || startRes.statusText}`
            );
            return false;
          }
        } catch (e: any) {
          setStatusMsg(null);
          setErrorMsg(`Server nicht erreichbar für Passkey-Registrierung: ${String(e)}`);
          return false;
        }
      }

      let challengeBuffer: ArrayBuffer;
      let userBuffer: ArrayBuffer;
      if (creationPublicKey?.challenge && creationPublicKey?.user?.id) {
        challengeBuffer = (base64UrlToBytes(creationPublicKey.challenge).buffer as ArrayBuffer);
        userBuffer = (base64UrlToBytes(creationPublicKey.user.id).buffer as ArrayBuffer);
      } else {
        challengeBuffer = (crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer);
        userBuffer = (new TextEncoder().encode(activeSession.userId).buffer as ArrayBuffer);
      }

      const prfSalt = crypto.getRandomValues(new Uint8Array(32));
      const prfSaltB64 = bytesToBase64(prfSalt);

      let credentialIdB64 = '';
      let passkeySecretBytes = crypto.getRandomValues(new Uint8Array(32));
      let isPrfEnabled = false;
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      let platformName = typeof navigator !== 'undefined' && navigator.platform ? navigator.platform : 'diesem Gerät';
      if (/android/i.test(ua)) platformName = 'Android';
      else if (/ipad/i.test(ua)) platformName = 'iPad';
      else if (/iphone/i.test(ua)) platformName = 'iPhone';
      else if (/macintosh|mac os x/i.test(ua)) platformName = 'Mac';
      else if (/windows/i.test(ua)) platformName = 'Windows';
      else if (/linux/i.test(ua)) platformName = 'Linux';
      const deviceLabel = `Passkey (${platformName})`;

      let cred: PublicKeyCredential | null = null;
      try {
        const createOptions: CredentialCreationOptions = {
          publicKey: {
            challenge: challengeBuffer,
            rp: creationPublicKey?.rp || {
              name: 'Gradus21',
              id: window.location.hostname || 'localhost',
            },
            user: {
              id: userBuffer,
              name: creationPublicKey?.user?.name || activeSession.email,
              displayName: creationPublicKey?.user?.displayName || activeSession.email,
            },
            pubKeyCredParams: creationPublicKey?.pubKeyCredParams || [
              { type: 'public-key', alg: -7 }, // ES256
              { type: 'public-key', alg: -257 }, // RS256
            ],
            authenticatorSelection: creationPublicKey?.authenticatorSelection || {
              authenticatorAttachment: 'platform',
              userVerification: 'preferred',
              residentKey: 'preferred',
            },
            timeout: creationPublicKey?.timeout || 60000,
            attestation: creationPublicKey?.attestation || 'none',
            extensions: {
              ...(creationPublicKey?.extensions || {}),
              // WebAuthn PRF Extension (W3C Level 3 standard)
              prf: {
                eval: {
                  first: prfSalt,
                },
              },
            } as any,
          },
        };

        cred = (await navigator.credentials.create(createOptions)) as PublicKeyCredential | null;

        if (cred) {
          credentialIdB64 = cred.id || bytesToBase64Url(new Uint8Array(cred.rawId));
          const extResults = (cred.getClientExtensionResults() as any)?.prf;
          const prfFirst = extResults?.results?.first;
          if (prfFirst) {
            passkeySecretBytes = new Uint8Array(prfFirst);
            isPrfEnabled = true;
          } else if (extResults?.enabled) {
            // Authenticator unterstützt Hardware-PRF, evaluiert es jedoch nicht während create().
            // Führe eine sofortige PRF-Auswertung via credentials.get() mit dem neuen Credential durch:
            try {
              const evalAssertion = (await navigator.credentials.get({
                publicKey: {
                  challenge: (crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer),
                  allowCredentials: [
                    {
                      type: 'public-key',
                      id: cred.rawId,
                      transports: (cred.response as any)?.getTransports
                        ? (cred.response as any).getTransports()
                        : undefined,
                    },
                  ],
                  userVerification:
                    creationPublicKey?.authenticatorSelection?.userVerification || 'preferred',
                  timeout: 30000,
                  rpId: creationPublicKey?.rp?.id || window.location.hostname || undefined,
                  extensions: {
                    prf: {
                      eval: {
                        first: prfSalt,
                      },
                    },
                  } as any,
                },
              })) as PublicKeyCredential | null;
              const evalPrfFirst = (evalAssertion?.getClientExtensionResults() as any)?.prf?.results?.first;
              if (evalPrfFirst) {
                passkeySecretBytes = new Uint8Array(evalPrfFirst);
                isPrfEnabled = true;
              } else {
                isPrfEnabled = false;
              }
            } catch (evalErr) {
              console.warn('Post-creation PRF evaluation failed, falling back to local secret:', evalErr);
              isPrfEnabled = false;
            }
          }
        }
      } catch (webauthnErr: any) {
        setStatusMsg(null);
        const errName = webauthnErr?.name || '';
        const errMsg = String(webauthnErr?.message || '');
        const isCancelled =
          errName === 'NotAllowedError' ||
          errName === 'AbortError' ||
          errMsg.toLowerCase().includes('cancel') ||
          errMsg.toLowerCase().includes('abort');

        if (isCancelled) {
          setErrorMsg('Die Passkey-Einrichtung wurde abgebrochen.');
        } else {
          setErrorMsg(`Passkey-Einrichtung fehlgeschlagen: ${errMsg || errName || String(webauthnErr)}`);
        }
        return false;
      }

      if (!cred || !credentialIdB64) {
        setStatusMsg(null);
        setErrorMsg('Es wurde kein Passkey vom Sicherheitschip oder Passwort-Manager bereitgestellt.');
        return false;
      }

      const passkeySecretB64 = bytesToBase64(passkeySecretBytes);
      const canonicalCredentialId = cred.id || credentialIdB64;

      // Verschlüssele den persönlichen Hauptschlüssel (DEK) mit dem Passkey-Geheimnis via Rust/WASM
      const passkeyEncryptedDek = wasm_wrap_dek_with_passkey(
        dek,
        passkeySecretB64,
        canonicalCredentialId
      );

      const recoveryAuthKeyB64 = activeSession.recoveryKeyFormatted
        ? wasm_derive_recovery_auth_key(activeSession.recoveryKeyFormatted)
        : undefined;

      let dataToken = activeSession.token;
      if (activeSession.token) {
        try {
          if (serverSessionId && cred.response) {
            const registrationResponse = {
              id: cred.id,
              rawId: arrayBufferToBase64Url(cred.rawId),
              response: {
                clientDataJSON: arrayBufferToBase64Url(
                  (cred.response as AuthenticatorAttestationResponse).clientDataJSON
                ),
                attestationObject: arrayBufferToBase64Url(
                  (cred.response as AuthenticatorAttestationResponse).attestationObject
                ),
              },
              type: cred.type,
            };

            const finishRes = await fetch('/api/auth/passkey/register/finish', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${activeSession.token}`,
              },
              body: JSON.stringify({
                session_id: serverSessionId,
                registration_response: registrationResponse,
                label: deviceLabel,
                passkey_encrypted_dek: passkeyEncryptedDek,
                passkey_prf_salt_b64: isPrfEnabled ? prfSaltB64 : undefined,
                kdf_salt_b64: activeSession.kdfSaltB64,
                encrypted_dek: activeSession.encryptedDek,
                recovery_encrypted_dek: activeSession.recoveryEncryptedDek,
                recovery_auth_key_b64: recoveryAuthKeyB64,
              }),
            });

            if (finishRes.ok) {
              const data = await finishRes.json();
              if (data.token) dataToken = data.token;
            } else {
              const errText = await finishRes.text().catch(() => '');
              setStatusMsg(null);
              setErrorMsg(
                `Passkey-Registrierung auf dem Server fehlgeschlagen: ${errText || finishRes.statusText}`
              );
              return false;
            }
          } else {
            const res = await fetch('/api/auth/passkey/register', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${activeSession.token}`,
              },
              body: JSON.stringify({
                credential_id: canonicalCredentialId,
                label: deviceLabel,
                passkey_encrypted_dek: passkeyEncryptedDek,
                passkey_prf_salt_b64: isPrfEnabled ? prfSaltB64 : undefined,
                kdf_salt_b64: activeSession.kdfSaltB64,
                encrypted_dek: activeSession.encryptedDek,
                recovery_encrypted_dek: activeSession.recoveryEncryptedDek,
                recovery_auth_key_b64: recoveryAuthKeyB64,
              }),
            });

            if (res.ok) {
              const data = await res.json();
              if (data.token) dataToken = data.token;
            } else {
              const errText = await res.text().catch(() => '');
              setStatusMsg(null);
              setErrorMsg(
                `Passkey-Registrierung fehlgeschlagen: ${errText || res.statusText}`
              );
              return false;
            }
          }
        } catch (serverErr: any) {
          setStatusMsg(null);
          setErrorMsg(`Verbindungsfehler bei der Passkey-Registrierung: ${String(serverErr)}`);
          return false;
        }
      }

      const entry: LocalPasskeyStoreEntry = {
        credentialId: canonicalCredentialId,
        email: activeSession.email.trim().toLowerCase(),
        label: deviceLabel,
        prfSupported: isPrfEnabled,
        prfSaltB64: isPrfEnabled ? prfSaltB64 : undefined,
        passkeyEncryptedDek: passkeyEncryptedDek,
        // Nur wenn PRF nicht hardwareseitig unterstützt wird, speichern wir den Fallback-Schlüssel
        passkeySecretB64: isPrfEnabled ? undefined : passkeySecretB64,
        createdAt: new Date().toLocaleDateString('de-DE'),
      };
      saveLocalPasskey(entry);
      setLocalPasskeyForEmail(entry);

      const updatedSession: ActiveVaultSession = {
        ...activeSession,
        token: dataToken || activeSession.token,
        passkeyCredentialId: credentialIdB64,
        passkeyLabel: deviceLabel,
      };

      if (isRegistrationTarget) {
        setRegSession(updatedSession);
        setRegPasskeyDone(true);
      } else {
        onUnlockSuccess(updatedSession);
        fetchUserPasskeys();
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

  const handleDeletePasskeyById = async (passkeyId: string, credentialId: string) => {
    if (!session) return;
    if (!window.confirm('Möchtest du diesen Passkey wirklich von deinem Konto entfernen?')) {
      return;
    }
    setErrorMsg(null);
    setStatusMsg('Passkey wird entfernt...');

    try {
      if (session.token) {
        const res = await fetch(`/api/auth/passkey/${passkeyId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        });
        if (!res.ok) {
          const errText = await res.text();
          setErrorMsg(errText || 'Passkey konnte nicht auf dem Server gelöscht werden.');
          setStatusMsg(null);
          return;
        }
      }

      removeLocalPasskey(session.email, credentialId);
      if (localPasskeyForEmail?.credentialId === credentialId) {
        setLocalPasskeyForEmail(null);
      }

      const updatedRemaining = userPasskeys.filter((p) => p.id !== passkeyId);
      setUserPasskeys(updatedRemaining);

      const nextPrimary = updatedRemaining[0];
      const updatedSession: ActiveVaultSession = {
        ...session,
        passkeyCredentialId: nextPrimary ? nextPrimary.credential_id : undefined,
        passkeyLabel: nextPrimary ? nextPrimary.label : undefined,
      };

      onUnlockSuccess(updatedSession);
      setStatusMsg('Der Passkey wurde erfolgreich von deinem Konto entfernt.');
    } catch (err: any) {
      setErrorMsg('Fehler beim Entfernen des Passkeys: ' + String(err));
      setStatusMsg(null);
    }
  };

  const handleRenamePasskey = async (passkeyId: string, label?: string) => {
    if (!session?.token) return;
    const clean = (label ?? editingPasskeyLabel).trim();
    if (!clean) return;

    try {
      const res = await fetch(`/api/auth/passkey/${passkeyId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ label: clean }),
      });
      if (res.ok) {
        setUserPasskeys((prev) =>
          prev.map((p) => (p.id === passkeyId ? { ...p, label: clean } : p))
        );
        if (
          session.passkeyCredentialId &&
          userPasskeys.find((p) => p.id === passkeyId)?.credential_id === session.passkeyCredentialId
        ) {
          onUnlockSuccess({ ...session, passkeyLabel: clean });
        }
        setEditingPasskeyId(null);
        setEditingPasskeyLabel('');
      } else {
        const errText = await res.text();
        setErrorMsg(errText || 'Fehler beim Umbenennen des Passkeys.');
      }
    } catch (err: any) {
      setErrorMsg('Fehler beim Umbenennen: ' + String(err));
    }
  };

  const handleRemovePasskey = async () => {
    if (!session) return;
    setErrorMsg(null);
    setStatusMsg('Passkey wird entfernt...');

    try {
      if (session.token) {
        const res = await fetch('/api/auth/passkey', {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        });
        if (!res.ok) {
          const errText = await res.text();
          setErrorMsg(errText || 'Passkey konnte nicht auf dem Server gelöscht werden.');
          setStatusMsg(null);
          return;
        }
      }

      removeLocalPasskey(session.email, session.passkeyCredentialId);
      setLocalPasskeyForEmail(null);

      const updatedSession: ActiveVaultSession = {
        ...session,
        passkeyCredentialId: undefined,
        passkeyLabel: undefined,
      };

      onUnlockSuccess(updatedSession);
      setStatusMsg('Der Passkey wurde erfolgreich von diesem Gerät und deinem Konto entfernt.');
    } catch (err: any) {
      setErrorMsg('Fehler beim Entfernen des Passkeys: ' + String(err));
      setStatusMsg(null);
    }
  };

  // ===========================================================================
  // MIT PASSKEY ÖFFNEN (1-Klick Entsperrung per Fingerabdruck / Face ID & PRF)
  // Unterstützt sowohl bestehende Geräte als auch Erstanmeldung auf Neugeräten
  // ===========================================================================
  const handleUnlockWithPasskey = async () => {
    setErrorMsg(null);
    setStatusMsg('Fingerabdruck / Face ID wird geprüft...');

    try {
      const store = loadLocalPasskeys();
      const enteredEmail = email.trim().toLowerCase();
      // Only match specific email if entered; do not fall back to another user's entry
      let localEntry: LocalPasskeyStoreEntry | null = null;
      if (enteredEmail) {
        localEntry = store[enteredEmail] || null;
      } else {
        const storedEntries = Object.values(store);
        if (storedEntries.length > 0) {
          localEntry = storedEntries[0];
        }
      }
      const targetEmail = enteredEmail || localEntry?.email || undefined;

      if (!targetEmail && (!localEntry || !localEntry.credentialId)) {
        setStatusMsg(null);
        setErrorMsg(
          'Bitte gib zuerst deine E-Mail-Adresse ein, um dich auf diesem Gerät per Passkey anzumelden.'
        );
        document.getElementById('login-email')?.focus();
        return;
      }

      if (!window.PublicKeyCredential || !navigator.credentials?.get) {
        setStatusMsg(null);
        setErrorMsg(
          'Dieser Browser unterstützt keine Passkey-Authentifizierung (WebAuthn). Bitte melde dich mit deinem Passwort an.'
        );
        return;
      }

      let derivedSecretB64 = '';
      let prfSaltToUse: Uint8Array | null = null;
      let prfSaltB64Used: string | undefined = undefined;

      if (localEntry?.prfSaltB64) {
        prfSaltToUse = base64ToBytes(localEntry.prfSaltB64);
        prfSaltB64Used = localEntry.prfSaltB64;
      }

      let serverSessionId: string | null = null;
      let serverPublicKey: any = null;
      try {
        const startRes = await fetch('/api/auth/passkey/login/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: targetEmail,
          }),
        });
        if (startRes.ok) {
          const startData = await startRes.json();
          serverSessionId = startData.session_id;
          serverPublicKey = startData.publicKey;
          if (startData.passkey_prf_salt_b64) {
            prfSaltToUse = base64ToBytes(startData.passkey_prf_salt_b64);
            prfSaltB64Used = startData.passkey_prf_salt_b64;
          }
        } else {
          // Falls das Konto auf dem Server nicht existiert (z. B. rein lokaler Offline-Tresor ohne Cloud-Konto),
          // aber ein lokaler Passkey hinterlegt ist, schalte nahtlos auf lokalen Offline-Modus um:
          if (localEntry?.passkeyEncryptedDek) {
            console.info('Konto auf dem Server nicht registriert – fahre im lokalen Offline-Tresor-Modus fort.');
          } else {
            const errText = await startRes.text().catch(() => '');
            setStatusMsg(null);
            setErrorMsg(
              errText ||
                'Für dieses Konto ist noch kein Passkey hinterlegt. Bitte melde dich mit deinem Passwort an.'
            );
            return;
          }
        }
      } catch {
        // Server unreachable / offline
        if (!localEntry) {
          setStatusMsg(null);
          setErrorMsg(
            'Der Server ist offline oder nicht erreichbar. Auf einem neuen Gerät ist für die Erstanmeldung eine Verbindung zum Server erforderlich.'
          );
          return;
        }
      }

      if (!prfSaltToUse && targetEmail) {
        try {
          const sRes = await fetch('/api/auth/salt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: targetEmail }),
          });
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData.passkey_prf_salt_b64) {
              prfSaltToUse = base64ToBytes(sData.passkey_prf_salt_b64);
              prfSaltB64Used = sData.passkey_prf_salt_b64;
              if (localEntry) {
                localEntry.prfSaltB64 = sData.passkey_prf_salt_b64;
                saveLocalPasskey(localEntry);
              }
            }
          }
        } catch {
          // ignore prefetch salt error
        }
      }

      let assertion: PublicKeyCredential | null = null;
      try {
        let challengeBuffer: ArrayBuffer;
        let allowCredentialsList: PublicKeyCredentialDescriptor[] | undefined;

        if (serverPublicKey?.challenge) {
          challengeBuffer = base64UrlToBytes(serverPublicKey.challenge).buffer as ArrayBuffer;
          if (Array.isArray(serverPublicKey.allowCredentials) && serverPublicKey.allowCredentials.length > 0) {
            allowCredentialsList = serverPublicKey.allowCredentials.map((c: any) => ({
              type: c.type || 'public-key',
              id: base64UrlToBytes(c.id).buffer as ArrayBuffer,
              transports: c.transports,
            }));
          }
        } else {
          challengeBuffer = crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer;
        }

        if ((!allowCredentialsList || allowCredentialsList.length === 0) && localEntry?.credentialId) {
          const credIdBytes = base64UrlToBytes(localEntry.credentialId);
          allowCredentialsList = [
            {
              type: 'public-key',
              id: credIdBytes.buffer as ArrayBuffer,
            },
          ];
        }

        const getExtensions = prfSaltToUse
          ? {
              prf: {
                eval: {
                  first: prfSaltToUse,
                },
              },
            }
          : undefined;

        assertion = (await navigator.credentials.get({
          publicKey: {
            challenge: challengeBuffer,
            allowCredentials: allowCredentialsList,
            userVerification: serverPublicKey?.userVerification || 'preferred',
            timeout: serverPublicKey?.timeout || 60000,
            rpId: serverPublicKey?.rpId || undefined,
            extensions: getExtensions as any,
          },
        })) as PublicKeyCredential | null;
      } catch (webauthnErr: any) {
        setStatusMsg(null);
        const errName = webauthnErr?.name || '';
        const errMsg = String(webauthnErr?.message || '');
        const isCancelled =
          errName === 'NotAllowedError' ||
          errName === 'AbortError' ||
          errName === 'SecurityError' ||
          errMsg.toLowerCase().includes('cancel') ||
          errMsg.toLowerCase().includes('abort') ||
          errMsg.toLowerCase().includes('abgebrochen') ||
          errMsg.toLowerCase().includes('close') ||
          errMsg.toLowerCase().includes('dismiss');

        if (isCancelled) {
          setErrorMsg('Die Anmeldung mit Fingerabdruck / Face ID wurde abgebrochen.');
        } else {
          setErrorMsg(
            `Passkey-Anmeldung fehlgeschlagen: ${errMsg || errName || String(webauthnErr)}`
          );
        }
        return;
      }

      // Falls der Passwortmanager oder Browser den Dialog ohne Fehler schließt (assertion = null), nicht fortfahren!
      if (!assertion) {
        setStatusMsg(null);
        setErrorMsg('Die Anmeldung mit Fingerabdruck / Face ID wurde abgebrochen.');
        return;
      }

      // WebAuthn Assertion war erfolgreich! Prüfe PRF Extension oder Fallback-Schlüssel
      const extResults = (assertion.getClientExtensionResults() as any)?.prf?.results?.first;
      if (extResults) {
        derivedSecretB64 = bytesToBase64(new Uint8Array(extResults));
      } else if (localEntry?.passkeySecretB64) {
        // Authenticator hat den Benutzer via WebAuthn erfolgreich authentifiziert,
        // aber das Gerät unterstützt keine native PRF-Extension (Fallback nur lokal).
        derivedSecretB64 = localEntry.passkeySecretB64;
      }

      let loginData: any = null;
      if (serverSessionId && assertion?.response) {
        try {
          const assertionResponse = {
            id: assertion.id,
            rawId: arrayBufferToBase64Url(assertion.rawId),
            response: {
              authenticatorData: arrayBufferToBase64Url(
                (assertion.response as AuthenticatorAssertionResponse).authenticatorData
              ),
              clientDataJSON: arrayBufferToBase64Url(
                (assertion.response as AuthenticatorAssertionResponse).clientDataJSON
              ),
              signature: arrayBufferToBase64Url(
                (assertion.response as AuthenticatorAssertionResponse).signature
              ),
              userHandle: (assertion.response as AuthenticatorAssertionResponse).userHandle
                ? arrayBufferToBase64Url(
                    (assertion.response as AuthenticatorAssertionResponse).userHandle!
                  )
                : null,
            },
            type: assertion.type,
          };

          const finishRes = await fetch('/api/auth/passkey/login/finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: serverSessionId,
              assertion_response: assertionResponse,
            }),
          });

          if (finishRes.ok) {
            loginData = await finishRes.json();
          } else {
            const errText = await finishRes.text().catch(() => '');
            setStatusMsg(null);
            setErrorMsg(`Passkey-Anmeldung abgelehnt: ${errText || 'Ungültige Signatur'}`);
            return;
          }
        } catch (e) {
          // Server unreachable / offline
        }
      }

      const passkeyEncryptedDek = loginData?.passkey_encrypted_dek || localEntry?.passkeyEncryptedDek;

      if (!passkeyEncryptedDek) {
        setStatusMsg(null);
        setErrorMsg('Für diesen Passkey wurde noch kein verschlüsselter Tresorschlüssel hinterlegt.');
        return;
      }

      if (!derivedSecretB64) {
        setStatusMsg(null);
        setErrorMsg(
          'Dieser Passkey unterstützt keine geräteübergreifende Hardware-Schlüsselableitung (PRF). Bitte melde dich auf diesem neuen Gerät einmalig mit deinem Passwort an.'
        );
        setTimeout(() => document.getElementById('login-password')?.focus(), 50);
        return;
      }

      const effectiveCredentialId =
        loginData?.passkey_credential_id ||
        localEntry?.credentialId ||
        assertion.id ||
        bytesToBase64Url(new Uint8Array(assertion.rawId));

      let unwrappedDekB64: string;
      try {
        unwrappedDekB64 = wasm_unwrap_dek_with_passkey(
          derivedSecretB64,
          effectiveCredentialId,
          passkeyEncryptedDek
        );
      } catch (firstUnwrapErr) {
        // Fallback: in case DEK was originally wrapped using standard base64 vs base64url or vice versa
        try {
          const altCredId = effectiveCredentialId.includes('-') || effectiveCredentialId.includes('_')
            ? bytesToBase64(base64UrlToBytes(effectiveCredentialId))
            : bytesToBase64Url(base64ToBytes(effectiveCredentialId));
          unwrappedDekB64 = wasm_unwrap_dek_with_passkey(
            derivedSecretB64,
            altCredId,
            passkeyEncryptedDek
          );
        } catch {
          throw firstUnwrapErr;
        }
      }

      const effectiveEmail = loginData?.email || localEntry?.email || targetEmail;
      const effectiveLabel = loginData?.passkey_label || localEntry?.label || 'Passkey';

      // Automatisch auf diesem Neugerät für zukünftige Offline-/Schnellstarts cachen
      const entryToSave: LocalPasskeyStoreEntry = {
        credentialId: effectiveCredentialId,
        email: effectiveEmail,
        label: effectiveLabel,
        prfSupported: Boolean(extResults),
        prfSaltB64: prfSaltB64Used || localEntry?.prfSaltB64,
        passkeyEncryptedDek: passkeyEncryptedDek,
        passkeySecretB64: localEntry?.passkeySecretB64,
        createdAt: localEntry?.createdAt || new Date().toLocaleDateString('de-DE'),
      };
      saveLocalPasskey(entryToSave);
      setLocalPasskeyForEmail(entryToSave);

      const localCached = findLocalCachedVault(effectiveEmail);
      const cachedMeta = loadLocalRecoveryMeta(effectiveEmail);
      let recoveryKeyFormatted = session?.recoveryKeyFormatted;
      let recoveryEncryptedDek =
        loginData?.recovery_encrypted_dek ||
        session?.recoveryEncryptedDek ||
        localCached?.recoveryEncryptedDek ||
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
            email: effectiveEmail,
            recoveryEncryptedDek,
          });
        } catch {
          // ignore
        }
      }

      const effectiveUserId = loginData?.user_id || localCached?.userId || session?.userId || 'user_local';

      onUnlockSuccess({
        token: loginData?.token || '',
        userId: effectiveUserId,
        email: effectiveEmail,
        isAdmin: loginData?.is_admin ?? false,
        kdfSaltB64: loginData?.kdf_salt_b64 || localCached?.kdfSaltB64 || session?.kdfSaltB64 || '',
        dekB64: unwrappedDekB64,
        encryptedDek:
          session?.encryptedDek && loginData?.encrypted_dek === loginData?.passkey_encrypted_dek
            ? session.encryptedDek
            : loginData?.encrypted_dek || localCached?.encryptedDek || session?.encryptedDek || '',
        recoveryEncryptedDek,
        recoveryKeyFormatted,
        totpEnabled: loginData?.totp_enabled ?? false,
        passkeyCredentialId: effectiveCredentialId,
        passkeyLabel: effectiveLabel,
        serverSyncedCount: session?.serverSyncedCount || 0,
      });
      setStatusMsg(null);
    } catch {
      setStatusMsg(null);
      setErrorMsg(
        'Passkey konnte nicht entsperrt werden. Bitte melde dich mit deinem Passwort an.'
      );
    }
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

  const handleCreateLocalOfflineVault = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    const trimmedEmail = (email.trim() || 'lehrer@schule.intern').toLowerCase();
    if (password.length < 8) {
      setErrorMsg('Das Master-Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Die Passwörter stimmen nicht überein.');
      return;
    }

    setStatusMsg('Lokaler Zero-Knowledge Tresor wird eingerichtet...');
    try {
      const bundleJson = wasm_generate_vault(password);
      const bundle = JSON.parse(bundleJson);

      saveLocalRecoveryMeta({
        email: trimmedEmail,
        recoveryEncryptedDek: bundle.recovery_encrypted_dek,
      });

      const localUserId = `local_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
      const newSession: ActiveVaultSession = {
        token: '',
        userId: localUserId,
        email: trimmedEmail,
        isAdmin: false,
        kdfSaltB64: bundle.kdf_salt_b64,
        dekB64: bundle.dek_b64,
        encryptedDek: bundle.encrypted_dek,
        recoveryEncryptedDek: bundle.recovery_encrypted_dek,
        recoveryKeyFormatted: bundle.recovery_key_formatted,
        totpEnabled: false,
        serverSyncedCount: 0,
      };

      setRegSession(newSession);
      setRegisterStep('recovery');
      setStatusMsg(null);
    } catch (err: any) {
      setErrorMsg('Fehler beim Initialisieren des lokalen Tresors: ' + String(err));
      setStatusMsg(null);
    }
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

      let data: any = null;
      try {
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

        data = await res.json();
      } catch {
        // Server unreachable / offline -> proceed as local offline vault
        const localUserId = `local_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
        data = {
          token: '',
          user_id: localUserId,
          email: trimmedEmail,
          is_admin: false,
        };
      }

      setStatusMsg(null);

      const newSession: ActiveVaultSession = {
        token: data.token || '',
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
  const handleFinishRegistration = async () => {
    if (!regSession) return;
    if (optInCloudSync && onToggleCloudSync) {
      try {
        await onToggleCloudSync(true);
      } catch {
        // ignore sync toggle error
      }
    }
    onUnlockSuccess(regSession);
  };

  const handleLoginVault = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg('Notenlisten werden geöffnet...');
    try {
      let saltData: any = null;
      let isServerOffline = !navigator.onLine;

      if (!isServerOffline) {
        try {
          const saltRes = await fetch('/api/auth/salt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });

          if (saltRes.ok) {
            saltData = await saltRes.json();
          } else if (saltRes.status === 404) {
            const localCached = findLocalCachedVault(email, session?.userId);
            if (!localCached) {
              setErrorMsg('Kein Gradus21-Konto für diese E-Mail-Adresse gefunden. Bitte prüfe deine Eingabe oder erstelle einen lokalen Tresor.');
              setStatusMsg(null);
              return;
            }
            // User does not exist on server (purged or purely offline vault)
            isServerOffline = true;
          } else {
            isServerOffline = true;
          }
        } catch {
          isServerOffline = true;
        }
      }

      if (saltData?.totp_enabled && !totpCode.trim()) {
        setLoginRequiresTotp(true);
        setErrorMsg('Bitte gib den 6-stelligen Code aus deiner Authenticator-App ein.');
        setStatusMsg(null);
        return;
      }

      const localCached = findLocalCachedVault(email, session?.userId);

      // Versuche zuerst den aktuellen verschlüsselten Schlüssel vom Server, dann den lokalen Cache
      const candidateEncryptedDeks = [
        saltData?.encrypted_dek,
        session?.encryptedDek,
        localCached?.encryptedDek,
      ].filter((v): v is string => Boolean(v && v.trim()));

      const candidateSalts = [
        saltData?.kdf_salt_b64,
        session?.kdfSaltB64,
        localCached?.kdfSaltB64,
      ].filter((v): v is string => Boolean(v && v.trim()));

      let unlocked: { dek_b64: string; auth_key_b64: string } | null = null;
      let usedEncryptedDek = '';
      let usedSalt = '';

      const kdfParams =
        saltData?.kdf_params ||
        localCached?.kdfParams ||
        session?.kdfParams || { m_cost: 65536, t_cost: 3, p_cost: 1 };

      for (const s of candidateSalts) {
        for (const encDek of candidateEncryptedDeks) {
          try {
            const unlockedJson = wasm_unlock_vault(
              password,
              s,
              JSON.stringify(kdfParams),
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

      let loginData: any = null;
      if (!isServerOffline && saltData) {
        try {
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
              setStatusMsg(null);
              return;
            } else {
              setErrorMsg(t || 'Anmeldung fehlgeschlagen');
              setStatusMsg(null);
              return;
            }
          }
          loginData = await loginRes.json();
        } catch {
          // proceeding offline
          loginData = null;
        }
      }

      const cachedMeta = loadLocalRecoveryMeta(email);
      const effectiveUserId = loginData?.user_id || session?.userId || localCached?.userId || 'user_local';

      onUnlockSuccess({
        token: loginData?.token || '',
        userId: effectiveUserId,
        email: loginData?.email || localCached?.email || email,
        isAdmin: loginData?.is_admin ?? false,
        kdfSaltB64: usedSalt || loginData?.kdf_salt_b64 || session?.kdfSaltB64 || '',
        kdfParams,
        authKeyB64: unlocked.auth_key_b64,
        dekB64: unlocked.dek_b64,
        encryptedDek: usedEncryptedDek || loginData?.encrypted_dek || session?.encryptedDek || '',
        recoveryEncryptedDek:
          loginData?.recovery_encrypted_dek ||
          session?.recoveryEncryptedDek ||
          localCached?.recoveryEncryptedDek ||
          cachedMeta?.recoveryEncryptedDek ||
          '',
        recoveryKeyFormatted: session?.recoveryKeyFormatted,
        totpEnabled: loginData?.totp_enabled ?? localCached?.totpEnabled ?? false,
        passkeyCredentialId: loginData?.passkey_credential_id,
        passkeyLabel: loginData?.passkey_label,
        serverSyncedCount: session?.serverSyncedCount || 0,
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
    setStatusMsg('Code wird überprüft...');
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
      setStatusMsg(null);
      return;
    }
    setTotpVerifyInput('');
    onUnlockSuccess({ ...session, totpEnabled: true });
    setStatusMsg('Zwei-Faktor-Schutz ist jetzt aktiv!');
  };

  const handleReconfigure2FA = async () => {
    if (!session) return;
    setErrorMsg(null);
    setStatusMsg('Neuer 2FA-Einrichtungsschlüssel wird generiert...');

    try {
      const res = await fetch('/api/auth/2fa/reconfigure', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        setErrorMsg(errText || '2FA konnte nicht zurückgesetzt werden.');
        setStatusMsg(null);
        return;
      }

      const data = await res.json();
      setTotpVerifyInput('');
      const updated: ActiveVaultSession = {
        ...session,
        totpEnabled: false,
        totpSecretBase32: data.totp_secret_base32,
        totpSetupUri: data.totp_setup_uri,
      };
      onUnlockSuccess(updated);
      if (data.totp_setup_uri) {
        QRCode.toDataURL(data.totp_setup_uri, {
          width: 240,
          margin: 3,
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#FFFFFF' },
        })
          .then((url) => setQrSvgDataUrl(url))
          .catch(() => setQrSvgDataUrl(null));
      }
      setStatusMsg(
        'Neuer 2FA-Schlüssel erstellt! Bitte scanne den neuen QR-Code und gib zur Bestätigung den 6-stelligen Code ein.'
      );
    } catch (err: any) {
      setErrorMsg('Fehler beim Neukonfigurieren von 2FA: ' + String(err));
      setStatusMsg(null);
    }
  };

  const handleDisable2FA = async () => {
    if (!session) return;
    if (
      !window.confirm(
        'Möchtest du die Zwei-Faktor-Authentifizierung (2FA) wirklich für dieses Konto deaktivieren?'
      )
    ) {
      return;
    }
    setErrorMsg(null);
    setStatusMsg('2FA wird deaktiviert...');

    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        setErrorMsg(errText || '2FA konnte nicht deaktiviert werden.');
        setStatusMsg(null);
        return;
      }

      const updated: ActiveVaultSession = {
        ...session,
        totpEnabled: false,
      };
      onUnlockSuccess(updated);
      setQrSvgDataUrl(null);
      setStatusMsg('Zwei-Faktor-Authentifizierung wurde deaktiviert.');
    } catch (err: any) {
      setErrorMsg('Fehler beim Deaktivieren von 2FA: ' + String(err));
      setStatusMsg(null);
    }
  };

  const handlePrintRecoverySheet = () => {
    if (!session) return;
    printRecoverySheetDocument(
      session.email,
      session.recoveryKeyFormatted || 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX'
    );
  };

  const handleRotateRecoveryKey = async () => {
    if (!session) return;
    setErrorMsg(null);
    setStatusMsg('Neuer Notfall-Schlüssel wird kryptografisch generiert...');

    try {
      const dek =
        session.dekB64 ||
        sessionStorage.getItem(`gradus21_dek_${session.userId}`) ||
        sessionStorage.getItem(`bte_notenflow_dek_${session.userId}`) ||
        '';
      if (!dek) {
        setErrorMsg('Hauptschlüssel (DEK) nicht im Speicher. Bitte melde dich erneut mit deinem Passwort an.');
        setStatusMsg(null);
        return;
      }

      // Erzeuge neuen 24-stelligen Recovery-Schlüssel & verschlüssele DEK via WASM
      const recBundleRaw = wasm_wrap_dek_with_recovery(dek, '');
      const recBundle =
        typeof recBundleRaw === 'string' ? JSON.parse(recBundleRaw) : recBundleRaw;
      const formattedKey: string = recBundle.recovery_key_formatted;
      const recEncryptedDek: string = recBundle.recovery_encrypted_dek;
      const recAuthKeyB64: string = recBundle.recovery_auth_key_b64;

      if (session.token) {
        const res = await fetch('/api/auth/recovery/rotate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({
            recovery_encrypted_dek: recEncryptedDek,
            recovery_auth_key_b64: recAuthKeyB64,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          setErrorMsg(errText || 'Notfall-Schlüssel konnte auf dem Server nicht aktualisiert werden.');
          setStatusMsg(null);
          return;
        }
      }

      saveLocalRecoveryMeta({
        email: session.email,
        recoveryEncryptedDek: recEncryptedDek,
      });

      const updatedSession: ActiveVaultSession = {
        ...session,
        recoveryKeyFormatted: formattedKey,
        recoveryEncryptedDek: recEncryptedDek,
      };

      onUnlockSuccess(updatedSession);
      setStatusMsg('Neuer Notfall-Schlüssel erfolgreich generiert! Bitte drucke das Notfallblatt jetzt aus und hefte es sicher ab.');
    } catch (err: any) {
      setErrorMsg('Fehler beim Erneuern des Notfall-Schlüssels: ' + String(err));
      setStatusMsg(null);
    }
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
                <span>
                  {localPasskeyForEmail
                    ? 'Mit Fingerabdruck / Face ID öffnen (Passkey)'
                    : 'Mit Passkey anmelden'}
                </span>
              </button>
              {localPasskeyForEmail ? (
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
              ) : (
                <div
                  className="text-[11px] text-center"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <span>
                    Unterstützt auch neue Geräte & synchronisierte Passkeys (iCloud, 1Password, Google).
                  </span>
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

          {/* REGISTRIERUNGS-WIZARD / WIEDERHERSTELLUNG / ANMELDEN */}
          {authTab === 'register' ? (
            <VaultRegistrationWizard
              step={registerStep}
              setStep={setRegisterStep}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              optInCloudSync={optInCloudSync}
              setOptInCloudSync={setOptInCloudSync}
              setShowAvvConfirmation={setShowAvvConfirmation}
              regSession={regSession}
              recoverySavedConfirmed={recoverySavedConfirmed}
              setRecoverySavedConfirmed={setRecoverySavedConfirmed}
              regQrDataUrl={regQrDataUrl}
              showRegTotpManualSecret={showRegTotpManualSecret}
              setShowRegTotpManualSecret={setShowRegTotpManualSecret}
              copiedRegTotpSecret={copiedRegTotpSecret}
              regTotpCode={regTotpCode}
              setRegTotpCode={setRegTotpCode}
              regTotpVerified={regTotpVerified}
              regPasskeyDone={regPasskeyDone}
              onStartRegistration={handleStartRegistration}
              onProceedToTotp={handleProceedToTotp}
              onVerifyRegistration2FA={handleVerifyRegistration2FA}
              onSetupRegistrationPasskey={handleSetupRegistrationPasskey}
              onSkipPasskey={handleSkipPasskey}
              onFinishRegistration={handleFinishRegistration}
              onCancelRegistration={handleCancelRegistration}
              onCreateLocalOfflineVault={handleCreateLocalOfflineVault}
              onPrintRecoverySheet={handlePrintRegRecoverySheet}
              onCopyRecoveryKey={() => handleCopyRecoveryKey(regSession?.recoveryKeyFormatted || '')}
              copiedRecoveryKey={copiedRecoveryKey}
              onCopyRegSecret={handleCopyRegSecret}
              onOpenLegal={handleOpenLegal}
            />
          ) : authTab === 'recover' ? (
            <RecoveryUnlockTab
              email={email}
              setEmail={setEmail}
              recoveryKey={recoveryKeyInput}
              setRecoveryKey={setRecoveryKeyInput}
              newPassword={newPasswordInput}
              setNewPassword={setNewPasswordInput}
              isLoading={false}
              onRecover={handleRecoverWithKey}
              onBackToLogin={() => setAuthTab('login')}
            />
          ) : (
            /* ANMELDEN */
            <form onSubmit={handleLoginVault} className="space-y-3.5 text-xs">
              {!navigator.onLine && (
                <div className="p-2.5 rounded-xl border text-[11px] flex items-center gap-2 text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/20">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Offline-Modus: Du kannst deinen Tresor wie gewohnt lokal auf diesem Gerät entsperren.</span>
                </div>
              )}
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

          {/* OFFLINE RESTORE: AUS NOTEN-BACKUP WIEDERHERSTELLEN */}
          {onImportEncryptedBackup && !isRegisterWizard && (
            <div
              className="pt-3 border-t text-center"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Aus verschlüsseltem Noten-Backup (.gradus21) wiederherstellen</span>
                <input
                  type="file"
                  accept=".gradus21,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onImportEncryptedBackup(file);
                    }
                  }}
                />
              </label>
            </div>
          )}
          {/* Interaktives Rechts- & Compliance-Modal */}
          <LegalModal
            isOpen={legalModalOpen}
            initialTab={legalTab}
            onClose={() => setLegalModalOpen(false)}
          />
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 2. KONTO & SICHERHEIT DIALOG (Verständlich für jede Lehrkraft + Passkey!)
  // ===========================================================================
  if (!session) return null;

  return (
    <CryptoEnvelopeInspector
      session={session}
      sampleEnvelope={sampleEnvelope}
      onLockVault={onLockVault}
      onCloseInspector={onCloseInspector}
      cloudSyncEnabled={cloudSyncEnabled}
      onToggleCloudSync={onToggleCloudSync}
      onPurgeCloudData={onPurgeCloudData}
      userPasskeys={userPasskeys}
      localPasskeyForEmail={localPasskeyForEmail}
      qrSvgDataUrl={qrSvgDataUrl}
      totpVerifyInput={totpVerifyInput}
      setTotpVerifyInput={setTotpVerifyInput}
      onSetupPasskey={() => handleSetupPasskey()}
      onRenamePasskey={handleRenamePasskey}
      onDeletePasskey={handleDeletePasskeyById}
      onRotateRecoveryKey={handleRotateRecoveryKey}
      onPrintRecoverySheet={handlePrintRecoverySheet}
      onReconfigure2FA={handleReconfigure2FA}
      onDisable2FA={handleDisable2FA}
      onVerify2FAToken={handleVerify2FA}
      statusMsg={statusMsg}
      errorMsg={errorMsg}
      setStatusMsg={setStatusMsg}
      setErrorMsg={setErrorMsg}
    />
  );
};
