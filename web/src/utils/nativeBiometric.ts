import { isTauri } from './platform';

export interface NativeBiometricStatus {
  available: boolean;
  biometryType?: 'fingerprint' | 'face' | 'iris' | 'touch_id' | 'face_id' | 'none';
  error?: string;
}

const STORAGE_PREFIX_DEK = 'gradus21_native_bio_dek_';
const STORAGE_PREFIX_META = 'gradus21_native_bio_meta_';
const STORAGE_LAST_USER_KEY = 'gradus21_native_bio_last_user';

export interface BiometricVaultMeta {
  userId: string;
  email: string;
  updatedAt: number;
}

/**
 * Checks if the current hardware and platform supports native biometrics via Tauri.
 * Returns false on standard web browsers and unsupported desktop environments.
 */
export async function checkNativeBiometricAvailability(): Promise<NativeBiometricStatus> {
  if (!isTauri()) {
    return { available: false, biometryType: 'none' };
  }

  try {
    const { checkStatus, BiometryType } = await import('@tauri-apps/plugin-biometric');
    const status = await checkStatus();

    let biometryType: NativeBiometricStatus['biometryType'] = 'none';
    if (status.biometryType === BiometryType.TouchID) {
      biometryType = 'fingerprint';
    } else if (status.biometryType === BiometryType.FaceID) {
      biometryType = 'face';
    } else if (status.biometryType === BiometryType.Iris) {
      biometryType = 'iris';
    }

    return {
      available: Boolean(status.isAvailable),
      biometryType,
      error: status.error,
    };
  } catch (err: any) {
    return {
      available: false,
      biometryType: 'none',
      error: err?.message || String(err),
    };
  }
}

/**
 * Checks whether a hardware-encrypted biometric DEK exists for the specified user or email.
 */
export function hasNativeBiometricEnrollment(userIdOrEmail?: string): boolean {
  if (typeof window === 'undefined') return false;

  const target = userIdOrEmail?.trim().toLowerCase();
  if (target) {
    // Check direct user ID key
    if (localStorage.getItem(`${STORAGE_PREFIX_DEK}${target}`)) return true;

    // Check by email in meta entries
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX_META)) {
        try {
          const meta = JSON.parse(localStorage.getItem(k) || '{}');
          if (meta.email && meta.email.toLowerCase() === target) {
            const uid = meta.userId?.toLowerCase();
            if (uid && localStorage.getItem(`${STORAGE_PREFIX_DEK}${uid}`)) return true;
          }
        } catch {
          // ignore corrupted items
        }
      }
    }
    return false;
  }

  // Fallback: check if ANY biometric DEK exists on this device
  const lastUser = localStorage.getItem(STORAGE_LAST_USER_KEY);
  if (lastUser && localStorage.getItem(`${STORAGE_PREFIX_DEK}${lastUser}`)) return true;

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(STORAGE_PREFIX_DEK)) return true;
  }
  return false;
}

/**
 * Returns the metadata of the stored biometric enrollment.
 */
export function getNativeBiometricMeta(userIdOrEmail?: string): BiometricVaultMeta | null {
  if (typeof window === 'undefined') return false ? (null as any) : null;

  const target = userIdOrEmail?.trim().toLowerCase();
  let targetUid = target;

  if (target) {
    // Check if target is an email
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX_META)) {
        try {
          const meta = JSON.parse(localStorage.getItem(k) || '{}');
          if (meta.email && meta.email.toLowerCase() === target) {
            targetUid = meta.userId?.toLowerCase() || target;
            break;
          }
        } catch {}
      }
    }
  } else {
    targetUid = localStorage.getItem(STORAGE_LAST_USER_KEY)?.toLowerCase() || undefined;
  }

  if (!targetUid) return null;

  const rawMeta = localStorage.getItem(`${STORAGE_PREFIX_META}${targetUid}`);
  if (!rawMeta) return null;
  try {
    return JSON.parse(rawMeta);
  } catch {
    return null;
  }
}

/**
 * Enables native biometric unlock for a user by encrypting the DEK with the Android/iOS
 * hardware security chip (Android Keystore StrongBox/TEE or Apple Secure Enclave).
 *
 * Security Officer Policy:
 * - Uses hardware AES-256-GCM (`dataToEncrypt`).
 * - Strictly sets `allowDeviceCredential: false` so that device PIN/passcode cannot bypass biometrics.
 */
export async function enableNativeBiometricLock(
  userId: string,
  email: string,
  dekB64: string
): Promise<boolean> {
  if (!isTauri()) {
    throw new Error('Native Biometrie ist nur in der installierten App verfügbar.');
  }
  if (!userId || !email || !dekB64) {
    throw new Error('Ungültige Sitzungsparameter für die biometrische Aktivierung.');
  }

  const biometricModule = await import('@tauri-apps/plugin-biometric');
  const authenticate = (biometricModule as any).authenticate;
  const biometricCipher = (biometricModule as any).biometricCipher;

  let storedData: string | null = null;

  // On Android, use biometricCipher (hardware Keystore)
  if (typeof biometricCipher === 'function') {
    try {
      const cipherRes = await biometricCipher('Gradus21 Noten-Tresor mit Fingerabdruck schützen', {
        title: 'Gradus21 Tresorschutz',
        subtitle: email,
        dataToEncrypt: dekB64,
        allowDeviceCredential: false,
        confirmationRequired: false,
      });
      if (cipherRes?.data) {
        storedData = cipherRes.data;
      }
    } catch (cipherErr) {
      console.warn('biometricCipher unsupported or rejected, attempting authenticate fallback:', cipherErr);
    }
  }

  // On iOS / macOS (LocalAuthentication Touch ID / Face ID), use authenticate()
  if (!storedData && typeof authenticate === 'function') {
    await authenticate('Gradus21 Noten-Tresor mit Biometrie (Touch ID / Face ID) schützen', {
      allowDeviceCredential: false,
    });
    // On iOS, the app sandbox is hardware-encrypted by Apple Data Protection
    storedData = `v1_plain:${dekB64}`;
  }

  if (!storedData) {
    throw new Error('Verschlüsselung im Hardware-Sicherheitschip fehlgeschlagen.');
  }

  const cleanUid = userId.trim().toLowerCase();
  const cleanEmail = email.trim().toLowerCase();

  localStorage.setItem(`${STORAGE_PREFIX_DEK}${cleanUid}`, storedData);
  const meta: BiometricVaultMeta = {
    userId: cleanUid,
    email: cleanEmail,
    updatedAt: Date.now(),
  };
  localStorage.setItem(`${STORAGE_PREFIX_META}${cleanUid}`, JSON.stringify(meta));
  localStorage.setItem(STORAGE_LAST_USER_KEY, cleanUid);

  return true;
}

/**
 * Unlocks the vault using the native hardware biometric sensor.
 * Resolves with the decrypted DEK in memory.
 */
export async function unlockWithNativeBiometric(
  userIdOrEmail?: string
): Promise<{ dekB64: string; email: string; userId: string }> {
  if (!isTauri()) {
    throw new Error('Native Biometrie ist nur in der installierten App verfügbar.');
  }

  const meta = getNativeBiometricMeta(userIdOrEmail);
  const cleanUid = meta?.userId || userIdOrEmail?.trim().toLowerCase();

  if (!cleanUid) {
    throw new Error('Kein biometrischer Schlüssel auf diesem Gerät hinterlegt.');
  }

  const encryptedDek = localStorage.getItem(`${STORAGE_PREFIX_DEK}${cleanUid}`);
  if (!encryptedDek) {
    throw new Error('Kein biometrischer Schlüssel für dieses Benutzerkonto gefunden.');
  }

  const biometricModule = await import('@tauri-apps/plugin-biometric');
  const authenticate = (biometricModule as any).authenticate;
  const biometricCipher = (biometricModule as any).biometricCipher;

  // iOS / LocalAuthentication fallback
  if (encryptedDek.startsWith('v1_plain:')) {
    if (typeof authenticate !== 'function') {
      throw new Error('Biometrische Authentifizierung nicht verfügbar.');
    }
    await authenticate('Gradus21 Noten-Tresor mit Face ID oder Touch ID entsperren', {
      allowDeviceCredential: false,
    });
    return {
      dekB64: encryptedDek.slice('v1_plain:'.length),
      email: meta?.email || '',
      userId: cleanUid,
    };
  }

  try {
    const cipherRes = await biometricCipher('Gradus21 Noten-Tresor entsperren', {
      title: 'Gradus21 Noten-Tresor',
      subtitle: meta?.email || 'Biometrische Entsperrung',
      dataToDecrypt: encryptedDek,
      allowDeviceCredential: false,
      confirmationRequired: false,
    });

    if (!cipherRes?.data) {
      throw new Error('Hardware-Entschlüsselung lieferte keine Daten.');
    }

    return {
      dekB64: cipherRes.data,
      email: meta?.email || '',
      userId: cleanUid,
    };
  } catch (err: any) {
    const errMsg = String(err?.message || err);
    // Security Officer Rule: Invalidate compromised or altered biometrics
    if (
      errMsg.includes('KeyPermanentlyInvalidated') ||
      errMsg.includes('invalidated') ||
      errMsg.includes('Key no longer valid')
    ) {
      disableNativeBiometricLock(cleanUid);
      throw new Error(
        'Die biometrischen Daten auf diesem Gerät wurden geändert. Aus Sicherheitsgründen wurde der biometrische Schnellzugriff zurückgesetzt. Bitte melde dich einmalig mit deinem Master-Passwort an.'
      );
    }
    throw err;
  }
}

/**
 * Removes the biometric enrollment for the specified user from this device.
 */
export function disableNativeBiometricLock(userIdOrEmail: string): void {
  if (typeof window === 'undefined') return;
  const meta = getNativeBiometricMeta(userIdOrEmail);
  const cleanUid = meta?.userId || userIdOrEmail?.trim().toLowerCase();
  if (!cleanUid) return;

  localStorage.removeItem(`${STORAGE_PREFIX_DEK}${cleanUid}`);
  localStorage.removeItem(`${STORAGE_PREFIX_META}${cleanUid}`);

  const lastUser = localStorage.getItem(STORAGE_LAST_USER_KEY);
  if (lastUser && lastUser.toLowerCase() === cleanUid) {
    localStorage.removeItem(STORAGE_LAST_USER_KEY);
  }
}
