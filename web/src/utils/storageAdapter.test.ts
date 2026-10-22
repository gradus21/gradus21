import { describe, it, expect, beforeEach } from 'vitest';
import { storageAdapter } from './storageAdapter';

describe('storageAdapter', () => {
  beforeEach(() => {
    storageAdapter.clear();
  });

  it('stores, retrieves, and removes items', () => {
    storageAdapter.setItem('test_key', 'test_value');
    expect(storageAdapter.getItem('test_key')).toBe('test_value');

    storageAdapter.removeItem('test_key');
    expect(storageAdapter.getItem('test_key')).toBeNull();
  });

  it('reports correct length and keys list', () => {
    storageAdapter.setItem('k1', 'v1');
    storageAdapter.setItem('k2', 'v2');
    expect(storageAdapter.length).toBe(2);

    const keys = storageAdapter.getAllKeys();
    expect(keys).toContain('k1');
    expect(keys).toContain('k2');

    storageAdapter.clear();
    expect(storageAdapter.length).toBe(0);
  });
});
