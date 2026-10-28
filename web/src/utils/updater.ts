import { isDesktopTauri } from './platform';
import { APP_VERSION } from '../version';

export interface UpdateInfo {
  available: boolean;
  version?: string;
  currentVersion?: string;
  body?: string;
  date?: string;
  error?: string;
}

export type DownloadProgressCallback = (percent: number, downloaded: number, total: number) => void;

/**
 * Checks whether an in-app update is available for desktop clients.
 * Safely resolves with `{ available: false }` if running on Web, Mobile or offline.
 */
export async function checkForAppUpdate(): Promise<UpdateInfo> {
  if (!isDesktopTauri()) {
    return { available: false, currentVersion: APP_VERSION };
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (update?.available) {
      return {
        available: true,
        version: update.version,
        currentVersion: update.currentVersion || APP_VERSION,
        body: update.body ?? undefined,
        date: update.date ?? undefined,
      };
    }
    return {
      available: false,
      currentVersion: update?.currentVersion || APP_VERSION,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[Updater] Update check failed or offline:', err);
    return {
      available: false,
      currentVersion: APP_VERSION,
      error: errMsg,
    };
  }
}

/**
 * Downloads and installs the pending update, then relaunches or prompts for restart.
 */
export async function installAppUpdate(onProgress?: DownloadProgressCallback): Promise<boolean> {
  if (!isDesktopTauri()) return false;

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (update?.available) {
      let totalLength = 0;
      let downloadedLength = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          totalLength = event.data.contentLength || 0;
          if (onProgress) onProgress(0, 0, totalLength);
        } else if (event.event === 'Progress') {
          downloadedLength += event.data.chunkLength;
          const pct = totalLength > 0 ? Math.min(100, Math.round((downloadedLength / totalLength) * 100)) : 0;
          if (onProgress) onProgress(pct, downloadedLength, totalLength);
        } else if (event.event === 'Finished') {
          if (onProgress) onProgress(100, downloadedLength, totalLength);
        }
      });

      // After downloadAndInstall, Windows automatically restarts or launches the updater.
      // On macOS and Linux, the update is staged and will be applied on the next start.
      return true;
    }
  } catch (err) {
    console.error('[Updater] Failed to download or install update:', err);
    throw err;
  }

  return false;
}
