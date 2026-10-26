import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isDesktopAuthRequested,
  getDesktopAuthParams,
  encryptWithTransitKey,
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

    it('returns false/null when port or state is missing', () => {
      expect(isDesktopAuthRequested('?desktop_auth=1&port=49152')).toBe(false);
      expect(getDesktopAuthParams('?desktop_auth=1&port=49152')).toBeNull();
    });

    it('extracts valid desktop auth params correctly', () => {
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

    it('rejects invalid port numbers', () => {
      expect(getDesktopAuthParams('?desktop_auth=1&port=999999&state=secret')).toBeNull();
      expect(getDesktopAuthParams('?desktop_auth=1&port=-5&state=secret')).toBeNull();
      expect(getDesktopAuthParams('?desktop_auth=1&port=abc&state=secret')).toBeNull();
    });
  });

  describe('encryptWithTransitKey', () => {
    it('encrypts payload into v1:nonce:ciphertext format with a 32-byte hex key', async () => {
      const hexKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const encrypted = await encryptWithTransitKey(hexKey, { hello: 'world' });

      expect(encrypted).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    });

    it('rejects key with invalid length', async () => {
      await expect(encryptWithTransitKey('shortKey', { hello: 'world' })).rejects.toThrow(
        /Ungültige Schlüssellänge/
      );
    });
  });

  describe('sendDesktopAuthCallback', () => {
    it('sends POST request to 127.0.0.1 with session payload', async () => {
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
});
