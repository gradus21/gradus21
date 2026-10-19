/**
 * Local Backup & File System Helpers for Gradus21
 * Supports:
 * 1. Persistent Browser Storage (navigator.storage.persist)
 * 2. Export / Import encrypted .gradus21 vault file (school network share / USB)
 * 3. Automated Local Directory Backup (File System Access API + IndexedDB)
 */

const BACKUP_IDB_NAME = 'gradus21_local_backup_v1';
const BACKUP_STORE_NAME = 'directory_handles';
const HANDLE_KEY = 'connected_backup_directory';

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
 * Checks if File System Access API is supported
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Prompts the user to pick a backup directory (e.g. school share or USB)
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

/**
 * Writes the encrypted vault bundle into the connected directory handle
 */
export async function writeVaultToDirectory(
  dirHandle: FileSystemDirectoryHandle,
  vaultJson: string
): Promise<{ filename: string; timestamp: string }> {
  const hasPerm = await verifyDirectoryPermission(dirHandle, true);
  if (!hasPerm) {
    throw new Error('Keine Schreibberechtigung für den gewählten Backup-Ordner.');
  }

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `gradus21-vault-${dateStr}.gradus21`;
  const latestFilename = 'gradus21-vault-latest.gradus21';

  // 1. Write the latest snapshot
  const latestFileHandle = await dirHandle.getFileHandle(latestFilename, { create: true });
  // @ts-expect-error - createWritable is standard in Chromium
  const writableLatest = await latestFileHandle.createWritable();
  await writableLatest.write(vaultJson);
  await writableLatest.close();

  // 2. Also write timestamped snapshot
  const timestampedHandle = await dirHandle.getFileHandle(filename, { create: true });
  // @ts-expect-error - createWritable is standard in Chromium
  const writableTimestamped = await timestampedHandle.createWritable();
  await writableTimestamped.write(vaultJson);
  await writableTimestamped.close();

  return { filename, timestamp: now.toISOString() };
}

/**
 * Exports the encrypted vault bundle as a file download (for school share or USB)
 */
export function exportVaultToFileDownload(vaultBundle: any): void {
  const jsonStr = JSON.stringify(vaultBundle, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gradus21-tresor-backup-${dateStr}.gradus21`;
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
