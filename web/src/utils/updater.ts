import { isDesktopTauri } from './platform';

export interface UpdateInfo {
  available: boolean;
  version?: string;
  body?: string;
}

/**
 * Checks whether an in-app update is available for desktop clients.
 * Safely resolves with `{ available: false }` if running on Web, Mobile or offline.
 */
export async function checkForAppUpdate(): Promise<UpdateInfo> {
  if (!isDesktopTauri()) {
    return { available: false };
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (update?.available) {
      return {
        available: true,
        version: update.version,
        body: update.body ?? undefined,
      };
    }
  } catch (err) {
    console.warn('[Updater] Update check failed or offline:', err);
  }

  return { available: false };
}

/**
 * Downloads and installs the pending update, then relaunches the desktop application.
 */
export async function installAppUpdate(): Promise<boolean> {
  if (!isDesktopTauri()) return false;

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (update?.available) {
      await update.downloadAndInstall();
      return true;
    }
  } catch (err) {
    console.error('[Updater] Failed to download or install update:', err);
    throw err;
  }

  return false;
}
