import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useVaultWorkspaceSync,
  ACTIVE_USER_ID_STORAGE_KEY,
  LEGACY_ACTIVE_USER_ID_STORAGE_KEY,
  getUserEncryptedCacheKey,
  getLegacyUserEncryptedCacheKey,
  getStoredDek,
  getStoredToken,
  getStoredAuthKey,
  persistEncryptedSessionCredentialsToCache,
} from './useVaultWorkspaceSync';
import { findLocalCachedVault } from '../components/vault/vaultTypes';
import { wasm_encrypt_envelope, wasm_decrypt_envelope } from '../wasm-pkg/gradus21_core';
import * as localBackupStorage from '../utils/localBackupStorage';

vi.mock('../utils/wasmLoader', () => ({
  ensureWasmLoaded: vi.fn().mockResolvedValue(undefined),
  getWasmStatus: () => ({ ready: true, error: null }),
}));

vi.mock('../wasm-pkg/gradus21_core', () => ({
  wasm_encrypt_envelope: vi.fn(),
  wasm_decrypt_envelope: vi.fn(),
  wasm_unlock_vault: vi.fn(),
  wasm_rewrap_dek: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('useVaultWorkspaceSync - handleImportEncryptedBackup', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('aborts backup import if user declines confirmation when existing vault is present', async () => {
    const existingUserId = 'teacher-123';
    localStorage.setItem(ACTIVE_USER_ID_STORAGE_KEY, existingUserId);
    localStorage.setItem(
      getUserEncryptedCacheKey(existingUserId),
      JSON.stringify({ userId: existingUserId, classEnvelopes: {} })
    );

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    const { result } = renderHook(() => useVaultWorkspaceSync());

    const backupFile = new File(
      [
        JSON.stringify({
          userId: 'teacher-999',
          session: { userId: 'teacher-999' },
          classEnvelopes: {},
        }),
      ],
      'backup.gradus21',
      { type: 'application/octet-stream' }
    );

    await act(async () => {
      await result.current.handleImportEncryptedBackup(backupFile);
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(ACTIVE_USER_ID_STORAGE_KEY)).toBe(existingUserId);
    expect(localStorage.getItem(getUserEncryptedCacheKey('teacher-999'))).toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('aborts backup import when user declines confirmation with legacy active storage key', async () => {
    const legacyUserId = 'teacher-legacy-456';
    localStorage.setItem(LEGACY_ACTIVE_USER_ID_STORAGE_KEY, legacyUserId);
    localStorage.setItem(
      getLegacyUserEncryptedCacheKey(legacyUserId),
      JSON.stringify({ userId: legacyUserId, classEnvelopes: {} })
    );

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { result } = renderHook(() => useVaultWorkspaceSync());

    const backupFile = new File(
      [
        JSON.stringify({
          userId: 'teacher-999',
          session: { userId: 'teacher-999' },
          classEnvelopes: {},
        }),
      ],
      'backup.gradus21',
      { type: 'application/octet-stream' }
    );

    await act(async () => {
      await result.current.handleImportEncryptedBackup(backupFile);
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(getUserEncryptedCacheKey('teacher-999'))).toBeNull();
  });

  it('prompts confirmation when active in-memory students exist even without a cached vault', async () => {
    expect(localStorage.getItem(ACTIVE_USER_ID_STORAGE_KEY)).toBeNull();

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { result } = renderHook(() => useVaultWorkspaceSync());

    act(() => {
      result.current.setDatasets([
        {
          id: 'test-class-active',
          schoolName: 'Test School',
          schoolYear: '2026/2027',
          className: '9a',
          subjectName: 'Mathematik',
          shortName: 'M9A',
          description: '',
          config: {
            scale_id: 'de_classic_1_to_6',
            weighting_mode: 'category_buckets',
            scale_empty_categories: true,
            enable_student_levels: false,
            level_threshold_offsets: { G: 0, M: 0, E: 0 },
            custom_thresholds: null,
          },
          categories: [],
          assessments: [],
          grades: [],
          students: [
            {
              id: 'student-1',
              name: 'Max Mustermann',
              level: 'M',
              is_not_graded: false,
            },
          ],
        },
      ]);
    });

    const backupFile = new File(
      [
        JSON.stringify({
          userId: 'teacher-fresh',
          session: { userId: 'teacher-fresh' },
          classEnvelopes: {},
        }),
      ],
      'backup.gradus21',
      { type: 'application/octet-stream' }
    );

    await act(async () => {
      await result.current.handleImportEncryptedBackup(backupFile);
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(getUserEncryptedCacheKey('teacher-fresh'))).toBeNull();
  });

  it('imports backup, purges credentials, locks vault and notifies user when confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    // Set lingering session credentials and legacy cache for the imported user
    sessionStorage.setItem('gradus21_dek_imported-user', 'old-lingering-dek');
    sessionStorage.setItem('gradus21_token_imported-user', 'old-lingering-token');
    sessionStorage.setItem('gradus21_authkey_imported-user', 'old-lingering-authkey');
    localStorage.setItem(getLegacyUserEncryptedCacheKey('imported-user'), JSON.stringify({ old: 'legacy' }));

    const { result } = renderHook(() => useVaultWorkspaceSync());

    const backupFile = new File(
      [
        JSON.stringify({
          userId: 'imported-user',
          session: { userId: 'imported-user', email: 'test@gradus21.de' },
          classEnvelopes: {},
        }),
      ],
      'backup.gradus21',
      { type: 'application/octet-stream' }
    );

    await act(async () => {
      await result.current.handleImportEncryptedBackup(backupFile);
    });

    expect(localStorage.getItem(ACTIVE_USER_ID_STORAGE_KEY)).toBe('imported-user');
    expect(localStorage.getItem(getLegacyUserEncryptedCacheKey('imported-user'))).toBeNull();
    const stored = JSON.parse(localStorage.getItem(getUserEncryptedCacheKey('imported-user')) || '{}');
    expect(stored.isLocked).toBe(true);
    expect(stored.session?.dekB64).toBe('');
    expect(stored.session?.token).toBe('');

    // Verify session credentials were completely purged
    expect(getStoredDek('imported-user')).toBe('');
    expect(getStoredToken('imported-user')).toBe('');
    expect(getStoredAuthKey('imported-user')).toBe('');

    // Verify alert was shown and vault is locked
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(result.current.isVaultLocked).toBe(true);
  });

  it('does not re-inject session credentials when restoring backup while an active session was unlocked', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});

    const { result } = renderHook(() => useVaultWorkspaceSync());

    // Unlock vault first with an active DEK and token
    await act(async () => {
      await result.current.handleUnlockVault({
        userId: 'active-teacher',
        email: 'teacher@gradus21.de',
        dekB64: 'active-secret-dek-in-memory',
        token: 'active-session-jwt-token',
        kdfSaltB64: 'salt',
        encryptedDek: 'enc-dek',
        recoveryEncryptedDek: 'rec-dek',
        totpEnabled: false,
        serverSyncedCount: 0,
      });
    });

    expect(result.current.isVaultLocked).toBe(false);

    // Import a backup file for the same user
    const backupFile = new File(
      [
        JSON.stringify({
          userId: 'active-teacher',
          session: { userId: 'active-teacher', email: 'teacher@gradus21.de' },
          classEnvelopes: {},
        }),
      ],
      'backup.gradus21',
      { type: 'application/octet-stream' }
    );

    await act(async () => {
      await result.current.handleImportEncryptedBackup(backupFile);
    });

    const stored = JSON.parse(
      localStorage.getItem(getUserEncryptedCacheKey('active-teacher')) || '{}'
    );
    expect(stored.isLocked).toBe(true);
    // Crucial check: encryptedSessionCredentials must NOT have been re-injected by handleLockVault
    expect(stored.encryptedSessionCredentials).toBeUndefined();
    expect(result.current.isVaultLocked).toBe(true);
  });

  it('purges totpSecretBase32 from memory and localStorage cache when handleLockVault is called', async () => {
    const userCacheKey = getUserEncryptedCacheKey('2fa-teacher');
    localStorage.setItem(
      userCacheKey,
      JSON.stringify({
        userId: '2fa-teacher',
        session: {
          userId: '2fa-teacher',
          email: '2fa@gradus21.de',
          totpSecretBase32: 'JBSWY3DPEHPK3PXP',
        },
      })
    );

    const { result } = renderHook(() => useVaultWorkspaceSync());

    // Wait for initial mount effect to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    await act(async () => {
      await result.current.handleUnlockVault({
        userId: '2fa-teacher',
        email: '2fa@gradus21.de',
        dekB64: 'active-secret-dek-in-memory',
        token: 'active-session-jwt-token',
        kdfSaltB64: 'salt',
        encryptedDek: 'enc-dek',
        recoveryEncryptedDek: 'rec-dek',
        totpSecretBase32: 'JBSWY3DPEHPK3PXP',
        totpEnabled: true,
        serverSyncedCount: 0,
      });
    });

    expect(result.current.vaultSession?.totpSecretBase32).toBe('JBSWY3DPEHPK3PXP');

    act(() => {
      result.current.handleLockVault();
    });

    expect(result.current.isVaultLocked).toBe(true);
    expect(result.current.vaultSession?.totpSecretBase32).toBeUndefined();

    const stored = JSON.parse(localStorage.getItem(userCacheKey) || '{}');
    expect(stored.isLocked).toBe(true);
    expect(stored.session?.totpSecretBase32).toBeUndefined();
  });

  it('populates minimal locked session when backup bundle lacks a session sub-object', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});

    const { result } = renderHook(() => useVaultWorkspaceSync());

    // Suppose an existing active teacher was loaded
    await act(async () => {
      await result.current.handleUnlockVault({
        userId: 'old-teacher',
        email: 'old@gradus21.de',
        dekB64: 'old-dek',
        token: 'old-token',
        kdfSaltB64: 'old-salt',
        encryptedDek: 'old-enc-dek',
        recoveryEncryptedDek: 'old-rec-dek',
        totpEnabled: false,
        serverSyncedCount: 0,
      });
    });

    // Import backup without 'session' sub-object
    const backupFile = new File(
      [
        JSON.stringify({
          userId: 'raw-bundle-teacher',
          email: 'raw@gradus21.de',
          kdfSaltB64: 'raw-salt-123',
          encryptedDek: 'raw-enc-dek',
          classEnvelopes: {},
        }),
      ],
      'raw-backup.gradus21',
      { type: 'application/octet-stream' }
    );

    await act(async () => {
      await result.current.handleImportEncryptedBackup(backupFile);
    });

    expect(localStorage.getItem(ACTIVE_USER_ID_STORAGE_KEY)).toBe('raw-bundle-teacher');
    const stored = JSON.parse(
      localStorage.getItem(getUserEncryptedCacheKey('raw-bundle-teacher')) || '{}'
    );
    expect(stored.isLocked).toBe(true);
    expect(stored.session?.userId).toBe('raw-bundle-teacher');
    expect(stored.session?.email).toBe('raw@gradus21.de');
    expect(stored.session?.kdfSaltB64).toBe('raw-salt-123');
    expect(stored.session?.dekB64).toBe('');
    expect(result.current.vaultSession?.userId).toBe('raw-bundle-teacher');
    expect(result.current.vaultSession?.email).toBe('raw@gradus21.de');
    expect(result.current.isVaultLocked).toBe(true);
  });

  it('synthesizes valid classEnvelopes with matching AAD on handleExportEncryptedBackup when localStorage cache is empty and decrypts them on unlock', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});

    vi.mocked(wasm_encrypt_envelope).mockImplementation(
      (dek: string, uid: string, aad: string, plain: string) =>
        JSON.stringify({ dek, uid, aad, plain })
    );
    vi.mocked(wasm_decrypt_envelope).mockImplementation(
      (dek: string, uid: string, aad: string, cipher: string) => {
        const parsed = JSON.parse(cipher);
        if (parsed.dek !== dek || parsed.uid !== uid || parsed.aad !== aad) {
          throw new Error(`AAD mismatch: expected ${parsed.aad}, got ${aad}`);
        }
        return parsed.plain;
      }
    );

    let exportedBundle: any = null;
    vi.spyOn(localBackupStorage, 'exportVaultToFileDownload').mockImplementation(
      async (bundle: any) => {
        exportedBundle = bundle;
      }
    );

    const { result } = renderHook(() => useVaultWorkspaceSync());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const userId = '11111111-2222-4333-8444-555555555555';
    await act(async () => {
      await result.current.handleUnlockVault({
        userId,
        email: 'synth@gradus21.de',
        dekB64: 'synth-dek-b64',
        token: '',
        kdfSaltB64: 'synth-salt',
        encryptedDek: 'synth-enc-dek',
        recoveryEncryptedDek: 'synth-rec-dek',
        totpEnabled: false,
        serverSyncedCount: 0,
      });
    });

    // Simulate cleared/evicted localStorage before export
    localStorage.clear();

    let exportOk = false;
    await act(async () => {
      exportOk = await result.current.handleExportEncryptedBackup();
    });

    expect(exportOk).toBe(true);
    expect(exportedBundle).toBeTruthy();
    const classIds = Object.keys(exportedBundle.classEnvelopes || {});
    expect(classIds.length).toBeGreaterThan(0);
    for (const cid of classIds) {
      expect(typeof exportedBundle.classEnvelopes[cid]).toBe('object');
      expect(typeof exportedBundle.classEnvelopes[cid].encryptedPayload).toBe('string');
      expect(exportedBundle.classEnvelopes[cid].version).toBeGreaterThanOrEqual(1);
    }

    // Re-unlock using the synthesized bundle in localStorage and verify all classes decrypt without AAD mismatch
    await act(async () => {
      await result.current.loadIsolatedUserWorkspace(
        {
          userId,
          email: 'synth@gradus21.de',
          dekB64: 'synth-dek-b64',
          token: '',
          kdfSaltB64: 'synth-salt',
          encryptedDek: 'synth-enc-dek',
          recoveryEncryptedDek: 'synth-rec-dek',
          totpEnabled: false,
          serverSyncedCount: 0,
        },
        true
      );
    });

    expect(result.current.datasets.length).toBe(classIds.length);
  });

  it('does not leak plaintext totpSecretBase32 in findLocalCachedVault and resolves native biometric metadata keys', () => {
    localStorage.setItem('gradus21_active_user_id_v3', 'u-bio');
    localStorage.setItem(
      getUserEncryptedCacheKey('u-bio'),
      JSON.stringify({
        userId: 'u-bio',
        session: {
          userId: 'u-bio',
          email: 'bio@gradus21.de',
          kdfSaltB64: 'salt-1',
          encryptedDek: 'enc-1',
          totpEnabled: true,
          totpSecretBase32: 'SHOULD_NOT_BE_EXPOSED',
        },
      })
    );

    const cached = findLocalCachedVault('bio@gradus21.de');
    expect(cached).toBeTruthy();
    expect(cached?.totpEnabled).toBe(true);
    expect(cached?.totpSecretBase32).toBeUndefined();

    // Also verify native biometric fallback key resolution ('gradus21_native_bio_meta_')
    localStorage.clear();
    localStorage.setItem('gradus21_native_bio_last_user', 'u-native');
    localStorage.setItem(
      'gradus21_native_bio_meta_u-native',
      JSON.stringify({
        userId: 'u-native',
        email: 'native@gradus21.de',
        kdfSaltB64: 'native-salt',
        encryptedDek: 'native-enc-dek',
      })
    );

    const bioCached = findLocalCachedVault('native@gradus21.de');
    expect(bioCached).toBeTruthy();
    expect(bioCached?.userId).toBe('u-native');
    expect(bioCached?.kdfSaltB64).toBe('native-salt');
    expect(bioCached?.encryptedDek).toBe('native-enc-dek');
  });

  it('prunes zombie classEnvelopes from localStorage when classes are removed from datasets (Invariant I-5)', async () => {
    const userId = '22222222-3333-4444-8555-666666666666';
    const zombieUuid = '99999999-8888-4777-8666-555555555555';
    const userCacheKey = getUserEncryptedCacheKey(userId);

    const { result } = renderHook(() => useVaultWorkspaceSync());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    await act(async () => {
      await result.current.handleUnlockVault({
        userId,
        email: 'zombie@gradus21.de',
        dekB64: 'zombie-dek-b64',
        token: '',
        kdfSaltB64: 'zombie-salt',
        encryptedDek: 'zombie-enc-dek',
        recoveryEncryptedDek: 'zombie-rec-dek',
        totpEnabled: false,
        serverSyncedCount: 0,
      });
    });

    // Inject a stale/deleted zombie class envelope into localStorage
    const rawBefore = localStorage.getItem(userCacheKey);
    const parsedBefore = rawBefore ? JSON.parse(rawBefore) : { userId, classEnvelopes: {} };
    parsedBefore.classEnvelopes = {
      ...(parsedBefore.classEnvelopes || {}),
      [zombieUuid]: { encryptedPayload: 'stale_zombie_cipher', version: 3 },
    };
    localStorage.setItem(userCacheKey, JSON.stringify(parsedBefore));

    // Trigger auto-save by mutating userSettings
    await act(async () => {
      result.current.setUserSettings((prev) => ({
        ...prev,
        teacherDisplayName: 'Frau Test',
      }));
      await new Promise((r) => setTimeout(r, 450));
    });

    const storedAfter = JSON.parse(localStorage.getItem(userCacheKey) || '{}');
    expect(storedAfter.classEnvelopes?.[zombieUuid]).toBeUndefined();
  });

  it('synchronously persists updated totpEnabled state to localStorage even when kdfSaltB64 and encryptedDek already exist', () => {
    const userId = '33333333-4444-4555-8666-777777777777';
    const userCacheKey = getUserEncryptedCacheKey(userId);

    localStorage.setItem(
      userCacheKey,
      JSON.stringify({
        userId,
        session: {
          userId,
          email: 'totp-reenable@gradus21.de',
          kdfSaltB64: 'existing-salt',
          encryptedDek: 'existing-enc-dek',
          recoveryEncryptedDek: 'existing-rec-dek',
          totpEnabled: false,
          serverSyncedCount: 2,
        },
        classEnvelopes: {},
      })
    );

    persistEncryptedSessionCredentialsToCache({
      userId,
      email: 'totp-reenable@gradus21.de',
      dekB64: 'in-memory-secret-dek',
      token: 'in-memory-jwt',
      authKeyB64: 'in-memory-auth-key',
      kdfSaltB64: 'existing-salt',
      encryptedDek: 'existing-enc-dek',
      recoveryEncryptedDek: 'existing-rec-dek',
      totpEnabled: true,
      totpSecretBase32: 'JBSWY3DPEHPK3PXP',
      serverSyncedCount: 2,
    });

    const storedAfter = JSON.parse(localStorage.getItem(userCacheKey) || '{}');
    expect(storedAfter.session?.totpEnabled).toBe(true);
    expect(storedAfter.session?.dekB64).toBe('');
    expect(storedAfter.session?.token).toBe('');
    expect(storedAfter.session?.authKeyB64).toBeUndefined();
    expect(storedAfter.session?.totpSecretBase32).toBeUndefined();
  });

  it('re-encrypts merged dataset and updates local cache without using stale remote envelope (Audit #12)', async () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    const userId = '00000000-0000-4000-8000-000000000001';
    const classId = '11111111-1111-4111-8111-111111111111';
    const userCacheKey = getUserEncryptedCacheKey(userId);

    // Mock fetch for sync and batch
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/envelopes/sync')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            {
              id: classId,
              entity_type: 'class_dataset',
              encrypted_payload: 'OLD_STALE_REMOTE_ENVELOPE',
              version: 5,
              updated_at: '2026-01-01T00:00:00Z',
            },
          ],
        });
      }
      if (String(url).includes('/api/envelopes/batch')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ id: classId, version: 6 }],
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });

    (wasm_decrypt_envelope as any).mockReturnValue(
      JSON.stringify({
        id: classId,
        className: '10A',
        students: [{ id: 's1', firstName: 'Server', lastName: 'Student' }],
        categories: [],
        assessments: [],
        grades: [],
      })
    );
    (wasm_encrypt_envelope as any).mockReturnValue('NEW_MERGED_ENVELOPE');

    const { result } = renderHook(() => useVaultWorkspaceSync());

    await act(async () => {
      await result.current.handleUnlockVault({
        userId,
        email: 'teacher@gradus21.de',
        dekB64: 'dek-123',
        token: 'jwt-token',
        kdfSaltB64: 'salt',
        encryptedDek: 'enc-dek',
        recoveryEncryptedDek: 'rec-dek',
        totpEnabled: false,
        serverSyncedCount: 1,
      });
    });

    await act(async () => {
      await result.current.handleResolveReconciliation('merge');
    });

    const storedCache = JSON.parse(localStorage.getItem(userCacheKey) || '{}');
    expect(storedCache.classEnvelopes[classId]).toBeDefined();
    // Invariant: The cache MUST store the freshly encrypted envelope, NEVER the stale OLD_STALE_REMOTE_ENVELOPE!
    expect(storedCache.classEnvelopes[classId].encryptedPayload).toBe('NEW_MERGED_ENVELOPE');
    expect(storedCache.classEnvelopes[classId].version).toBe(6);
    expect(storedCache.classEnvelopes[classId].dirty).toBe(false);
  });

  it('marks the sync as pending and keeps envelopes dirty when the reconciliation batch upload fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const userId = '00000000-0000-4000-8000-000000000021';
    const classId = '22222222-2222-4222-8222-222222222222';
    const userCacheKey = getUserEncryptedCacheKey(userId);

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/envelopes/sync')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            {
              id: classId,
              entity_type: 'class_dataset',
              encrypted_payload: 'REMOTE_ENVELOPE',
              version: 3,
              updated_at: '2026-01-01T00:00:00Z',
            },
          ],
        });
      }
      if (String(url).includes('/api/envelopes/batch')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });

    (wasm_decrypt_envelope as any).mockReturnValue(
      JSON.stringify({
        id: classId,
        className: '10A',
        students: [{ id: 's1', firstName: 'Server', lastName: 'Student' }],
        categories: [],
        assessments: [],
        grades: [],
      })
    );
    (wasm_encrypt_envelope as any).mockReturnValue('PENDING_ENVELOPE');

    const { result } = renderHook(() => useVaultWorkspaceSync());

    await act(async () => {
      await result.current.handleUnlockVault({
        userId,
        email: 'teacher@gradus21.de',
        dekB64: 'dek-123',
        token: 'jwt-token',
        kdfSaltB64: 'salt',
        encryptedDek: 'enc-dek',
        recoveryEncryptedDek: 'rec-dek',
        totpEnabled: false,
        serverSyncedCount: 1,
      });
    });

    await act(async () => {
      await result.current.handleResolveReconciliation('merge');
    });

    expect(result.current.syncStatus).not.toBe('synced');
    const storedCache = JSON.parse(localStorage.getItem(userCacheKey) || '{}');
    expect(storedCache.classEnvelopes[classId].dirty).toBe(true);
    const successAlerts = alertSpy.mock.calls.filter((call) =>
      String(call[0] || '').includes('erfolgreich abgeschlossen')
    );
    expect(successAlerts).toHaveLength(0);
  });

  it('deletes local-only envelopes on the server when downloading the remote state', async () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    const userId = '00000000-0000-4000-8000-000000000022';
    const localClassId = '33333333-3333-4333-8333-333333333333';
    const userCacheKey = getUserEncryptedCacheKey(userId);

    localStorage.setItem(
      userCacheKey,
      JSON.stringify({
        userId,
        classEnvelopes: {
          [localClassId]: { encryptedPayload: 'LOCAL_ENVELOPE', version: 1, dirty: false },
        },
      })
    );

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/envelopes/sync')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => [] });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock;

    (wasm_decrypt_envelope as any).mockReturnValue(
      JSON.stringify({
        id: localClassId,
        className: '10A',
        students: [],
        categories: [],
        assessments: [],
        grades: [],
      })
    );
    (wasm_encrypt_envelope as any).mockReturnValue('LOCAL_ENVELOPE');

    const { result } = renderHook(() => useVaultWorkspaceSync());

    await act(async () => {
      await result.current.handleUnlockVault({
        userId,
        email: 'teacher@gradus21.de',
        dekB64: 'dek-123',
        token: 'jwt-token',
        kdfSaltB64: 'salt',
        encryptedDek: 'enc-dek',
        recoveryEncryptedDek: 'rec-dek',
        totpEnabled: false,
        serverSyncedCount: 1,
      });
    });

    await act(async () => {
      await result.current.handleResolveReconciliation('download_remote');
    });

    const deleteCalls = fetchMock.mock.calls.filter(
      (call) =>
        (call[1] as RequestInit | undefined)?.method === 'DELETE' &&
        String(call[0]).includes('/api/envelopes/')
    );
    expect(deleteCalls.some((call) => String(call[0]).includes(localClassId))).toBe(true);
  });
});
