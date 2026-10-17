/* tslint:disable */
/* eslint-disable */

export function wasm_calculate_class_report(input_json: string): string;

export function wasm_decrypt_envelope(dek_b64: string, owner_user_id: string, entity_id: string, envelope: string): string;

export function wasm_encrypt_envelope(dek_b64: string, owner_user_id: string, entity_id: string, plaintext_json: string): string;

export function wasm_generate_vault(password: string): string;

export function wasm_rewrap_dek(dek_b64: string, new_password: string): string;

export function wasm_simulate_needed_score(summary_json: string, categories_json: string, target_category_id: string, target_overall_percent: number): any;

export function wasm_unlock_vault(password: string, salt_b64: string, kdf_params_json: string, encrypted_dek: string): string;

export function wasm_unlock_with_recovery(recovery_key: string, recovery_encrypted_dek: string): string;

export function wasm_unwrap_dek_with_passkey(passkey_secret_b64: string, credential_id: string, passkey_encrypted_dek: string): string;

export function wasm_wrap_dek_with_passkey(dek_b64: string, passkey_secret_b64: string, credential_id: string): string;

export function wasm_wrap_dek_with_recovery(dek_b64: string, existing_recovery_key: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly wasm_calculate_class_report: (a: number, b: number) => [number, number, number, number];
    readonly wasm_decrypt_envelope: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly wasm_encrypt_envelope: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly wasm_generate_vault: (a: number, b: number) => [number, number, number, number];
    readonly wasm_rewrap_dek: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly wasm_simulate_needed_score: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly wasm_unlock_vault: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly wasm_unlock_with_recovery: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly wasm_unwrap_dek_with_passkey: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly wasm_wrap_dek_with_passkey: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly wasm_wrap_dek_with_recovery: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
