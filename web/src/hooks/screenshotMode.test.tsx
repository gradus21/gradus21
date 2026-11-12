import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { isScreenshotModeUrl } from '../utils/screenshotMode';
import {
  useVaultWorkspaceSync,
  ACTIVE_USER_ID_STORAGE_KEY,
  getUserEncryptedCacheKey,
} from './useVaultWorkspaceSync';
import { INITIAL_CLASS_DATASETS } from '../data/demoClasses';
import { VAULT_LOCKED_STORAGE_KEY } from './vaultSyncHelpers';

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

const setUrl = (url: string) => window.history.replaceState(null, '', url);

const seedLockedVault = (userId: string) => {
  localStorage.setItem(VAULT_LOCKED_STORAGE_KEY, 'true');
  localStorage.setItem(ACTIVE_USER_ID_STORAGE_KEY, userId);
  localStorage.setItem(
    getUserEncryptedCacheKey(userId),
    JSON.stringify({ session: { userId, email: 'lehrer@example.org' }, isLocked: true })
  );
};

describe('isScreenshotModeUrl (#37)', () => {
  it('aktiviert den Modus nur mit explizitem ?demo=1', () => {
    expect(isScreenshotModeUrl('?demo=1')).toBe(true);
    expect(isScreenshotModeUrl('?foo=bar&demo=1')).toBe(true);
  });

  it('ignoriert ähnliche Parameter und reine Navigations-Hashes', () => {
    expect(isScreenshotModeUrl('')).toBe(false);
    expect(isScreenshotModeUrl('?demo=10')).toBe(false);
    expect(isScreenshotModeUrl('?nodemo=1')).toBe(false);
    expect(isScreenshotModeUrl('?demo=0')).toBe(false);
  });
});

describe('useVaultWorkspaceSync - Screenshot-Modus vs. Hash-Navigation (#37)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    setUrl('/');
    localStorage.clear();
    sessionStorage.clear();
  });

  it.each(['/#speed', '/#matrix', '/#student360'])(
    'lässt den Tresor bei Navigations-Hash %s gesperrt und lädt keine Demo-Daten',
    async (url) => {
      setUrl(url);
      seedLockedVault('teacher-1');

      const { result } = renderHook(() => useVaultWorkspaceSync());

      expect(result.current.isVaultLocked).toBe(true);
      await waitFor(() => expect(result.current.wasmReady).toBe(true));
      await waitFor(() => expect(result.current.vaultSession?.userId).toBe('teacher-1'));
      expect(result.current.isVaultLocked).toBe(true);
      expect(result.current.datasets.some((d) => d.id === INITIAL_CLASS_DATASETS[0].id)).toBe(
        false
      );
    }
  );

  it('lädt mit ?demo=1 einen isolierten Demo-Workspace ohne echte Vault-Session', async () => {
    setUrl('/?demo=1#speed');
    seedLockedVault('teacher-1');
    const cacheBefore = localStorage.getItem(getUserEncryptedCacheKey('teacher-1'));

    const { result } = renderHook(() => useVaultWorkspaceSync());

    expect(result.current.isVaultLocked).toBe(false);
    await waitFor(() => expect(result.current.wasmReady).toBe(true));
    await waitFor(() =>
      expect(result.current.datasets[0]?.id).toBe(INITIAL_CLASS_DATASETS[0].id)
    );
    expect(result.current.vaultSession).toBeNull();
    // Echter Tresor-Cache bleibt unangetastet
    expect(localStorage.getItem(getUserEncryptedCacheKey('teacher-1'))).toBe(cacheBefore);
  });
});
