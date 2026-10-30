import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getNativeBackupPath,
  setNativeBackupPath,
  clearNativeBackupPath,
  isAutomatedBackupSupported,
  validateAndSaveNativeBackupDirectory,
  pickNativeBackupDirectory,
  writeVaultToNativeDirectory,
  NATIVE_BACKUP_PATH_STORAGE_KEY,
} from './localBackupStorage';
import { getStorageLocationInfo } from './platform';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe('localBackupStorage native backup path support', () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).showDirectoryPicker;
  });

  afterEach(() => {
    localStorage.clear();
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).showDirectoryPicker;
  });

  it('persists and clears custom native backup path in localStorage', () => {
    expect(getNativeBackupPath()).toBeNull();

    setNativeBackupPath('  /home/lehrer/Gradus21-Backups  ');
    expect(getNativeBackupPath()).toBe('/home/lehrer/Gradus21-Backups');
    expect(localStorage.getItem(NATIVE_BACKUP_PATH_STORAGE_KEY)).toBe(
      '/home/lehrer/Gradus21-Backups'
    );

    clearNativeBackupPath();
    expect(getNativeBackupPath()).toBeNull();
  });

  it('reports automated backup as supported on all native Tauri clients even without showDirectoryPicker', () => {
    expect(isAutomatedBackupSupported()).toBe(false);

    // Simulate Linux Tauri (WebKitGTK without showDirectoryPicker)
    (window as any).__TAURI__ = {};
    expect(isAutomatedBackupSupported()).toBe(true);
  });

  it('validates and saves custom backup directory via Tauri IPC', async () => {
    (window as any).__TAURI__ = {};
    invokeMock.mockResolvedValueOnce('/mnt/schulnetz/gradus21_backups');

    const resolved = await validateAndSaveNativeBackupDirectory('/mnt/schulnetz/gradus21_backups');
    expect(invokeMock).toHaveBeenCalledWith('native_validate_backup_dir', {
      path: '/mnt/schulnetz/gradus21_backups',
    });
    expect(resolved).toBe('/mnt/schulnetz/gradus21_backups');
    expect(getNativeBackupPath()).toBe('/mnt/schulnetz/gradus21_backups');
  });

  it('opens native folder picker and persists chosen directory', async () => {
    (window as any).__TAURI__ = {};
    invokeMock.mockResolvedValueOnce('/home/julian/Nextcloud/Gradus21');

    const chosen = await pickNativeBackupDirectory('/home/julian');
    expect(invokeMock).toHaveBeenCalledWith('native_pick_backup_dir', {
      initialDir: '/home/julian',
    });
    expect(chosen).toBe('/home/julian/Nextcloud/Gradus21');
    expect(getNativeBackupPath()).toBe('/home/julian/Nextcloud/Gradus21');
  });

  it('writes vault backup to native directory via Tauri IPC', async () => {
    (window as any).__TAURI__ = {};
    invokeMock.mockResolvedValueOnce({
      filename: 'gradus21_vault_backup_u1_2026-10-30T12-00-00.gradus21',
      timestamp: '2026-10-30T12-00-00',
      resolvedPath: '/home/julian/Gradus21-Backups',
    });

    const res = await writeVaultToNativeDirectory(
      '/home/julian/Gradus21-Backups',
      '{"userId":"u1"}',
      { userId: 'u1', forceSnapshot: true }
    );
    expect(invokeMock).toHaveBeenCalledWith('native_write_vault_backup', {
      backupDir: '/home/julian/Gradus21-Backups',
      vaultJson: '{"userId":"u1"}',
      userId: 'u1',
      forceSnapshot: true,
      snapshotIntervalMs: 15 * 60 * 1000,
      maxSnapshots: 20,
    });
    expect(res.resolvedPath).toBe('/home/julian/Gradus21-Backups');
  });

  it('provides platform-appropriate default backup path placeholders for all native clients', () => {
    (window as any).__TAURI__ = {};

    // Linux
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (X11; Linux x86_64)', configurable: true });
    Object.defineProperty(navigator, 'platform', { value: 'Linux x86_64', configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
    expect(getStorageLocationInfo().defaultBackupPathPlaceholder).toBe('~/Gradus21-Backups');

    // Windows
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', configurable: true });
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
    expect(getStorageLocationInfo().defaultBackupPathPlaceholder).toBe('%USERPROFILE%\\Documents\\Gradus21-Backups');

    // macOS
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', configurable: true });
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
    expect(getStorageLocationInfo().defaultBackupPathPlaceholder).toBe('~/Documents/Gradus21-Backups');

    // iPadOS
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    expect(getStorageLocationInfo().defaultBackupPathPlaceholder).toBe('Gradus21-Backups');

    // Android
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 14; Pixel 7)', configurable: true });
    Object.defineProperty(navigator, 'platform', { value: 'Linux aarch64', configurable: true });
    expect(getStorageLocationInfo().defaultBackupPathPlaceholder).toBe('Gradus21-Backups');
  });
});
