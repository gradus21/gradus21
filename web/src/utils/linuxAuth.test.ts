import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLinuxAuthMethod,
  setLinuxAuthMethod,
  enableLinuxKeyringUnlock,
  unlockWithLinuxKeyring,
  disableLinuxKeyringUnlock,
  hasLinuxKeyringEnrollment,
  getLinuxKeyringMeta,
  enableLocalPasskeyEnrollment,
  hasLocalPasskeyEnrollment,
  disableLocalPasskeyEnrollment,
  isLinuxDesktopTauri,
} from './linuxAuth';

describe('linuxAuth utilities', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('defaults to password when no keyring or passkey is configured and cloudSync is false', () => {
    expect(getLinuxAuthMethod(false)).toBe('password');
  });

  it('correctly evaluates isLinuxDesktopTauri, strictly rejecting Android and web', () => {
    // 1. In browser without Tauri
    expect(isLinuxDesktopTauri()).toBe(false);

    // 2. In Tauri on Android
    (window as any).__TAURI__ = {};
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240105.004) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
      configurable: true,
    });
    Object.defineProperty(navigator, 'platform', {
      value: 'Linux aarch64',
      configurable: true,
    });
    expect(isLinuxDesktopTauri()).toBe(false);

    // 3. In Tauri on Linux Desktop
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    });
    Object.defineProperty(navigator, 'platform', {
      value: 'Linux x86_64',
      configurable: true,
    });
    expect(isLinuxDesktopTauri()).toBe(true);

    delete (window as any).__TAURI__;
  });

  it('defaults to cloud_passkey when cloudSync is true and no local keyring is configured', () => {
    expect(getLinuxAuthMethod(true)).toBe('cloud_passkey');
  });

  it('allows manually setting and reading unlock methods', () => {
    setLinuxAuthMethod('local_passkey');
    expect(getLinuxAuthMethod(false)).toBe('local_passkey');

    setLinuxAuthMethod('keyring');
    expect(getLinuxAuthMethod(false)).toBe('keyring');

    setLinuxAuthMethod('password');
    expect(getLinuxAuthMethod(false)).toBe('password');
  });

  it('falls back to password when cloud_passkey is selected but cloudSync is turned off', () => {
    setLinuxAuthMethod('cloud_passkey');
    expect(getLinuxAuthMethod(false)).toBe('password');
  });

  it('manages Linux Keyring lifecycle correctly (enable, check, unlock, disable)', async () => {
    const userId = 'usr_linux_123';
    const email = 'lehrer@schule.de';
    const fakeDek = 'b64_random_dek_bytes_987654321';

    expect(hasLinuxKeyringEnrollment(userId)).toBe(false);

    // Enable
    await enableLinuxKeyringUnlock(userId, email, fakeDek);
    expect(hasLinuxKeyringEnrollment(userId)).toBe(true);
    expect(hasLinuxKeyringEnrollment(email)).toBe(true);
    expect(hasLinuxKeyringEnrollment()).toBe(true);
    expect(getLinuxAuthMethod(false)).toBe('keyring');

    const meta = getLinuxKeyringMeta(userId);
    expect(meta?.email).toBe(email);
    expect(meta?.userId).toBe(userId);

    // Unlock
    const unlocked = await unlockWithLinuxKeyring(userId);
    expect(unlocked.dekB64).toBe(fakeDek);
    expect(unlocked.email).toBe(email);
    expect(unlocked.userId).toBe(userId);

    // Disable
    await disableLinuxKeyringUnlock(userId);
    expect(hasLinuxKeyringEnrollment(userId)).toBe(false);
    expect(getLinuxAuthMethod(false)).toBe('password');
  });

  it('manages Local Passkey lifecycle correctly', () => {
    const userId = 'usr_passkey_456';
    const email = 'yubikey@schule.de';

    expect(hasLocalPasskeyEnrollment(userId)).toBe(false);

    enableLocalPasskeyEnrollment(userId, email, 'cred_abc');
    expect(hasLocalPasskeyEnrollment(userId)).toBe(true);
    expect(getLinuxAuthMethod(false)).toBe('local_passkey');

    disableLocalPasskeyEnrollment(userId);
    expect(hasLocalPasskeyEnrollment(userId)).toBe(false);
    expect(getLinuxAuthMethod(false)).toBe('password');
  });
});
