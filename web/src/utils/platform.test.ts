import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isStandaloneClient,
  isTauri,
  isAppleTouchDevice,
  isIPad,
  isAndroid,
  isLinux,
  isDesktopTauri,
  isMobileTauri,
  isMobileDevice,
  getStorageLocationInfo,
  getOperatingSystem,
  getModifierKey,
  getAltKey,
  openExternalUrl,
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
    expect(isMobileDevice()).toBe(false);

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
    expect(isMobileDevice()).toBe(true);
  });

  it('correctly distinguishes Android devices from Linux desktop systems', () => {
    // Android device (User Agent contains 'Linux; Android ...' and platform 'Linux aarch64')
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240105.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
      configurable: true,
    });
    Object.defineProperty(navigator, 'platform', {
      value: 'Linux aarch64',
      configurable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 5,
      configurable: true,
    });

    expect(isAndroid()).toBe(true);
    expect(isMobileDevice()).toBe(true);
    // Must NOT be detected as Linux desktop!
    expect(isLinux()).toBe(false);

    // Simulated Tauri on Android
    (window as any).__TAURI__ = {};
    expect(isTauri()).toBe(true);
    expect(isMobileTauri()).toBe(true);
    expect(isDesktopTauri()).toBe(false);

    delete (window as any).__TAURI__;

    // Real Linux Desktop (X11 / Wayland)
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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

    expect(isAndroid()).toBe(false);
    expect(isLinux()).toBe(true);
    expect(isMobileDevice()).toBe(false);

    (window as any).__TAURI__ = {};
    expect(isDesktopTauri()).toBe(true);
    expect(isMobileTauri()).toBe(false);
    delete (window as any).__TAURI__;
  });

  describe('getStorageLocationInfo', () => {
    beforeEach(() => {
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
    });

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

    it('returns native iOS app sandbox info when running in Tauri on iPhone', () => {
      (window as any).__TAURI__ = {};
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15',
        configurable: true,
      });
      Object.defineProperty(navigator, 'platform', {
        value: 'iPhone',
        configurable: true,
      });
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 5,
        configurable: true,
      });

      const info = getStorageLocationInfo();
      expect(info.isNative).toBe(true);
      expect(info.isMobile).toBe(true);
      expect(info.platformName).toBe('iOS');
      expect(info.locationLabel).toContain('iOS');
      expect(info.canCopyPath).toBe(false);

      delete (window as any).__TAURI__;
    });

    it('returns native iPadOS app sandbox info when running in Tauri on iPad', () => {
      (window as any).__TAURI__ = {};
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15',
        configurable: true,
      });
      Object.defineProperty(navigator, 'platform', {
        value: 'iPad',
        configurable: true,
      });
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 5,
        configurable: true,
      });

      const info = getStorageLocationInfo();
      expect(info.isNative).toBe(true);
      expect(info.isMobile).toBe(true);
      expect(info.platformName).toBe('iPadOS');
      expect(info.locationLabel).toContain('iPadOS');
      expect(info.canCopyPath).toBe(false);

      delete (window as any).__TAURI__;
    });

    it('returns mobile Safari info when running in browser on iOS', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15',
        configurable: true,
      });
      Object.defineProperty(navigator, 'platform', {
        value: 'iPhone',
        configurable: true,
      });
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 5,
        configurable: true,
      });

      const info = getStorageLocationInfo();
      expect(info.isNative).toBe(false);
      expect(info.isMobile).toBe(true);
      expect(info.platformName).toBe('Safari (iOS)');
    });
  });

  describe('OS and device ergonomics helpers', () => {
    it('returns correct modifier keys and operating systems for Mac / Apple devices', () => {
      Object.defineProperty(navigator, 'platform', {
        value: 'MacIntel',
        configurable: true,
      });
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        configurable: true,
      });
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 0,
        configurable: true,
      });

      expect(getOperatingSystem()).toBe('macos');
      expect(getModifierKey()).toBe('⌘');
      expect(getAltKey()).toBe('⌥');
    });

    it('returns Ctrl and Alt on Windows systems', () => {
      Object.defineProperty(navigator, 'platform', {
        value: 'Win32',
        configurable: true,
      });
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        configurable: true,
      });
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 0,
        configurable: true,
      });

      expect(getOperatingSystem()).toBe('windows');
      expect(getModifierKey()).toBe('Ctrl');
      expect(getAltKey()).toBe('Alt');
    });
  });

  describe('openExternalUrl', () => {
    it('opens url using window.open in web browser environment', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      await openExternalUrl('https://gradus21.de/downloads/avv.pdf');
      expect(openSpy).toHaveBeenCalledWith('https://gradus21.de/downloads/avv.pdf', '_blank', 'noopener,noreferrer');
      openSpy.mockRestore();
    });
  });
});
