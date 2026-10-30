import { ActiveVaultSession, bytesToBase64, base64ToBytes } from '../components/vault/vaultTypes';
import { isTauri } from './platform';
import { apiUrl } from './apiConfig';

export interface DesktopAuthParams {
  port?: number;
  state?: string;
  sessionToken?: string;
  transitKey?: string;
  email?: string;
}

/**
 * Checks if the current browser window was opened for a Desktop App passkey/login authorization flow.
 */
export function isDesktopAuthRequested(
  search: string = typeof window !== 'undefined' ? window.location.search : ''
): boolean {
  try {
    const params = new URLSearchParams(search);
    const isDesktop = params.get('desktop_auth') === '1';
    const hasRelay = Boolean(params.get('session_token') || params.get('session'));
    const hasLoopback = Boolean(params.get('port')) && Boolean(params.get('state'));
    return isDesktop && (hasRelay || hasLoopback);
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

    const sessionToken = params.get('session_token') || params.get('session') || undefined;

    const portStr = params.get('port');
    const state = params.get('state') || undefined;
    let port: number | undefined = undefined;
    if (portStr) {
      const p = parseInt(portStr, 10);
      if (!isNaN(p) && p > 0 && p <= 65535) {
        port = p;
      }
    }

    if (!sessionToken && (!port || !state)) return null;

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
      sessionToken,
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
 * Decrypts transit payload using Web Crypto AES-256-GCM.
 * Expects format `v1:<nonce_base64>:<ciphertext_base64>` and AAD `gradus21:desktop-auth:v1`.
 */
export async function decryptWithTransitKey(
  transitKeyRaw: string,
  envelope: string
): Promise<ActiveVaultSession> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API ist in dieser Umgebung nicht verfügbar.');
  }

  const parts = envelope.split(':');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    throw new Error('Ungültiges Transit-Payload Format (erwartet v1:<iv>:<ciphertext>)');
  }

  let keyBytes: Uint8Array;
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
    ['decrypt']
  );

  const iv = base64ToBytes(parts[1]);
  const ciphertext = base64ToBytes(parts[2]);
  const aad = new TextEncoder().encode('gradus21:desktop-auth:v1');

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer, additionalData: aad },
    cryptoKey,
    ciphertext.buffer as ArrayBuffer
  );

  const jsonStr = new TextDecoder().decode(decryptedBuffer);
  return JSON.parse(jsonStr) as ActiveVaultSession;
}

/**
 * Sends unlocked session payload back to the desktop application.
 * Uses encrypted Server-Relay as primary channel (resilient against browser Mixed-Content / CSP blocks)
 * and attempts loopback in parallel.
 */
export async function sendDesktopAuthCallback(
  params: DesktopAuthParams,
  session: ActiveVaultSession
): Promise<{ success: boolean; message?: string }> {
  if (!params.transitKey) {
    return {
      success: false,
      message: 'Fehlender Transitschlüssel für die verschlüsselte Übertragung.',
    };
  }
  let encryptedPayload: string | undefined = undefined;
  try {
    encryptedPayload = await encryptWithTransitKey(params.transitKey, session);
  } catch (encErr) {
    console.warn('Transit encryption failed:', encErr);
    return {
      success: false,
      message: 'Kryptografische Verschlüsselung für Desktop-Übertragung fehlgeschlagen.',
    };
  }

  let relaySucceeded = false;
  let loopbackSucceeded = false;
  let lastError = '';

  // 1. Primärer robuster Kanal: Server-Relay (Same-Origin HTTPS)
  if (params.sessionToken && encryptedPayload) {
    try {
      const relayRes = await fetch(apiUrl('/api/auth/desktop-relay/complete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: params.sessionToken,
          encrypted_payload: encryptedPayload,
        }),
      });
      if (relayRes.ok) {
        relaySucceeded = true;
      } else {
        const errText = await relayRes.text().catch(() => '');
        lastError = `Server-Relais Fehler: ${errText || relayRes.statusText}`;
      }
    } catch (relayErr: any) {
      lastError = `Server-Relais Verbindungsfehler: ${relayErr?.message || String(relayErr)}`;
    }
  }

  // 2. Paralleler / Fallback Kanal: Lokaler Loopback Socket (funktioniert u.a. bei reiner Localhost-Entwicklung)
  if (params.port && params.state && encryptedPayload) {
    const loopbackUrl = `http://127.0.0.1:${params.port}/callback`;
    const bodyData = {
      state: params.state,
      encrypted_payload: encryptedPayload,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const response = await fetch(loopbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        loopbackSucceeded = true;
      }
    } catch (loopbackErr: any) {
      if (!lastError) {
        lastError =
          loopbackErr?.name === 'AbortError'
            ? 'Loopback Zeitüberschreitung'
            : String(loopbackErr?.message || loopbackErr);
      }
    }
  }

  if (relaySucceeded || loopbackSucceeded) {
    return { success: true };
  }

  return {
    success: false,
    message: lastError || 'Konnte Autorisierung nicht an die Desktop-App übertragen.',
  };
}

/**
 * Initiates the System-Browser Passkey flow from the Tauri Desktop App.
 * Uses Server-Relay polling and the local loopback listener in parallel.
 */
export async function startDesktopBrowserAuth(
  serverUrl: string,
  email?: string
): Promise<ActiveVaultSession> {
  if (!isTauri()) {
    throw new Error('startDesktopBrowserAuth darf nur in der nativen Tauri Desktop-App aufgerufen werden.');
  }

  // Generate 32-byte cryptographically secure transit key for E2EE payload transport
  const transitKeyBytes = window.crypto.getRandomValues(new Uint8Array(32));
  const transitKeyHex = Array.from(transitKeyBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Request ephemeral session token from Server Relay
  let sessionToken: string | undefined = undefined;
  const cleanServerUrl = serverUrl.replace(/\/+$/, '');
  try {
    const initRes = await fetch(`${cleanServerUrl}/api/auth/desktop-relay/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (initRes.ok) {
      const data = await initRes.json();
      if (data?.session_token) {
        sessionToken = data.session_token;
      }
    }
  } catch (initErr) {
    console.warn('Desktop relay init failed, relying solely on loopback socket:', initErr);
  }

  // Dynamic import of @tauri-apps/api/core
  const { invoke } = await import('@tauri-apps/api/core');

  // Channel 1: Native Tauri Loopback Listener
  const tauriPromise = invoke<ActiveVaultSession>('start_desktop_browser_auth', {
    serverUrl: cleanServerUrl,
    email: email || null,
    sessionToken: sessionToken || null,
    transitKeyOverride: transitKeyHex,
  });

  // Channel 2: Server-Relay Polling (Robust against browser Mixed-Content / CSP blocks)
  let pollIntervalId: any = null;
  const pollPromise = new Promise<ActiveVaultSession>((resolve, reject) => {
    if (!sessionToken) {
      // If server relay init was not possible (e.g. server offline), rely only on loopback
      return;
    }

    const startTime = Date.now();
    const timeoutMs = 300000; // 5 minutes

    pollIntervalId = setInterval(async () => {
      if (Date.now() - startTime > timeoutMs) {
        clearInterval(pollIntervalId);
        reject(
          new Error(
            'Zeitüberschreitung: Passkey-Anmeldung im Browser nicht innerhalb von 5 Minuten abgeschlossen.'
          )
        );
        return;
      }

      try {
        const pollRes = await fetch(
          `${cleanServerUrl}/api/auth/desktop-relay/poll?session_token=${encodeURIComponent(sessionToken!)}`
        );
        if (pollRes.ok) {
          const pollData = await pollRes.json();
          if (pollData?.status === 'ready' && pollData?.encrypted_payload) {
            clearInterval(pollIntervalId);
            const decrypted = await decryptWithTransitKey(transitKeyHex, pollData.encrypted_payload);
            // Bring desktop window to front
            invoke('focus_main_window').catch(() => {});
            resolve(decrypted);
          } else if (pollData?.status === 'expired') {
            clearInterval(pollIntervalId);
            reject(new Error('Die Autorisierungssitzung ist abgelaufen.'));
          }
        }
      } catch {
        // network jitter during polling is ignored
      }
    }, 1000);
  });

  try {
    const candidatePromises: Promise<ActiveVaultSession>[] = [tauriPromise];
    if (sessionToken) {
      candidatePromises.push(pollPromise);
    }
    const result = await Promise.any(candidatePromises);
    if (pollIntervalId) clearInterval(pollIntervalId);
    return result;
  } catch (err: any) {
    if (pollIntervalId) clearInterval(pollIntervalId);
    if (err && err.errors && err.errors.length > 0) {
      const meaningfulErr = err.errors.find((e: any) => e?.message) || err.errors[0];
      throw meaningfulErr;
    }
    throw err;
  }
}
