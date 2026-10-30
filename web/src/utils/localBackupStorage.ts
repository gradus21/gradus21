/**
 * Local Backup & File System Helpers for Gradus21
 * Supports:
 * 1. Persistent Browser Storage (navigator.storage.persist)
 * 2. Export / Import encrypted .gradus21 vault file (school network share / USB)
 * 3. Automated Local Directory Backup:
 *    - Native Clients (Linux, Windows, macOS, iOS/iPadOS, Android): Separate Backup Path via Tauri IPC
 *    - Web Browsers (Chromium): File System Access API + IndexedDB
 */

import { isTauri } from './platform';

const BACKUP_IDB_NAME = 'gradus21_local_backup_v1';
const BACKUP_STORE_NAME = 'directory_handles';
const HANDLE_KEY = 'connected_backup_directory';
export const NATIVE_BACKUP_PATH_STORAGE_KEY = 'gradus21_native_backup_dir_v1';

/**
 * Reads the configured separate backup directory path for native Tauri clients.
 */
export function getNativeBackupPath(): string | null {
  if (typeof localStorage === 'undefined') return null;
  const val = localStorage.getItem(NATIVE_BACKUP_PATH_STORAGE_KEY);
  return val && val.trim() ? val.trim() : null;
}

/**
 * Persists a separate backup directory path for native Tauri clients.
 */
export function setNativeBackupPath(path: string): void {
  if (typeof localStorage === 'undefined') return;
  const trimmed = path.trim();
  if (trimmed) {
    localStorage.setItem(NATIVE_BACKUP_PATH_STORAGE_KEY, trimmed);
  } else {
    localStorage.removeItem(NATIVE_BACKUP_PATH_STORAGE_KEY);
  }
}

/**
 * Clears the configured separate backup directory path for native Tauri clients.
 */
export function clearNativeBackupPath(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(NATIVE_BACKUP_PATH_STORAGE_KEY);
}

/**
 * Requests persistent storage from the browser to prevent eviction
 */
export async function requestStoragePersistence(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      return isPersisted;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Checks if the browser currently considers storage persistent
 */
export async function checkStoragePersistence(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
    try {
      return await navigator.storage.persisted();
    } catch {
      return false;
    }
  }
  return false;
}

function openBackupIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const req = indexedDB.open(BACKUP_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BACKUP_STORE_NAME)) {
        db.createObjectStore(BACKUP_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Store a FileSystemDirectoryHandle in IndexedDB
 */
export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openBackupIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BACKUP_STORE_NAME, 'readwrite');
    const store = tx.objectStore(BACKUP_STORE_NAME);
    const req = store.put(handle, HANDLE_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieve the saved FileSystemDirectoryHandle from IndexedDB
 */
export async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openBackupIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BACKUP_STORE_NAME, 'readonly');
      const store = tx.objectStore(BACKUP_STORE_NAME);
      const req = store.get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/**
 * Remove the saved directory handle from IndexedDB
 */
export async function removeDirectoryHandle(): Promise<void> {
  try {
    const db = await openBackupIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BACKUP_STORE_NAME, 'readwrite');
      const store = tx.objectStore(BACKUP_STORE_NAME);
      const req = store.delete(HANDLE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // ignore
  }
}

/**
 * Checks if browser File System Access API (`window.showDirectoryPicker`) is supported
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Checks if automated local backup directory is supported (either Native Tauri Client or Chromium File System Access API)
 */
export function isAutomatedBackupSupported(): boolean {
  return isTauri() || isFileSystemAccessSupported();
}

/**
 * Returns the platform-specific default backup directory path on native Tauri clients.
 */
export async function getDefaultNativeBackupDirectory(): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<string>('native_get_default_backup_dir');
}

/**
 * Validates and prepares (creates if needed + checks write access) a custom backup directory path on native Tauri clients.
 */
export async function validateAndSaveNativeBackupDirectory(rawPath: string): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  const validatedPath = await invoke<string>('native_validate_backup_dir', { path: rawPath });
  setNativeBackupPath(validatedPath);
  return validatedPath;
}

/**
 * Opens a native OS folder picker dialog on Tauri clients (or uses the default mobile Documents folder).
 */
export async function pickNativeBackupDirectory(initialDir?: string | null): Promise<string | null> {
  const { invoke } = await import('@tauri-apps/api/core');
  const chosen = await invoke<string | null>('native_pick_backup_dir', {
    initialDir: initialDir || getNativeBackupPath() || undefined,
  });
  if (chosen) {
    setNativeBackupPath(chosen);
  }
  return chosen;
}

/**
 * Writes the encrypted vault bundle into the configured native backup directory path via Tauri IPC.
 */
export async function writeVaultToNativeDirectory(
  backupDir: string,
  vaultJson: string,
  options?: WriteVaultDirectoryOptions
): Promise<{ filename: string; timestamp: string; resolvedPath: string }> {
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<{ filename: string; timestamp: string; resolvedPath: string }>(
    'native_write_vault_backup',
    {
      backupDir,
      vaultJson,
      userId: options?.userId,
      forceSnapshot: options?.forceSnapshot ?? false,
      snapshotIntervalMs: options?.snapshotIntervalMs ?? 15 * 60 * 1000,
      maxSnapshots: options?.maxSnapshots ?? 20,
    }
  );
}

/**
 * Prompts the user to pick a backup directory (e.g. school share or USB) via browser File System Access API
 */
export async function pickBackupDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API wird von diesem Browser nicht unterstützt.');
  }
  try {
    // @ts-expect-error - showDirectoryPicker is standard in Chromium
    const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
      id: 'gradus21_school_backup_dir',
      mode: 'readwrite',
    });
    await saveDirectoryHandle(handle);
    return handle;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return null;
    }
    throw err;
  }
}

/**
 * Verifies or requests permission for a directory handle
 */
export async function verifyDirectoryPermission(
  fileHandle: FileSystemDirectoryHandle,
  readWrite = true
): Promise<boolean> {
  const options: any = {};
  if (readWrite) {
    options.mode = 'readwrite';
  }
  // @ts-expect-error - queryPermission is standard in Chromium
  if ((await fileHandle.queryPermission(options)) === 'granted') {
    return true;
  }
  // @ts-expect-error - requestPermission is standard in Chromium
  if ((await fileHandle.requestPermission(options)) === 'granted') {
    return true;
  }
  return false;
}

export interface WriteVaultDirectoryOptions {
  userId?: string;
  forceSnapshot?: boolean;
  snapshotIntervalMs?: number; // default: 15 * 60 * 1000 (15 min)
  maxSnapshots?: number; // default: 20
}

let lastSnapshotTimestamp = 0;

/**
 * Writes the encrypted vault bundle into the connected directory handle.
 * Supports atomic latest file updates and periodic snapshots with retention (max 20).
 */
export async function writeVaultToDirectory(
  dirHandle: FileSystemDirectoryHandle,
  vaultJson: string,
  options?: WriteVaultDirectoryOptions
): Promise<{ filename: string; timestamp: string }> {
  const hasPerm = await verifyDirectoryPermission(dirHandle, true);
  if (!hasPerm) {
    throw new Error('Keine Schreibberechtigung für den gewählten Backup-Ordner.');
  }

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rawUserId = options?.userId || '';
  const safeUserId = rawUserId ? rawUserId.replace(/[^a-zA-Z0-9_-]/g, '_') : 'default';

  // Canonical filename per documentation: gradus21_vault_backup_<userId>.gradus21
  const mainFilename = `gradus21_vault_backup_${safeUserId}.gradus21`;
  const legacyLatestFilename = 'gradus21-vault-latest.gradus21';

  // 1. Write the latest snapshot atomar
  const mainFileHandle = await dirHandle.getFileHandle(mainFilename, { create: true });
  const writableMain = await mainFileHandle.createWritable();
  await writableMain.write(vaultJson);
  await writableMain.close();

  // Also maintain gradus21-vault-latest.gradus21 compatibility
  try {
    const legacyHandle = await dirHandle.getFileHandle(legacyLatestFilename, { create: true });
    const writableLegacy = await legacyHandle.createWritable();
    await writableLegacy.write(vaultJson);
    await writableLegacy.close();
  } catch {
    // Ignore legacy mirror error if any
  }

  // 2. Periodic or forced snapshot (at most once every 15 minutes by default)
  const snapshotInterval = options?.snapshotIntervalMs ?? 15 * 60 * 1000;
  const maxSnapshots = options?.maxSnapshots ?? 20;
  const timeSinceLastSnapshot = Date.now() - lastSnapshotTimestamp;
  const shouldCreateSnapshot = options?.forceSnapshot || timeSinceLastSnapshot >= snapshotInterval;

  let savedSnapshotName = mainFilename;

  if (shouldCreateSnapshot) {
    lastSnapshotTimestamp = Date.now();
    const snapshotFilename = `gradus21_vault_backup_${safeUserId}_${dateStr}.gradus21`;
    savedSnapshotName = snapshotFilename;

    const timestampedHandle = await dirHandle.getFileHandle(snapshotFilename, { create: true });
    const writableTimestamped = await timestampedHandle.createWritable();
    await writableTimestamped.write(vaultJson);
    await writableTimestamped.close();

    // 3. Local Retention Rotation: Clean up snapshots exceeding maxSnapshots
    try {
      const snapshotFiles: string[] = [];
      // @ts-expect-error - Chromium directory iterator
      for await (const entry of dirHandle.values()) {
        if (
          entry.kind === 'file' &&
          (entry.name.startsWith('gradus21_vault_backup_') || entry.name.startsWith('gradus21-vault-')) &&
          entry.name.endsWith('.gradus21') &&
          !entry.name.endsWith(`${safeUserId}.gradus21`) &&
          !entry.name.includes('latest')
        ) {
          snapshotFiles.push(entry.name);
        }
      }

      if (snapshotFiles.length > maxSnapshots) {
        // Sort ascending by filename/timestamp (older files first)
        snapshotFiles.sort();
        const toDeleteCount = snapshotFiles.length - maxSnapshots;
        for (let i = 0; i < toDeleteCount; i++) {
          await dirHandle.removeEntry(snapshotFiles[i]);
        }
      }
    } catch (cleanupErr) {
      console.warn('Fehler bei der Bereinigung veralteter Backup-Dateien:', cleanupErr);
    }
  }

  return { filename: savedSnapshotName, timestamp: now.toISOString() };
}

/**
 * Exports the encrypted vault bundle as a file download (for school share or USB).
 * On native Tauri clients, uses native file export / Save dialog for reliable cross-platform saving.
 */
export async function exportVaultToFileDownload(vaultBundle: any): Promise<void> {
  const jsonStr = JSON.stringify(vaultBundle, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `gradus21-tresor-backup-${dateStr}.gradus21`;

  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const savedPath = await invoke<string | null>('native_export_backup_file', {
        filename,
        vaultJson: jsonStr,
        preferredDir: getNativeBackupPath() || undefined,
      });
      if (savedPath) {
        alert(`Tresor-Backup wurde erfolgreich gespeichert unter:\n${savedPath}`);
      }
      return;
    } catch (err) {
      console.warn('Nativer Datei-Export fehlgeschlagen, nutze Browser-Fallback:', err);
    }
  }

  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Reads an encrypted vault file from user upload
 */
export function readVaultFromFile(file: File): Promise<any> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        if (
          !parsed ||
          (!parsed.classEnvelopes && !parsed.encryptedDatasetsEnvelope && !parsed.userId)
        ) {
          throw new Error('Ungültiges Gradus21-Backup-Format.');
        }
        resolve(parsed);
      } catch (err) {
        reject(new Error('Die Datei konnte nicht als gültiges Gradus21-Backup gelesen werden.'));
      }
    };
    reader.onerror = () => reject(new Error('Fehler beim Lesen der Datei.'));
    reader.readAsText(file);
  });
}
