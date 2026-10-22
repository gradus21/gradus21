/**
 * Unified Storage Adapter for Gradus21.
 * 
 * Provides a resilient, synchronous Storage interface compatible with localStorage,
 * backed by in-memory failover and extensible for native Tauri persistence
 * (avoiding WebKit/Safari 7-day eviction on iOS/iPadOS).
 */

class GradusStorageAdapter {
  private memoryFallback: Map<string, string> = new Map();
  private hasLocalStorage: boolean;

  constructor() {
    this.hasLocalStorage = this.checkLocalStorageAvailability();
  }

  private checkLocalStorageAvailability(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    try {
      const testKey = '__gradus21_storage_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  public getItem(key: string): string | null {
    if (this.hasLocalStorage) {
      try {
        const val = window.localStorage.getItem(key);
        if (val !== null) return val;
      } catch {
        // Fallback to memory
      }
    }
    return this.memoryFallback.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    if (this.hasLocalStorage) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch (err) {
        console.warn('[StorageAdapter] localStorage write failed (quota exceeded or restricted), using memory cache fallback:', err);
      }
    }
    this.memoryFallback.set(key, value);
  }

  public removeItem(key: string): void {
    if (this.hasLocalStorage) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Ignore
      }
    }
    this.memoryFallback.delete(key);
  }

  public clear(): void {
    if (this.hasLocalStorage) {
      try {
        window.localStorage.clear();
      } catch {
        // Ignore
      }
    }
    this.memoryFallback.clear();
  }

  public key(index: number): string | null {
    if (this.hasLocalStorage) {
      try {
        return window.localStorage.key(index);
      } catch {
        // Fallback
      }
    }
    const keys = Array.from(this.memoryFallback.keys());
    return keys[index] ?? null;
  }

  public get length(): number {
    if (this.hasLocalStorage) {
      try {
        return window.localStorage.length;
      } catch {
        // Fallback
      }
    }
    return this.memoryFallback.size;
  }

  public getAllKeys(): string[] {
    const keySet = new Set<string>();
    if (this.hasLocalStorage) {
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k) keySet.add(k);
        }
      } catch {
        // Ignore
      }
    }
    for (const k of this.memoryFallback.keys()) {
      keySet.add(k);
    }
    return Array.from(keySet);
  }
}

export const storageAdapter = new GradusStorageAdapter();
