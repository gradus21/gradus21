use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2,
};
use axum::http::{HeaderMap, StatusCode};
use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use uuid::Uuid;

use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct JwtClaims {
    pub sub: String,
    pub email: String,
    #[serde(default)]
    pub is_admin: bool,
    pub two_factor_verified: bool,
    pub exp: usize,
}

pub fn extract_client_ip(headers: &HeaderMap) -> String {
    headers
        .get("x-real-ip")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            headers
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.split(',').next_back())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        })
        .unwrap_or_else(|| "local".to_string())
}

pub fn check_auth_rate_limit(state: &AppState, key: &str) -> Result<(), (StatusCode, String)> {
    const WINDOW: Duration = Duration::from_secs(60);
    const MAX_ATTEMPTS: usize = 12;

    let now = Instant::now();
    let mut map = state.auth_rate_limits.write().unwrap();

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

    let sanitized_key = if key.len() > 128 { &key[..128] } else { key };
    let entry = map.entry(sanitized_key.to_string()).or_default();
    entry.retain(|t| now.duration_since(*t) < WINDOW);
    if entry.len() >= MAX_ATTEMPTS {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            "Zu viele Anmeldeversuche. Bitte warte eine Minute.".into(),
        ));
    }
    entry.push(now);
    Ok(())
}

pub fn hash_client_key(key_b64: &str) -> Result<String, (StatusCode, String)> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(key_b64.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub fn issue_jwt(
    secret: &str,
    user_id: Uuid,
    email: &str,
    is_admin: bool,
    two_factor_verified: bool,
) -> Result<String, (StatusCode, String)> {
    let exp = (Utc::now().timestamp() + 86400 * 7) as usize;
    let claims = JwtClaims {
        sub: user_id.to_string(),
        email: email.to_string(),
        is_admin,
        two_factor_verified,
        exp,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
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
        let users = state.mem_users.read().unwrap();
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
        }
        // Invariant I-6: Always synchronize mutable role/email claims from the live UserRecord
        // so demoted admins immediately lose privileges without waiting for 7-day JWT expiry.
        claims.is_admin = user.is_admin;
        claims.email = user.email.clone();
    }

    Ok(claims)
}

