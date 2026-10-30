import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkNativeBiometricAvailability,
  hasNativeBiometricEnrollment,
  getNativeBiometricMeta,
  enableNativeBiometricLock,
  unlockWithNativeBiometric,
  disableNativeBiometricLock,
} from './nativeBiometric';

describe('nativeBiometric utilities', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    delete (window as any).__TAURI_INTERNALS__;
  });

  describe('checkNativeBiometricAvailability', () => {
    it('returns available: false outside Tauri', async () => {
      const res = await checkNativeBiometricAvailability();
      expect(res.available).toBe(false);
      expect(res.biometryType).toBe('none');
    });

    it('returns available: true and biometryType when inside Tauri', async () => {
      (window as any).__TAURI_INTERNALS__ = {};

      vi.doMock('@tauri-apps/plugin-biometric', () => ({
        checkStatus: vi.fn().mockResolvedValue({
          isAvailable: true,
          biometryType: 1, // TouchID / Fingerprint
        }),
        BiometryType: { TouchID: 1, FaceID: 2, Iris: 3, None: 0 },
      }));

      const res = await checkNativeBiometricAvailability();
      expect(res.available).toBe(true);
      expect(res.biometryType).toBe('fingerprint');
    });
  });

  describe('enrollment, locking and unlocking flow', () => {
    const mockUid = 'user_uuid_123';
    const mockEmail = 'lehrer@schule.de';
    const mockDek = 'dek_base64_sample_secret';
    const mockCipher = 'cipher_data_hardware;iv_sample';

    it('manages enrollment status correctly', () => {
      expect(hasNativeBiometricEnrollment(mockUid)).toBe(false);
      expect(getNativeBiometricMeta(mockUid)).toBeNull();
    });

    it('enables native biometric lock and encrypts DEK via biometricCipher', async () => {
      (window as any).__TAURI_INTERNALS__ = {};

      const mockBiometricCipher = vi.fn().mockResolvedValue({
        data: mockCipher,
      });

      vi.doMock('@tauri-apps/plugin-biometric', () => ({
        biometricCipher: mockBiometricCipher,
        authenticate: vi.fn(),
      }));

      const success = await enableNativeBiometricLock(mockUid, mockEmail, mockDek);
      expect(success).toBe(true);
      expect(mockBiometricCipher).toHaveBeenCalledWith(
        expect.stringContaining('Fingerabdruck'),
        expect.objectContaining({
          dataToEncrypt: mockDek,
          allowDeviceCredential: false,
        })
      );

      expect(hasNativeBiometricEnrollment(mockUid)).toBe(true);
      expect(hasNativeBiometricEnrollment(mockEmail)).toBe(true);
      expect(hasNativeBiometricEnrollment()).toBe(true);

      const meta = getNativeBiometricMeta(mockUid);
      expect(meta?.userId).toBe(mockUid);
      expect(meta?.email).toBe(mockEmail);
    });

    it('unlocks and decrypts DEK with biometricCipher', async () => {
      (window as any).__TAURI_INTERNALS__ = {};

      // Seed storage
      localStorage.setItem(`gradus21_native_bio_dek_${mockUid}`, mockCipher);
      localStorage.setItem(
        `gradus21_native_bio_meta_${mockUid}`,
        JSON.stringify({ userId: mockUid, email: mockEmail, updatedAt: Date.now() })
      );
      localStorage.setItem('gradus21_native_bio_last_user', mockUid);

      const mockBiometricCipher = vi.fn().mockResolvedValue({
        data: mockDek,
      });

      vi.doMock('@tauri-apps/plugin-biometric', () => ({
        biometricCipher: mockBiometricCipher,
        authenticate: vi.fn(),
      }));

      const res = await unlockWithNativeBiometric(mockEmail);
      expect(res.dekB64).toBe(mockDek);
      expect(res.email).toBe(mockEmail);
      expect(res.userId).toBe(mockUid);

      expect(mockBiometricCipher).toHaveBeenCalledWith(
        expect.stringContaining('entsperren'),
        expect.objectContaining({
          dataToDecrypt: mockCipher,
          allowDeviceCredential: false,
        })
      );
    });

    it('cleans up and raises security error if key was invalidated in Android KeyStore', async () => {
      (window as any).__TAURI_INTERNALS__ = {};

      localStorage.setItem(`gradus21_native_bio_dek_${mockUid}`, mockCipher);
      localStorage.setItem(
        `gradus21_native_bio_meta_${mockUid}`,
        JSON.stringify({ userId: mockUid, email: mockEmail, updatedAt: Date.now() })
      );

      vi.doMock('@tauri-apps/plugin-biometric', () => ({
        biometricCipher: vi.fn().mockRejectedValue(new Error('KeyPermanentlyInvalidatedException')),
        authenticate: vi.fn(),
      }));

      await expect(unlockWithNativeBiometric(mockUid)).rejects.toThrow(
        /biometrischen Daten auf diesem Gerät wurden geändert/
      );

      // Should be purged from localStorage
      expect(hasNativeBiometricEnrollment(mockUid)).toBe(false);
    });

    it('enables and unlocks via iOS LocalAuthentication authenticate() fallback', async () => {
      (window as any).__TAURI_INTERNALS__ = {};

      const mockAuthenticate = vi.fn().mockResolvedValue(undefined);
      const mockBiometricCipher = vi.fn().mockRejectedValue(new Error('Plugin method biometricCipher not implemented on iOS'));
      const origUserAgent = navigator.userAgent;
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15',
        configurable: true,
      });

      try {
        vi.doMock('@tauri-apps/plugin-biometric', () => ({
          authenticate: mockAuthenticate,
          biometricCipher: mockBiometricCipher,
        }));

        const success = await enableNativeBiometricLock(mockUid, mockEmail, mockDek);
        expect(success).toBe(true);
        expect(mockBiometricCipher).not.toHaveBeenCalled();
        expect(mockAuthenticate).toHaveBeenCalledWith(
          expect.stringContaining('Biometrie'),
          expect.objectContaining({ allowDeviceCredential: false })
        );

        const unlocked = await unlockWithNativeBiometric(mockUid);
        expect(mockBiometricCipher).not.toHaveBeenCalled();
        expect(unlocked.dekB64).toBe(mockDek);
        expect(unlocked.email).toBe(mockEmail);
        expect(unlocked.userId).toBe(mockUid);
      } finally {
        Object.defineProperty(window.navigator, 'userAgent', {
          value: origUserAgent,
          configurable: true,
        });
      }
    });

    it('disables biometric lock cleanly', () => {
      localStorage.setItem(`gradus21_native_bio_dek_${mockUid}`, mockCipher);
      localStorage.setItem(
        `gradus21_native_bio_meta_${mockUid}`,
        JSON.stringify({ userId: mockUid, email: mockEmail, updatedAt: Date.now() })
      );
      localStorage.setItem('gradus21_native_bio_last_user', mockUid);

      disableNativeBiometricLock(mockUid);
      expect(hasNativeBiometricEnrollment(mockUid)).toBe(false);
      expect(localStorage.getItem('gradus21_native_bio_last_user')).toBeNull();
    });
  });
});
