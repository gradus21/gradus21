/**
 * Linux-specific authentication utilities for Gradus21.
 * Supports:
 * 1. Native Linux Keyring (FreeDesktop Secret Service / GNOME Keyring / KWallet & fprintd biometric sensor)
 * 2. Local FIDO2 / Passkey Loopback Service (127.0.0.1 with ephemeral transit-token, 0 bytes network)
 * 3. Fallback to Master-Password (100% offline)
 *
 * Security Officer Hardening:
 * - Master-Password remains cryptographic Root of Trust (Argon2id + AES-256-GCM).
 * - Full Disk Encryption (LUKS) advisory integrated.
 * - Loopback bound strictly to 127.0.0.1 with single-use cryptographic state & transit tokens.
 * - Zero external telemetry in local-only mode.
 */

import { isTauri, isLinux } from './platform';

export type LinuxAuthMethod =
  | 'password'        // Master-Passwort (Standard, 100% offline, kein Hintergrunddienst)
  | 'keyring'         // Nativer Linux-Schlüsselbund (Secret Service / GNOME Keyring / KWallet & Fingerabdruck)
  | 'local_passkey'   // Lokaler FIDO2/Passkey-Dienst (127.0.0.1 Loopback für YubiKey)
  | 'cloud_passkey';  // Cloud-Passkey via gradus21.app (nur bei aktivem Cloud-Sync)

const KEYRING_SERVICE_NAME = 'de.gradus21.app';
const STORAGE_METHOD_KEY = 'gradus21_linux_auth_method';
const STORAGE_PREFIX_KEYRING_META = 'gradus21_linux_keyring_meta_';
const STORAGE_PREFIX_LOCAL_PASSKEY = 'gradus21_linux_local_passkey_';
const STORAGE_LAST_LINUX_USER = 'gradus21_linux_last_user';

export interface LinuxAuthMeta {
  userId: string;
  email: string;
  updatedAt: number;
}

/**
 * Checks whether the current runtime is Linux inside a Tauri desktop app.
 */
export const isLinuxDesktopTauri = (): boolean => {
  return isTauri() && isLinux();
};

/**
 * Gets the configured Linux unlock method.
 */
export const getLinuxAuthMethod = (cloudSyncEnabled?: boolean): LinuxAuthMethod => {
  if (typeof window === 'undefined') return 'password';
  const saved = localStorage.getItem(STORAGE_METHOD_KEY) as LinuxAuthMethod | null;
  if (saved && ['password', 'keyring', 'local_passkey', 'cloud_passkey'].includes(saved)) {
    // If saved is cloud_passkey but cloudSync is disabled, fallback to password or keyring
    if (saved === 'cloud_passkey' && cloudSyncEnabled === false) {
      return hasLinuxKeyringEnrollment() ? 'keyring' : 'password';
    }
    return saved;
  }
  // Auto-detect defaults
  if (hasLinuxKeyringEnrollment()) return 'keyring';
  if (hasLocalPasskeyEnrollment()) return 'local_passkey';
  if (cloudSyncEnabled) return 'cloud_passkey';
  return 'password';
};

/**
 * Sets the preferred Linux unlock method.
 */
export const setLinuxAuthMethod = (method: LinuxAuthMethod): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_METHOD_KEY, method);
};

// ============================================================================
// OPTION 1: Nativer Linux-Schlüsselbund (FreeDesktop Secret Service & fprintd)
// ============================================================================

export const isLinuxKeyringSupported = async (): Promise<boolean> => {
  if (!isTauri()) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const available = await invoke<boolean>('keyring_is_available');
    return Boolean(available);
  } catch {
    // If not implemented or desktop command unavailable
    return false;
  }
};

export const hasLinuxKeyringEnrollment = (userIdOrEmail?: string): boolean => {
  if (typeof window === 'undefined') return false;
  const target = userIdOrEmail?.trim().toLowerCase();
  if (target) {
    if (localStorage.getItem(`${STORAGE_PREFIX_KEYRING_META}${target}`)) return true;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX_KEYRING_META)) {
        try {
          const meta = JSON.parse(localStorage.getItem(k) || '{}');
          if (meta.email?.toLowerCase() === target || meta.userId?.toLowerCase() === target) {
            return true;
          }
        } catch {}
      }
    }
    return false;
  }
  const lastUser = localStorage.getItem(STORAGE_LAST_LINUX_USER);
  if (lastUser && localStorage.getItem(`${STORAGE_PREFIX_KEYRING_META}${lastUser.toLowerCase()}`)) {
    return true;
  }
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(STORAGE_PREFIX_KEYRING_META)) return true;
  }
  return false;
};

export const getLinuxKeyringMeta = (userIdOrEmail?: string): LinuxAuthMeta | null => {
  if (typeof window === 'undefined') return null;
  const target = userIdOrEmail?.trim().toLowerCase();
  let targetUid = target;

  if (target) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX_KEYRING_META)) {
        try {
          const meta = JSON.parse(localStorage.getItem(k) || '{}');
          if (meta.email?.toLowerCase() === target || meta.userId?.toLowerCase() === target) {
            return meta;
          }
        } catch {}
      }
    }
  } else {
    targetUid = localStorage.getItem(STORAGE_LAST_LINUX_USER)?.toLowerCase();
  }

  if (!targetUid) return null;
  const raw = localStorage.getItem(`${STORAGE_PREFIX_KEYRING_META}${targetUid}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const enableLinuxKeyringUnlock = async (
  userId: string,
  email: string,
  dekB64: string
): Promise<boolean> => {
  if (!userId || !email || !dekB64) {
    throw new Error('Ungültige Sitzungsparameter für den Linux-Schlüsselbund.');
  }

  const cleanUid = userId.trim().toLowerCase();
  const cleanEmail = email.trim().toLowerCase();

  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('keyring_save_secret', {
        service: KEYRING_SERVICE_NAME,
        user: cleanUid,
        secret: dekB64,
      });
    } catch (err: any) {
      throw new Error(`Fehler beim Speichern im Linux-Schlüsselbund: ${err?.message || err}`);
    }
  } else {
    // In-browser mock for unit test environments
    sessionStorage.setItem(`__mock_keyring_${cleanUid}`, dekB64);
  }

  const meta: LinuxAuthMeta = {
    userId: cleanUid,
    email: cleanEmail,
    updatedAt: Date.now(),
  };
  localStorage.setItem(`${STORAGE_PREFIX_KEYRING_META}${cleanUid}`, JSON.stringify(meta));
  localStorage.setItem(STORAGE_LAST_LINUX_USER, cleanUid);
  setLinuxAuthMethod('keyring');
  return true;
};

export const unlockWithLinuxKeyring = async (
  userIdOrEmail?: string
): Promise<{ dekB64: string; email: string; userId: string }> => {
  const meta = getLinuxKeyringMeta(userIdOrEmail);
  const cleanUid = meta?.userId || userIdOrEmail?.trim().toLowerCase();

  if (!cleanUid) {
    throw new Error('Kein Schlüsselbund-Eintrag für dieses Konto hinterlegt.');
  }

  let dekB64 = '';
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      dekB64 = await invoke<string>('keyring_get_secret', {
        service: KEYRING_SERVICE_NAME,
        user: cleanUid,
      });
    } catch (err: any) {
      throw new Error(`Entsperrung über den Linux-Schlüsselbund fehlgeschlagen: ${err?.message || err}`);
    }
  } else {
    dekB64 = sessionStorage.getItem(`__mock_keyring_${cleanUid}`) || '';
  }

  if (!dekB64) {
    throw new Error('Hauptschlüssel (DEK) konnte nicht aus dem Linux-Schlüsselbund geladen werden.');
  }

  return {
    dekB64,
    email: meta?.email || '',
    userId: cleanUid,
  };
};

export const disableLinuxKeyringUnlock = async (userIdOrEmail: string): Promise<void> => {
  if (typeof window === 'undefined') return;
  const meta = getLinuxKeyringMeta(userIdOrEmail);
  const cleanUid = meta?.userId || userIdOrEmail?.trim().toLowerCase();
  if (!cleanUid) return;

  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('keyring_delete_secret', {
        service: KEYRING_SERVICE_NAME,
        user: cleanUid,
      });
    } catch (e) {
      console.warn('Keyring secret delete skipped or already gone:', e);
    }
  } else {
    sessionStorage.removeItem(`__mock_keyring_${cleanUid}`);
  }

  localStorage.removeItem(`${STORAGE_PREFIX_KEYRING_META}${cleanUid}`);
  const lastUser = localStorage.getItem(STORAGE_LAST_LINUX_USER);
  if (lastUser && lastUser.toLowerCase() === cleanUid) {
    localStorage.removeItem(STORAGE_LAST_LINUX_USER);
  }
  if (getLinuxAuthMethod() === 'keyring') {
    setLinuxAuthMethod('password');
  }
};

// ============================================================================
// OPTION 2: Lokaler FIDO2 / Passkey-Dienst (127.0.0.1 Loopback)
// ============================================================================

export const hasLocalPasskeyEnrollment = (userIdOrEmail?: string): boolean => {
  if (typeof window === 'undefined') return false;
  const target = userIdOrEmail?.trim().toLowerCase();
  if (target) {
    return Boolean(localStorage.getItem(`${STORAGE_PREFIX_LOCAL_PASSKEY}${target}`));
  }
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(STORAGE_PREFIX_LOCAL_PASSKEY)) return true;
  }
  return false;
};

export const enableLocalPasskeyEnrollment = (
  userId: string,
  email: string,
  credentialId: string
): void => {
  if (typeof window === 'undefined') return;
  const meta: LinuxAuthMeta = {
    userId: userId.trim().toLowerCase(),
    email: email.trim().toLowerCase(),
    updatedAt: Date.now(),
  };
  localStorage.setItem(`${STORAGE_PREFIX_LOCAL_PASSKEY}${meta.userId}`, JSON.stringify({ ...meta, credentialId }));
  setLinuxAuthMethod('local_passkey');
};

export const disableLocalPasskeyEnrollment = (userIdOrEmail: string): void => {
  if (typeof window === 'undefined') return;
  const target = userIdOrEmail.trim().toLowerCase();
  localStorage.removeItem(`${STORAGE_PREFIX_LOCAL_PASSKEY}${target}`);
  if (getLinuxAuthMethod() === 'local_passkey') {
    setLinuxAuthMethod('password');
  }
};
