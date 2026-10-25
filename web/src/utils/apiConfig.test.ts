import { describe, it, expect, beforeEach } from 'vitest';
import { getServerUrl, setServerUrl, apiUrl } from './apiConfig';

describe('API & Server URL Configuration', () => {
  beforeEach(() => {
    localStorage.clear();
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
});
