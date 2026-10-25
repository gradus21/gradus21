import { describe, it, expect } from 'vitest';
import { generateTotpSecret, buildTotpUri, generateTotpCode, verifyTotpCode } from './totp';

describe('Offline TOTP Utility (RFC 6238)', () => {
  it('generates random base32 secret and valid otpauth URI', () => {
    const { secretBase32 } = generateTotpSecret();
    expect(secretBase32.length).toBeGreaterThanOrEqual(16);

    const uri = buildTotpUri('lehrer@schule.de', secretBase32);
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain(`secret=${secretBase32}`);
    expect(uri).toContain('issuer=Gradus21');
  });

  it('generates and verifies matching 6-digit TOTP code', async () => {
    const { secretBase32 } = generateTotpSecret();
    const code = await generateTotpCode(secretBase32);

    expect(code).toMatch(/^\d{6}$/);

    const valid = await verifyTotpCode(secretBase32, code);
    expect(valid).toBe(true);
  });

  it('rejects incorrect codes', async () => {
    const { secretBase32 } = generateTotpSecret();
    const valid = await verifyTotpCode(secretBase32, '000000');
    // If 000000 happens to be the code, verify a wrong code
    const actual = await generateTotpCode(secretBase32);
    const wrong = actual === '999999' ? '111111' : '999999';
    expect(await verifyTotpCode(secretBase32, wrong)).toBe(false);
  });
});
