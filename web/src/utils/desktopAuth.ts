import { ActiveVaultSession, bytesToBase64, base64ToBytes } from '../components/vault/vaultTypes';
import { isTauri } from './platform';

export interface DesktopAuthParams {
  port: number;
  state: string;
  transitKey?: string;
  email?: string;
}

/**
 * Checks if the current browser window was opened for a Desktop App passkey/login authorization flow.
 */
export function isDesktopAuthRequested(search: string = typeof window !== 'undefined' ? window.location.search : ''): boolean {
  try {
    const params = new URLSearchParams(search);
    return params.get('desktop_auth') === '1' && Boolean(params.get('port')) && Boolean(params.get('state'));
  } catch {
    return false;
  }
}

/**
 * Extracts desktop authentication parameters from URL search query and hash.
 */
export function getDesktopAuthParams(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  hash: string = typeof window !== 'undefined' ? window.location.hash : ''
): DesktopAuthParams | null {
  try {
    const params = new URLSearchParams(search);
    if (params.get('desktop_auth') !== '1') return null;

    const portStr = params.get('port');
    const state = params.get('state');
    if (!portStr || !state) return null;

    const port = parseInt(portStr, 10);
    if (isNaN(port) || port <= 0 || port > 65535) return null;

    const email = params.get('email') || undefined;

    // Transit key can be passed in hash (e.g. #transit_key=...) so it never hits server logs,
    // or as a query param fallback.
    let transitKey = params.get('transit_key') || undefined;
    if (!transitKey && hash) {
      const hashClean = hash.startsWith('#') ? hash.slice(1) : hash;
      const hashParams = new URLSearchParams(hashClean);
      transitKey = hashParams.get('transit_key') || undefined;
    }

    return {
      port,
      state,
      transitKey,
      email,
    };
  } catch {
    return null;
  }
}

/**
 * Encrypts arbitrary payload using Web Crypto AES-256-GCM.
 * Output format: `v1:<nonce_base64>:<ciphertext_base64>`
 */
export async function encryptWithTransitKey(transitKeyRaw: string, payload: unknown): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API ist in dieser Umgebung nicht verfügbar.');
  }

  let keyBytes: Uint8Array;
  // Support hex (64 chars) or base64 (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(transitKeyRaw)) {
    const match = transitKeyRaw.match(/.{1,2}/g);
    keyBytes = new Uint8Array(match ? match.map((b) => parseInt(b, 16)) : []);
  } else {
    keyBytes = base64ToBytes(transitKeyRaw);
  }

  if (keyBytes.length !== 32) {
    throw new Error(`Ungültige Schlüssellänge für Transit-Key: ${keyBytes.length} Bytes (erwartet: 32)`);
  }

  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = new TextEncoder().encode(JSON.stringify(payload));
  const aad = new TextEncoder().encode('gradus21:desktop-auth:v1');

  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    cryptoKey,
    plaintextBytes
  );

  const ivB64 = bytesToBase64(iv);
  const cipherB64 = bytesToBase64(new Uint8Array(cipherBuffer));

  return `v1:${ivB64}:${cipherB64}`;
}

/**
 * Sends unlocked session payload back to the desktop application's local loopback server.
 */
export async function sendDesktopAuthCallback(
  params: DesktopAuthParams,
  session: ActiveVaultSession
): Promise<{ success: boolean; message?: string }> {
  const url = `http://127.0.0.1:${params.port}/callback`;

  let encryptedPayload: string | undefined = undefined;
  if (params.transitKey) {
    try {
      encryptedPayload = await encryptWithTransitKey(params.transitKey, session);
    } catch (encErr) {
      console.warn('Transit encryption failed, falling back to plaintext localhost transmission:', encErr);
    }
  }

  const bodyData = {
    state: params.state,
    session: encryptedPayload ? undefined : session,
    encrypted_payload: encryptedPayload,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyData),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return { success: false, message: errText || `HTTP ${response.status}` };
    }

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Initiates the System-Browser Passkey flow from the Tauri Desktop App.
 * Invokes the Tauri backend command `start_desktop_browser_auth`.
 */
export async function startDesktopBrowserAuth(
  serverUrl: string,
  email?: string
): Promise<ActiveVaultSession> {
  if (!isTauri()) {
    throw new Error('startDesktopBrowserAuth darf nur in der nativen Tauri Desktop-App aufgerufen werden.');
  }

  // Dynamic import of @tauri-apps/api/core to prevent loading issues in standard browsers
  const { invoke } = await import('@tauri-apps/api/core');

  const session = await invoke<ActiveVaultSession>('start_desktop_browser_auth', {
    serverUrl,
    email: email || null,
  });

  return session;
}
