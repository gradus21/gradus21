export interface ActiveVaultSession {
  token: string;
  userId: string;
  email: string;
  isAdmin?: boolean;
  kdfSaltB64: string;
  kdfParams?: { m_cost: number; t_cost: number; p_cost: number };
  authKeyB64?: string;
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

export interface VaultLockAndAuthModalProps {
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
  cloudSyncEnabled?: boolean;
  onToggleCloudSync?: (enable: boolean) => void | Promise<void | boolean>;
  onPurgeCloudData?: () => void | Promise<void | boolean>;
  onImportEncryptedBackup?: (file: File) => Promise<void>;
}

export interface LocalPasskeyStoreEntry {
  credentialId: string;
  email: string;
  label: string;
  prfSupported?: boolean;
  prfSaltB64?: string;
  passkeySecretB64?: string; // Fallback only for non-PRF authenticators
  passkeyEncryptedDek?: string; // Local cached passkey wrapped DEK for offline unlock
  createdAt: string;
}

export interface UserPasskeyItem {
  id: string;
  label: string;
  credential_id: string;
  prf_supported: boolean;
  created_at: string;
  last_used_at?: string;
}

export interface LocalRecoveryMetaEntry {
  email: string;
  recoveryEncryptedDek: string;
}

export interface LocalCachedVaultMeta {
  userId: string;
  email: string;
  kdfSaltB64: string;
  kdfParams?: { m_cost: number; t_cost: number; p_cost: number };
  encryptedDek: string;
  recoveryEncryptedDek?: string;
  totpEnabled?: boolean;
}

export type RegistrationStep = 'credentials' | 'recovery' | 'totp' | 'passkey' | 'complete';

export const PASSKEY_STORAGE_KEY = 'gradus21_passkey_device_store_v2';
export const LEGACY_PASSKEY_STORAGE_KEY = 'bte_notenflow_passkey_device_store_v1';
export const RECOVERY_META_STORAGE_KEY = 'gradus21_recovery_meta_v2';
export const LEGACY_RECOVERY_META_STORAGE_KEY = 'bte_notenflow_recovery_meta_v1';

export function findLocalCachedVault(targetEmail?: string, targetUserId?: string): LocalCachedVaultMeta | null {
  try {
    const normalized = targetEmail ? targetEmail.trim().toLowerCase() : null;
    let fallback: LocalCachedVaultMeta | null = null;

    // Check targetUserId or active user ID storage key first
    const activeUserId =
      targetUserId ||
      localStorage.getItem('gradus21_active_user_id_v3') ||
      localStorage.getItem('bte_notenflow_active_user_id_v3');
    if (activeUserId) {
      const activeRaw =
        localStorage.getItem(`gradus21_e2ee_user_vault_v3_${activeUserId}`) ||
        localStorage.getItem(`bte_notenflow_e2ee_user_vault_v3_${activeUserId}`);
      if (activeRaw) {
        try {
          const parsed = JSON.parse(activeRaw);
          const s = parsed.session;
          if (s && s.userId && s.encryptedDek && s.kdfSaltB64) {
            const activeMeta: LocalCachedVaultMeta = {
              userId: s.userId,
              email: s.email || 'lokal@schule.intern',
              kdfSaltB64: s.kdfSaltB64,
              kdfParams: s.kdfParams || parsed.kdfParams,
              encryptedDek: s.encryptedDek,
              recoveryEncryptedDek: s.recoveryEncryptedDek,
              totpEnabled: s.totpEnabled,
            };
            if (!normalized || (s.email && s.email.trim().toLowerCase() === normalized)) {
              return activeMeta;
            }
          }
        } catch {
          // ignore corrupted entry
        }
      }
    }

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith('gradus21_e2ee_user_vault_') ||
        key.startsWith('bte_notenflow_e2ee_user_vault_')
      ) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          const s = parsed.session;
          if (s && s.userId && s.encryptedDek && s.kdfSaltB64) {
            const meta: LocalCachedVaultMeta = {
              userId: s.userId,
              email: s.email || 'lokal@schule.intern',
              kdfSaltB64: s.kdfSaltB64,
              kdfParams: s.kdfParams || parsed.kdfParams,
              encryptedDek: s.encryptedDek,
              recoveryEncryptedDek: s.recoveryEncryptedDek,
              totpEnabled: s.totpEnabled,
            };
            if (normalized && s.email && s.email.trim().toLowerCase() === normalized) {
              return meta;
            }
            if (!fallback) fallback = meta;
          }
        } catch {
          // ignore corrupted entry
        }
      }
    }
    return fallback;
  } catch {
    return null;
  }
}

export function loadLocalPasskeys(): Record<string, LocalPasskeyStoreEntry> {
  try {
    const raw = localStorage.getItem(PASSKEY_STORAGE_KEY) || localStorage.getItem(LEGACY_PASSKEY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLocalPasskey(entry: LocalPasskeyStoreEntry) {
  const store = loadLocalPasskeys();
  store[entry.email.trim().toLowerCase()] = entry;
  store[entry.credentialId] = entry;
  localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(store));
}

export function removeLocalPasskey(email: string, credentialId?: string) {
  try {
    const store = loadLocalPasskeys();
    const normalizedEmail = email.trim().toLowerCase();
    if (credentialId) {
      delete store[credentialId];
      if (store[normalizedEmail]?.credentialId === credentialId) {
        delete store[normalizedEmail];
        const otherEntry = Object.values(store).find(
          (v) => v.email?.toLowerCase() === normalizedEmail && v.credentialId !== credentialId
        );
        if (otherEntry) {
          store[normalizedEmail] = otherEntry;
        }
      }
    } else {
      delete store[normalizedEmail];
      for (const [key, value] of Object.entries(store)) {
        if (value.email?.toLowerCase() === normalizedEmail) {
          delete store[key];
        }
      }
    }
    localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(store));
    localStorage.removeItem(LEGACY_PASSKEY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function loadLocalRecoveryMeta(email: string): LocalRecoveryMetaEntry | null {
  try {
    const raw = localStorage.getItem(RECOVERY_META_STORAGE_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw) as Record<string, LocalRecoveryMetaEntry>;
    return store[email.trim().toLowerCase()] || Object.values(store)[0] || null;
  } catch {
    return null;
  }
}

export function saveLocalRecoveryMeta(entry: LocalRecoveryMetaEntry) {
  try {
    const raw = localStorage.getItem(RECOVERY_META_STORAGE_KEY);
    const store: Record<string, LocalRecoveryMetaEntry> = raw ? JSON.parse(raw) : {};
    store[entry.email.trim().toLowerCase()] = {
      email: entry.email,
      recoveryEncryptedDek: entry.recoveryEncryptedDek,
    };
    localStorage.setItem(RECOVERY_META_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage errors
  }
}

export function normalizeRecoveryCode(code: string): string {
  return code
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function base64UrlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
  return base64ToBytes(padded);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  return bytesToBase64Url(new Uint8Array(buffer));
}
