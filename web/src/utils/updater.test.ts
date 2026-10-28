import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkForAppUpdate, installAppUpdate } from './updater';
import { APP_VERSION } from '../version';

describe('Tauri Desktop Updater Utility', () => {
  const originalWindow = global.window;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    global.window = originalWindow;
    vi.restoreAllMocks();
  });

  it('returns available: false when running outside Tauri desktop (e.g. web)', async () => {
    const res = await checkForAppUpdate();
    expect(res.available).toBe(false);
    expect(res.currentVersion).toBe(APP_VERSION);
  });

  it('returns false on installAppUpdate when outside Tauri desktop', async () => {
    const res = await installAppUpdate();
    expect(res).toBe(false);
  });

  it('handles simulated Tauri desktop environment with update available', async () => {
    // Mock Tauri internals
    (global as unknown as { window: unknown }).window = {
      __TAURI_INTERNALS__: {},
      location: { protocol: 'tauri:', hostname: 'tauri.localhost' },
    };

    const mockDownloadAndInstall = vi.fn(async (cb?: (ev: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void) => {
      if (cb) {
        cb({ event: 'Started', data: { contentLength: 1000 } });
        cb({ event: 'Progress', data: { chunkLength: 500 } });
        cb({ event: 'Finished' });
      }
    });

    vi.doMock('@tauri-apps/plugin-updater', () => ({
      check: vi.fn().mockResolvedValue({
        available: true,
        version: '1.3.0',
        currentVersion: '1.2.9',
        body: 'Bug fixes',
        downloadAndInstall: mockDownloadAndInstall,
      }),
    }));

    const { checkForAppUpdate: mockedCheck, installAppUpdate: mockedInstall } = await import('./updater');

    const checkRes = await mockedCheck();
    expect(checkRes.available).toBe(true);
    expect(checkRes.version).toBe('1.3.0');

    let progressReported = 0;
    const installOk = await mockedInstall((pct) => {
      progressReported = pct;
    });

    expect(installOk).toBe(true);
    expect(mockDownloadAndInstall).toHaveBeenCalled();
    expect(progressReported).toBe(100);
  });
});
