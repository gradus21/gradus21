import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isStandaloneClient,
  isTauri,
  isAppleTouchDevice,
  isIPad,
  getStorageLocationInfo,
} from './platform';

describe('platform utilities', () => {
  const originalWindow = global.window;
  const originalNavigator = global.navigator;

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    global.window = originalWindow;
    global.navigator = originalNavigator;
  });

  it('detects standalone client mode via VITE_STANDALONE_CLIENT environment variable', () => {
    vi.stubEnv('VITE_STANDALONE_CLIENT', 'true');
    expect(isStandaloneClient()).toBe(true);

    vi.stubEnv('VITE_STANDALONE_CLIENT', 'false');
    expect(isStandaloneClient()).toBe(false);
  });

  it('detects tauri runtime via window.__TAURI_INTERNALS__ or window.__TAURI__', () => {
    vi.stubEnv('VITE_STANDALONE_CLIENT', 'false');
    
    // Default: false
    expect(isTauri()).toBe(false);
    expect(isStandaloneClient()).toBe(false);

    // Simulated Tauri runtime
    (window as any).__TAURI_INTERNALS__ = {};
    expect(isTauri()).toBe(true);
    expect(isStandaloneClient()).toBe(true);

    delete (window as any).__TAURI_INTERNALS__;
    (window as any).__TAURI__ = {};
    expect(isTauri()).toBe(true);
    expect(isStandaloneClient()).toBe(true);
    delete (window as any).__TAURI__;
  });

  it('detects Apple touch devices (iPad / iPhone)', () => {
    // Standard desktop Linux/Chrome
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Linux x86_64)',
      configurable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 0,
      configurable: true,
    });
    expect(isAppleTouchDevice()).toBe(false);
    expect(isIPad()).toBe(false);

    // iPadOS 13+ desktop-class Safari user agent spoof
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6)',
      configurable: true,
    });
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 5,
      configurable: true,
    });
    expect(isAppleTouchDevice()).toBe(true);
    expect(isIPad()).toBe(true);
  });

  describe('getStorageLocationInfo', () => {
    it('returns browser sandbox details when not running in Tauri', () => {
      const info = getStorageLocationInfo();
      expect(info.isNative).toBe(false);
      expect(info.platformName).toBe('Web-Browser');
      expect(info.path).toContain('IndexedDB');
    });

    it('returns Linux XDG path when running in Tauri on Linux', () => {
      (window as any).__TAURI__ = {};
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (X11; Linux x86_64)',
        configurable: true,
      });
      Object.defineProperty(navigator, 'platform', {
        value: 'Linux x86_64',
        configurable: true,
      });
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 0,
        configurable: true,
      });

      const info = getStorageLocationInfo();
      expect(info.isNative).toBe(true);
      expect(info.platformName).toBe('Linux');
      expect(info.path).toBe('~/.local/share/de.gradus21.app/');

      delete (window as any).__TAURI__;
    });

    it('returns macOS Application Support path when running in Tauri on Mac', () => {
      (window as any).__TAURI__ = {};
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        configurable: true,
      });
      Object.defineProperty(navigator, 'platform', {
        value: 'MacIntel',
        configurable: true,
      });
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 0,
        configurable: true,
      });

      const info = getStorageLocationInfo();
      expect(info.isNative).toBe(true);
      expect(info.platformName).toBe('macOS');
      expect(info.path).toBe('~/Library/Application Support/de.gradus21.app/');

      delete (window as any).__TAURI__;
    });

    it('returns Windows LocalAppData path when running in Tauri on Windows', () => {
      (window as any).__TAURI__ = {};
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        configurable: true,
      });
      Object.defineProperty(navigator, 'platform', {
        value: 'Win32',
        configurable: true,
      });
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 0,
        configurable: true,
      });

      const info = getStorageLocationInfo();
      expect(info.isNative).toBe(true);
      expect(info.platformName).toBe('Windows');
      expect(info.path).toBe('%LOCALAPPDATA%\\de.gradus21.app\\');

      delete (window as any).__TAURI__;
    });
  });
});
