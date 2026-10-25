/**
 * Pure client-side TOTP (RFC 6238 / RFC 4226) implementation for offline-first 2FA.
 * Supports generating base32 secrets, otpauth URIs, and verifying codes with time drift.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(): { secretBytes: Uint8Array; secretBase32: string } {
  const secretBytes = new Uint8Array(20);
  crypto.getRandomValues(secretBytes);
  const secretBase32 = base32Encode(secretBytes);
  return { secretBytes, secretBase32 };
}

export function buildTotpUri(email: string, secretBase32: string, issuer = 'Gradus21'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const encIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`;
}

export function base32Encode(buffer: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(input: string): Uint8Array {
  const cleaned = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const result: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const val = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (val === -1) continue;

    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      result.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(result);
}

function getSubtle(): SubtleCrypto {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    return window.crypto.subtle;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).crypto?.subtle) {
    return (globalThis as any).crypto.subtle;
  }
  // Node / vitest test environment fallback
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = require('crypto');
    if (nodeCrypto.webcrypto?.subtle) return nodeCrypto.webcrypto.subtle;
  } catch {
    // browser environment
  }
  throw new Error('WebCrypto subtle not available in this environment');
}

/**
 * Calculates the current 6-digit TOTP code for a given base32 secret and timestamp.
 */
export async function generateTotpCode(secretBase32: string, timestampMs = Date.now()): Promise<string> {
  const keyBytes = base32Decode(secretBase32);
  const timeStep = Math.floor(timestampMs / 1000 / 30);

  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  // High 32 bits
  timeView.setUint32(0, Math.floor(timeStep / 0x100000000));
  // Low 32 bits
  timeView.setUint32(4, timeStep & 0xffffffff);

  const subtle = getSubtle();
  const cryptoKey = await subtle.importKey(
    'raw',
    keyBytes as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const timeBytes = new Uint8Array(timeBuffer);
  const signature = await subtle.sign('HMAC', cryptoKey, timeBytes);
  const hmac = new Uint8Array(signature);

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verifies a 6-digit TOTP code against a base32 secret, allowing +/- 1 time step (30s) drift.
 */
export async function verifyTotpCode(
  secretBase32: string,
  userCode: string,
  timestampMs = Date.now()
): Promise<boolean> {
  const normalized = userCode.trim().replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;

  for (const stepOffset of [-1, 0, 1]) {
    const code = await generateTotpCode(secretBase32, timestampMs + stepOffset * 30 * 1000);
    if (code === normalized) {
      return true;
    }
  }

  return false;
}
