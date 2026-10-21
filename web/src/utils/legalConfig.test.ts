import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_LEGAL_CONFIG,
  fetchLegalConfig,
  getDisplayDomain,
  formatApiErrorMessage,
  _resetCachedConfigForTests,
} from './legalConfig';

describe('legalConfig utility', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    _resetCachedConfigForTests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    _resetCachedConfigForTests();
  });

  it('provides default official legal config pointing to gradus21.de', () => {
    expect(DEFAULT_LEGAL_CONFIG.avv_url).toBe('https://gradus21.de/avv.html');
    expect(DEFAULT_LEGAL_CONFIG.avv_download_url).toBe('https://gradus21.de/downloads/gradus21-muster-avv.pdf');
    expect(DEFAULT_LEGAL_CONFIG.terms_url).toBe('https://gradus21.de/nutzungsbedingungen.html');
    expect(DEFAULT_LEGAL_CONFIG.email).toBe('kontakt@gradus21.de');
  });

  it('extracts display domain cleanly from full URL', () => {
    expect(getDisplayDomain('https://gradus21.de/avv.html')).toBe('gradus21.de');
    expect(getDisplayDomain('https://schul-server.intern:8443/legal/avv.pdf')).toBe('schul-server.intern');
    expect(getDisplayDomain('not-a-valid-url')).toBe('gradus21.de');
    expect(getDisplayDomain('')).toBe('gradus21.de');
    expect(getDisplayDomain(undefined)).toBe('gradus21.de');
  });

  it('fetches server legal config when available', async () => {
    const mockConfig = {
      ...DEFAULT_LEGAL_CONFIG,
      avv_url: 'https://myschool.de/avv.html',
      avv_download_url: 'https://myschool.de/avv.pdf',
      avv_custom_text: 'Eigener Schul-Mustervertrag',
      terms_url: 'https://myschool.de/nutzungsbedingungen.html',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockConfig,
    } as any);

    const result = await fetchLegalConfig();
    expect(result.avv_url).toBe('https://myschool.de/avv.html');
    expect(result.avv_download_url).toBe('https://myschool.de/avv.pdf');
    expect(result.avv_custom_text).toBe('Eigener Schul-Mustervertrag');
    expect(result.terms_url).toBe('https://myschool.de/nutzungsbedingungen.html');
  });

  it('falls back to default config if network fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

    const result = await fetchLegalConfig();
    expect(result.avv_url).toBe('https://gradus21.de/avv.html');
    expect(result.terms_url).toBe('https://gradus21.de/nutzungsbedingungen.html');
  });

  it('formats HTML error responses into readable German messages', () => {
    const raw501 = '<!DOCTYPE HTML><html><head><title>Error response</title></head><body><h1>Error code: 501</h1></body></html>';
    const formatted501 = formatApiErrorMessage(raw501, 501);
    expect(formatted501).toContain('HTTP 501');
    expect(formatted501).toContain('gradus21-server');

    const raw502 = '<html><body>502 Bad Gateway</body></html>';
    expect(formatApiErrorMessage(raw502, 502)).toContain('HTTP 502');

    const normalError = 'E-Mail existiert bereits';
    expect(formatApiErrorMessage(normalError, 400)).toBe('E-Mail existiert bereits');
  });
});
