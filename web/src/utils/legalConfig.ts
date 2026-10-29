import { useState, useEffect } from 'react';
import { apiUrl } from './apiConfig';

export interface LegalConfigData {
  name: string;
  company?: string | null;
  address: string;
  email: string;
  phone?: string | null;
  representative?: string | null;
  register?: string | null;
  vat_id?: string | null;
  hosting_provider: string;
  hosting_location: string;
  dpo_contact?: string | null;
  avv_url: string;
  avv_download_url?: string | null;
  avv_custom_text?: string | null;
  terms_url: string;
}

export const DEFAULT_LEGAL_CONFIG: LegalConfigData = {
  name: 'Julian Kallidat',
  company: null,
  address: 'Hardtstr. 6, 76467 Bietigheim, Deutschland',
  email: 'kontakt@gradus21.de',
  phone: null,
  representative: null,
  register: null,
  vat_id: null,
  hosting_provider: 'Alfahosting GmbH',
  hosting_location: 'Leipzig (Deutschland)',
  dpo_contact: null,
  avv_url: 'https://gradus21.de/avv.html',
  avv_download_url: 'https://gradus21.de/downloads/gradus21-muster-avv.pdf',
  avv_custom_text: null,
  terms_url: 'https://gradus21.de/nutzungsbedingungen.html',
};

let cachedConfig: LegalConfigData = { ...DEFAULT_LEGAL_CONFIG };
let isFetching = false;
const listeners = new Set<(config: LegalConfigData) => void>();

export async function fetchLegalConfig(): Promise<LegalConfigData> {
  if (isFetching) return cachedConfig;
  isFetching = true;
  try {
    const res = await fetch(apiUrl('/api/legal/info'));
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        cachedConfig = {
          ...DEFAULT_LEGAL_CONFIG,
          ...data,
          avv_url: data.avv_url || DEFAULT_LEGAL_CONFIG.avv_url,
          avv_download_url:
            data.avv_download_url !== undefined
              ? data.avv_download_url
              : DEFAULT_LEGAL_CONFIG.avv_download_url,
          avv_custom_text: data.avv_custom_text || null,
          terms_url: data.terms_url || DEFAULT_LEGAL_CONFIG.terms_url,
        };
        listeners.forEach((l) => l(cachedConfig));
      }
    }
  } catch {
    // Keep fallback defaults (e.g. offline / PWA mode)
  } finally {
    isFetching = false;
  }
  return cachedConfig;
}

export function useLegalConfig(): LegalConfigData {
  const [config, setConfig] = useState<LegalConfigData>(cachedConfig);

  useEffect(() => {
    listeners.add(setConfig);
    fetchLegalConfig().then(setConfig);
    return () => {
      listeners.delete(setConfig);
    };
  }, []);

  return config;
}

export function _resetCachedConfigForTests(): void {
  cachedConfig = { ...DEFAULT_LEGAL_CONFIG };
  isFetching = false;
}

export function getDisplayDomain(urlStr?: string): string {
  if (!urlStr) return 'gradus21.de';
  try {
    const host = new URL(urlStr).hostname;
    return host || 'gradus21.de';
  } catch {
    return 'gradus21.de';
  }
}

/**
 * Cleanly formats API response errors, translating raw HTML server responses
 * (e.g. 501 Unsupported Method from python http.server or 502 Bad Gateway) into readable German messages.
 */
export function formatApiErrorMessage(rawError: string, status?: number): string {
  if (!rawError) return 'Ein unbekannter Serverfehler ist aufgetreten.';
  const trimmed = rawError.trim();
  if (
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.includes('<body') ||
    /<[a-z][\s\S]*>/i.test(trimmed)
  ) {
    if (status === 501) {
      return 'Der Ziel-Server unterstützt die POST-Anfrage nicht (HTTP 501). Bitte überprüfe, ob das Gradus21-Backend (gradus21-server) auf Port 8080 läuft und nicht durch einen anderen Prozess (z. B. python http.server) blockiert wird.';
    }
    if (status === 502) {
      return 'Bad Gateway (HTTP 502): Das Backend ist derzeit nicht erreichbar oder startet noch.';
    }
    if (status === 503) {
      return 'Service Unavailable (HTTP 503): Das Backend ist vorübergehend überlastet oder nicht erreichbar.';
    }
    if (status === 504) {
      return 'Gateway Timeout (HTTP 504): Die Server-Anfrage hat das Zeitlimit überschritten.';
    }
    return `Serverfehler (HTTP ${status || 'Fehler'}): Der Webserver hat eine HTML-Fehlerseite anstelle einer API-Antwort gesendet.`;
  }
  return trimmed;
}
