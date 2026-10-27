import initWasm from '../wasm-pkg/gradus21_core';

let wasmInitPromise: Promise<void> | null = null;
let isWasmInitialized = false;
let wasmInitError: Error | null = null;

export function getWasmStatus(): { ready: boolean; error: Error | null } {
  return { ready: isWasmInitialized, error: wasmInitError };
}

/**
 * Ensures the WebAssembly core module is loaded and initialized.
 * In mobile environments (iOS WKWebView, Android WebView) or custom Tauri schemes,
 * WebAssembly.instantiateStreaming can fail with TypeError due to scheme or MIME restrictions.
 * This loader fetches the WASM binary as an ArrayBuffer and calls WebAssembly.instantiate directly,
 * guaranteeing cross-platform compatibility.
 */
export async function ensureWasmLoaded(): Promise<void> {
  if (isWasmInitialized) return;
  if (wasmInitPromise) return wasmInitPromise;

  wasmInitPromise = (async () => {
    try {
      const wasmUrl = new URL('../wasm-pkg/gradus21_core_bg.wasm', import.meta.url);
      try {
        const res = await fetch(wasmUrl);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          await initWasm(buffer);
          isWasmInitialized = true;
          return;
        }
      } catch (fetchErr) {
        console.warn('Direct ArrayBuffer fetch for WASM failed, attempting default init:', fetchErr);
      }

      await initWasm();
      isWasmInitialized = true;
    } catch (err: any) {
      console.error('Failed to initialize WebAssembly core:', err);
      wasmInitError = err instanceof Error ? err : new Error(String(err));
      wasmInitPromise = null; // allow retry
      throw wasmInitError;
    }
  })();

  return wasmInitPromise;
}
