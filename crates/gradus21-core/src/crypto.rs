use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use hkdf::Hkdf;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use thiserror::Error;
use zeroize::Zeroize;

#[derive(Debug, Error)]
pub enum CryptoError {
    #[error("KDF parameter or hashing error: {0}")]
    KdfError(String),
    #[error("Base64 decode error: {0}")]
    Base64Error(String),
    #[error("Invalid key or nonce length")]
    InvalidLength,
    #[error("Encryption failed")]
    EncryptionFailed,
    #[error("Decryption failed (invalid key, corrupted ciphertext, or AAD mismatch)")]
    DecryptionFailed,
    #[error("Unsupported envelope format")]
    UnsupportedFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KdfParams {
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

impl Default for KdfParams {
    fn default() -> Self {
        Self {
            memory_kib: 19456, // OWASP recommended minimum for Argon2id (fast in WASM & server)
            iterations: 2,
            parallelism: 1,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Zeroize)]
#[zeroize(drop)]
pub struct DerivedPasswordKeys {
    pub auth_key_b64: String,
    pub kek_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultRegistrationBundle {
    pub kdf_salt_b64: String,
    pub kdf_params: KdfParams,
    pub auth_key_b64: String,
    pub encrypted_dek: String,
    pub recovery_encrypted_dek: String,
    pub recovery_auth_key_b64: String,
    pub recovery_key_formatted: String,
    pub dek_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnlockedVault {
    pub dek_b64: String,
    pub auth_key_b64: String,
}

const DOMAIN_AUTH_KEY: &[u8] = b"BTE-NotenFlow-v2-AuthKey";
const DOMAIN_KEK: &[u8] = b"BTE-NotenFlow-v2-KEK";
const DOMAIN_RECOVERY_KEK: &[u8] = b"BTE-NotenFlow-v2-RecoveryKEK";
const DOMAIN_RECOVERY_AUTH_KEY: &[u8] = b"BTE-NotenFlow-v2-RecoveryAuthKey";
const DOMAIN_PASSKEY_KEK: &[u8] = b"BTE-NotenFlow-v2-PasskeyKEK";
const AAD_DEK_WRAP: &[u8] = b"BTE-NotenFlow-v2-DEK-Wrap";
const AAD_RECOVERY_WRAP: &[u8] = b"BTE-NotenFlow-v2-Recovery-Wrap";
const AAD_PASSKEY_WRAP: &[u8] = b"BTE-NotenFlow-v2-Passkey-Wrap";

/// Derives two cryptographically separated 256-bit keys from password + salt:
/// 1. `auth_key_b64` -> sent to the server for login/registration (server hashes it again)
/// 2. `kek_b64` -> Key Encryption Key that never leaves client RAM
pub fn derive_password_keys(
    password: &str,
    salt_b64: &str,
    params: &KdfParams,
) -> Result<DerivedPasswordKeys, CryptoError> {
    let salt = B64
        .decode(salt_b64)
        .map_err(|e| CryptoError::Base64Error(e.to_string()))?;

    if params.memory_kib < 1024 || params.memory_kib > 262_144 {
        return Err(CryptoError::KdfError(format!(
            "memory_kib out of safe bounds (1024..=262144): {}",
            params.memory_kib
        )));
    }
    if params.iterations == 0 || params.iterations > 20 {
        return Err(CryptoError::KdfError(format!(
            "iterations out of safe bounds (1..=20): {}",
            params.iterations
        )));
    }
    if params.parallelism == 0 || params.parallelism > 16 {
        return Err(CryptoError::KdfError(format!(
            "parallelism out of safe bounds (1..=16): {}",
            params.parallelism
        )));
    }

    let argon_params = Params::new(
        params.memory_kib,
        params.iterations,
        params.parallelism,
        Some(32),
    )
    .map_err(|e| CryptoError::KdfError(e.to_string()))?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon_params);
    let mut master_secret = [0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), &salt, &mut master_secret)
        .map_err(|e| CryptoError::KdfError(e.to_string()))?;

    let hk = Hkdf::<Sha256>::new(Some(&salt), &master_secret);
    let mut auth_key = [0u8; 32];
    let mut kek = [0u8; 32];

    hk.expand(DOMAIN_AUTH_KEY, &mut auth_key)
        .map_err(|_| CryptoError::KdfError("HKDF expand failed".into()))?;
    hk.expand(DOMAIN_KEK, &mut kek)
        .map_err(|_| CryptoError::KdfError("HKDF expand failed".into()))?;

    master_secret.zeroize();

    let result = DerivedPasswordKeys {
        auth_key_b64: B64.encode(auth_key),
        kek_b64: B64.encode(kek),
    };

    auth_key.zeroize();
    kek.zeroize();

    Ok(result)
}

/// Generates a fresh E2EE Vault (DEK, KDF Salt, Recovery Key, and wrapped DEK envelopes).
pub fn generate_vault_bundle(password: &str) -> Result<VaultRegistrationBundle, CryptoError> {
    let mut rng = rand::thread_rng();

    let mut salt = [0u8; 16];
    rng.fill_bytes(&mut salt);
    let kdf_salt_b64 = B64.encode(salt);

    let mut dek = [0u8; 32];
    rng.fill_bytes(&mut dek);
    let dek_b64 = B64.encode(dek);

    let kdf_params = KdfParams::default();
    let derived = derive_password_keys(password, &kdf_salt_b64, &kdf_params)?;

    // Encrypt DEK with KEK
    let encrypted_dek = aes_gcm_encrypt_raw(&derived.kek_b64, &dek, AAD_DEK_WRAP)?;

    // Generate human-readable Emergency Recovery Key (6 groups of 4 alphanumeric chars)
    let recovery_key_formatted = generate_formatted_recovery_key();
    let mut recovery_kek_b64 = derive_recovery_kek(&recovery_key_formatted)?;
    let recovery_auth_key_b64 = derive_recovery_auth_key(&recovery_key_formatted)?;
    let recovery_encrypted_dek = aes_gcm_encrypt_raw(&recovery_kek_b64, &dek, AAD_RECOVERY_WRAP)?;

    recovery_kek_b64.zeroize();
    dek.zeroize();

    Ok(VaultRegistrationBundle {
        kdf_salt_b64,
        kdf_params,
        auth_key_b64: derived.auth_key_b64.clone(),
        encrypted_dek,
        recovery_encrypted_dek,
        recovery_auth_key_b64,
        recovery_key_formatted,
        dek_b64,
    })
}

/// Unlocks the Master DEK using the teacher's password and KDF parameters.
pub fn unlock_vault_with_password(
    password: &str,
    salt_b64: &str,
    params: &KdfParams,
    encrypted_dek: &str,
) -> Result<UnlockedVault, CryptoError> {
    let derived = derive_password_keys(password, salt_b64, params)?;
    let mut dek_bytes = aes_gcm_decrypt_raw(&derived.kek_b64, encrypted_dek, AAD_DEK_WRAP)?;
    let dek_b64 = B64.encode(&dek_bytes);
    dek_bytes.zeroize();
    Ok(UnlockedVault {
        dek_b64,
        auth_key_b64: derived.auth_key_b64.clone(),
    })
}

/// Unlocks the Master DEK using the Emergency Recovery Key.
pub fn unlock_dek_with_recovery_key(
    recovery_key: &str,
    recovery_encrypted_dek: &str,
) -> Result<String, CryptoError> {
    let normalized = normalize_recovery_key(recovery_key);
    let mut recovery_kek_b64 = derive_recovery_kek(&normalized)?;
    let mut dek_bytes = aes_gcm_decrypt_raw(&recovery_kek_b64, recovery_encrypted_dek, AAD_RECOVERY_WRAP)?;
    recovery_kek_b64.zeroize();
    let encoded = B64.encode(&dek_bytes);
    dek_bytes.zeroize();
    Ok(encoded)
}

/// Wraps an existing Master DEK with either an existing formatted recovery key or a newly generated one.
/// Returns `(recovery_key_formatted, recovery_encrypted_dek)`.
pub fn wrap_dek_with_recovery_key(
    dek_b64: &str,
    existing_recovery_key: Option<&str>,
) -> Result<(String, String), CryptoError> {
    let mut dek_bytes = B64
        .decode(dek_b64)
        .map_err(|e| CryptoError::Base64Error(e.to_string()))?;

    let normalized_existing = existing_recovery_key
        .map(normalize_recovery_key)
        .filter(|s| s.chars().filter(|c| c.is_ascii_alphanumeric()).count() >= 16);

    let recovery_key_formatted =
        normalized_existing.unwrap_or_else(generate_formatted_recovery_key);
    let mut recovery_kek_b64 = derive_recovery_kek(&recovery_key_formatted)?;
    let res = aes_gcm_encrypt_raw(&recovery_kek_b64, &dek_bytes, AAD_RECOVERY_WRAP);
    recovery_kek_b64.zeroize();
    dek_bytes.zeroize();
    let recovery_encrypted_dek = res?;

    Ok((recovery_key_formatted, recovery_encrypted_dek))
}

/// Re-wraps the existing Master DEK with a new password (takes <10ms, no database re-encryption needed!).
pub fn rewrap_dek_for_new_password(
    dek_b64: &str,
    new_password: &str,
) -> Result<(String, KdfParams, String, String), CryptoError> {
    let mut dek_bytes = B64
        .decode(dek_b64)
        .map_err(|e| CryptoError::Base64Error(e.to_string()))?;

    let mut rng = rand::thread_rng();
    let mut salt = [0u8; 16];
    rng.fill_bytes(&mut salt);
    let kdf_salt_b64 = B64.encode(salt);
    let params = KdfParams::default();

    let derived = match derive_password_keys(new_password, &kdf_salt_b64, &params) {
        Ok(d) => d,
        Err(e) => {
            dek_bytes.zeroize();
            return Err(e);
        }
    };
    let enc_res = aes_gcm_encrypt_raw(&derived.kek_b64, &dek_bytes, AAD_DEK_WRAP);
    dek_bytes.zeroize();
    let encrypted_dek = enc_res?;

    Ok((
        kdf_salt_b64,
        params,
        derived.auth_key_b64.clone(),
        encrypted_dek,
    ))
}

/// Wraps the Master DEK using a WebAuthn Passkey PRF secret or device-bound Passkey secret.
pub fn wrap_dek_with_passkey_secret(
    dek_b64: &str,
    passkey_secret_b64: &str,
    credential_id: &str,
) -> Result<String, CryptoError> {
    let mut dek_bytes = B64
        .decode(dek_b64)
        .map_err(|e| CryptoError::Base64Error(e.to_string()))?;
    let mut passkey_kek_b64 = match derive_passkey_kek(passkey_secret_b64, credential_id) {
        Ok(k) => k,
        Err(e) => {
            dek_bytes.zeroize();
            return Err(e);
        }
    };
    let res = aes_gcm_encrypt_raw(&passkey_kek_b64, &dek_bytes, AAD_PASSKEY_WRAP);
    passkey_kek_b64.zeroize();
    dek_bytes.zeroize();
    res
}

/// Unwraps the Master DEK using a WebAuthn Passkey PRF secret or device-bound Passkey secret.
pub fn unwrap_dek_with_passkey_secret(
    passkey_secret_b64: &str,
    credential_id: &str,
    passkey_encrypted_dek: &str,
) -> Result<String, CryptoError> {
    let mut passkey_kek_b64 = derive_passkey_kek(passkey_secret_b64, credential_id)?;
    let res = aes_gcm_decrypt_raw(&passkey_kek_b64, passkey_encrypted_dek, AAD_PASSKEY_WRAP);
    passkey_kek_b64.zeroize();
    let mut dek_bytes = res?;
    let encoded = B64.encode(&dek_bytes);
    dek_bytes.zeroize();
    Ok(encoded)
}

fn derive_passkey_kek(passkey_secret_b64: &str, credential_id: &str) -> Result<String, CryptoError> {
    let mut secret_bytes = B64
        .decode(passkey_secret_b64)
        .map_err(|e| CryptoError::Base64Error(e.to_string()))?;
    let hk = Hkdf::<Sha256>::new(Some(credential_id.as_bytes()), &secret_bytes);
    secret_bytes.zeroize();
    let mut key = [0u8; 32];
    hk.expand(DOMAIN_PASSKEY_KEK, &mut key)
        .map_err(|_| CryptoError::KdfError("Passkey HKDF failed".into()))?;
    let b64 = B64.encode(key);
    key.zeroize();
    Ok(b64)
}

/// Encrypts a JSON entity payload into an authenticated AES-256-GCM envelope:
/// Format: `v1:<iv_base64>:<ciphertext_with_tag_base64>`
/// Binds `owner_user_id:entity_id` as AAD so ciphertexts cannot be swapped across rows or users.
pub fn encrypt_entity_envelope(
    dek_b64: &str,
    owner_user_id: &str,
    entity_id: &str,
    plaintext_json: &str,
) -> Result<String, CryptoError> {
    let aad = format!("v1:{}:{}", owner_user_id, entity_id);
    aes_gcm_encrypt_raw(dek_b64, plaintext_json.as_bytes(), aad.as_bytes())
}

/// Decrypts an authenticated AES-256-GCM entity envelope and verifies the AAD binding.
pub fn decrypt_entity_envelope(
    dek_b64: &str,
    owner_user_id: &str,
    entity_id: &str,
    envelope: &str,
) -> Result<String, CryptoError> {
    let aad_v1 = format!("v1:{}:{}", owner_user_id, entity_id);
    if let Ok(bytes) = aes_gcm_decrypt_raw(dek_b64, envelope, aad_v1.as_bytes()) {
        return String::from_utf8(bytes).map_err(|_| CryptoError::DecryptionFailed);
    }
    let aad_pipe = format!("owner:{}|entity:{}", owner_user_id, entity_id);
    let bytes = aes_gcm_decrypt_raw(dek_b64, envelope, aad_pipe.as_bytes())?;
    String::from_utf8(bytes).map_err(|_| CryptoError::DecryptionFailed)
}

fn generate_formatted_recovery_key() -> String {
    const CHARSET: &[u8; 32] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    let mut groups = Vec::with_capacity(6);
    for _ in 0..6 {
        let mut group = String::with_capacity(4);
        for _ in 0..4 {
            let mut b = [0u8; 1];
            rng.fill_bytes(&mut b);
            let idx = (b[0] & 0x1F) as usize;
            group.push(CHARSET[idx] as char);
        }
        groups.push(group);
    }
    groups.join("-")
}

fn normalize_recovery_key(input: &str) -> String {
    let cleaned: String = input
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect();
    cleaned
        .as_bytes()
        .chunks(4)
        .map(|chunk| std::str::from_utf8(chunk).unwrap_or(""))
        .collect::<Vec<_>>()
        .join("-")
}

fn derive_recovery_kek(formatted_key: &str) -> Result<String, CryptoError> {
    let normalized = normalize_recovery_key(formatted_key);
    let hk = Hkdf::<Sha256>::new(Some(DOMAIN_RECOVERY_KEK), normalized.as_bytes());
    let mut key = [0u8; 32];
    hk.expand(DOMAIN_RECOVERY_KEK, &mut key)
        .map_err(|_| CryptoError::KdfError("Recovery HKDF failed".into()))?;
    let b64 = B64.encode(key);
    key.zeroize();
    Ok(b64)
}

/// Derives a cryptographically separated 256-bit authentication proof key from the Emergency Recovery Key.
/// Sent to the server during registration/recovery-wrap (hashed via Argon2 on the server) and verified
/// on `POST /api/auth/recover` without ever exposing the Recovery KEK to the server.
pub fn derive_recovery_auth_key(formatted_key: &str) -> Result<String, CryptoError> {
    let normalized = normalize_recovery_key(formatted_key);
    let hk = Hkdf::<Sha256>::new(Some(DOMAIN_RECOVERY_AUTH_KEY), normalized.as_bytes());
    let mut key = [0u8; 32];
    hk.expand(DOMAIN_RECOVERY_AUTH_KEY, &mut key)
        .map_err(|_| CryptoError::KdfError("Recovery AuthKey HKDF failed".into()))?;
    let b64 = B64.encode(key);
    key.zeroize();
    Ok(b64)
}

fn aes_gcm_encrypt_raw(key_b64: &str, plaintext: &[u8], aad: &[u8]) -> Result<String, CryptoError> {
    let mut key_bytes = B64
        .decode(key_b64)
        .map_err(|e| CryptoError::Base64Error(e.to_string()))?;
    if key_bytes.len() != 32 {
        key_bytes.zeroize();
        return Err(CryptoError::InvalidLength);
    }

    let cipher_res = Aes256Gcm::new_from_slice(&key_bytes);
    key_bytes.zeroize();
    let cipher = cipher_res.map_err(|_| CryptoError::InvalidLength)?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(
            nonce,
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| CryptoError::EncryptionFailed)?;

    Ok(format!(
        "v1:{}:{}",
        B64.encode(nonce_bytes),
        B64.encode(ciphertext)
    ))
}

fn aes_gcm_decrypt_raw(key_b64: &str, envelope: &str, aad: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let parts: Vec<&str> = envelope.split(':').collect();
    if parts.len() != 3 || parts[0] != "v1" {
        return Err(CryptoError::UnsupportedFormat);
    }

    let mut key_bytes = B64
        .decode(key_b64)
        .map_err(|e| CryptoError::Base64Error(e.to_string()))?;
    if key_bytes.len() != 32 {
        key_bytes.zeroize();
        return Err(CryptoError::InvalidLength);
    }

    let nonce_bytes = match B64.decode(parts[1]) {
        Ok(b) if b.len() == 12 => b,
        Ok(_) => {
            key_bytes.zeroize();
            return Err(CryptoError::InvalidLength);
        }
        Err(e) => {
            key_bytes.zeroize();
            return Err(CryptoError::Base64Error(e.to_string()));
        }
    };

    let ciphertext = match B64.decode(parts[2]) {
        Ok(c) => c,
        Err(e) => {
            key_bytes.zeroize();
            return Err(CryptoError::Base64Error(e.to_string()));
        }
    };

    let cipher_res = Aes256Gcm::new_from_slice(&key_bytes);
    key_bytes.zeroize();
    let cipher = cipher_res.map_err(|_| CryptoError::InvalidLength)?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    cipher
        .decrypt(
            nonce,
            Payload {
                msg: &ciphertext,
                aad,
            },
        )
        .map_err(|_| CryptoError::DecryptionFailed)
}

/// Encrypts an arbitrary payload for ephemeral transit between browser and desktop app.
/// Format: `v1:<nonce_b64>:<ciphertext_b64>`
pub fn encrypt_transit_payload(key: &[u8; 32], plaintext: &str) -> Result<String, CryptoError> {
    use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| CryptoError::InvalidLength)?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(
            nonce,
            Payload {
                msg: plaintext.as_bytes(),
                aad: b"gradus21:desktop-auth:v1",
            },
        )
        .map_err(|_| CryptoError::EncryptionFailed)?;

    Ok(format!("v1:{}:{}", B64.encode(nonce_bytes), B64.encode(ciphertext)))
}

/// Decrypts an ephemeral transit payload.
pub fn decrypt_transit_payload(key: &[u8; 32], envelope: &str) -> Result<String, CryptoError> {
    use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
    let parts: Vec<&str> = envelope.split(':').collect();
    if parts.len() != 3 || parts[0] != "v1" {
        return Err(CryptoError::UnsupportedFormat);
    }

    let nonce_bytes = match B64.decode(parts[1]) {
        Ok(b) if b.len() == 12 => b,
        _ => return Err(CryptoError::InvalidLength),
    };

    let ciphertext = match B64.decode(parts[2]) {
        Ok(c) => c,
        Err(e) => return Err(CryptoError::Base64Error(e.to_string())),
    };

    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| CryptoError::InvalidLength)?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let decrypted = cipher
        .decrypt(
            nonce,
            Payload {
                msg: &ciphertext,
                aad: b"gradus21:desktop-auth:v1",
            },
        )
        .map_err(|_| CryptoError::DecryptionFailed)?;

    String::from_utf8(decrypted).map_err(|_| CryptoError::DecryptionFailed)
}
