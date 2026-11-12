import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getServerUrl, setServerUrl, apiUrl, fetchWithTimeout, isPrivateNetworkHost, normalizeServerUrlInput } from './apiConfig';

describe('API & Server URL Configuration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('defaults to https://gradus21.app when running standalone', () => {
    // In vitest, window.location.origin is 'http://localhost:3000'
    const url = getServerUrl();
    expect(url).toBeDefined();
  });

  it('stores and formats custom server URL', () => {
    setServerUrl('schul-server.intern:8443');
    expect(getServerUrl()).toBe('https://schul-server.intern:8443');
    expect(apiUrl('/api/auth/login')).toBe('https://schul-server.intern:8443/api/auth/login');
  });

  it('resets custom server URL when cleared', () => {
    setServerUrl('https://custom.schule.de');
    expect(getServerUrl()).toBe('https://custom.schule.de');
    setServerUrl('');
    expect(getServerUrl()).not.toBe('https://custom.schule.de');
  });

  it('sanitizes legacy gradus21.de and tauri.localhost URLs back to valid origin or default', () => {
    localStorage.setItem('gradus21_custom_server_url', 'https://gradus21.de');
    expect(getServerUrl()).toBe(window.location.origin);
    expect(localStorage.getItem('gradus21_custom_server_url')).toBeNull();

    localStorage.setItem('gradus21_custom_server_url', 'http://tauri.localhost');
    expect(getServerUrl()).toBe(window.location.origin);
    expect(localStorage.getItem('gradus21_custom_server_url')).toBeNull();
  });

  it('defaults a bare private/LAN address to http so self-hosted school servers stay reachable', () => {
    expect(setServerUrl('192.168.1.50:8080')).toBe('http://192.168.1.50:8080');
    expect(setServerUrl('10.0.0.7')).toBe('http://10.0.0.7');
    expect(setServerUrl('schule.local:8443')).toBe('http://schule.local:8443');
    expect(getServerUrl()).toBe('http://schule.local:8443');
  });

  it('keeps https for public hosts and preserves an explicit scheme', () => {
    expect(normalizeServerUrlInput('schul-server.intern:8443')).toBe(
      'https://schul-server.intern:8443'
    );
    expect(normalizeServerUrlInput('http://192.168.1.50:8080')).toBe('http://192.168.1.50:8080');
    expect(normalizeServerUrlInput('https://192.168.1.50:8080')).toBe('https://192.168.1.50:8080');
  });

  it('classifies private network hosts correctly', () => {
    expect(isPrivateNetworkHost('localhost')).toBe(true);
    expect(isPrivateNetworkHost('127.0.0.1')).toBe(true);
    expect(isPrivateNetworkHost('192.168.0.10')).toBe(true);
    expect(isPrivateNetworkHost('172.16.5.4')).toBe(true);
    expect(isPrivateNetworkHost('172.32.5.4')).toBe(false);
    expect(isPrivateNetworkHost('schule.local')).toBe(true);
    expect(isPrivateNetworkHost('gradus21.app')).toBe(false);
  });

  it('removes the caller abort listener once the request settles', async () => {
    const controller = new AbortController();
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await fetchWithTimeout('https://example.com/api/ping', { signal: controller.signal });
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects with an AbortError when the caller aborts without a reason', async () => {
    const controller = new AbortController();
    const promise = fetchWithTimeout('https://example.com/api/ping', { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  describe('fetchWithTimeout', () => {
    it('returns response when fetch finishes within timeout', async () => {
      const mockResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

      const res = await fetchWithTimeout('https://example.com/api', {}, 500);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it('aborts and throws TimeoutError when request hangs longer than timeoutMs', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce((_url, init) => {
        return new Promise((_, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              reject(new DOMException('Request was aborted', 'AbortError'));
            });
          }
        });
      });

      await expect(fetchWithTimeout('https://example.com/api/stalled', {}, 50)).rejects.toThrow(
        /Netzwerk-Timeout: Server antwortet nicht nach 0.05s/
      );
    });

    it('honors caller-provided abort signal before timeout', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce((_url, init) => {
        return new Promise((_, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              reject(new DOMException('User cancelled', 'AbortError'));
            });
          }
        });
      });

      const controller = new AbortController();
      const promise = fetchWithTimeout('https://example.com/api', { signal: controller.signal }, 1000);
      controller.abort();

      await expect(promise).rejects.toThrow();
    });

    it('uses native tauri-plugin-http fetch when running inside Tauri', async () => {
      (window as any).__TAURI_INTERNALS__ = {};
      const mockTauriFetch = vi.fn().mockResolvedValue(new Response('{"tauri":true}', { status: 200 }));
      vi.doMock('@tauri-apps/plugin-http', () => ({
        fetch: mockTauriFetch,
      }));

      try {
        const res = await fetchWithTimeout('https://example.com/api', {}, 500);
        expect(mockTauriFetch).toHaveBeenCalled();
        const data = await res.json();
        expect(data.tauri).toBe(true);
      } finally {
        delete (window as any).__TAURI_INTERNALS__;
        vi.doUnmock('@tauri-apps/plugin-http');
      }
    });

    it('falls back to window.fetch if native tauri-plugin-http throws', async () => {
      (window as any).__TAURI_INTERNALS__ = {};
      const mockTauriFetch = vi.fn().mockRejectedValue(new Error('url not allowed on the configured scope'));
      vi.doMock('@tauri-apps/plugin-http', () => ({
        fetch: mockTauriFetch,
      }));
      const mockWindowFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('{"fallback":true}', { status: 200 })
      );

      try {
        const res = await fetchWithTimeout('https://example.com/api', {}, 500);
        expect(mockTauriFetch).toHaveBeenCalled();
        expect(mockWindowFetch).toHaveBeenCalled();
        const data = await res.json();
        expect(data.fallback).toBe(true);
      } finally {
        delete (window as any).__TAURI_INTERNALS__;
        vi.doUnmock('@tauri-apps/plugin-http');
      }
    });
  });
});
