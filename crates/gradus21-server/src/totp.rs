use hmac::{Hmac, Mac};
use rand::RngCore;
use sha1::Sha1;
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

type HmacSha1 = Hmac<Sha1>;

static LAST_USED_TOTP_STEP: OnceLock<Mutex<HashMap<Uuid, u64>>> = OnceLock::new();

fn used_steps_map() -> &'static Mutex<HashMap<Uuid, u64>> {
    LAST_USED_TOTP_STEP.get_or_init(|| Mutex::new(HashMap::new()))
}

const BASE32_ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/// Generates a random 20-byte (160-bit) TOTP secret encoded as Base32 (RFC 4648)
pub fn generate_totp_secret_base32() -> String {
    let mut bytes = [0u8; 20];
    rand::thread_rng().fill_bytes(&mut bytes);
    base32_encode(&bytes)
}

/// Builds a standard `otpauth://totp/...` URI for QR code scanners (Bitwarden, Google Authenticator, Aegis, Apple Passwords)
pub fn build_otpauth_uri(email: &str, secret_base32: &str) -> String {
    format!(
        "otpauth://totp/Gradus21:{}?secret={}&issuer=Gradus21",
        url_encode(email),
        secret_base32
    )
}

/// Verifies initial QR-code enrollment before 2FA is active (`totp_enabled == false`).
/// Does not consume the login replay counter so the user can immediately test logging in
/// after completing setup. All authentication & step-up endpoints MUST use `verify_totp_code_once`.
pub fn verify_totp_enrollment_code(secret_base32: &str, code: &str) -> bool {
    match_totp_step(secret_base32, code).is_some()
}

/// Verifies a 6-digit TOTP code and enforces RFC 6238 §5.2 single-use replay protection per user.
///
/// Architectural Invariant (I-1): Every login and step-up authentication endpoint MUST call
/// `verify_totp_code_once` so that a captured TOTP code can never be replayed.
pub fn verify_totp_code_once(user_id: Uuid, secret_base32: &str, code: &str) -> bool {
    let Some(matched_step) = match_totp_step(secret_base32, code) else {
        return false;
    };
    let mut map = used_steps_map().lock().unwrap();
    if map.len() >= 2048 {
        map.retain(|_, &mut step| step.saturating_add(4) >= matched_step);
    }
    if let Some(&last_step) = map.get(&user_id) {
        if matched_step <= last_step {
            return false;
        }
    }
    map.insert(user_id, matched_step);
    true
}

/// Clears stored TOTP replay state for a user (when 2FA is reconfigured or disabled).
pub fn clear_totp_replay_state(user_id: Uuid) {
    let mut map = used_steps_map().lock().unwrap();
    map.remove(&user_id);
}

/// Clears all stored TOTP replay states (e.g. after full system backup restore).
pub fn clear_all_totp_replay_state() {
    let mut map = used_steps_map().lock().unwrap();
    map.clear();
}

fn match_totp_step(secret_base32: &str, code: &str) -> Option<u64> {
    let cleaned_code = code.trim();
    if cleaned_code.len() != 6 || !cleaned_code.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let Ok(code_num) = cleaned_code.parse::<u32>() else {
        return None;
    };
    let secret_bytes = base32_decode(secret_base32)?;

    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let current_step = now_secs / 30;

    for offset in [-1i64, 0, 1] {
        let step = (current_step as i64 + offset) as u64;
        if compute_hotp(&secret_bytes, step) == code_num {
            return Some(step);
        }
    }
    None
}

/// Computes current 6-digit TOTP code (restricted to unit tests only)
#[cfg(test)]
pub fn current_totp_code(secret_base32: &str) -> Option<String> {
    let secret_bytes = base32_decode(secret_base32)?;
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let code = compute_hotp(&secret_bytes, now_secs / 30);
    Some(format!("{:06}", code))
}

fn compute_hotp(secret: &[u8], counter: u64) -> u32 {
    let counter_bytes = counter.to_be_bytes();
    let mut mac = HmacSha1::new_from_slice(secret).expect("HMAC accepts any key size");
    mac.update(&counter_bytes);
    let result = mac.finalize().into_bytes();

    let offset = (result[19] & 0x0f) as usize;
    let binary = ((result[offset] as u32 & 0x7f) << 24)
        | ((result[offset + 1] as u32) << 16)
        | ((result[offset + 2] as u32) << 8)
        | (result[offset + 3] as u32);

    binary % 1_000_000
}

fn base32_encode(data: &[u8]) -> String {
    let mut out = String::new();
    let mut buffer = 0u32;
    let mut bits_left = 0;
    for &b in data {
        buffer = (buffer << 8) | (b as u32);
        bits_left += 8;
        while bits_left >= 5 {
            bits_left -= 5;
            let idx = ((buffer >> bits_left) & 0x1f) as usize;
            out.push(BASE32_ALPHABET[idx] as char);
        }
    }
    if bits_left > 0 {
        let idx = ((buffer << (5 - bits_left)) & 0x1f) as usize;
        out.push(BASE32_ALPHABET[idx] as char);
    }
    out
}

fn base32_decode(input: &str) -> Option<Vec<u8>> {
    let mut buffer = 0u32;
    let mut bits_left = 0;
    let mut out = Vec::new();
    for c in input.chars() {
        if c == '=' || c == ' ' || c == '-' {
            continue;
        }
        let val = match c.to_ascii_uppercase() {
            'A'..='Z' => (c.to_ascii_uppercase() as u8 - b'A') as u32,
            '2'..='7' => (c as u8 - b'2' + 26) as u32,
            _ => return None,
        };
        buffer = (buffer << 5) | val;
        bits_left += 5;
        if bits_left >= 8 {
            bits_left -= 8;
            out.push(((buffer >> bits_left) & 0xff) as u8);
        }
    }
    Some(out)
}

fn url_encode(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            _ => format!("%{:02X}", c as u32),
        })
        .collect()
}
