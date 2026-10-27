import { isStandaloneClient } from './platform';

const DEFAULT_SERVER_URL = 'https://gradus21.app';
const SERVER_URL_STORAGE_KEY = 'gradus21_custom_server_url';

/**
 * Returns the configured Gradus21 backend server URL.
 * - In native apps (iOS, iPadOS, macOS, Android, Windows, Linux): Defaults to 'https://gradus21.app'
 * - In standard web browsers: Defaults to window.location.origin
 * - Can be overridden by the user to point to a custom/self-hosted school server.
 */
export function getServerUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_SERVER_URL;

  const stored = localStorage.getItem(SERVER_URL_STORAGE_KEY);
  if (stored && stored.trim()) {
    return stored.trim().replace(/\/+$/, '');
  }

  // If running in browser hosted on a domain (e.g. https://gradus21.app or custom domain)
  if (
    !isStandaloneClient() &&
    typeof window.location !== 'undefined' &&
    window.location.origin.startsWith('http') &&
    !window.location.hostname.includes('localhost') &&
    !window.location.hostname.includes('127.0.0.1') &&
    !window.location.hostname.includes('tauri')
  ) {
    return window.location.origin;
  }

  return DEFAULT_SERVER_URL;
}

/**
 * Updates the custom server URL in localStorage.
 * If set to empty or default, clears the custom override.
 */
export function setServerUrl(url: string): string {
  let cleaned = (url || '').trim().replace(/\/+$/, '');
  if (!cleaned || cleaned === DEFAULT_SERVER_URL) {
    localStorage.removeItem(SERVER_URL_STORAGE_KEY);
    return DEFAULT_SERVER_URL;
  }

  // Auto-prepend https:// if protocol is omitted
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }

  localStorage.setItem(SERVER_URL_STORAGE_KEY, cleaned);
  return cleaned;
}

/**
 * Formats a relative API endpoint path into an absolute URL using the active server URL.
 * Example: apiUrl('/api/auth/login') -> 'https://gradus21.app/api/auth/login'
 */
export function apiUrl(endpoint: string): string {
  const base = getServerUrl();
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${path}`;
}
