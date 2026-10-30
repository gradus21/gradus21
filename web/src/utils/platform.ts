/**
 * Platform detection and configuration utilities for Gradus21.
 * Supports web browsers, PWA, and native Tauri runtime (iOS, iPadOS, macOS, Linux, Windows, Android).
 */

/**
 * Checks whether the app runs as a standalone native client.
 * Triggers via VITE_STANDALONE_CLIENT environment variable or Tauri runtime presence.
 */
export const isStandaloneClient = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    import.meta.env.VITE_STANDALONE_CLIENT === 'true' ||
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) ||
    Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__) ||
    (typeof window.location !== 'undefined' &&
      (window.location.protocol === 'tauri:' ||
        window.location.hostname.includes('tauri')))
  );
};

/**
 * Checks whether the app is actively running inside a native Tauri desktop/mobile wrapper.
 */
export const isTauri = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ ||
    (typeof window.location !== 'undefined' &&
      (window.location.protocol === 'tauri:' || window.location.hostname.includes('tauri')))
  );
};

/**
 * Detects whether the current device is an Apple iOS/iPadOS touch device
 * (used for notch/safe-area spacing, virtual keyboard scrolling and Apple Pencil gestures).
 */
export const isAppleTouchDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
};

/**
 * Detects whether the current device is specifically an iPad / iPadOS device.
 */
export const isIPad = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
};

/**
 * Detects whether the current device is specifically an iPhone or iPod.
 */
export const isIPhone = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPod/.test(navigator.userAgent);
};

/**
 * Detects whether the app is running on an Apple iOS or iPadOS platform.
 */
export const isIOS = (): boolean => {
  return isAppleTouchDevice();
};

/**
 * Detects whether the app is running on an Android platform.
 */
export const isAndroid = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
};

/**
 * Detects whether the app is running on a mobile device (iOS, iPadOS or Android).
 */
export const isMobileDevice = (): boolean => {
  return isAppleTouchDevice() || isAndroid();
};

/**
 * Checks whether the app is running inside a native Tauri wrapper on a mobile device.
 */
export const isMobileTauri = (): boolean => {
  return isTauri() && isMobileDevice();
};

/**
 * Checks whether the app runs inside a desktop Tauri instance (Linux, macOS, Windows).
 * Returns false on mobile (iOS, iPadOS, Android) or pure web browser.
 */
export const isDesktopTauri = (): boolean => {
  if (!isTauri()) return false;
  if (isAppleTouchDevice()) return false;
  if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) return false;
  return true;
};

/**
 * Helper to identify Linux desktop systems (e.g. for package-manager guidance vs AppImage).
 * Note: Android devices report 'Linux; Android ...' in userAgent and 'Linux aarch64' in platform.
 * Therefore Android must be explicitly excluded to avoid confusing Android with Linux desktop.
 */
export const isLinux = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  if (isAndroid()) return false;
  return /Linux/.test(navigator.userAgent || navigator.platform);
};

/**
 * Helper to identify Windows desktop systems.
 */
export const isWindows = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Win/.test(navigator.userAgent || navigator.platform);
};

/**
 * Helper to identify macOS desktop systems.
 */
export const isMacOS = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Mac/.test(navigator.platform) && !isAppleTouchDevice();
};

export type OperatingSystem = 'macos' | 'ios' | 'ipados' | 'windows' | 'android' | 'linux' | 'unknown';
export type DeviceFormFactor = 'phone' | 'tablet' | 'desktop';

/**
 * Returns the detected operating system in lowercase identifier form.
 */
export const getOperatingSystem = (): OperatingSystem => {
  if (isIPad()) return 'ipados';
  if (isIPhone() || (isIOS() && !isIPad())) return 'ios';
  if (isAndroid()) return 'android';
  if (isMacOS()) return 'macos';
  if (isWindows()) return 'windows';
  if (isLinux()) return 'linux';
  return 'unknown';
};

/**
 * Returns the primary modifier key symbol for shortcuts (e.g. ⌘ for Mac/iOS, Ctrl for Windows/Linux).
 */
export const getModifierKey = (): string => {
  if (isMacOS() || isIOS()) return '⌘';
  return 'Ctrl';
};

/**
 * Returns the Alt/Option modifier key symbol (⌥ for Mac/iOS, Alt for Windows/Linux).
 */
export const getAltKey = (): string => {
  if (isMacOS() || isIOS()) return '⌥';
  return 'Alt';
};

/**
 * Returns whether current device is a tablet (e.g. iPad, Android Tablet).
 */
export const isTabletDevice = (): boolean => {
  if (isIPad()) return true;
  if (typeof window !== 'undefined' && isAndroid()) {
    // Android tablets typically have minimum dimension >= 600px and max >= 960px
    const minDim = Math.min(window.innerWidth || 0, window.innerHeight || 0);
    return minDim >= 600;
  }
  return false;
};

/**
 * Returns whether current device is a smartphone (< 768px touch screen).
 */
export const isSmartphoneDevice = (): boolean => {
  if (isIPhone()) return true;
  if (isTabletDevice()) return false;
  if (isMobileDevice()) return true;
  if (typeof window !== 'undefined' && window.innerWidth < 640) return true;
  return false;
};

export interface StorageLocationInfo {
  isNative: boolean;
  isMobile: boolean;
  platformName: string;
  locationLabel: string;
  path: string;
  details: string;
  canCopyPath: boolean;
}

/**
 * Returns OS- and environment-specific storage path and metadata for local data persistence.
 */
export const getStorageLocationInfo = (): StorageLocationInfo => {
  if (isTauri()) {
    // 1. Mobile Tauri: iOS / iPadOS
    if (isAppleTouchDevice()) {
      const isTablet = isIPad();
      const platformName = isTablet ? 'iPadOS' : 'iOS';
      return {
        isNative: true,
        isMobile: true,
        platformName,
        locationLabel: `Geschützte App-Sandbox (${platformName})`,
        path: `Gradus21 App-Sandbox (${platformName})`,
        details: 'Im isolierten, verschlüsselten Datenspeicher Ihres Apple-Geräts abgelegt.',
        canCopyPath: false,
      };
    }

    // 2. Mobile Tauri: Android
    if (isAndroid()) {
      return {
        isNative: true,
        isMobile: true,
        platformName: 'Android',
        locationLabel: 'Geschützte App-Sandbox (Android)',
        path: 'Gradus21 App-Sandbox (Interner Speicher)',
        details: 'Im isolierten, verschlüsselten Datenspeicher Ihres Android-Geräts abgelegt.',
        canCopyPath: false,
      };
    }

    // 3. Desktop Tauri: Linux
    if (isLinux()) {
      return {
        isNative: true,
        isMobile: false,
        platformName: 'Linux',
        locationLabel: 'Lokales Anwendungsdaten-Verzeichnis (XDG Data)',
        path: '~/.local/share/de.gradus21.app/',
        details: 'Dauerhafter lokaler Speicher im Benutzerverzeichnis Ihres Linux-Systems.',
        canCopyPath: true,
      };
    }

    // 4. Desktop Tauri: macOS
    if (isMacOS()) {
      return {
        isNative: true,
        isMobile: false,
        platformName: 'macOS',
        locationLabel: 'Lokales Anwendungsdaten-Verzeichnis (Application Support)',
        path: '~/Library/Application Support/de.gradus21.app/',
        details: 'Dauerhafter lokaler Speicher im Benutzerverzeichnis Ihres Macs.',
        canCopyPath: true,
      };
    }

    // 5. Desktop Tauri: Windows
    if (isWindows()) {
      return {
        isNative: true,
        isMobile: false,
        platformName: 'Windows',
        locationLabel: 'Lokales Anwendungsdaten-Verzeichnis (LocalAppData)',
        path: '%LOCALAPPDATA%\\de.gradus21.app\\',
        details: 'Dauerhafter lokaler Speicher im Windows-Benutzerprofil.',
        canCopyPath: true,
      };
    }

    // 6. Desktop Tauri: Fallback
    return {
      isNative: true,
      isMobile: false,
      platformName: 'Desktop',
      locationLabel: 'Lokaler App-Datenspeicher',
      path: 'de.gradus21.app (Anwendungsdaten)',
      details: 'Dauerhafter lokaler Speicher im Benutzerprofil Ihres Betriebssystems.',
      canCopyPath: true,
    };
  }

  // Web Browser fallbacks
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'gradus21.de';

  if (isAppleTouchDevice()) {
    const isTablet = isIPad();
    const platformName = isTablet ? 'Safari (iPadOS)' : 'Safari (iOS)';
    return {
      isNative: false,
      isMobile: true,
      platformName,
      locationLabel: 'Browser-Sandbox (IndexedDB)',
      path: `${origin} (IndexedDB & LocalStorage)`,
      details: 'Im isolierten Speicherbereich Ihres mobilen Safari-Browsers abgelegt.',
      canCopyPath: true,
    };
  }

  if (isAndroid()) {
    return {
      isNative: false,
      isMobile: true,
      platformName: 'Mobile Browser (Android)',
      locationLabel: 'Browser-Sandbox (IndexedDB)',
      path: `${origin} (IndexedDB & LocalStorage)`,
      details: 'Im isolierten Speicherbereich Ihres mobilen Webbrowsers abgelegt.',
      canCopyPath: true,
    };
  }

  return {
    isNative: false,
    isMobile: false,
    platformName: 'Web-Browser',
    locationLabel: 'Browser-Sandbox (IndexedDB)',
    path: `${origin} (IndexedDB & LocalStorage)`,
    details: 'Im isolierten, verschlüsselten Speicherbereich Ihres Webbrowsers abgelegt.',
    canCopyPath: true,
  };
};


