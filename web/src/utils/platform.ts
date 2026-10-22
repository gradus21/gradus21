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
    Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__)
  );
};

/**
 * Checks whether the app is actively running inside a native Tauri desktop/mobile wrapper.
 */
export const isTauri = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
    (window as unknown as { __TAURI__?: unknown }).__TAURI__
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
