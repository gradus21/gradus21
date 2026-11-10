import { isStandaloneClient, isTauri } from './platform';

const DEFAULT_SERVER_URL = 'https://gradus21.app';
const SERVER_URL_STORAGE_KEY = 'gradus21_custom_server_url';

function isInvalidOrLegacyServerUrl(url: string): boolean {
  const lower = url.toLowerCase().trim().replace(/\/+$/, '');
  if (!lower) return true;
  if (
    lower.includes('tauri.localhost') ||
    lower.startsWith('tauri://') ||
    lower.includes('asset.localhost') ||
    lower === 'https://gradus21.de' ||
    lower === 'http://gradus21.de' ||
    lower === 'https://www.gradus21.de' ||
    lower === 'http://www.gradus21.de'
  ) {
    return true;
  }
  if (
    isStandaloneClient() &&
    (lower === 'http://localhost' ||
      lower === 'https://localhost' ||
      lower.startsWith('http://localhost:') ||
      lower.startsWith('https://localhost:') ||
      lower.startsWith('http://127.0.0.1') ||
      lower.startsWith('https://127.0.0.1'))
  ) {
    return true;
  }
  return false;
}

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
    const cleaned = stored.trim().replace(/\/+$/, '');
    if (isInvalidOrLegacyServerUrl(cleaned)) {
      localStorage.removeItem(SERVER_URL_STORAGE_KEY);
    } else {
      return cleaned;
    }
  }

  // If running in browser hosted on a domain (e.g. https://gradus21.app, custom domain, or local Docker instance)
  if (
    !isStandaloneClient() &&
    typeof window.location !== 'undefined' &&
    window.location.origin &&
    window.location.origin.startsWith('http') &&
    !isInvalidOrLegacyServerUrl(window.location.origin)
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

  if (cleaned === DEFAULT_SERVER_URL || isInvalidOrLegacyServerUrl(cleaned)) {
    localStorage.removeItem(SERVER_URL_STORAGE_KEY);
    return DEFAULT_SERVER_URL;
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

/**
 * Executes a fetch request with a configurable timeout (default: 8000ms).
 * Prevents requests from hanging indefinitely on stalled or dropped networks
 * (e.g. Wi-Fi NAT loopback drops or Android Private DNS stalls).
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = 8000
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError'));
  }, timeoutMs);

  let signal = controller.signal;
  if (init?.signal) {
    const callerSignal = init.signal;
    if (callerSignal.aborted) {
      clearTimeout(timer);
      controller.abort(callerSignal.reason);
      throw callerSignal.reason;
    }
    callerSignal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        controller.abort(callerSignal.reason);
      },
      { once: true }
    );
  }

  try {
    let fetchFn: typeof fetch = fetch;
    if (isTauri()) {
      try {
        const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
        fetchFn = tauriFetch as unknown as typeof fetch;
      } catch (err) {
        console.warn('[apiConfig] Native Tauri HTTP plugin unavailable, falling back to window.fetch:', err);
      }
    }

    const response = await fetchFn(input, {
      ...init,
      signal,
    });
    return response;
  } catch (error: any) {
    if (timedOut || error?.name === 'TimeoutError') {
      const err = new Error(`Netzwerk-Timeout: Server antwortet nicht nach ${timeoutMs / 1000}s`);
      err.name = 'TimeoutError';
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
