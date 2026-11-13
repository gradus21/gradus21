use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2,
};
use axum::http::{HeaderMap, StatusCode};
use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{Duration, Instant};
use uuid::Uuid;

use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct JwtClaims {
    pub sub: String,
    pub email: String,
    #[serde(default)]
    pub is_admin: bool,
    #[serde(default)]
    pub two_factor_verified: bool,
    #[serde(default)]
    pub token_version: i32,
    pub exp: usize,
}

tokio::task_local! {
    pub static REQUEST_CLIENT_IP: String;
}

pub fn current_request_client_ip() -> String {
    REQUEST_CLIENT_IP
        .try_with(|ip| ip.clone())
        .unwrap_or_else(|_| "local".to_string())
}

pub async fn client_ip_middleware(
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let ip = extract_client_ip(req.headers());
    REQUEST_CLIENT_IP.scope(ip, next.run(req)).await
}

fn sanitize_ip_token(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.len() > 64 {
        return None;
    }
    if trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == ':' || c == '-')
    {
        Some(trimmed.to_string())
    } else {
        None
    }
}

pub fn extract_client_ip(headers: &HeaderMap) -> String {
    let trust_proxy = std::env::var("TRUST_PROXY_HEADERS")
        .map(|v| {
            let norm = v.trim().to_ascii_lowercase();
            norm != "false" && norm != "0" && norm != "no"
        })
        .unwrap_or(true);

    if !trust_proxy {
        return "local".to_string();
    }

    // Prefer the rightmost proxy-appended entry of X-Forwarded-For over X-Real-IP so that
    // if a reverse proxy appends to X-Forwarded-For without overwriting a client-supplied
    // X-Real-IP header, the client cannot spoof X-Real-IP to bypass rate limiting.
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next_back())
        .and_then(sanitize_ip_token)
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .and_then(sanitize_ip_token)
        })
        .unwrap_or_else(|| "local".to_string())
}

pub fn check_auth_rate_limit(state: &AppState, key: &str) -> Result<(), (StatusCode, String)> {
    let ip = current_request_client_ip();
    check_auth_rate_limit_with_ip(state, &ip, key)
}

pub fn check_auth_rate_limit_with_ip(
    state: &AppState,
    client_ip: &str,
    key: &str,
) -> Result<(), (StatusCode, String)> {
    const WINDOW: Duration = Duration::from_secs(60);
    const MAX_ATTEMPTS: usize = 12;
    const MAX_IP_GLOBAL_ATTEMPTS: usize = 36;
    const MAX_IP_VERIFY_ATTEMPTS: usize = 8;

    let now = Instant::now();
    let mut map = state.auth_rate_limits.write();

    // Prevent unbounded memory growth from random attacker email addresses without wiping active lockouts
    if map.len() > 1024 {
        map.retain(|_, timestamps| {
            timestamps.retain(|t| now.duration_since(*t) < WINDOW);
            !timestamps.is_empty()
        });
        while map.len() > 2048 {
            // Evict only the single entry with the oldest latest attempt, preserving active lockouts
            if let Some(oldest_key) = map
                .iter()
                .filter(|(_, ts)| ts.len() < MAX_ATTEMPTS)
                .min_by_key(|(_, ts)| ts.last().copied().unwrap_or(now))
                .or_else(|| {
                    map.iter()
                        .min_by_key(|(_, ts)| ts.last().copied().unwrap_or(now))
                })
                .map(|(k, _)| k.clone())
            {
                map.remove(&oldest_key);
            } else {
                break;
            }
        }
    }

    let clean_ip = sanitize_ip_token(client_ip).unwrap_or_else(|| "local".to_string());
    let effective_key = if clean_ip == "local" {
        key.to_string()
    } else {
        format!("ip:{}:{}", clean_ip, key)
    };

    // Long keys are hashed instead of byte-sliced: slicing a &str mid-codepoint panics (#47).
    let sanitized_key = if effective_key.len() > 128 {
        format!("sha256:{:x}", Sha256::digest(effective_key.as_bytes()))
    } else {
        effective_key
    };

    {
        let entry = map.entry(sanitized_key.clone()).or_default();
        entry.retain(|t| now.duration_since(*t) < WINDOW);
        if entry.len() >= MAX_ATTEMPTS {
            return Err((
                StatusCode::TOO_MANY_REQUESTS,
                "Zu viele Anmeldeversuche. Bitte warte eine Minute.".into(),
            ));
        }
    }

    // When a real client IP is present, also enforce a per-IP global auth budget (and a stricter
    // per-IP email-verification budget) so a single IP cannot brute-force across many accounts
    // or exhaust the email verification store.
    if clean_ip != "local" {
        if key.starts_with("verify_start:") {
            let ip_verify_key = format!("ip_verify_start:{}", clean_ip);
            let verify_entry = map.entry(ip_verify_key.clone()).or_default();
            verify_entry.retain(|t| now.duration_since(*t) < WINDOW);
            if verify_entry.len() >= MAX_IP_VERIFY_ATTEMPTS {
                return Err((
                    StatusCode::TOO_MANY_REQUESTS,
                    "Zu viele E-Mail-Verifikationsanfragen von dieser IP-Adresse. Bitte warte eine Minute.".into(),
                ));
            }
            verify_entry.push(now);
        }

        let ip_global_key = format!("ip_global:{}", clean_ip);
        let global_entry = map.entry(ip_global_key).or_default();
        global_entry.retain(|t| now.duration_since(*t) < WINDOW);
        if global_entry.len() >= MAX_IP_GLOBAL_ATTEMPTS {
            return Err((
                StatusCode::TOO_MANY_REQUESTS,
                "Zu viele Authentifizierungsanfragen von dieser IP-Adresse. Bitte warte eine Minute.".into(),
            ));
        }
        global_entry.push(now);
    }

    map.entry(sanitized_key).or_default().push(now);
    Ok(())
}

pub fn hash_client_key(key_b64: &str) -> Result<String, (StatusCode, String)> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(key_b64.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| {
            tracing::error!("Argon2 hashing error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Interner Fehler bei der Schlüsselverarbeitung".into(),
            )
        })
}

pub fn issue_jwt(
    secret: &str,
    user_id: Uuid,
    email: &str,
    is_admin: bool,
    two_factor_verified: bool,
) -> Result<String, (StatusCode, String)> {
    issue_jwt_with_version(secret, user_id, email, is_admin, two_factor_verified, 0)
}

pub fn issue_jwt_with_version(
    secret: &str,
    user_id: Uuid,
    email: &str,
    is_admin: bool,
    two_factor_verified: bool,
    token_version: i32,
) -> Result<String, (StatusCode, String)> {
    let exp = (Utc::now().timestamp() + 86400 * 7) as usize;
    let claims = JwtClaims {
        sub: user_id.to_string(),
        email: email.to_string(),
        is_admin,
        two_factor_verified,
        token_version,
        exp,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| {
        tracing::error!("JWT encoding error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Interner Fehler bei der Token-Erstellung".into(),
        )
    })
}

pub fn authenticate_request(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<JwtClaims, (StatusCode, String)> {
    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or((StatusCode::UNAUTHORIZED, "Authorization Header fehlt".into()))?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or((StatusCode::UNAUTHORIZED, "Bearer Token erwartet".into()))?;

    let token_data = decode::<JwtClaims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültiges oder abgelaufenes JWT".into()))?;

    let mut claims = token_data.claims;
    let uid = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige Benutzer-ID im JWT".into()))?;

    {
        // shortcut: in-memory user verification assumes single-node or startup-loaded users; upgrade authenticate_request to async and query PostgreSQL on cache misses for multi-replica horizontal scaling
        let users = state.mem_users.read();
        let Some(user) = users.get(&uid) else {
            return Err((
                StatusCode::UNAUTHORIZED,
                "Dieses Benutzerkonto existiert nicht mehr.".into(),
            ));
        };
        if !user.is_active {
            return Err((
                StatusCode::FORBIDDEN,
                "Dieses Benutzerkonto wurde von der Administration vorübergehend deaktiviert.".into(),
            ));
        };
        if claims.token_version != user.token_version {
            return Err((
                StatusCode::UNAUTHORIZED,
                "Sitzung abgelaufen oder Sicherheitsmerkmale wurden geändert. Bitte neu anmelden.".into(),
            ));
        }
        if user.totp_enabled && !claims.two_factor_verified {
            return Err((
                StatusCode::UNAUTHORIZED,
                "Zwei-Faktor-Authentifizierung für diese Sitzung erforderlich.".into(),
            ));
        }
        // Invariant I-6: Always synchronize mutable role/email claims from the live UserRecord
        // so demoted admins immediately lose privileges without waiting for 7-day JWT expiry.
        claims.is_admin = user.is_admin;
        claims.email = user.email.clone();
    }

    Ok(claims)
}

