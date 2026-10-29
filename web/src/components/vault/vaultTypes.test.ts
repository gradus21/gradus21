import { describe, it, expect } from 'vitest';
import { normalizeKdfParams } from './vaultTypes';

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
