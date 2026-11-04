import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeKdfParams, findLocalCachedVault } from './vaultTypes';

describe('normalizeKdfParams', () => {
  it('converts legacy m_cost, t_cost, p_cost to memory_kib, iterations, parallelism', () => {
    const legacy = { m_cost: 65536, t_cost: 3, p_cost: 1 };
    const normalized = normalizeKdfParams(legacy);
    expect(normalized).toEqual({
      memory_kib: 65536,
      iterations: 3,
      parallelism: 1,
    });
  });

  it('preserves standard memory_kib, iterations, parallelism', () => {
    const standard = { memory_kib: 19456, iterations: 2, parallelism: 1 };
    const normalized = normalizeKdfParams(standard);
    expect(normalized).toEqual({
      memory_kib: 19456,
      iterations: 2,
      parallelism: 1,
    });
  });

  it('parses JSON stringified legacy and standard parameters', () => {
    const stringifiedLegacy = JSON.stringify({ m_cost: 65536, t_cost: 3, p_cost: 1 });
    expect(normalizeKdfParams(stringifiedLegacy)).toEqual({
      memory_kib: 65536,
      iterations: 3,
      parallelism: 1,
    });

    const stringifiedStandard = JSON.stringify({ memory_kib: 32768, iterations: 4, parallelism: 2 });
    expect(normalizeKdfParams(stringifiedStandard)).toEqual({
      memory_kib: 32768,
      iterations: 4,
      parallelism: 2,
    });
  });

  it('provides safe OWASP defaults for null, undefined, or empty values', () => {
    const fallback = { memory_kib: 19456, iterations: 2, parallelism: 1 };
    expect(normalizeKdfParams(null)).toEqual(fallback);
    expect(normalizeKdfParams(undefined)).toEqual(fallback);
    expect(normalizeKdfParams({})).toEqual(fallback);
    expect(normalizeKdfParams('invalid json')).toEqual(fallback);
  });
});

describe('findLocalCachedVault', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('retrieves cached vault from active user storage v3', () => {
    const userId = 'usr_test_123';
    localStorage.setItem('gradus21_active_user_id_v3', userId);
    localStorage.setItem(
      `gradus21_e2ee_user_vault_v3_${userId}`,
      JSON.stringify({
        userId,
        session: {
          userId,
          email: 'teacher@school.de',
          kdfSaltB64: 'c2FsdA==',
          encryptedDek: 'ZW5jRGVr',
        },
      })
    );

    const cached = findLocalCachedVault('teacher@school.de');
    expect(cached).not.toBeNull();
    expect(cached?.userId).toBe(userId);
    expect(cached?.kdfSaltB64).toBe('c2FsdA==');
    expect(cached?.encryptedDek).toBe('ZW5jRGVr');
  });

  it('falls back to biometric vault metadata when user cache is missing', () => {
    const userEmail = 'admin@gradus21.de';
    localStorage.setItem('gradus21_bio_last_user_v1', userEmail);
    localStorage.setItem(
      `gradus21_bio_meta_v1_${userEmail}`,
      JSON.stringify({
        userId: 'usr_bio_456',
        email: userEmail,
        updatedAt: Date.now(),
        kdfSaltB64: 'YmlvU2FsdA==',
        encryptedDek: 'YmlvRW5jRGVr',
        kdfParams: { memory_kib: 19456, iterations: 2, parallelism: 1 },
      })
    );

    const cached = findLocalCachedVault(userEmail);
    expect(cached).not.toBeNull();
    expect(cached?.kdfSaltB64).toBe('YmlvU2FsdA==');
    expect(cached?.encryptedDek).toBe('YmlvRW5jRGVr');
  });
});
