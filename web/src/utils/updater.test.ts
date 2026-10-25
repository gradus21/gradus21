import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkForAppUpdate, installAppUpdate } from './updater';

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
    // In node/vitest, __TAURI__ is undefined by default
    const res = await checkForAppUpdate();
    expect(res).toEqual({ available: false });
  });

  it('returns false on installAppUpdate when outside Tauri desktop', async () => {
    const res = await installAppUpdate();
    expect(res).toBe(false);
  });
});
