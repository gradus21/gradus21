import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isDesktopAuthRequested,
  getDesktopAuthParams,
  encryptWithTransitKey,
  decryptWithTransitKey,
  sendDesktopAuthCallback,
} from './desktopAuth';
import { ActiveVaultSession } from '../components/vault/vaultTypes';

describe('desktopAuth utilities', () => {
  const dummySession: ActiveVaultSession = {
    token: 'jwt_mock_token_12345',
    userId: 'user_mock_uuid',
    email: 'test@schule.de',
    kdfSaltB64: 'c2FsdF9zYWx0',
    dekB64: 'ZGVrX2Rla19kZWs=',
    encryptedDek: 'enc_dek',
    recoveryEncryptedDek: 'rec_enc_dek',
    totpEnabled: false,
    serverSyncedCount: 0,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('isDesktopAuthRequested & getDesktopAuthParams', () => {
    it('returns false/null when desktop_auth param is missing', () => {
      expect(isDesktopAuthRequested('?other=123')).toBe(false);
      expect(getDesktopAuthParams('?other=123')).toBeNull();
    });

    it('returns false/null when port/state and session_token are missing', () => {
      expect(isDesktopAuthRequested('?desktop_auth=1&port=49152')).toBe(false);
      expect(getDesktopAuthParams('?desktop_auth=1&port=49152')).toBeNull();
    });

    it('extracts valid desktop auth params with loopback', () => {
      const search = '?desktop_auth=1&port=49152&state=state_secret_123&email=lehrkraft%40schule.de';
      const hash = '#transit_key=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

      expect(isDesktopAuthRequested(search)).toBe(true);
      const params = getDesktopAuthParams(search, hash);
      expect(params).not.toBeNull();
      expect(params?.port).toBe(49152);
      expect(params?.state).toBe('state_secret_123');
      expect(params?.email).toBe('lehrkraft@schule.de');
      expect(params?.transitKey).toBe('deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    });

    it('extracts valid desktop auth params with session_token (Server Relay)', () => {
      const search = '?desktop_auth=1&session_token=token_abc123&email=lehrkraft%40schule.de';
      const hash = '#transit_key=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

      expect(isDesktopAuthRequested(search)).toBe(true);
      const params = getDesktopAuthParams(search, hash);
      expect(params).not.toBeNull();
      expect(params?.sessionToken).toBe('token_abc123');
      expect(params?.email).toBe('lehrkraft@schule.de');
      expect(params?.transitKey).toBe('deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    });

    it('rejects invalid port numbers when no session_token is provided', () => {
      expect(getDesktopAuthParams('?desktop_auth=1&port=999999&state=secret')).toBeNull();
      expect(getDesktopAuthParams('?desktop_auth=1&port=-5&state=secret')).toBeNull();
      expect(getDesktopAuthParams('?desktop_auth=1&port=abc&state=secret')).toBeNull();
    });
  });

  describe('encryptWithTransitKey & decryptWithTransitKey', () => {
    it('encrypts and decrypts payload correctly (round-trip)', async () => {
      const hexKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const encrypted = await encryptWithTransitKey(hexKey, dummySession);

      expect(encrypted).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);

      const decrypted = await decryptWithTransitKey(hexKey, encrypted);
      expect(decrypted.email).toBe(dummySession.email);
      expect(decrypted.token).toBe(dummySession.token);
      expect(decrypted.dekB64).toBe(dummySession.dekB64);
    });

    it('rejects key with invalid length', async () => {
      await expect(encryptWithTransitKey('shortKey', { hello: 'world' })).rejects.toThrow(
        /Ungültige Schlüssellänge/
      );
    });
  });

  describe('sendDesktopAuthCallback', () => {
    it('sends POST request to Server Relay when sessionToken is present', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      global.fetch = fetchMock;

      const params = {
        sessionToken: 'token_xyz_relay',
        transitKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      };

      const result = await sendDesktopAuthCallback(params, dummySession);
      expect(result.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/desktop-relay/complete'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.session_token).toBe('token_xyz_relay');
      expect(body.encrypted_payload).toMatch(/^v1:/);
    });

    it('sends POST request to 127.0.0.1 with session payload when port is present', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });
      global.fetch = fetchMock;

      const params = {
        port: 48999,
        state: 'auth_state_xyz',
      };

      const result = await sendDesktopAuthCallback(params, dummySession);
      expect(result.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:48999/callback', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.state).toBe('auth_state_xyz');
      expect(body.session.email).toBe('test@schule.de');
    });

    it('handles network error cleanly without crashing', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const params = {
        port: 48999,
        state: 'auth_state_xyz',
      };

      const result = await sendDesktopAuthCallback(params, dummySession);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Connection refused');
    });
  });

  describe('startDesktopBrowserAuth', () => {
    it('throws error when called outside Tauri environment', async () => {
      // isTauri returns false in plain test environment
      const { startDesktopBrowserAuth } = await import('./desktopAuth');
      await expect(startDesktopBrowserAuth('https://gradus21.de')).rejects.toThrow(
        /darf nur in der nativen Tauri/
      );
    });

    it('resolves via server relay polling even if native loopback command rejects (mobile sandbox resilience)', async () => {
      // Mock window.__TAURI_INTERNALS__ to simulate Tauri app
      (window as any).__TAURI_INTERNALS__ = {};

      const hexTransitKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const encPayload = await encryptWithTransitKey(hexTransitKey, dummySession);

      // Mock @tauri-apps/api/core invoke to simulate socket failure on mobile
      vi.doMock('@tauri-apps/api/core', () => ({
        invoke: vi.fn().mockImplementation((cmd: string) => {
          if (cmd === 'start_desktop_browser_auth') {
            return Promise.reject(new Error('Loopback socket bind prohibited on mobile'));
          }
          return Promise.resolve();
        }),
      }));

      // Mock fetch: init returns session_token, poll returns ready
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/auth/desktop-relay/init')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ session_token: 'relay_test_session_123' }),
          });
        }
        if (url.includes('/api/auth/desktop-relay/poll')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'ready', encrypted_payload: encPayload }),
          });
        }
        return Promise.reject(new Error('Unhandled url'));
      });
      global.fetch = fetchMock;

      // Mock window.crypto.getRandomValues for deterministic transitKey
      const originalGetRandomValues = window.crypto.getRandomValues.bind(window.crypto);
      vi.spyOn(window.crypto, 'getRandomValues').mockImplementation((arr: any) => {
        if (arr.length === 32) {
          const expectedBytes = new Uint8Array([
            1, 35, 69, 103, 137, 171, 205, 239, 1, 35, 69, 103, 137, 171, 205, 239,
            1, 35, 69, 103, 137, 171, 205, 239, 1, 35, 69, 103, 137, 171, 205, 239,
          ]);
          arr.set(expectedBytes);
          return arr;
        }
        return originalGetRandomValues(arr);
      });

      const { startDesktopBrowserAuth } = await import('./desktopAuth');
      const session = await startDesktopBrowserAuth('https://gradus21.de', 'test@schule.de');

      expect(session).toBeDefined();
      expect(session.email).toBe('test@schule.de');
      expect(session.token).toBe('jwt_mock_token_12345');

      delete (window as any).__TAURI_INTERNALS__;
    });
  });
});
