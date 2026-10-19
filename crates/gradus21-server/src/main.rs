pub mod admin;
mod totp;

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    extract::{DefaultBodyLimit, Path, State},
    http::{HeaderMap, HeaderValue, StatusCode},
    routing::{delete, get, post, put},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chrono::{DateTime, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use gradus21_core::crypto::{decrypt_entity_envelope, encrypt_entity_envelope, KdfParams};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use std::{
    collections::HashMap,
    fs,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, RwLock},
    time::{Duration, Instant},
};
use tower_http::cors::{Any, CorsLayer};
use url::Url;
use uuid::Uuid;
use webauthn_rs::prelude::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPasskeyRecord {
    pub id: Uuid,
    pub user_id: Uuid,
    pub credential_id: String,
    pub passkey_label: String,
    pub passkey_encrypted_dek: String,
    #[serde(default)]
    pub passkey_prf_salt: Option<String>,
    #[serde(default)]
    pub passkey_data: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub last_used_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegalConfig {
    pub name: String,
    pub company: Option<String>,
    pub address: String,
    pub email: String,
    pub phone: Option<String>,
    pub representative: Option<String>,
    pub register: Option<String>,
    pub vat_id: Option<String>,
    pub hosting_provider: String,
    pub hosting_location: String,
    pub dpo_contact: Option<String>,
}

impl Default for LegalConfig {
    fn default() -> Self {
        Self {
            name: std::env::var("LEGAL_IMPRESSUM_NAME")
                .unwrap_or_else(|_| "Julian Kallidat".into()),
            company: std::env::var("LEGAL_IMPRESSUM_COMPANY").ok().filter(|s| !s.trim().is_empty()),
            address: std::env::var("LEGAL_IMPRESSUM_ADDRESS")
                .unwrap_or_else(|_| "Hardtstr. 6, 76467 Bietigheim, Deutschland".into()),
            email: std::env::var("LEGAL_IMPRESSUM_EMAIL")
                .unwrap_or_else(|_| "kontakt@gradus21.de".into()),
            phone: std::env::var("LEGAL_IMPRESSUM_PHONE").ok().filter(|s| !s.trim().is_empty()),
            representative: std::env::var("LEGAL_IMPRESSUM_REPRESENTATIVE").ok().filter(|s| !s.trim().is_empty()),
            register: std::env::var("LEGAL_IMPRESSUM_REGISTER").ok().filter(|s| !s.trim().is_empty()),
            vat_id: std::env::var("LEGAL_IMPRESSUM_VAT_ID").ok().filter(|s| !s.trim().is_empty()),
            hosting_provider: std::env::var("LEGAL_HOSTING_PROVIDER")
                .unwrap_or_else(|_| "Alfahosting GmbH".into()),
            hosting_location: std::env::var("LEGAL_HOSTING_LOCATION")
                .unwrap_or_else(|_| "Leipzig (Deutschland)".into()),
            dpo_contact: std::env::var("LEGAL_DPO_CONTACT").ok().filter(|s| !s.trim().is_empty()),
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub db: Option<PgPool>,
    pub disk_store_path: PathBuf,
    pub mem_users: Arc<RwLock<HashMap<Uuid, UserRecord>>>,
    pub mem_passkeys: Arc<RwLock<HashMap<Uuid, UserPasskeyRecord>>>,
    pub mem_envelopes: Arc<RwLock<HashMap<Uuid, EncryptedEnvelopeRecord>>>,
    pub mem_settings: Arc<RwLock<HashMap<String, serde_json::Value>>>,
    pub mem_global_templates: Arc<RwLock<HashMap<Uuid, admin::GlobalTemplateRecord>>>,
    pub auth_rate_limits: Arc<RwLock<HashMap<String, Vec<Instant>>>>,
    pub jwt_secret: String,
    pub server_encryption_key_b64: String,
    pub admin_emails: Vec<String>,
    pub enable_admin_panel: bool,
    pub webauthn: Arc<Webauthn>,
    pub reg_challenges: Arc<RwLock<HashMap<String, (Instant, PasskeyRegistration, Uuid)>>>,
    pub auth_challenges: Arc<RwLock<HashMap<String, (Instant, PasskeyAuthentication, Option<Uuid>)>>>,
    pub legal_config: LegalConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PersistentDiskStore {
    pub users: HashMap<Uuid, UserRecord>,
    #[serde(default)]
    pub passkeys: HashMap<Uuid, UserPasskeyRecord>,
    pub envelopes: HashMap<Uuid, EncryptedEnvelopeRecord>,
    #[serde(default)]
    pub system_settings: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub global_templates: HashMap<Uuid, admin::GlobalTemplateRecord>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRecord {
    pub id: Uuid,
    pub email: String,
    pub auth_key_hash: String,
    pub kdf_salt: String,
    pub kdf_params: KdfParams,
    pub encrypted_dek: String,
    pub recovery_encrypted_dek: String,
    #[serde(default)]
    pub recovery_auth_key_hash: String,
    pub totp_secret_server_encrypted: Option<String>,
    pub totp_enabled: bool,
    #[serde(default)]
    pub passkey_credential_id: Option<String>,
    #[serde(default)]
    pub passkey_label: Option<String>,
    #[serde(default)]
    pub passkey_encrypted_dek: Option<String>,
    #[serde(default)]
    pub passkey_prf_salt: Option<String>,
    pub ui_preferences: serde_json::Value,
    #[serde(default)]
    pub is_admin: bool,
    #[serde(default = "default_true")]
    pub is_active: bool,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub last_login_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedEnvelopeRecord {
    pub id: Uuid,
    pub owner_user_id: Uuid,
    pub entity_type: String,
    pub parent_id: Option<Uuid>,
    pub class_id: Option<Uuid>,
    pub encrypted_payload: String,
    pub version: i32,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JwtClaims {
    pub sub: String,
    pub email: String,
    #[serde(default)]
    pub is_admin: bool,
    pub two_factor_verified: bool,
    pub exp: usize,
}

#[derive(Deserialize)]
struct RegisterRequest {
    email: String,
    auth_key_b64: String,
    kdf_salt_b64: String,
    kdf_params: KdfParams,
    encrypted_dek: String,
    recovery_encrypted_dek: String,
    #[serde(default)]
    recovery_auth_key_b64: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct AuthResponse {
    pub token: String,
    pub user_id: Uuid,
    pub email: String,
    pub is_admin: bool,
    pub kdf_salt_b64: String,
    pub kdf_params: KdfParams,
    pub encrypted_dek: String,
    pub recovery_encrypted_dek: String,
    pub totp_enabled: bool,
    pub totp_setup_uri: Option<String>,
    pub totp_secret_base32: Option<String>,
    pub passkey_credential_id: Option<String>,
    pub passkey_label: Option<String>,
    pub passkey_encrypted_dek: Option<String>,
    pub passkey_prf_salt_b64: Option<String>,
    pub ui_preferences: serde_json::Value,
}

#[derive(Deserialize)]
struct SaltQueryRequest {
    email: String,
}

#[derive(Serialize)]
struct SaltQueryResponse {
    kdf_salt_b64: String,
    kdf_params: KdfParams,
    encrypted_dek: String,
    recovery_encrypted_dek: String,
    totp_enabled: bool,
    has_passkey: bool,
    passkey_label: Option<String>,
    passkey_prf_salt_b64: Option<String>,
}

#[derive(Deserialize)]
struct PasskeyRegisterRequest {
    credential_id: String,
    label: String,
    passkey_encrypted_dek: String,
    #[serde(default)]
    passkey_prf_salt_b64: Option<String>,
    kdf_salt_b64: Option<String>,
    encrypted_dek: Option<String>,
    recovery_encrypted_dek: Option<String>,
    #[serde(default)]
    recovery_auth_key_b64: Option<String>,
}

#[derive(Deserialize)]
struct PasskeyLoginRequest {
    email: Option<String>,
    credential_id: String,
}

#[derive(Deserialize)]
struct LoginRequest {
    email: String,
    auth_key_b64: String,
    totp_code: Option<String>,
}

#[derive(Deserialize)]
struct RecoverPasswordRequest {
    email: String,
    recovery_auth_key_b64: String,
    new_auth_key_b64: String,
    new_kdf_salt_b64: String,
    new_kdf_params: KdfParams,
    new_encrypted_dek: String,
    new_recovery_encrypted_dek: Option<String>,
    #[serde(default)]
    new_recovery_auth_key_b64: Option<String>,
}

#[derive(Deserialize)]
struct RotateRecoveryKeyRequest {
    recovery_encrypted_dek: String,
    recovery_auth_key_b64: String,
}

#[derive(Deserialize)]
struct VerifyTotpRequest {
    totp_code: String,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct UpsertEnvelopeRequest {
    pub id: Uuid,
    pub entity_type: String,
    pub parent_id: Option<Uuid>,
    pub class_id: Option<Uuid>,
    pub encrypted_payload: String,
    #[serde(default)]
    pub expected_version: Option<i32>,
}

pub type BatchUpsertItem = UpsertEnvelopeRequest;

#[derive(Deserialize)]
struct BatchSyncRequest {
    envelopes: Vec<BatchUpsertItem>,
}

fn check_auth_rate_limit(state: &AppState, key: &str) -> Result<(), (StatusCode, String)> {
    const WINDOW: Duration = Duration::from_secs(60);
    const MAX_ATTEMPTS: usize = 12;

    let now = Instant::now();
    let mut map = state.auth_rate_limits.write().unwrap();

    // Prevent unbounded memory growth from random attacker email addresses
    if map.len() > 1024 {
        map.retain(|_, timestamps| {
            timestamps.retain(|t| now.duration_since(*t) < WINDOW);
            !timestamps.is_empty()
        });
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

fn hash_client_key(key_b64: &str) -> Result<String, (StatusCode, String)> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(key_b64.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn ensure_pg_schema_and_load(
    pool: &PgPool,
    users_map: &mut HashMap<Uuid, UserRecord>,
    passkeys_map: &mut HashMap<Uuid, UserPasskeyRecord>,
    envelopes_map: &mut HashMap<Uuid, EncryptedEnvelopeRecord>,
    settings_map: &mut HashMap<String, serde_json::Value>,
    templates_map: &mut HashMap<Uuid, admin::GlobalTemplateRecord>,
) {
    let schema_queries = [
        r#"CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            auth_key_hash TEXT NOT NULL,
            kdf_salt TEXT NOT NULL,
            kdf_params JSONB NOT NULL DEFAULT '{"memory_kib": 19456, "iterations": 2, "parallelism": 1}',
            encrypted_dek TEXT NOT NULL,
            recovery_encrypted_dek TEXT NOT NULL,
            recovery_auth_key_hash TEXT NOT NULL DEFAULT '',
            totp_secret_server_encrypted TEXT,
            totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            passkey_credential_id TEXT,
            passkey_label TEXT,
            passkey_encrypted_dek TEXT,
            passkey_prf_salt TEXT,
            ui_preferences JSONB NOT NULL DEFAULT '{"theme": "teal", "mode": "light"}',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"#,
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_auth_key_hash TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS passkey_credential_id TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS passkey_label TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS passkey_encrypted_dek TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS passkey_prf_salt TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ",
        r#"CREATE TABLE IF NOT EXISTS user_passkeys (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            credential_id TEXT NOT NULL UNIQUE,
            passkey_label TEXT NOT NULL,
            passkey_encrypted_dek TEXT NOT NULL,
            passkey_prf_salt TEXT,
            passkey_data JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_used_at TIMESTAMPTZ
        )"#,
        "CREATE INDEX IF NOT EXISTS idx_user_passkeys_user ON user_passkeys (user_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_passkeys_cred ON user_passkeys (credential_id)",
        r#"CREATE TABLE IF NOT EXISTS encrypted_envelopes (
            id UUID PRIMARY KEY,
            owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            entity_type TEXT NOT NULL,
            parent_id UUID,
            class_id UUID,
            encrypted_payload TEXT NOT NULL,
            version INT NOT NULL DEFAULT 1,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"#,
        "CREATE INDEX IF NOT EXISTS idx_encrypted_envelopes_owner ON encrypted_envelopes (owner_user_id)",
        r#"CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"#,
        r#"CREATE TABLE IF NOT EXISTS grading_templates (
            id UUID PRIMARY KEY,
            owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            is_encrypted BOOLEAN NOT NULL DEFAULT TRUE,
            payload TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"#,
        "ALTER TABLE grading_templates ALTER COLUMN owner_user_id DROP NOT NULL",
    ];

    for q in schema_queries {
        if let Err(e) = sqlx::query(q).execute(pool).await {
            tracing::warn!("Schema initialization statement warning: {}", e);
        }
    }

    if let Ok(rows) = sqlx::query(
        "SELECT id, email, auth_key_hash, kdf_salt, kdf_params, encrypted_dek, recovery_encrypted_dek, recovery_auth_key_hash, totp_secret_server_encrypted, totp_enabled, passkey_credential_id, passkey_label, passkey_encrypted_dek, passkey_prf_salt, ui_preferences, is_admin, is_active, created_at, last_login_at FROM users",
    )
    .fetch_all(pool)
    .await
    {
        for row in rows {
            let id: Uuid = row.get("id");
            let kdf_params_val: serde_json::Value = row.get("kdf_params");
            let user = UserRecord {
                id,
                email: row.get("email"),
                auth_key_hash: row.get("auth_key_hash"),
                kdf_salt: row.get("kdf_salt"),
                kdf_params: serde_json::from_value(kdf_params_val).unwrap_or_default(),
                encrypted_dek: row.get("encrypted_dek"),
                recovery_encrypted_dek: row.get("recovery_encrypted_dek"),
                recovery_auth_key_hash: row.try_get("recovery_auth_key_hash").unwrap_or_default(),
                totp_secret_server_encrypted: row.get("totp_secret_server_encrypted"),
                totp_enabled: row.get("totp_enabled"),
                passkey_credential_id: row.try_get("passkey_credential_id").ok().flatten(),
                passkey_label: row.try_get("passkey_label").ok().flatten(),
                passkey_encrypted_dek: row.try_get("passkey_encrypted_dek").ok().flatten(),
                passkey_prf_salt: row.try_get("passkey_prf_salt").ok().flatten(),
                ui_preferences: row.get("ui_preferences"),
                is_admin: row.try_get("is_admin").unwrap_or(false),
                is_active: row.try_get("is_active").unwrap_or(true),
                created_at: row.try_get("created_at").ok(),
                last_login_at: row.try_get("last_login_at").ok(),
            };
            users_map.insert(id, user);
        }
    }

    if let Ok(rows) = sqlx::query(
        "SELECT id, user_id, credential_id, passkey_label, passkey_encrypted_dek, passkey_prf_salt, passkey_data, created_at, last_used_at FROM user_passkeys",
    )
    .fetch_all(pool)
    .await
    {
        for row in rows {
            let id: Uuid = row.get("id");
            let pk = UserPasskeyRecord {
                id,
                user_id: row.get("user_id"),
                credential_id: row.get("credential_id"),
                passkey_label: row.get("passkey_label"),
                passkey_encrypted_dek: row.get("passkey_encrypted_dek"),
                passkey_prf_salt: row.try_get("passkey_prf_salt").ok().flatten(),
                passkey_data: row.try_get("passkey_data").ok().flatten(),
                created_at: row.get("created_at"),
                last_used_at: row.try_get("last_used_at").ok().flatten(),
            };
            passkeys_map.insert(id, pk);
        }
    }

    // Auto-migrate legacy passkey from users into user_passkeys if not already present
    for user in users_map.values() {
        if let Some(cred_id) = &user.passkey_credential_id {
            if !cred_id.trim().is_empty() && !passkeys_map.values().any(|p| p.user_id == user.id && p.credential_id == *cred_id) {
                let pid = Uuid::new_v4();
                let label = user.passkey_label.clone().unwrap_or_else(|| "Passkey (Standard)".into());
                let enc_dek = user.passkey_encrypted_dek.clone().unwrap_or_else(|| user.encrypted_dek.clone());
                let rec = UserPasskeyRecord {
                    id: pid,
                    user_id: user.id,
                    credential_id: cred_id.clone(),
                    passkey_label: label,
                    passkey_encrypted_dek: enc_dek,
                    passkey_prf_salt: user.passkey_prf_salt.clone(),
                    passkey_data: None,
                    created_at: user.created_at.unwrap_or_else(Utc::now),
                    last_used_at: user.last_login_at,
                };
                passkeys_map.insert(pid, rec);
            }
        }
    }

    if let Ok(rows) = sqlx::query(
        "SELECT id, owner_user_id, entity_type, parent_id, class_id, encrypted_payload, version, updated_at FROM encrypted_envelopes",
    )
    .fetch_all(pool)
    .await
    {
        for row in rows {
            let id: Uuid = row.get("id");
            let env = EncryptedEnvelopeRecord {
                id,
                owner_user_id: row.get("owner_user_id"),
                entity_type: row.get("entity_type"),
                parent_id: row.get("parent_id"),
                class_id: row.get("class_id"),
                encrypted_payload: row.get("encrypted_payload"),
                version: row.get("version"),
                updated_at: row.get("updated_at"),
            };
            envelopes_map.insert(id, env);
        }
    }

    if let Ok(rows) = sqlx::query("SELECT key, value FROM system_settings").fetch_all(pool).await {
        for row in rows {
            let key: String = row.get("key");
            let val: serde_json::Value = row.get("value");
            settings_map.insert(key, val);
        }
    }

    if let Ok(rows) = sqlx::query(
        "SELECT id, payload, created_at, updated_at FROM grading_templates WHERE owner_user_id IS NULL AND is_encrypted = FALSE",
    )
    .fetch_all(pool)
    .await
    {
        for row in rows {
            let id: Uuid = row.get("id");
            let payload_str: String = row.get("payload");
            if let Ok(rec) = serde_json::from_str::<admin::GlobalTemplateRecord>(&payload_str) {
                templates_map.insert(id, rec);
            } else {
                let parsed: serde_json::Value = serde_json::from_str(&payload_str).unwrap_or_default();
                let title = parsed.get("title").and_then(|v| v.as_str()).unwrap_or("Globale Vorlage").to_string();
                let desc = parsed.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let template_type = parsed.get("template_type").and_then(|v| v.as_str()).unwrap_or("curve").to_string();
                let inner_payload = parsed.get("payload").cloned().unwrap_or(parsed);
                templates_map.insert(
                    id,
                    admin::GlobalTemplateRecord {
                        id,
                        template_type,
                        title,
                        description: desc,
                        payload: inner_payload,
                        created_at: row.get("created_at"),
                        updated_at: row.get("updated_at"),
                    },
                );
            }
        }
    }

    // Seed default global templates into PostgreSQL if not already present
    for default_tpl in admin::default_global_templates() {
        if let std::collections::hash_map::Entry::Vacant(e) = templates_map.entry(default_tpl.id) {
            let payload_str = serde_json::to_string(&default_tpl).unwrap_or_default();
            let _ = sqlx::query(
                r#"INSERT INTO grading_templates (id, owner_user_id, is_encrypted, payload, created_at, updated_at)
                VALUES ($1, NULL, FALSE, $2, $3, $4)
                ON CONFLICT (id) DO NOTHING"#,
            )
            .bind(default_tpl.id)
            .bind(payload_str)
            .bind(default_tpl.created_at)
            .bind(default_tpl.updated_at)
            .execute(pool)
            .await;
            e.insert(default_tpl);
        }
    }
}

pub async fn sync_user_to_pg(state: &AppState, user: &UserRecord) {
    let Some(pool) = &state.db else {
        return;
    };
    let kdf_params_json = serde_json::to_value(&user.kdf_params).unwrap_or_default();
    if let Err(e) = sqlx::query(
        r#"INSERT INTO users (
            id, email, auth_key_hash, kdf_salt, kdf_params, encrypted_dek,
            recovery_encrypted_dek, recovery_auth_key_hash, totp_secret_server_encrypted,
            totp_enabled, passkey_credential_id, passkey_label, passkey_encrypted_dek,
            passkey_prf_salt, ui_preferences, is_admin, is_active, last_login_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
        ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            auth_key_hash = EXCLUDED.auth_key_hash,
            kdf_salt = EXCLUDED.kdf_salt,
            kdf_params = EXCLUDED.kdf_params,
            encrypted_dek = EXCLUDED.encrypted_dek,
            recovery_encrypted_dek = EXCLUDED.recovery_encrypted_dek,
            recovery_auth_key_hash = EXCLUDED.recovery_auth_key_hash,
            totp_secret_server_encrypted = EXCLUDED.totp_secret_server_encrypted,
            totp_enabled = EXCLUDED.totp_enabled,
            passkey_credential_id = EXCLUDED.passkey_credential_id,
            passkey_label = EXCLUDED.passkey_label,
            passkey_encrypted_dek = EXCLUDED.passkey_encrypted_dek,
            passkey_prf_salt = EXCLUDED.passkey_prf_salt,
            ui_preferences = EXCLUDED.ui_preferences,
            is_admin = EXCLUDED.is_admin,
            is_active = EXCLUDED.is_active,
            last_login_at = EXCLUDED.last_login_at,
            updated_at = NOW()"#,
    )
    .bind(user.id)
    .bind(&user.email)
    .bind(&user.auth_key_hash)
    .bind(&user.kdf_salt)
    .bind(kdf_params_json)
    .bind(&user.encrypted_dek)
    .bind(&user.recovery_encrypted_dek)
    .bind(&user.recovery_auth_key_hash)
    .bind(&user.totp_secret_server_encrypted)
    .bind(user.totp_enabled)
    .bind(&user.passkey_credential_id)
    .bind(&user.passkey_label)
    .bind(&user.passkey_encrypted_dek)
    .bind(&user.passkey_prf_salt)
    .bind(&user.ui_preferences)
    .bind(user.is_admin)
    .bind(user.is_active)
    .bind(user.last_login_at)
    .execute(pool)
    .await
    {
        tracing::error!("Failed to sync user {} to PostgreSQL: {}", user.id, e);
    }
}

async fn sync_envelope_to_pg(state: &AppState, env: &EncryptedEnvelopeRecord) {
    let Some(pool) = &state.db else {
        return;
    };
    if let Err(e) = sqlx::query(
        r#"INSERT INTO encrypted_envelopes (
            id, owner_user_id, entity_type, parent_id, class_id, encrypted_payload, version, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
            entity_type = EXCLUDED.entity_type,
            parent_id = EXCLUDED.parent_id,
            class_id = EXCLUDED.class_id,
            encrypted_payload = EXCLUDED.encrypted_payload,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at"#,
    )
    .bind(env.id)
    .bind(env.owner_user_id)
    .bind(&env.entity_type)
    .bind(env.parent_id)
    .bind(env.class_id)
    .bind(&env.encrypted_payload)
    .bind(env.version)
    .bind(env.updated_at)
    .execute(pool)
    .await
    {
        tracing::error!("Failed to sync envelope {} to PostgreSQL: {}", env.id, e);
    }
}

async fn delete_envelope_from_pg(state: &AppState, id: Uuid, owner_id: Uuid) {
    let Some(pool) = &state.db else {
        return;
    };
    if let Err(e) = sqlx::query("DELETE FROM encrypted_envelopes WHERE id = $1 AND owner_user_id = $2")
        .bind(id)
        .bind(owner_id)
        .execute(pool)
        .await
    {
        tracing::error!("Failed to delete envelope {} from PostgreSQL: {}", id, e);
    }
}

async fn delete_all_envelopes_from_pg(state: &AppState, owner_id: Uuid) {
    let Some(pool) = &state.db else {
        return;
    };
    if let Err(e) = sqlx::query("DELETE FROM encrypted_envelopes WHERE owner_user_id = $1")
        .bind(owner_id)
        .execute(pool)
        .await
    {
        tracing::error!("Failed to delete all envelopes for user {} from PostgreSQL: {}", owner_id, e);
    }
}

pub fn create_webauthn() -> Arc<Webauthn> {
    let rp_id = std::env::var("WEBAUTHN_RP_ID").unwrap_or_else(|_| "localhost".into());
    let rp_name = std::env::var("WEBAUTHN_RP_NAME").unwrap_or_else(|_| "Gradus21".into());
    let rp_origin_str = std::env::var("WEBAUTHN_RP_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".into());
    let rp_origin = Url::parse(&rp_origin_str).unwrap_or_else(|_| Url::parse("http://localhost:5173").unwrap());

    let mut builder = WebauthnBuilder::new(&rp_id, &rp_origin)
        .expect("Fehler bei der Initialisierung von WebauthnBuilder")
        .rp_name(&rp_name);

    if let Ok(allowed_origins_str) = std::env::var("WEBAUTHN_ALLOWED_ORIGINS") {
        for orig_str in allowed_origins_str.split(',') {
            let trimmed = orig_str.trim();
            if !trimmed.is_empty() {
                if let Ok(u) = Url::parse(trimmed) {
                    if u != rp_origin {
                        builder = builder.append_allowed_origin(&u);
                    }
                }
            }
        }
    } else {
        for default_orig in &["http://localhost:5173", "http://localhost:3080", "http://127.0.0.1:5173", "http://127.0.0.1:3080"] {
            if let Ok(u) = Url::parse(default_orig) {
                if u != rp_origin {
                    builder = builder.append_allowed_origin(&u);
                }
            }
        }
    }

    Arc::new(builder.build().expect("Fehler beim Erstellen der Webauthn-Instanz"))
}

pub async fn sync_passkey_to_pg(state: &AppState, pk: &UserPasskeyRecord) {
    let Some(pool) = &state.db else {
        return;
    };
    if let Err(e) = sqlx::query(
        r#"INSERT INTO user_passkeys (
            id, user_id, credential_id, passkey_label, passkey_encrypted_dek,
            passkey_prf_salt, passkey_data, created_at, last_used_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
            passkey_label = EXCLUDED.passkey_label,
            passkey_encrypted_dek = EXCLUDED.passkey_encrypted_dek,
            passkey_prf_salt = EXCLUDED.passkey_prf_salt,
            passkey_data = EXCLUDED.passkey_data,
            last_used_at = EXCLUDED.last_used_at"#,
    )
    .bind(pk.id)
    .bind(pk.user_id)
    .bind(&pk.credential_id)
    .bind(&pk.passkey_label)
    .bind(&pk.passkey_encrypted_dek)
    .bind(&pk.passkey_prf_salt)
    .bind(&pk.passkey_data)
    .bind(pk.created_at)
    .bind(pk.last_used_at)
    .execute(pool)
    .await
    {
        tracing::error!("Failed to sync passkey {} to PostgreSQL: {}", pk.id, e);
    }
}

pub async fn delete_passkey_from_pg(state: &AppState, id: Uuid) {
    let Some(pool) = &state.db else {
        return;
    };
    if let Err(e) = sqlx::query("DELETE FROM user_passkeys WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
    {
        tracing::error!("Failed to delete passkey {} from PostgreSQL: {}", id, e);
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info,gradus21_server=debug".into()),
        )
        .init();

    let jwt_secret = match std::env::var("JWT_SECRET") {
        Ok(s) if !s.trim().is_empty() => s,
        _ => {
            tracing::warn!("JWT_SECRET not set — using development fallback secret. Set JWT_SECRET in production!");
            "gradus21_jwt_signing_secret_2026_zero_knowledge".into()
        }
    };

    let raw_server_key = match std::env::var("SERVER_ENCRYPTION_KEY") {
        Ok(s) if !s.trim().is_empty() => s,
        _ => {
            tracing::warn!("SERVER_ENCRYPTION_KEY not set — using development fallback key. Set SERVER_ENCRYPTION_KEY in production!");
            "0123456789abcdef0123456789abcdef".into()
        }
    };
    let key_digest = Sha256::digest(raw_server_key.as_bytes());
    let server_encryption_key_b64 = B64.encode(key_digest);

    let disk_store_path = PathBuf::from(
        std::env::var("VAULT_STORE_PATH").unwrap_or_else(|_| "./data/vault_store.json".into()),
    );
    if let Some(parent) = disk_store_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let mut initial_disk: PersistentDiskStore = if disk_store_path.exists() {
        fs::read_to_string(&disk_store_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        PersistentDiskStore::default()
    };

    let db = if let Ok(db_url) = std::env::var("DATABASE_URL") {
        match PgPoolOptions::new().max_connections(10).connect(&db_url).await {
            Ok(pool) => {
                tracing::info!("Connected to PostgreSQL database; ensuring schema and loading records");
                ensure_pg_schema_and_load(
                    &pool,
                    &mut initial_disk.users,
                    &mut initial_disk.passkeys,
                    &mut initial_disk.envelopes,
                    &mut initial_disk.system_settings,
                    &mut initial_disk.global_templates,
                )
                .await;
                Some(pool)
            }
            Err(e) => {
                tracing::warn!(
                    "PostgreSQL not reachable ({}), using persistent disk vault at {:?}",
                    e,
                    disk_store_path
                );
                None
            }
        }
    } else {
        tracing::info!(
            "Using persistent disk Encrypted Vault store at {:?} ({} users, {} envelopes)",
            disk_store_path,
            initial_disk.users.len(),
            initial_disk.envelopes.len()
        );
        None
    };

    // Migrate legacy passkeys from users into initial_disk.passkeys if not already present
    for user in initial_disk.users.values() {
        if let Some(cred_id) = &user.passkey_credential_id {
            if !cred_id.trim().is_empty()
                && !initial_disk.passkeys.values().any(|p| p.user_id == user.id && p.credential_id == *cred_id)
            {
                let pid = Uuid::new_v4();
                let label = user.passkey_label.clone().unwrap_or_else(|| "Passkey (Standard)".into());
                let enc_dek = user.passkey_encrypted_dek.clone().unwrap_or_else(|| user.encrypted_dek.clone());
                let rec = UserPasskeyRecord {
                    id: pid,
                    user_id: user.id,
                    credential_id: cred_id.clone(),
                    passkey_label: label,
                    passkey_encrypted_dek: enc_dek,
                    passkey_prf_salt: user.passkey_prf_salt.clone(),
                    passkey_data: None,
                    created_at: user.created_at.unwrap_or_else(Utc::now),
                    last_used_at: user.last_login_at,
                };
                initial_disk.passkeys.insert(pid, rec);
            }
        }
    }

    let admin_emails: Vec<String> = std::env::var("ADMIN_EMAILS")
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();

    let enable_admin_panel = std::env::var("ENABLE_ADMIN_PANEL")
        .map(|v| v.trim() != "false" && v.trim() != "0")
        .unwrap_or(true);

    // Ensure all default global templates are present in memory/disk
    for default_tpl in admin::default_global_templates() {
        initial_disk.global_templates.entry(default_tpl.id).or_insert(default_tpl);
    }

    let webauthn = create_webauthn();

    let legal_config = LegalConfig::default();

    let state = AppState {
        db,
        disk_store_path,
        mem_users: Arc::new(RwLock::new(initial_disk.users)),
        mem_passkeys: Arc::new(RwLock::new(initial_disk.passkeys)),
        mem_envelopes: Arc::new(RwLock::new(initial_disk.envelopes)),
        mem_settings: Arc::new(RwLock::new(initial_disk.system_settings)),
        mem_global_templates: Arc::new(RwLock::new(initial_disk.global_templates)),
        auth_rate_limits: Arc::new(RwLock::new(HashMap::new())),
        jwt_secret,
        server_encryption_key_b64,
        admin_emails,
        enable_admin_panel,
        webauthn,
        reg_challenges: Arc::new(RwLock::new(HashMap::new())),
        auth_challenges: Arc::new(RwLock::new(HashMap::new())),
        legal_config,
    };

    // Spawn background tasks (Automated snapshot scheduler & retention)
    tokio::spawn(admin::start_backup_scheduler(state.clone()));

    let cors = if let Ok(origin) = std::env::var("CORS_ALLOWED_ORIGIN") {
        if let Ok(header_val) = origin.parse::<HeaderValue>() {
            CorsLayer::new()
                .allow_origin(header_val)
                .allow_methods(Any)
                .allow_headers(Any)
        } else {
            CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any)
        }
    } else {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
    };

    let app = Router::new()
        .route("/api/health", get(health_check))
        .route("/api/legal/info", get(get_legal_info))
        .route("/api/auth/salt", post(get_user_salt))
        .route("/api/auth/register", post(register_user))
        .route("/api/auth/login", post(login_user))
        .route("/api/auth/recover", post(recover_password))
        .route("/api/auth/recovery/rotate", post(rotate_recovery_key))
        .route("/api/auth/passkey/register/start", post(passkey_register_start))
        .route("/api/auth/passkey/register/finish", post(passkey_register_finish))
        .route("/api/auth/passkey/login/start", post(passkey_login_start))
        .route("/api/auth/passkey/login/finish", post(passkey_login_finish))
        .route("/api/auth/passkey/list", get(list_user_passkeys))
        .route(
            "/api/auth/passkey/:id",
            delete(delete_user_passkey_by_id).patch(rename_user_passkey),
        )
        .route("/api/auth/passkey/register", post(register_passkey))
        .route("/api/auth/passkey/login", post(login_with_passkey))
        .route("/api/auth/passkey", delete(delete_passkey))
        .route("/api/auth/2fa/setup", get(get_2fa_setup_info))
        .route("/api/auth/2fa/verify", post(verify_and_enable_2fa))
        .route("/api/auth/2fa/reconfigure", post(reconfigure_2fa))
        .route("/api/auth/2fa/disable", post(disable_2fa))
        .route(
            "/api/envelopes",
            get(list_envelopes)
                .post(upsert_envelope)
                .delete(delete_all_user_envelopes),
        )
        .route("/api/envelopes/sync", get(list_envelopes))
        .route("/api/envelopes/batch", post(batch_sync_envelopes))
        .route("/api/envelopes/:id", delete(delete_envelope))
        .route("/api/preferences", put(update_preferences))
        // Admin & Global Template routes:
        .route("/api/templates", get(admin::list_global_templates))
        .route("/api/admin/users", get(admin::list_users))
        .route("/api/admin/users/invite", post(admin::invite_user))
        .route(
            "/api/admin/users/:id",
            delete(admin::delete_user).patch(admin::update_user_status),
        )
        .route(
            "/api/admin/users/:id/status",
            post(admin::update_user_status).patch(admin::update_user_status),
        )
        .route("/api/admin/backups", get(admin::list_backups))
        .route("/api/admin/backups/create", post(admin::create_backup_snapshot))
        .route("/api/admin/backups/snapshot", post(admin::create_backup_snapshot))
        .route(
            "/api/admin/backups/download/:filename",
            get(admin::download_backup),
        )
        .route("/api/admin/backups/restore", post(admin::restore_backup))
        .route(
            "/api/admin/backups/config",
            get(admin::get_backup_config)
                .put(admin::update_backup_config)
                .post(admin::update_backup_config),
        )
        .route(
            "/api/admin/backups/schedule",
            get(admin::get_backup_config)
                .put(admin::update_backup_config)
                .post(admin::update_backup_config),
        )
        .route(
            "/api/admin/templates",
            get(admin::list_global_templates).post(admin::create_global_template),
        )
        .route(
            "/api/admin/templates/:id",
            put(admin::update_global_template).delete(admin::delete_global_template),
        )
        .route(
            "/api/admin/smtp",
            get(admin::get_smtp_config)
                .put(admin::update_smtp_config)
                .post(admin::update_smtp_config),
        )
        .route("/api/admin/smtp/test", post(admin::test_smtp))
        .route(
            "/api/admin/mail-templates",
            get(admin::list_mail_templates)
                .post(admin::save_all_mail_templates)
                .put(admin::save_all_mail_templates),
        )
        .route(
            "/api/admin/mail-templates/:id",
            put(admin::update_mail_template),
        )
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024))
        .layer(cors)
        .with_state(state);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Gradus21 Zero-Knowledge API listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

pub fn persist_to_disk(state: &AppState) {
    let users = state.mem_users.read().unwrap().clone();
    let passkeys = state.mem_passkeys.read().unwrap().clone();
    let envelopes = state.mem_envelopes.read().unwrap().clone();
    let system_settings = state.mem_settings.read().unwrap().clone();
    let global_templates = state.mem_global_templates.read().unwrap().clone();
    let store = PersistentDiskStore {
        users,
        passkeys,
        envelopes,
        system_settings,
        global_templates,
    };
    if let Ok(json) = serde_json::to_string_pretty(&store) {
        let tmp_path = state.disk_store_path.with_extension("json.tmp");
        if let Err(e) = fs::write(&tmp_path, json) {
            tracing::error!("Failed to write temporary vault store {:?}: {}", tmp_path, e);
            return;
        }
        if let Err(e) = fs::rename(&tmp_path, &state.disk_store_path) {
            tracing::error!(
                "Failed to atomically rename {:?} to {:?}: {}",
                tmp_path,
                state.disk_store_path,
                e
            );
        }
    }
}

async fn health_check(State(state): State<AppState>) -> Json<serde_json::Value> {
    let user_count = state.mem_users.read().unwrap().len();
    let env_count = state.mem_envelopes.read().unwrap().len();
    Json(serde_json::json!({
        "status": "ok",
        "service": "gradus21-server",
        "zero_knowledge_e2ee": true,
        "storage_mode": if state.db.is_some() { "postgresql" } else { "persistent_disk_vault" },
        "registered_users": user_count,
        "stored_envelopes": env_count
    }))
}

async fn get_legal_info(State(state): State<AppState>) -> Json<LegalConfig> {
    Json(state.legal_config.clone())
}

async fn get_user_salt(
    State(state): State<AppState>,
    Json(req): Json<SaltQueryRequest>,
) -> Result<Json<SaltQueryResponse>, (StatusCode, String)> {
    let email = req.email.trim().to_lowercase();
    check_auth_rate_limit(&state, &format!("salt:{}", email))?;

    if let Some(u) = find_user_by_email(&state, &email).await {
        let (has_passkey, passkey_label, passkey_prf_salt_b64) = {
            let pks = state.mem_passkeys.read().unwrap();
            let user_pks: Vec<_> = pks.values().filter(|p| p.user_id == u.id).collect();
            if !user_pks.is_empty() {
                let primary = user_pks
                    .iter()
                    .find(|p| u.passkey_credential_id.as_deref() == Some(&p.credential_id))
                    .or_else(|| user_pks.first())
                    .unwrap();
                (
                    true,
                    Some(primary.passkey_label.clone()),
                    primary.passkey_prf_salt.clone(),
                )
            } else {
                (
                    u.passkey_credential_id.is_some(),
                    u.passkey_label.clone(),
                    u.passkey_prf_salt.clone(),
                )
            }
        };

        return Ok(Json(SaltQueryResponse {
            kdf_salt_b64: u.kdf_salt,
            kdf_params: u.kdf_params,
            encrypted_dek: u.encrypted_dek,
            recovery_encrypted_dek: u.recovery_encrypted_dek,
            totp_enabled: u.totp_enabled,
            has_passkey,
            passkey_label,
            passkey_prf_salt_b64,
        }));
    }

    Err((StatusCode::NOT_FOUND, "Kein Tresor unter dieser E-Mail gefunden".into()))
}

async fn register_user(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let email = req.email.trim().to_lowercase();
    check_auth_rate_limit(&state, &format!("register:{}", email))?;

    let auth_key_hash = hash_client_key(&req.auth_key_b64)?;
    let recovery_auth_key_hash = match req
        .recovery_auth_key_b64
        .as_deref()
        .filter(|s| !s.trim().is_empty())
    {
        Some(rec_key) => hash_client_key(rec_key)?,
        None => String::new(),
    };

    let user_id = Uuid::new_v4();
    let totp_secret_b32 = totp::generate_totp_secret_base32();
    let totp_uri = totp::build_otpauth_uri(&email, &totp_secret_b32);

    let totp_encrypted = encrypt_entity_envelope(
        &state.server_encryption_key_b64,
        "server",
        &user_id.to_string(),
        &totp_secret_b32,
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let ui_prefs = serde_json::json!({ "theme": "teal", "mode": "light" });

    let is_first_user = {
        let users = state.mem_users.read().unwrap();
        users.is_empty()
    };
    let is_admin = is_first_user || state.admin_emails.contains(&email);
    let is_active = true;
    let now = Utc::now();

    let new_user = {
        let mut users = state.mem_users.write().unwrap();
        if users.values().any(|u| u.email == email) {
            return Err((StatusCode::CONFLICT, "Diese E-Mail ist bereits registriert".into()));
        }
        let record = UserRecord {
            id: user_id,
            email: email.clone(),
            auth_key_hash,
            kdf_salt: req.kdf_salt_b64.clone(),
            kdf_params: req.kdf_params.clone(),
            encrypted_dek: req.encrypted_dek.clone(),
            recovery_encrypted_dek: req.recovery_encrypted_dek.clone(),
            recovery_auth_key_hash,
            totp_secret_server_encrypted: Some(totp_encrypted),
            totp_enabled: false,
            passkey_credential_id: None,
            passkey_label: None,
            passkey_encrypted_dek: None,
            passkey_prf_salt: None,
            ui_preferences: ui_prefs.clone(),
            is_admin,
            is_active,
            created_at: Some(now),
            last_login_at: Some(now),
        };
        users.insert(user_id, record.clone());
        record
    };
    sync_user_to_pg(&state, &new_user).await;
    persist_to_disk(&state);

    let token = issue_jwt(&state.jwt_secret, user_id, &email, is_admin, true)?;
    Ok(Json(AuthResponse {
        token,
        user_id,
        email,
        is_admin,
        kdf_salt_b64: req.kdf_salt_b64,
        kdf_params: req.kdf_params,
        encrypted_dek: req.encrypted_dek,
        recovery_encrypted_dek: req.recovery_encrypted_dek,
        totp_enabled: false,
        totp_setup_uri: Some(totp_uri),
        totp_secret_base32: Some(totp_secret_b32),
        passkey_credential_id: None,
        passkey_label: None,
        passkey_encrypted_dek: None,
        passkey_prf_salt_b64: None,
        ui_preferences: ui_prefs,
    }))
}

async fn login_user(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let email = req.email.trim().to_lowercase();
    check_auth_rate_limit(&state, &format!("login:{}", email))?;

    let user_opt = find_user_by_email(&state, &email).await;
    let Some(user) = user_opt else {
        return Err((StatusCode::UNAUTHORIZED, "Ungültige Zugangsdaten".into()));
    };

    if !user.is_active {
        return Err((
            StatusCode::FORBIDDEN,
            "Dieses Benutzerkonto wurde von der Administration vorübergehend deaktiviert.".into(),
        ));
    }

    let parsed_hash = PasswordHash::new(&user.auth_key_hash)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Hash-Fehler".into()))?;
    Argon2::default()
        .verify_password(req.auth_key_b64.as_bytes(), &parsed_hash)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültiges Passwort / AuthKey".into()))?;

    if user.totp_enabled {
        let Some(code) = req.totp_code.as_deref().filter(|s| !s.trim().is_empty()) else {
            return Err((StatusCode::FORBIDDEN, "2FA_REQUIRED".into()));
        };
        let Some(enc_secret) = user.totp_secret_server_encrypted.as_deref() else {
            return Err((StatusCode::INTERNAL_SERVER_ERROR, "2FA Secret fehlt".into()));
        };
        let secret_b32 = decrypt_entity_envelope(
            &state.server_encryption_key_b64,
            "server",
            &user.id.to_string(),
            enc_secret,
        )
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "2FA Entschlüsselungsfehler".into()))?;

        if !totp::verify_totp_code(&secret_b32, code) {
            return Err((StatusCode::UNAUTHORIZED, "Ungültiger 6-stelliger 2FA-TOTP-Code".into()));
        }
    }

    let is_admin = user.is_admin || state.admin_emails.contains(&user.email.to_lowercase());
    let now = Utc::now();
    {
        let mut users = state.mem_users.write().unwrap();
        if let Some(u) = users.get_mut(&user.id) {
            u.last_login_at = Some(now);
            if is_admin && !u.is_admin {
                u.is_admin = true;
            }
        }
    }
    if let Some(mut updated_user) = find_user_by_email(&state, &email).await {
        updated_user.last_login_at = Some(now);
        if is_admin {
            updated_user.is_admin = true;
        }
        sync_user_to_pg(&state, &updated_user).await;
    }

    let token = issue_jwt(&state.jwt_secret, user.id, &user.email, is_admin, true)?;
    Ok(Json(AuthResponse {
        token,
        user_id: user.id,
        email: user.email,
        is_admin,
        kdf_salt_b64: user.kdf_salt,
        kdf_params: user.kdf_params,
        encrypted_dek: user.encrypted_dek,
        recovery_encrypted_dek: user.recovery_encrypted_dek,
        totp_enabled: user.totp_enabled,
        totp_setup_uri: None,
        totp_secret_base32: None,
        passkey_credential_id: user.passkey_credential_id,
        passkey_label: user.passkey_label,
        passkey_encrypted_dek: user.passkey_encrypted_dek,
        passkey_prf_salt_b64: user.passkey_prf_salt,
        ui_preferences: user.ui_preferences,
    }))
}

async fn recover_password(
    State(state): State<AppState>,
    Json(req): Json<RecoverPasswordRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let email = req.email.trim().to_lowercase();
    check_auth_rate_limit(&state, &format!("recover:{}", email))?;

    let Some(existing_user) = find_user_by_email(&state, &email).await else {
        return Err((StatusCode::NOT_FOUND, "Kein Tresor unter dieser E-Mail gefunden".into()));
    };

    if existing_user.recovery_auth_key_hash.trim().is_empty()
        || req.recovery_auth_key_b64.trim().is_empty()
    {
        return Err((
            StatusCode::UNAUTHORIZED,
            "Recovery-Nachweis fehlt oder für dieses Konto nicht hinterlegt".into(),
        ));
    }

    let parsed_rec_hash = PasswordHash::new(&existing_user.recovery_auth_key_hash)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Recovery-Hash-Fehler".into()))?;
    Argon2::default()
        .verify_password(req.recovery_auth_key_b64.as_bytes(), &parsed_rec_hash)
        .map_err(|_| {
            (
                StatusCode::UNAUTHORIZED,
                "Ungültiger Recovery-Schlüssel (kryptografischer Nachweis fehlgeschlagen)".into(),
            )
        })?;

    let new_hash = hash_client_key(&req.new_auth_key_b64)?;
    let new_rec_hash_opt = match req
        .new_recovery_auth_key_b64
        .as_deref()
        .filter(|s| !s.trim().is_empty())
    {
        Some(new_rec_key) => Some(hash_client_key(new_rec_key)?),
        None => None,
    };

    let updated_user = {
        let mut users = state.mem_users.write().unwrap();
        let user = users
            .get_mut(&existing_user.id)
            .ok_or((StatusCode::NOT_FOUND, "Benutzer:in nicht gefunden".into()))?;
        user.auth_key_hash = new_hash;
        user.kdf_salt = req.new_kdf_salt_b64.clone();
        user.kdf_params = req.new_kdf_params.clone();
        user.encrypted_dek = req.new_encrypted_dek.clone();
        if let Some(rec_dek) = req
            .new_recovery_encrypted_dek
            .as_ref()
            .filter(|s| !s.trim().is_empty())
        {
            user.recovery_encrypted_dek = rec_dek.clone();
        }
        if let Some(new_rec_hash) = new_rec_hash_opt {
            user.recovery_auth_key_hash = new_rec_hash;
        }
        user.clone()
    };
    sync_user_to_pg(&state, &updated_user).await;
    persist_to_disk(&state);

    let token = issue_jwt(&state.jwt_secret, updated_user.id, &updated_user.email, updated_user.is_admin, true)?;
    Ok(Json(AuthResponse {
        token,
        user_id: updated_user.id,
        email: updated_user.email,
        is_admin: updated_user.is_admin,
        kdf_salt_b64: updated_user.kdf_salt,
        kdf_params: updated_user.kdf_params,
        encrypted_dek: updated_user.encrypted_dek,
        recovery_encrypted_dek: updated_user.recovery_encrypted_dek,
        totp_enabled: updated_user.totp_enabled,
        totp_setup_uri: None,
        totp_secret_base32: None,
        passkey_credential_id: updated_user.passkey_credential_id,
        passkey_label: updated_user.passkey_label,
        passkey_encrypted_dek: updated_user.passkey_encrypted_dek,
        passkey_prf_salt_b64: updated_user.passkey_prf_salt,
        ui_preferences: updated_user.ui_preferences,
    }))
}

async fn rotate_recovery_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<RotateRecoveryKeyRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    let rec_hash = hash_client_key(&req.recovery_auth_key_b64)?;

    let updated_record = {
        let mut users = state.mem_users.write().unwrap();
        let user = users
            .get_mut(&user_id)
            .ok_or((StatusCode::NOT_FOUND, "Benutzer:in nicht gefunden".into()))?;
        user.recovery_encrypted_dek = req.recovery_encrypted_dek.clone();
        user.recovery_auth_key_hash = rec_hash;
        user.clone()
    };

    sync_user_to_pg(&state, &updated_record).await;
    persist_to_disk(&state);

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Notfall-Schlüssel erfolgreich erneuert",
        "recovery_encrypted_dek": req.recovery_encrypted_dek,
    })))
}

#[derive(Serialize)]
struct PasskeyRegisterStartResponse {
    session_id: String,
    #[serde(rename = "publicKey")]
    public_key: CreationChallengeResponse,
}

#[derive(Deserialize)]
struct PasskeyRegisterFinishRequest {
    session_id: String,
    registration_response: RegisterPublicKeyCredential,
    label: Option<String>,
    passkey_encrypted_dek: String,
    #[serde(default)]
    passkey_prf_salt_b64: Option<String>,
    #[serde(default)]
    kdf_salt_b64: Option<String>,
    #[serde(default)]
    encrypted_dek: Option<String>,
    #[serde(default)]
    recovery_encrypted_dek: Option<String>,
    #[serde(default)]
    recovery_auth_key_b64: Option<String>,
}

#[derive(Deserialize)]
struct PasskeyLoginStartRequest {
    #[serde(default)]
    email: Option<String>,
}

#[derive(Serialize)]
struct PasskeyLoginStartResponse {
    session_id: String,
    #[serde(rename = "publicKey")]
    public_key: RequestChallengeResponse,
}

#[derive(Deserialize)]
struct PasskeyLoginFinishRequest {
    session_id: String,
    assertion_response: PublicKeyCredential,
}

#[derive(Deserialize)]
struct RenamePasskeyRequest {
    label: String,
}

async fn passkey_register_start(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<PasskeyRegisterStartResponse>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    let user = {
        let users = state.mem_users.read().unwrap();
        users
            .get(&user_id)
            .cloned()
            .ok_or((StatusCode::NOT_FOUND, "Benutzerkonto nicht gefunden".into()))?
    };

    let pks = state.mem_passkeys.read().unwrap();
    let exclude_credentials: Vec<CredentialID> = pks
        .values()
        .filter(|p| p.user_id == user_id)
        .filter_map(|p| {
            if let Some(val) = &p.passkey_data {
                if let Ok(pk) = serde_json::from_value::<Passkey>(val.clone()) {
                    return Some(pk.cred_id().clone());
                }
            }
            B64.decode(&p.credential_id).ok().map(CredentialID::from)
        })
        .collect();

    let exclude_opt = if exclude_credentials.is_empty() {
        None
    } else {
        Some(exclude_credentials)
    };

    let (creation_challenge, reg_state) = state
        .webauthn
        .start_passkey_registration(user_id, &user.email, &user.email, exclude_opt)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Fehler bei WebAuthn-Registrierung: {}", e),
            )
        })?;

    let session_id = format!("g21_reg_{}", Uuid::new_v4().simple());
    {
        let mut map = state.reg_challenges.write().unwrap();
        let now = Instant::now();
        map.retain(|_, (created, _, _)| now.duration_since(*created) < Duration::from_secs(120));
        map.insert(session_id.clone(), (now, reg_state, user_id));
    }

    Ok(Json(PasskeyRegisterStartResponse {
        session_id,
        public_key: creation_challenge,
    }))
}

async fn passkey_register_finish(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<PasskeyRegisterFinishRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    let challenge_entry = {
        let mut map = state.reg_challenges.write().unwrap();
        let now = Instant::now();
        map.retain(|_, (created, _, _)| now.duration_since(*created) < Duration::from_secs(120));
        map.remove(&req.session_id)
    };

    let Some((_, reg_state, expected_user_id)) = challenge_entry else {
        return Err((
            StatusCode::BAD_REQUEST,
            "Registrierungs-Sitzung abgelaufen oder ungültig. Bitte erneut versuchen.".into(),
        ));
    };

    if expected_user_id != user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "Sitzung gehört nicht zu diesem Benutzerkonto.".into(),
        ));
    }

    let passkey = state
        .webauthn
        .finish_passkey_registration(&req.registration_response, &reg_state)
        .map_err(|e| {
            tracing::warn!("WebAuthn registration verification failed: {}", e);
            (
                StatusCode::BAD_REQUEST,
                format!("WebAuthn-Verifizierung fehlgeschlagen: {}", e),
            )
        })?;

    let cred_id_str = req.registration_response.id.clone();
    let label = req
        .label
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "Passkey (Fingerabdruck / Face ID)".to_string());
    let passkey_id = Uuid::new_v4();

    let rec_hash_opt = match req
        .recovery_auth_key_b64
        .as_deref()
        .filter(|s| !s.trim().is_empty())
    {
        Some(k) => Some(hash_client_key(k)?),
        None => None,
    };

    let passkey_rec = UserPasskeyRecord {
        id: passkey_id,
        user_id,
        credential_id: cred_id_str.clone(),
        passkey_label: label.clone(),
        passkey_encrypted_dek: req.passkey_encrypted_dek.clone(),
        passkey_prf_salt: req.passkey_prf_salt_b64.clone(),
        passkey_data: serde_json::to_value(&passkey).ok(),
        created_at: Utc::now(),
        last_used_at: Some(Utc::now()),
    };

    state
        .mem_passkeys
        .write()
        .unwrap()
        .insert(passkey_id, passkey_rec.clone());
    sync_passkey_to_pg(&state, &passkey_rec).await;

    // Update primary passkey on user record
    let updated_user = {
        let mut users = state.mem_users.write().unwrap();
        let u = users
            .get_mut(&user_id)
            .ok_or((StatusCode::NOT_FOUND, "Benutzer nicht gefunden".into()))?;
        u.passkey_credential_id = Some(cred_id_str.clone());
        u.passkey_label = Some(label.clone());
        u.passkey_encrypted_dek = Some(req.passkey_encrypted_dek.clone());
        if let Some(prf) = &req.passkey_prf_salt_b64 {
            u.passkey_prf_salt = Some(prf.clone());
        }
        if let Some(salt) = req.kdf_salt_b64.as_ref().filter(|s| !s.is_empty()) {
            if u.kdf_salt.is_empty() {
                u.kdf_salt = salt.clone();
            }
        }
        if let Some(enc_dek) = req.encrypted_dek.as_ref().filter(|s| !s.is_empty()) {
            u.encrypted_dek = enc_dek.clone();
        }
        if let Some(rec_dek) = req.recovery_encrypted_dek.as_ref().filter(|s| !s.is_empty()) {
            u.recovery_encrypted_dek = rec_dek.clone();
        }
        if let Some(rec_hash) = &rec_hash_opt {
            u.recovery_auth_key_hash = rec_hash.clone();
        }
        u.clone()
    };
    sync_user_to_pg(&state, &updated_user).await;
    persist_to_disk(&state);

    let issued_token = issue_jwt(&state.jwt_secret, user_id, &claims.email, claims.is_admin, true)?;

    Ok(Json(serde_json::json!({
        "success": true,
        "token": issued_token,
        "passkey_id": passkey_id,
        "credential_id": cred_id_str,
        "label": label,
        "passkey_prf_salt_b64": req.passkey_prf_salt_b64,
    })))
}

async fn passkey_login_start(
    State(state): State<AppState>,
    Json(req): Json<PasskeyLoginStartRequest>,
) -> Result<Json<PasskeyLoginStartResponse>, (StatusCode, String)> {
    let user_opt = if let Some(e) = req.email.as_deref().filter(|s| !s.trim().is_empty()) {
        let clean = e.trim().to_lowercase();
        let users = state.mem_users.read().unwrap();
        users.values().find(|u| u.email.to_lowercase() == clean).cloned()
    } else {
        None
    };

    let pks = state.mem_passkeys.read().unwrap();
    let passkeys_to_allow: Vec<Passkey> = pks
        .values()
        .filter(|p| {
            if let Some(u) = &user_opt {
                p.user_id == u.id
            } else {
                true
            }
        })
        .filter_map(|p| {
            if let Some(val) = &p.passkey_data {
                serde_json::from_value::<Passkey>(val.clone()).ok()
            } else {
                None
            }
        })
        .collect();

    if passkeys_to_allow.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Kein passender Passkey für diesen Benutzer hinterlegt. Bitte melde dich mit deinem Passwort an.".into(),
        ));
    }

    let (request_challenge, auth_state) = state
        .webauthn
        .start_passkey_authentication(&passkeys_to_allow)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Fehler beim Vorbereiten der Authentifizierung: {}", e),
            )
        })?;

    let session_id = format!("g21_auth_{}", Uuid::new_v4().simple());
    {
        let mut map = state.auth_challenges.write().unwrap();
        let now = Instant::now();
        map.retain(|_, (created, _, _)| now.duration_since(*created) < Duration::from_secs(120));
        map.insert(session_id.clone(), (now, auth_state, user_opt.map(|u| u.id)));
    }

    Ok(Json(PasskeyLoginStartResponse {
        session_id,
        public_key: request_challenge,
    }))
}

async fn passkey_login_finish(
    State(state): State<AppState>,
    Json(req): Json<PasskeyLoginFinishRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    check_auth_rate_limit(&state, &format!("passkey_auth:{}", req.session_id))?;

    let challenge_entry = {
        let mut map = state.auth_challenges.write().unwrap();
        let now = Instant::now();
        map.retain(|_, (created, _, _)| now.duration_since(*created) < Duration::from_secs(120));
        map.remove(&req.session_id)
    };

    let Some((_, auth_state, _)) = challenge_entry else {
        return Err((
            StatusCode::BAD_REQUEST,
            "Anmelde-Sitzung abgelaufen oder ungültig. Bitte erneut versuchen.".into(),
        ));
    };

    let auth_result = state
        .webauthn
        .finish_passkey_authentication(&req.assertion_response, &auth_state)
        .map_err(|e| {
            tracing::warn!("WebAuthn authentication failed: {}", e);
            (
                StatusCode::UNAUTHORIZED,
                format!("Passkey-Authentifizierung fehlgeschlagen: {}", e),
            )
        })?;

    let cred_id_bytes = auth_result.cred_id().as_slice();
    let matched_passkey = {
        let pks = state.mem_passkeys.read().unwrap();
        pks.values()
            .find(|p| {
                if let Some(val) = &p.passkey_data {
                    if let Ok(pk) = serde_json::from_value::<Passkey>(val.clone()) {
                        return pk.cred_id().as_slice() == cred_id_bytes;
                    }
                }
                p.credential_id == req.assertion_response.id
            })
            .cloned()
    };

    let Some(mut passkey_rec) = matched_passkey else {
        return Err((
            StatusCode::UNAUTHORIZED,
            "Zugehöriger Passkey im System nicht gefunden".into(),
        ));
    };

    passkey_rec.last_used_at = Some(Utc::now());
    if let Some(mut data) = passkey_rec.passkey_data.clone() {
        data["sign_counter"] = serde_json::json!(auth_result.counter());
        passkey_rec.passkey_data = Some(data);
    }
    state
        .mem_passkeys
        .write()
        .unwrap()
        .insert(passkey_rec.id, passkey_rec.clone());
    sync_passkey_to_pg(&state, &passkey_rec).await;

    let user_opt = {
        let users = state.mem_users.read().unwrap();
        users.get(&passkey_rec.user_id).cloned()
    };
    let Some(user) = user_opt else {
        return Err((
            StatusCode::NOT_FOUND,
            "Benutzerkonto nicht gefunden".into(),
        ));
    };

    if !user.is_active {
        return Err((
            StatusCode::FORBIDDEN,
            "Dein Benutzerkonto wurde von der Administration deaktiviert.".into(),
        ));
    }

    let now = Utc::now();
    {
        let mut users = state.mem_users.write().unwrap();
        if let Some(u) = users.get_mut(&user.id) {
            u.last_login_at = Some(now);
        }
    }
    let mut updated_user = user.clone();
    updated_user.last_login_at = Some(now);
    sync_user_to_pg(&state, &updated_user).await;
    persist_to_disk(&state);

    let token = issue_jwt(&state.jwt_secret, user.id, &user.email, user.is_admin, true)?;

    Ok(Json(AuthResponse {
        token,
        user_id: user.id,
        email: user.email,
        is_admin: user.is_admin,
        kdf_salt_b64: user.kdf_salt,
        kdf_params: user.kdf_params,
        encrypted_dek: user.encrypted_dek,
        recovery_encrypted_dek: user.recovery_encrypted_dek,
        totp_enabled: user.totp_enabled,
        totp_setup_uri: None,
        totp_secret_base32: None,
        passkey_credential_id: Some(passkey_rec.credential_id),
        passkey_label: Some(passkey_rec.passkey_label),
        passkey_encrypted_dek: Some(passkey_rec.passkey_encrypted_dek),
        passkey_prf_salt_b64: passkey_rec.passkey_prf_salt,
        ui_preferences: user.ui_preferences,
    }))
}

async fn list_user_passkeys(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<serde_json::Value>>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    let pks = state.mem_passkeys.read().unwrap();
    let mut user_pks: Vec<_> = pks.values().filter(|p| p.user_id == user_id).cloned().collect();
    user_pks.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    let list = user_pks
        .into_iter()
        .map(|p| {
            serde_json::json!({
                "id": p.id,
                "label": p.passkey_label,
                "credential_id": p.credential_id,
                "prf_supported": p.passkey_prf_salt.is_some(),
                "created_at": p.created_at,
                "last_used_at": p.last_used_at,
            })
        })
        .collect();

    Ok(Json(list))
}

async fn delete_user_passkey_by_id(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(passkey_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    let removed = {
        let mut pks = state.mem_passkeys.write().unwrap();
        if let Some(entry) = pks.get(&passkey_id) {
            if entry.user_id != user_id {
                return Err((
                    StatusCode::FORBIDDEN,
                    "Keine Berechtigung für diesen Passkey".into(),
                ));
            }
            pks.remove(&passkey_id)
        } else {
            None
        }
    };

    let Some(p) = removed else {
        return Err((StatusCode::NOT_FOUND, "Passkey nicht gefunden".into()));
    };

    delete_passkey_from_pg(&state, passkey_id).await;

    // Update primary passkey on user if it was deleted
    let user_to_sync = {
        let mut users = state.mem_users.write().unwrap();
        if let Some(u) = users.get_mut(&user_id) {
            if u.passkey_credential_id.as_deref() == Some(&p.credential_id) {
                let remaining = state.mem_passkeys.read().unwrap();
                let next_opt = remaining.values().find(|r| r.user_id == user_id).cloned();
                drop(remaining);
                if let Some(next) = next_opt {
                    u.passkey_credential_id = Some(next.credential_id);
                    u.passkey_label = Some(next.passkey_label);
                    u.passkey_encrypted_dek = Some(next.passkey_encrypted_dek);
                    u.passkey_prf_salt = next.passkey_prf_salt;
                } else {
                    u.passkey_credential_id = None;
                    u.passkey_label = None;
                    u.passkey_encrypted_dek = None;
                    u.passkey_prf_salt = None;
                }
                Some(u.clone())
            } else {
                None
            }
        } else {
            None
        }
    };
    if let Some(u) = user_to_sync {
        sync_user_to_pg(&state, &u).await;
    }
    persist_to_disk(&state);

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Passkey erfolgreich gelöscht",
    })))
}

async fn rename_user_passkey(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(passkey_id): Path<Uuid>,
    Json(payload): Json<RenamePasskeyRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    let clean_label = payload.label.trim();
    if clean_label.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Der Name darf nicht leer sein.".into(),
        ));
    }

    let updated = {
        let mut pks = state.mem_passkeys.write().unwrap();
        let entry = pks
            .get_mut(&passkey_id)
            .ok_or((StatusCode::NOT_FOUND, "Passkey nicht gefunden".into()))?;
        if entry.user_id != user_id {
            return Err((
                StatusCode::FORBIDDEN,
                "Keine Berechtigung für diesen Passkey".into(),
            ));
        }
        entry.passkey_label = clean_label.to_string();
        entry.clone()
    };

    sync_passkey_to_pg(&state, &updated).await;

    // Update primary label on user if this is the primary passkey
    let user_to_sync = {
        let mut users = state.mem_users.write().unwrap();
        if let Some(u) = users.get_mut(&user_id) {
            if u.passkey_credential_id.as_deref() == Some(&updated.credential_id) {
                u.passkey_label = Some(updated.passkey_label.clone());
                Some(u.clone())
            } else {
                None
            }
        } else {
            None
        }
    };
    if let Some(u) = user_to_sync {
        sync_user_to_pg(&state, &u).await;
    }
    persist_to_disk(&state);

    Ok(Json(serde_json::json!({
        "success": true,
        "id": passkey_id,
        "label": updated.passkey_label,
    })))
}

async fn register_passkey(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<PasskeyRegisterRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    let issued_token = issue_jwt(&state.jwt_secret, user_id, &claims.email, claims.is_admin, true)?;
    let rec_hash_opt = match req
        .recovery_auth_key_b64
        .as_deref()
        .filter(|s| !s.trim().is_empty())
    {
        Some(rec_key) => Some(hash_client_key(rec_key)?),
        None => None,
    };

    let passkey_id = Uuid::new_v4();
    let passkey_rec = UserPasskeyRecord {
        id: passkey_id,
        user_id,
        credential_id: req.credential_id.clone(),
        passkey_label: req.label.clone(),
        passkey_encrypted_dek: req.passkey_encrypted_dek.clone(),
        passkey_prf_salt: req.passkey_prf_salt_b64.clone(),
        passkey_data: None,
        created_at: Utc::now(),
        last_used_at: Some(Utc::now()),
    };
    state
        .mem_passkeys
        .write()
        .unwrap()
        .insert(passkey_id, passkey_rec.clone());
    sync_passkey_to_pg(&state, &passkey_rec).await;

    let updated_record = {
        let mut users = state.mem_users.write().unwrap();
        let update_existing = |user: &mut UserRecord| {
            user.passkey_credential_id = Some(req.credential_id.clone());
            user.passkey_label = Some(req.label.clone());
            user.passkey_encrypted_dek = Some(req.passkey_encrypted_dek.clone());
            if let Some(prf_salt) = &req.passkey_prf_salt_b64 {
                user.passkey_prf_salt = Some(prf_salt.clone());
            }
            if let Some(salt) = req.kdf_salt_b64.as_ref().filter(|s| !s.is_empty()) {
                if user.kdf_salt.is_empty() {
                    user.kdf_salt = salt.clone();
                }
            }
            if let Some(enc_dek) = req.encrypted_dek.as_ref().filter(|s| !s.is_empty()) {
                user.encrypted_dek = enc_dek.clone();
            }
            if let Some(rec_dek) = req
                .recovery_encrypted_dek
                .as_ref()
                .filter(|s| !s.is_empty())
            {
                user.recovery_encrypted_dek = rec_dek.clone();
            }
            if let Some(rec_hash) = &rec_hash_opt {
                user.recovery_auth_key_hash = rec_hash.clone();
            }
        };

        if let Some(user) = users.get_mut(&user_id) {
            update_existing(user);
            user.clone()
        } else if let Some(user) = users.values_mut().find(|u| u.email == claims.email) {
            update_existing(user);
            user.clone()
        } else {
            let new_user = UserRecord {
                id: user_id,
                email: claims.email.clone(),
                auth_key_hash: String::new(),
                kdf_salt: req.kdf_salt_b64.clone().unwrap_or_default(),
                kdf_params: KdfParams::default(),
                encrypted_dek: req
                    .encrypted_dek
                    .clone()
                    .unwrap_or_else(|| req.passkey_encrypted_dek.clone()),
                recovery_encrypted_dek: req.recovery_encrypted_dek.clone().unwrap_or_default(),
                recovery_auth_key_hash: rec_hash_opt.unwrap_or_default(),
                totp_secret_server_encrypted: None,
                totp_enabled: false,
                passkey_credential_id: Some(req.credential_id.clone()),
                passkey_label: Some(req.label.clone()),
                passkey_encrypted_dek: Some(req.passkey_encrypted_dek.clone()),
                passkey_prf_salt: req.passkey_prf_salt_b64.clone(),
                ui_preferences: serde_json::json!({ "theme": "teal", "mode": "light" }),
                is_admin: claims.is_admin,
                is_active: true,
                created_at: Some(Utc::now()),
                last_login_at: Some(Utc::now()),
            };
            users.insert(user_id, new_user.clone());
            new_user
        }
    };
    sync_user_to_pg(&state, &updated_record).await;
    persist_to_disk(&state);
    Ok(Json(serde_json::json!({
        "token": issued_token,
        "passkey_credential_id": req.credential_id,
        "passkey_label": req.label,
        "passkey_prf_salt_b64": req.passkey_prf_salt_b64,
    })))
}

async fn delete_passkey(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    let updated_record = {
        let mut users = state.mem_users.write().unwrap();
        let user = users
            .get_mut(&user_id)
            .ok_or((StatusCode::NOT_FOUND, "Benutzer:in nicht gefunden".into()))?;
        user.passkey_credential_id = None;
        user.passkey_label = None;
        user.passkey_encrypted_dek = None;
        user.passkey_prf_salt = None;
        user.clone()
    };

    {
        let mut pks = state.mem_passkeys.write().unwrap();
        pks.retain(|_, p| p.user_id != user_id);
    }
    if let Some(pool) = &state.db {
        let _ = sqlx::query("DELETE FROM user_passkeys WHERE user_id = $1")
            .bind(user_id)
            .execute(pool)
            .await;
    }

    sync_user_to_pg(&state, &updated_record).await;
    persist_to_disk(&state);

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Passkey erfolgreich gelöscht",
    })))
}

async fn login_with_passkey(
    State(state): State<AppState>,
    Json(req): Json<PasskeyLoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let rate_key = req
        .email
        .as_deref()
        .unwrap_or(req.credential_id.as_str())
        .trim()
        .to_lowercase();
    check_auth_rate_limit(&state, &format!("passkey:{}", rate_key))?;

    let passkey_opt = {
        let pks = state.mem_passkeys.read().unwrap();
        pks.values()
            .find(|p| p.credential_id == req.credential_id)
            .cloned()
    };

    let user_opt = if let Some(pk) = &passkey_opt {
        let users = state.mem_users.read().unwrap();
        users.get(&pk.user_id).cloned()
    } else {
        let users = state.mem_users.read().unwrap();
        users
            .values()
            .find(|u| {
                let cred_matches =
                    u.passkey_credential_id.as_deref() == Some(req.credential_id.as_str());
                let email_matches = req
                    .email
                    .as_ref()
                    .map(|e| u.email == e.trim().to_lowercase())
                    .unwrap_or(true);
                cred_matches && email_matches
            })
            .cloned()
    };

    let Some(user) = user_opt else {
        return Err((
            StatusCode::UNAUTHORIZED,
            "Dieser Passkey ist noch nicht mit deinem Konto verknüpft.".into(),
        ));
    };

    if !user.is_active {
        return Err((
            StatusCode::FORBIDDEN,
            "Dein Benutzerkonto wurde von der Administration deaktiviert.".into(),
        ));
    }

    let now = Utc::now();
    if let Some(mut pk) = passkey_opt.clone() {
        pk.last_used_at = Some(now);
        state.mem_passkeys.write().unwrap().insert(pk.id, pk.clone());
        sync_passkey_to_pg(&state, &pk).await;
    }

    {
        let mut users = state.mem_users.write().unwrap();
        if let Some(u) = users.get_mut(&user.id) {
            u.last_login_at = Some(now);
        }
    }
    let mut updated_user = user.clone();
    updated_user.last_login_at = Some(now);
    sync_user_to_pg(&state, &updated_user).await;

    let (cred_id, label, enc_dek, prf_salt) = if let Some(pk) = &passkey_opt {
        (
            Some(pk.credential_id.clone()),
            Some(pk.passkey_label.clone()),
            Some(pk.passkey_encrypted_dek.clone()),
            pk.passkey_prf_salt.clone(),
        )
    } else {
        (
            user.passkey_credential_id.clone(),
            user.passkey_label.clone(),
            user.passkey_encrypted_dek.clone(),
            user.passkey_prf_salt.clone(),
        )
    };

    let token = issue_jwt(&state.jwt_secret, user.id, &user.email, user.is_admin, true)?;
    Ok(Json(AuthResponse {
        token,
        user_id: user.id,
        email: user.email,
        is_admin: user.is_admin,
        kdf_salt_b64: user.kdf_salt,
        kdf_params: user.kdf_params,
        encrypted_dek: user.encrypted_dek,
        recovery_encrypted_dek: user.recovery_encrypted_dek,
        totp_enabled: user.totp_enabled,
        totp_setup_uri: None,
        totp_secret_base32: None,
        passkey_credential_id: cred_id,
        passkey_label: label,
        passkey_encrypted_dek: enc_dek,
        passkey_prf_salt_b64: prf_salt,
        ui_preferences: user.ui_preferences,
    }))
}

async fn get_2fa_setup_info(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    let (totp_enabled, email, secret_b32, updated_user_opt) = {
        let mut users = state.mem_users.write().unwrap();
        let user_entry = if let Some(u) = users.get_mut(&user_id) {
            Some(u)
        } else {
            users.values_mut().find(|u| u.email == claims.email)
        };

        if let Some(user) = user_entry {
            if user.totp_enabled {
                return Err((
                    StatusCode::CONFLICT,
                    "2FA ist bereits für dieses Konto aktiviert.".into(),
                ));
            }

            let mut created = false;
            let secret = if let Some(enc_secret) = &user.totp_secret_server_encrypted {
                decrypt_entity_envelope(
                    &state.server_encryption_key_b64,
                    "server",
                    &user.id.to_string(),
                    enc_secret,
                )
                .unwrap_or_else(|_| {
                    created = true;
                    totp::generate_totp_secret_base32()
                })
            } else {
                created = true;
                totp::generate_totp_secret_base32()
            };

            if created {
                if let Ok(enc) = encrypt_entity_envelope(
                    &state.server_encryption_key_b64,
                    "server",
                    &user.id.to_string(),
                    &secret,
                ) {
                    user.totp_secret_server_encrypted = Some(enc);
                }
            }
            let maybe_saved = if created { Some(user.clone()) } else { None };
            (user.totp_enabled, user.email.clone(), secret, maybe_saved)
        } else {
            let secret = totp::generate_totp_secret_base32();
            let enc = encrypt_entity_envelope(
                &state.server_encryption_key_b64,
                "server",
                &user_id.to_string(),
                &secret,
            )
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            let new_user = UserRecord {
                id: user_id,
                email: claims.email.clone(),
                auth_key_hash: String::new(),
                kdf_salt: String::new(),
                kdf_params: KdfParams::default(),
                encrypted_dek: String::new(),
                recovery_encrypted_dek: String::new(),
                recovery_auth_key_hash: String::new(),
                totp_secret_server_encrypted: Some(enc),
                totp_enabled: false,
                passkey_credential_id: None,
                passkey_label: None,
                passkey_encrypted_dek: None,
                passkey_prf_salt: None,
                ui_preferences: serde_json::json!({ "theme": "teal", "mode": "light" }),
                is_admin: claims.is_admin,
                is_active: true,
                created_at: Some(Utc::now()),
                last_login_at: Some(Utc::now()),
            };
            users.insert(user_id, new_user.clone());
            (false, claims.email.clone(), secret, Some(new_user))
        }
    };

    if let Some(saved_user) = updated_user_opt {
        sync_user_to_pg(&state, &saved_user).await;
        persist_to_disk(&state);
    }

    let uri = totp::build_otpauth_uri(&email, &secret_b32);
    Ok(Json(serde_json::json!({
        "totp_enabled": totp_enabled,
        "totp_secret_base32": secret_b32,
        "totp_setup_uri": uri
    })))
}

async fn verify_and_enable_2fa(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<VerifyTotpRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;
    check_auth_rate_limit(&state, &format!("2fa_verify:{}", user_id))?;

    let updated_user_opt = {
        let mut users = state.mem_users.write().unwrap();
        let user_opt = if let Some(u) = users.get_mut(&user_id) {
            Some(u)
        } else {
            users.values_mut().find(|u| u.email == claims.email)
        };

        if let Some(user) = user_opt {
            if let Some(enc_secret) = &user.totp_secret_server_encrypted {
                let secret_b32 = decrypt_entity_envelope(
                    &state.server_encryption_key_b64,
                    "server",
                    &user.id.to_string(),
                    enc_secret,
                )
                .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "2FA Fehler".into()))?;

                if !totp::verify_totp_code(&secret_b32, &req.totp_code) {
                    return Err((StatusCode::BAD_REQUEST, "6-stelliger 2FA-Code ist ungültig".into()));
                }
                user.totp_enabled = true;
                Some(user.clone())
            } else {
                return Err((StatusCode::BAD_REQUEST, "Kein 2FA-Secret initialisiert".into()));
            }
        } else {
            return Err((StatusCode::NOT_FOUND, "Benutzer:in nicht gefunden".into()));
        }
    };
    if let Some(saved_user) = updated_user_opt {
        sync_user_to_pg(&state, &saved_user).await;
    }
    persist_to_disk(&state);
    Ok(Json(serde_json::json!({ "totp_enabled": true })))
}

async fn reconfigure_2fa(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;
    check_auth_rate_limit(&state, &format!("2fa_reconfigure:{}", user_id))?;

    let new_secret_b32 = totp::generate_totp_secret_base32();
    let enc = encrypt_entity_envelope(
        &state.server_encryption_key_b64,
        "server",
        &user_id.to_string(),
        &new_secret_b32,
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let (email, updated_user) = {
        let mut users = state.mem_users.write().unwrap();
        let user_opt = if let Some(u) = users.get_mut(&user_id) {
            Some(u)
        } else {
            users.values_mut().find(|u| u.email == claims.email)
        };

        if let Some(user) = user_opt {
            user.totp_secret_server_encrypted = Some(enc);
            user.totp_enabled = false;
            (user.email.clone(), user.clone())
        } else {
            return Err((StatusCode::NOT_FOUND, "Benutzer:in nicht gefunden".into()));
        }
    };

    sync_user_to_pg(&state, &updated_user).await;
    persist_to_disk(&state);

    let uri = totp::build_otpauth_uri(&email, &new_secret_b32);
    Ok(Json(serde_json::json!({
        "totp_enabled": false,
        "totp_secret_base32": new_secret_b32,
        "totp_setup_uri": uri
    })))
}

async fn disable_2fa(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;
    check_auth_rate_limit(&state, &format!("2fa_disable:{}", user_id))?;

    let updated_user = {
        let mut users = state.mem_users.write().unwrap();
        let user_opt = if let Some(u) = users.get_mut(&user_id) {
            Some(u)
        } else {
            users.values_mut().find(|u| u.email == claims.email)
        };

        if let Some(user) = user_opt {
            user.totp_enabled = false;
            user.clone()
        } else {
            return Err((StatusCode::NOT_FOUND, "Benutzer:in nicht gefunden".into()));
        }
    };

    sync_user_to_pg(&state, &updated_user).await;
    persist_to_disk(&state);

    Ok(Json(serde_json::json!({
        "success": true,
        "totp_enabled": false
    })))
}

async fn list_envelopes(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<EncryptedEnvelopeRecord>>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let owner_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    let store = state.mem_envelopes.read().unwrap();
    let list: Vec<EncryptedEnvelopeRecord> = store
        .values()
        .filter(|e| e.owner_user_id == owner_id)
        .cloned()
        .collect();

    Ok(Json(list))
}

fn resolve_tenant_envelope_id(owner_id: Uuid, requested_id: Uuid) -> Uuid {
    let default_demo_owner =
        Uuid::parse_str("7f9c2a10-58e4-4c9b-9b1a-123456789abc").unwrap();
    if owner_id == default_demo_owner {
        return requested_id;
    }

    let static_ws = Uuid::parse_str("00000000-0000-4000-8000-000000000001").unwrap();
    let static_pref = Uuid::parse_str("00000000-0000-4000-8000-000000000002").unwrap();

    // Only shared static singleton IDs (workspace and user_settings) need deterministic tenant namespacing
    if requested_id != static_ws && requested_id != static_pref {
        return requested_id;
    }

    let o_bytes = owner_id.as_bytes();
    let r_bytes = requested_id.as_bytes();
    let mut combined = [0u8; 16];
    for i in 0..16 {
        combined[i] = o_bytes[i] ^ r_bytes[i];
    }
    // Set UUID v4 variant bits
    combined[6] = (combined[6] & 0x0f) | 0x40;
    combined[8] = (combined[8] & 0x3f) | 0x80;
    Uuid::from_bytes(combined)
}

async fn upsert_envelope(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<UpsertEnvelopeRequest>,
) -> Result<Json<EncryptedEnvelopeRecord>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let owner_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;
    let effective_id = resolve_tenant_envelope_id(owner_id, req.id);

    let record = {
        let mut store = state.mem_envelopes.write().unwrap();
        let existing = store.get(&effective_id).or_else(|| store.get(&req.id));
        if let Some(existing) = existing {
            if existing.owner_user_id != owner_id {
                return Err((StatusCode::FORBIDDEN, "Zugriff verweigert (Mandantentrennung)".into()));
            }
            // Issue #2: Optimistic Concurrency Control
            if let Some(exp_ver) = req.expected_version {
                if existing.version != exp_ver {
                    let err_json = serde_json::json!({
                        "error": "conflict",
                        "message": format!(
                            "Konflikt: Datensatz hat Version {}, erwartete Version war {}",
                            existing.version, exp_ver
                        ),
                        "conflict_envelope": existing,
                        "current_envelope": existing,
                        "server_version": existing.version,
                        "expected_version": exp_ver,
                        "envelope_id": req.id
                    });
                    return Err((StatusCode::CONFLICT, err_json.to_string()));
                }
            }
        }

        let key = if let Some(existing) = store.get(&req.id) {
            if existing.owner_user_id == owner_id {
                req.id
            } else {
                effective_id
            }
        } else {
            effective_id
        };

        let next_version = store.get(&key).map(|e| e.version + 1).unwrap_or(1);
        let rec = EncryptedEnvelopeRecord {
            id: key,
            owner_user_id: owner_id,
            entity_type: req.entity_type,
            parent_id: req.parent_id,
            class_id: req.class_id,
            encrypted_payload: req.encrypted_payload,
            version: next_version,
            updated_at: Utc::now(),
        };
        store.insert(key, rec.clone());
        rec
    };
    sync_envelope_to_pg(&state, &record).await;
    persist_to_disk(&state);
    Ok(Json(record))
}

async fn batch_sync_envelopes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<BatchSyncRequest>,
) -> Result<Json<Vec<EncryptedEnvelopeRecord>>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let owner_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    let updated = {
        let mut store = state.mem_envelopes.write().unwrap();

        // Pre-validation pass: verify all expected_versions before mutating any record
        for item in &req.envelopes {
            let effective_id = resolve_tenant_envelope_id(owner_id, item.id);
            let existing = store.get(&effective_id).or_else(|| store.get(&item.id));
            if let Some(existing) = existing {
                if existing.owner_user_id != owner_id {
                    return Err((StatusCode::FORBIDDEN, "Zugriff verweigert".into()));
                }
                if let Some(exp_ver) = item.expected_version {
                    if existing.version != exp_ver {
                        let err_json = serde_json::json!({
                            "error": "conflict",
                            "message": format!(
                                "Konflikt bei Envelope {}: Server hat Version {}, erwartet war {}",
                                item.id, existing.version, exp_ver
                            ),
                            "conflict_envelope": existing,
                            "current_envelope": existing,
                            "server_version": existing.version,
                            "expected_version": exp_ver,
                            "envelope_id": item.id
                        });
                        return Err((StatusCode::CONFLICT, err_json.to_string()));
                    }
                }
            }
        }

        let mut out = Vec::with_capacity(req.envelopes.len());

        for item in req.envelopes {
            let effective_id = resolve_tenant_envelope_id(owner_id, item.id);
            let key = if let Some(existing) = store.get(&item.id) {
                if existing.owner_user_id == owner_id {
                    item.id
                } else {
                    effective_id
                }
            } else {
                effective_id
            };
            let next_version = store.get(&key).map(|e| e.version + 1).unwrap_or(1);
            let record = EncryptedEnvelopeRecord {
                id: key,
                owner_user_id: owner_id,
                entity_type: item.entity_type,
                parent_id: item.parent_id,
                class_id: item.class_id,
                encrypted_payload: item.encrypted_payload,
                version: next_version,
                updated_at: Utc::now(),
            };
            store.insert(key, record.clone());
            out.push(record);
        }
        out
    };
    for rec in &updated {
        sync_envelope_to_pg(&state, rec).await;
    }
    persist_to_disk(&state);
    Ok(Json(updated))
}

async fn delete_envelope(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let owner_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;
    let effective_id = resolve_tenant_envelope_id(owner_id, id);

    let removed_id = {
        let mut store = state.mem_envelopes.write().unwrap();
        if let Some(existing) = store.get(&effective_id) {
            if existing.owner_user_id != owner_id {
                return Err((StatusCode::FORBIDDEN, "Zugriff verweigert".into()));
            }
            store.remove(&effective_id);
            Some(effective_id)
        } else if let Some(existing) = store.get(&id) {
            if existing.owner_user_id != owner_id {
                return Err((StatusCode::FORBIDDEN, "Zugriff verweigert".into()));
            }
            store.remove(&id);
            Some(id)
        } else {
            None
        }
    };
    if let Some(del_id) = removed_id {
        delete_envelope_from_pg(&state, del_id, owner_id).await;
        persist_to_disk(&state);
        return Ok(StatusCode::NO_CONTENT);
    }
    Err((StatusCode::NOT_FOUND, "Nicht gefunden".into()))
}

async fn delete_all_user_envelopes(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let owner_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    {
        let mut store = state.mem_envelopes.write().unwrap();
        store.retain(|_, env| env.owner_user_id != owner_id);
    }
    delete_all_envelopes_from_pg(&state, owner_id).await;
    persist_to_disk(&state);
    Ok(StatusCode::NO_CONTENT)
}

async fn update_preferences(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(prefs): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let owner_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    let updated_user_opt = {
        let mut users = state.mem_users.write().unwrap();
        if let Some(user) = users.get_mut(&owner_id) {
            user.ui_preferences = prefs.clone();
            Some(user.clone())
        } else {
            None
        }
    };
    if let Some(saved_user) = updated_user_opt {
        sync_user_to_pg(&state, &saved_user).await;
    }
    persist_to_disk(&state);
    Ok(Json(prefs))
}

async fn find_user_by_email(state: &AppState, email: &str) -> Option<UserRecord> {
    if let Some(u) = state
        .mem_users
        .read()
        .unwrap()
        .values()
        .find(|u| u.email == email)
        .cloned()
    {
        return Some(u);
    }

    if let Some(pool) = &state.db {
        if let Ok(Some(row)) = sqlx::query(
            "SELECT id, email, auth_key_hash, kdf_salt, kdf_params, encrypted_dek, recovery_encrypted_dek, recovery_auth_key_hash, totp_secret_server_encrypted, totp_enabled, passkey_credential_id, passkey_label, passkey_encrypted_dek, passkey_prf_salt, ui_preferences, is_admin, is_active, created_at, last_login_at FROM users WHERE email = $1",
        )
        .bind(email)
        .fetch_optional(pool)
        .await
        {
            let id: Uuid = row.get("id");
            let kdf_params_val: serde_json::Value = row.get("kdf_params");
            let user = UserRecord {
                id,
                email: row.get("email"),
                auth_key_hash: row.get("auth_key_hash"),
                kdf_salt: row.get("kdf_salt"),
                kdf_params: serde_json::from_value(kdf_params_val).unwrap_or_default(),
                encrypted_dek: row.get("encrypted_dek"),
                recovery_encrypted_dek: row.get("recovery_encrypted_dek"),
                recovery_auth_key_hash: row.try_get("recovery_auth_key_hash").unwrap_or_default(),
                totp_secret_server_encrypted: row.get("totp_secret_server_encrypted"),
                totp_enabled: row.get("totp_enabled"),
                passkey_credential_id: row.try_get("passkey_credential_id").ok().flatten(),
                passkey_label: row.try_get("passkey_label").ok().flatten(),
                passkey_encrypted_dek: row.try_get("passkey_encrypted_dek").ok().flatten(),
                passkey_prf_salt: row.try_get("passkey_prf_salt").ok().flatten(),
                ui_preferences: row.get("ui_preferences"),
                is_admin: row.try_get("is_admin").unwrap_or(false),
                is_active: row.try_get("is_active").unwrap_or(true),
                created_at: row.try_get("created_at").ok(),
                last_login_at: row.try_get("last_login_at").ok(),
            };
            state.mem_users.write().unwrap().insert(id, user.clone());
            return Some(user);
        }
    }
    None
}

fn issue_jwt(
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

fn authenticate_request(
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

    Ok(token_data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;
    use gradus21_core::crypto::{
        derive_recovery_auth_key, generate_vault_bundle, rewrap_dek_for_new_password,
        wrap_dek_with_recovery_key,
    };

    fn create_test_state() -> AppState {
        let tmp_file = std::env::temp_dir().join(format!("gradus21_test_vault_{}.json", Uuid::new_v4()));
        let key_digest = Sha256::digest(b"test_server_encryption_key_2026");
        let rp_id = "localhost";
        let rp_origin = Url::parse("http://localhost:5173").unwrap();
        let webauthn = Arc::new(
            WebauthnBuilder::new(rp_id, &rp_origin)
                .unwrap()
                .rp_name("Gradus21 Test")
                .append_allowed_origin(&Url::parse("http://localhost:3080").unwrap())
                .build()
                .unwrap(),
        );

        AppState {
            db: None,
            disk_store_path: tmp_file,
            mem_users: Arc::new(RwLock::new(HashMap::new())),
            mem_passkeys: Arc::new(RwLock::new(HashMap::new())),
            mem_envelopes: Arc::new(RwLock::new(HashMap::new())),
            mem_settings: Arc::new(RwLock::new(HashMap::new())),
            mem_global_templates: Arc::new(RwLock::new(HashMap::new())),
            auth_rate_limits: Arc::new(RwLock::new(HashMap::new())),
            jwt_secret: "test_jwt_secret_2026".into(),
            server_encryption_key_b64: B64.encode(key_digest),
            admin_emails: vec!["admin@example.com".into()],
            enable_admin_panel: true,
            webauthn,
            reg_challenges: Arc::new(RwLock::new(HashMap::new())),
            auth_challenges: Arc::new(RwLock::new(HashMap::new())),
            legal_config: LegalConfig::default(),
        }
    }

    #[test]
    fn test_rejects_offline_demo_jwt_backdoor() {
        let state = create_test_state();
        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            HeaderValue::from_static("Bearer offline_demo_jwt"),
        );
        let res = authenticate_request(&state, &headers);
        assert!(res.is_err());
        assert_eq!(res.unwrap_err().0, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_register_login_and_cryptographic_recovery_verification() {
        let state = create_test_state();
        let bundle = generate_vault_bundle("InitialPassword123!").expect("bundle");

        // 1. Register user with recovery_auth_key_b64
        let Json(reg_resp) = register_user(
            State(state.clone()),
            Json(RegisterRequest {
                email: "teacher@schule.de".into(),
                auth_key_b64: bundle.auth_key_b64.clone(),
                kdf_salt_b64: bundle.kdf_salt_b64.clone(),
                kdf_params: bundle.kdf_params.clone(),
                encrypted_dek: bundle.encrypted_dek.clone(),
                recovery_encrypted_dek: bundle.recovery_encrypted_dek.clone(),
                recovery_auth_key_b64: Some(bundle.recovery_auth_key_b64.clone()),
            }),
        )
        .await
        .expect("register_user");
        assert_eq!(reg_resp.email, "teacher@schule.de");

        // 2. Verify salt endpoint does NOT leak passkey_credential_id
        let Json(salt_resp) = get_user_salt(
            State(state.clone()),
            Json(SaltQueryRequest {
                email: "teacher@schule.de".into(),
            }),
        )
        .await
        .expect("get_user_salt");
        assert!(!salt_resp.has_passkey);

        // 3. Attempt password recovery with WRONG recovery_auth_key_b64 -> must fail with 401
        let (new_salt, new_params, new_auth_key, new_enc_dek) =
            rewrap_dek_for_new_password(&bundle.dek_b64, "NewPassword456!").expect("rewrap");
        let wrong_rec_key = derive_recovery_auth_key("AAAA-BBBB-CCCC-DDDD-EEEE-FFFF").unwrap();

        let bad_recover = recover_password(
            State(state.clone()),
            Json(RecoverPasswordRequest {
                email: "teacher@schule.de".into(),
                recovery_auth_key_b64: wrong_rec_key,
                new_auth_key_b64: new_auth_key.clone(),
                new_kdf_salt_b64: new_salt.clone(),
                new_kdf_params: new_params.clone(),
                new_encrypted_dek: new_enc_dek.clone(),
                new_recovery_encrypted_dek: None,
                new_recovery_auth_key_b64: None,
            }),
        )
        .await;
        assert!(bad_recover.is_err());
        assert_eq!(bad_recover.err().unwrap().0, StatusCode::UNAUTHORIZED);

        // 4. Attempt password recovery with VALID recovery_auth_key_b64 -> succeeds
        let Json(good_recover) = recover_password(
            State(state.clone()),
            Json(RecoverPasswordRequest {
                email: "teacher@schule.de".into(),
                recovery_auth_key_b64: bundle.recovery_auth_key_b64.clone(),
                new_auth_key_b64: new_auth_key.clone(),
                new_kdf_salt_b64: new_salt,
                new_kdf_params: new_params,
                new_encrypted_dek: new_enc_dek,
                new_recovery_encrypted_dek: None,
                new_recovery_auth_key_b64: None,
            }),
        )
        .await
        .expect("valid recovery");
        assert_eq!(good_recover.user_id, reg_resp.user_id);

        // 5. Test rotating recovery key for logged-in user (e.g. if original sheet lost)
        let mut auth_headers = HeaderMap::new();
        auth_headers.insert(
            "authorization",
            HeaderValue::from_str(&format!("Bearer {}", good_recover.token)).unwrap(),
        );

        let (new_formatted_rec, new_rec_enc_dek) = wrap_dek_with_recovery_key(&bundle.dek_b64, None).expect("wrap new rec");
        let new_rec_auth_b64 = derive_recovery_auth_key(&new_formatted_rec).expect("derive new rec auth");

        let Json(rot_resp) = rotate_recovery_key(
            State(state.clone()),
            auth_headers,
            Json(RotateRecoveryKeyRequest {
                recovery_encrypted_dek: new_rec_enc_dek.clone(),
                recovery_auth_key_b64: new_rec_auth_b64.clone(),
            }),
        )
        .await
        .expect("rotate recovery key");
        assert_eq!(rot_resp["success"], true);

        // Verify that the new recovery key works to recover password again
        let Json(recover_with_new_key) = recover_password(
            State(state.clone()),
            Json(RecoverPasswordRequest {
                email: "teacher@schule.de".into(),
                recovery_auth_key_b64: new_rec_auth_b64,
                new_auth_key_b64: "new_auth_key_2".into(),
                new_kdf_salt_b64: "new_salt_2".into(),
                new_kdf_params: KdfParams::default(),
                new_encrypted_dek: "v1:nonce:new_dek_payload".into(),
                new_recovery_encrypted_dek: None,
                new_recovery_auth_key_b64: None,
            }),
        )
        .await
        .expect("recover with rotated key");
        assert_eq!(recover_with_new_key.user_id, reg_resp.user_id);

        // Clean up temporary vault file
        let _ = fs::remove_file(&state.disk_store_path);
    }

    #[tokio::test]
    async fn test_2fa_setup_locks_after_enabling_and_tenant_isolation() {
        let state = create_test_state();
        let bundle = generate_vault_bundle("Teacher2FA!").expect("bundle");

        let Json(reg_resp) = register_user(
            State(state.clone()),
            Json(RegisterRequest {
                email: "2fa@schule.de".into(),
                auth_key_b64: bundle.auth_key_b64,
                kdf_salt_b64: bundle.kdf_salt_b64,
                kdf_params: bundle.kdf_params,
                encrypted_dek: bundle.encrypted_dek,
                recovery_encrypted_dek: bundle.recovery_encrypted_dek,
                recovery_auth_key_b64: Some(bundle.recovery_auth_key_b64),
            }),
        )
        .await
        .expect("register");

        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            HeaderValue::from_str(&format!("Bearer {}", reg_resp.token)).unwrap(),
        );

        // 1. Setup 2FA before enabling -> returns secret_base32, no totp_current_code_hint
        let Json(setup_info) = get_2fa_setup_info(State(state.clone()), headers.clone())
            .await
            .expect("2fa setup");
        assert!(setup_info.get("totp_current_code_hint").is_none());
        let secret_b32 = setup_info["totp_secret_base32"].as_str().unwrap().to_string();

        // 2. Verify and enable 2FA using valid TOTP code
        let valid_code = totp::current_totp_code(&secret_b32).expect("code");
        let Json(verified_info) = verify_and_enable_2fa(
            State(state.clone()),
            headers.clone(),
            Json(VerifyTotpRequest {
                totp_code: valid_code,
            }),
        )
        .await
        .expect("enable 2fa");
        assert_eq!(verified_info["totp_enabled"], true);

        // 3. Calling get_2fa_setup_info again after 2FA is enabled must be rejected with 409 CONFLICT
        let second_setup = get_2fa_setup_info(State(state.clone()), headers.clone()).await;
        assert!(second_setup.is_err());
        assert_eq!(second_setup.unwrap_err().0, StatusCode::CONFLICT);

        // 3b. Reconfiguring 2FA generates a new secret and temporarily resets totp_enabled to false until verified
        let Json(reconf_info) = reconfigure_2fa(State(state.clone()), headers.clone())
            .await
            .expect("reconfigure 2fa");
        assert_eq!(reconf_info["totp_enabled"], false);
        let new_secret_b32 = reconf_info["totp_secret_base32"].as_str().unwrap().to_string();
        assert_ne!(new_secret_b32, secret_b32);

        // Verify with new secret enables 2FA again
        let new_valid_code = totp::current_totp_code(&new_secret_b32).expect("new code");
        let Json(re_verified) = verify_and_enable_2fa(
            State(state.clone()),
            headers.clone(),
            Json(VerifyTotpRequest {
                totp_code: new_valid_code,
            }),
        )
        .await
        .expect("re-enable 2fa");
        assert_eq!(re_verified["totp_enabled"], true);

        // 3c. Disabling 2FA resets totp_enabled to false
        let Json(disabled_info) = disable_2fa(State(state.clone()), headers.clone())
            .await
            .expect("disable 2fa");
        assert_eq!(disabled_info["totp_enabled"], false);

        // Re-enable again for remaining tests
        let valid_code_again = totp::current_totp_code(&new_secret_b32).expect("code again");
        let _ = verify_and_enable_2fa(
            State(state.clone()),
            headers.clone(),
            Json(VerifyTotpRequest {
                totp_code: valid_code_again,
            }),
        )
        .await
        .expect("re-enable 2fa again");

        // 4. Upsert envelope and verify tenant isolation + OCC
        let env_id = Uuid::new_v4();
        let Json(env_rec) = upsert_envelope(
            State(state.clone()),
            headers.clone(),
            Json(UpsertEnvelopeRequest {
                id: env_id,
                entity_type: "workspace_v2".into(),
                parent_id: None,
                class_id: None,
                encrypted_payload: "v1:nonce:cipher".into(),
                expected_version: None,
            }),
        )
        .await
        .expect("upsert");
        assert_eq!(env_rec.owner_user_id, reg_resp.user_id);
        assert_eq!(env_rec.version, 1);

        // OCC Test: Updating with wrong expected_version must fail with 409 Conflict
        let conflict_res = upsert_envelope(
            State(state.clone()),
            headers.clone(),
            Json(UpsertEnvelopeRequest {
                id: env_id,
                entity_type: "workspace_v2".into(),
                parent_id: None,
                class_id: None,
                encrypted_payload: "v1:nonce:cipher_conflict".into(),
                expected_version: Some(999),
            }),
        )
        .await;
        assert!(conflict_res.is_err());
        assert_eq!(conflict_res.unwrap_err().0, StatusCode::CONFLICT);

        // OCC Test: Updating with correct expected_version (1) succeeds and advances to version 2
        let Json(updated_rec) = upsert_envelope(
            State(state.clone()),
            headers.clone(),
            Json(UpsertEnvelopeRequest {
                id: env_id,
                entity_type: "workspace_v2".into(),
                parent_id: None,
                class_id: None,
                encrypted_payload: "v1:nonce:cipher_updated".into(),
                expected_version: Some(1),
            }),
        )
        .await
        .expect("valid occ update");
        assert_eq!(updated_rec.version, 2);

        let _ = fs::remove_file(&state.disk_store_path);
    }

    #[tokio::test]
    async fn test_passkey_prf_registration_and_login_flow() {
        use gradus21_core::crypto::{generate_vault_bundle, wrap_dek_with_passkey_secret, unwrap_dek_with_passkey_secret};
        use base64::{engine::general_purpose::STANDARD as B64, Engine as _};

        let state = create_test_state();
        let bundle = generate_vault_bundle("Password123!").expect("bundle");

        // 1. Register base user
        let Json(reg_resp) = register_user(
            State(state.clone()),
            Json(RegisterRequest {
                email: "passkey_user@schule.de".into(),
                auth_key_b64: bundle.auth_key_b64.clone(),
                kdf_salt_b64: bundle.kdf_salt_b64.clone(),
                kdf_params: bundle.kdf_params.clone(),
                encrypted_dek: bundle.encrypted_dek.clone(),
                recovery_encrypted_dek: bundle.recovery_encrypted_dek.clone(),
                recovery_auth_key_b64: Some(bundle.recovery_auth_key_b64.clone()),
            }),
        )
        .await
        .expect("register user");

        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            HeaderValue::from_str(&format!("Bearer {}", reg_resp.token)).unwrap(),
        );

        // 2. Simulate WebAuthn PRF extension output (32 random bytes derived by authenticator)
        let prf_salt_bytes = [7u8; 32];
        let prf_salt_b64 = B64.encode(prf_salt_bytes);
        let prf_secret_bytes = [42u8; 32];
        let prf_secret_b64 = B64.encode(prf_secret_bytes);
        let cred_id = "cred_prf_hardware_touchid_12345";

        let passkey_encrypted_dek = wrap_dek_with_passkey_secret(&bundle.dek_b64, &prf_secret_b64, cred_id)
            .expect("wrap dek with prf secret");

        // 3. Register Passkey with PRF salt
        let Json(passkey_reg_resp) = register_passkey(
            State(state.clone()),
            headers.clone(),
            Json(PasskeyRegisterRequest {
                credential_id: cred_id.into(),
                label: "MacBook Touch ID".into(),
                passkey_encrypted_dek: passkey_encrypted_dek.clone(),
                passkey_prf_salt_b64: Some(prf_salt_b64.clone()),
                kdf_salt_b64: Some(bundle.kdf_salt_b64.clone()),
                encrypted_dek: Some(bundle.encrypted_dek.clone()),
                recovery_encrypted_dek: Some(bundle.recovery_encrypted_dek.clone()),
                recovery_auth_key_b64: Some(bundle.recovery_auth_key_b64.clone()),
            }),
        )
        .await
        .expect("register passkey");
        assert_eq!(passkey_reg_resp["passkey_credential_id"], cred_id);
        assert_eq!(passkey_reg_resp["passkey_prf_salt_b64"], prf_salt_b64);

        // 4. Verify salt query returns has_passkey = true and passkey_prf_salt_b64
        let Json(salt_info) = get_user_salt(
            State(state.clone()),
            Json(SaltQueryRequest {
                email: "passkey_user@schule.de".into(),
            }),
        )
        .await
        .expect("get salt");
        assert!(salt_info.has_passkey);
        assert_eq!(salt_info.passkey_prf_salt_b64, Some(prf_salt_b64.clone()));

        // 5. Login via Passkey Credential ID
        let Json(login_resp) = login_with_passkey(
            State(state.clone()),
            Json(PasskeyLoginRequest {
                email: Some("passkey_user@schule.de".into()),
                credential_id: cred_id.into(),
            }),
        )
        .await
        .expect("login with passkey");
        assert_eq!(login_resp.passkey_credential_id, Some(cred_id.into()));
        assert_eq!(login_resp.passkey_prf_salt_b64, Some(prf_salt_b64));
        assert_eq!(login_resp.passkey_encrypted_dek, Some(passkey_encrypted_dek.clone()));

        // 6. Client unwraps DEK using the hardware PRF secret
        let unwrapped_dek = unwrap_dek_with_passkey_secret(&prf_secret_b64, cred_id, &login_resp.passkey_encrypted_dek.unwrap())
            .expect("unwrap dek");
        assert_eq!(unwrapped_dek, bundle.dek_b64);

        // 7. Delete Passkey and verify state is cleared
        let Json(del_resp) = delete_passkey(
            State(state.clone()),
            headers,
        )
        .await
        .expect("delete passkey");
        assert_eq!(del_resp["success"], true);

        let Json(salt_after_del) = get_user_salt(
            State(state.clone()),
            Json(SaltQueryRequest {
                email: "passkey_user@schule.de".into(),
            }),
        )
        .await
        .expect("get salt after del");
        assert!(!salt_after_del.has_passkey);

        let _ = fs::remove_file(&state.disk_store_path);
    }

    #[tokio::test]
    async fn test_admin_permissions_user_management_and_templates() {
        let state = create_test_state();
        let bundle1 = generate_vault_bundle("AdminPass123!").expect("bundle1");
        let bundle2 = generate_vault_bundle("TeacherPass123!").expect("bundle2");

        // 1. Register first user (automatically becomes admin)
        let Json(admin_auth) = register_user(
            State(state.clone()),
            Json(RegisterRequest {
                email: "admin@schule.de".into(),
                auth_key_b64: bundle1.auth_key_b64.clone(),
                kdf_salt_b64: bundle1.kdf_salt_b64.clone(),
                kdf_params: bundle1.kdf_params.clone(),
                encrypted_dek: bundle1.encrypted_dek.clone(),
                recovery_encrypted_dek: bundle1.recovery_encrypted_dek.clone(),
                recovery_auth_key_b64: None,
            }),
        )
        .await
        .expect("admin register");
        assert!(admin_auth.is_admin);

        // 2. Register second user (standard user)
        let Json(teacher_auth) = register_user(
            State(state.clone()),
            Json(RegisterRequest {
                email: "teacher@schule.de".into(),
                auth_key_b64: bundle2.auth_key_b64.clone(),
                kdf_salt_b64: bundle2.kdf_salt_b64.clone(),
                kdf_params: bundle2.kdf_params.clone(),
                encrypted_dek: bundle2.encrypted_dek.clone(),
                recovery_encrypted_dek: bundle2.recovery_encrypted_dek.clone(),
                recovery_auth_key_b64: None,
            }),
        )
        .await
        .expect("teacher register");
        assert!(!teacher_auth.is_admin);

        // 3. Teacher attempts to access admin endpoint -> 403 Forbidden
        let mut teacher_headers = HeaderMap::new();
        teacher_headers.insert("authorization", format!("Bearer {}", teacher_auth.token).parse().unwrap());
        let forbidden_res = admin::list_users(State(state.clone()), teacher_headers.clone()).await;
        assert!(forbidden_res.is_err());
        assert_eq!(forbidden_res.unwrap_err().0, StatusCode::FORBIDDEN);

        // 4. Admin accesses admin endpoint -> success, returns user list with last_login_at
        let mut admin_headers = HeaderMap::new();
        admin_headers.insert("authorization", format!("Bearer {}", admin_auth.token).parse().unwrap());
        let Json(users_list) = admin::list_users(State(state.clone()), admin_headers.clone())
            .await
            .expect("admin list users");
        assert_eq!(users_list.len(), 2);
        let teacher_entry = users_list.iter().find(|u| u.email == "teacher@schule.de").unwrap();
        assert!(teacher_entry.last_login_at.is_some());
        assert_eq!(teacher_entry.is_admin, false);

        // 5. Demoting the only admin must fail
        let demote_req = admin::UpdateUserStatusRequest {
            is_admin: Some(false),
            is_active: None,
        };
        let demote_res = admin::update_user_status(
            State(state.clone()),
            admin_headers.clone(),
            Path(admin_auth.user_id),
            Json(demote_req),
        )
        .await;
        assert!(demote_res.is_err());
        assert_eq!(demote_res.unwrap_err().0, StatusCode::BAD_REQUEST);

        // 6. Deactivating oneself must fail
        let deactivate_self_req = admin::UpdateUserStatusRequest {
            is_admin: None,
            is_active: Some(false),
        };
        let deactivate_self_res = admin::update_user_status(
            State(state.clone()),
            admin_headers.clone(),
            Path(admin_auth.user_id),
            Json(deactivate_self_req),
        )
        .await;
        assert!(deactivate_self_res.is_err());
        assert_eq!(deactivate_self_res.unwrap_err().0, StatusCode::BAD_REQUEST);

        // 7. Admin creates global template
        let tpl_req = admin::UpsertGlobalTemplateRequest {
            template_type: "curve".into(),
            title: "Standard IHK Schlüssel".into(),
            description: "Globale Vorlage für Notenschlüssel".into(),
            payload: serde_json::json!({ "linear": true, "pass_percentage": 50 }),
        };
        let Json(created_tpl) = admin::create_global_template(
            State(state.clone()),
            admin_headers.clone(),
            Json(tpl_req),
        )
        .await
        .expect("create global template");
        assert_eq!(created_tpl.title, "Standard IHK Schlüssel");

        // 8. Teacher can list global templates
        let Json(public_tpls) = admin::list_global_templates(State(state.clone()), teacher_headers.clone())
            .await
            .expect("public tpls");
        assert_eq!(public_tpls.len(), 1);
        assert_eq!(public_tpls[0].title, "Standard IHK Schlüssel");

        // 9. Admin updates global template
        let update_req = admin::UpsertGlobalTemplateRequest {
            template_type: "curve".into(),
            title: "Standard IHK Schlüssel v2".into(),
            description: "Aktualisierte globale Vorlage".into(),
            payload: serde_json::json!({ "linear": true, "pass_percentage": 50 }),
        };
        let Json(updated_tpl) = admin::update_global_template(
            State(state.clone()),
            admin_headers.clone(),
            Path(created_tpl.id),
            Json(update_req),
        )
        .await
        .expect("update global template");
        assert_eq!(updated_tpl.title, "Standard IHK Schlüssel v2");

        // 10. Teacher can list updated templates
        let Json(updated_public_tpls) = admin::list_global_templates(State(state.clone()), teacher_headers.clone())
            .await
            .expect("public tpls");
        assert_eq!(updated_public_tpls.len(), 1);
        assert_eq!(updated_public_tpls[0].title, "Standard IHK Schlüssel v2");

        let _ = fs::remove_file(&state.disk_store_path);
    }

    #[tokio::test]
    async fn test_full_registration_onboarding_recovery_totp_and_passkey_flow() {
        let state = create_test_state();
        let password = "SuperSecretPassword2026!";
        let bundle = generate_vault_bundle(password).expect("bundle");

        // 1. Initial registration step (Credentials & Master Password)
        let Json(reg_resp) = register_user(
            State(state.clone()),
            Json(RegisterRequest {
                email: "onboarding.teacher@schule.de".into(),
                auth_key_b64: bundle.auth_key_b64.clone(),
                kdf_salt_b64: bundle.kdf_salt_b64.clone(),
                kdf_params: bundle.kdf_params.clone(),
                encrypted_dek: bundle.encrypted_dek.clone(),
                recovery_encrypted_dek: bundle.recovery_encrypted_dek.clone(),
                recovery_auth_key_b64: Some(bundle.recovery_auth_key_b64.clone()),
            }),
        )
        .await
        .expect("register user");

        assert_eq!(reg_resp.email, "onboarding.teacher@schule.de");
        assert_eq!(reg_resp.totp_enabled, false);
        assert!(reg_resp.totp_setup_uri.is_some());
        assert!(reg_resp.totp_secret_base32.is_some());

        let mut auth_headers = HeaderMap::new();
        auth_headers.insert(
            "authorization",
            format!("Bearer {}", reg_resp.token).parse().unwrap(),
        );

        // 2. Recovery Key verification: Ensure recovery key allows DEK recovery
        let rec_auth_key = derive_recovery_auth_key(&bundle.recovery_key_formatted).unwrap();
        assert_eq!(rec_auth_key, bundle.recovery_auth_key_b64);

        // 3. Mandatory 2FA Setup Step
        let totp_secret_b32 = reg_resp.totp_secret_base32.unwrap();
        // Trying with invalid 2FA code must fail with 400 Bad Request
        let bad_2fa = verify_and_enable_2fa(
            State(state.clone()),
            auth_headers.clone(),
            Json(VerifyTotpRequest {
                totp_code: "000000".into(),
            }),
        )
        .await;
        assert!(bad_2fa.is_err());
        assert_eq!(bad_2fa.unwrap_err().0, StatusCode::BAD_REQUEST);

        // Verifying with valid 6-digit TOTP code must succeed and enable 2FA
        let valid_totp = totp::current_totp_code(&totp_secret_b32).expect("valid totp code");
        let Json(verified_info) = verify_and_enable_2fa(
            State(state.clone()),
            auth_headers.clone(),
            Json(VerifyTotpRequest {
                totp_code: valid_totp.clone(),
            }),
        )
        .await
        .expect("verify 2fa");
        assert_eq!(verified_info["totp_enabled"], true);

        // 4. Optional Passkey Registration Step
        let cred_id = "test_passkey_cred_123";
        let passkey_enc_dek = "v1:nonce:passkey_encrypted_dek_payload";
        let prf_salt_b64 = "prf_salt_sample_base64";
        let Json(passkey_reg_resp) = register_passkey(
            State(state.clone()),
            auth_headers.clone(),
            Json(PasskeyRegisterRequest {
                credential_id: cred_id.into(),
                label: "MacBook Touch ID".into(),
                passkey_encrypted_dek: passkey_enc_dek.into(),
                passkey_prf_salt_b64: Some(prf_salt_b64.into()),
                kdf_salt_b64: Some(bundle.kdf_salt_b64.clone()),
                encrypted_dek: Some(bundle.encrypted_dek.clone()),
                recovery_encrypted_dek: Some(bundle.recovery_encrypted_dek.clone()),
                recovery_auth_key_b64: Some(bundle.recovery_auth_key_b64.clone()),
            }),
        )
        .await
        .expect("register passkey");
        assert_eq!(passkey_reg_resp["passkey_credential_id"], cred_id);

        // 5. Subsequent Login Verification:
        // A) Password login without TOTP code must now be rejected with 2FA_REQUIRED
        let login_no_2fa = login_user(
            State(state.clone()),
            Json(LoginRequest {
                email: "onboarding.teacher@schule.de".into(),
                auth_key_b64: bundle.auth_key_b64.clone(),
                totp_code: None,
            }),
        )
        .await;
        assert!(login_no_2fa.is_err());
        assert_eq!(login_no_2fa.unwrap_err().1, "2FA_REQUIRED");

        // B) Password login with valid TOTP code succeeds
        let Json(login_ok) = login_user(
            State(state.clone()),
            Json(LoginRequest {
                email: "onboarding.teacher@schule.de".into(),
                auth_key_b64: bundle.auth_key_b64.clone(),
                totp_code: Some(valid_totp),
            }),
        )
        .await
        .expect("login with 2fa");
        assert_eq!(login_ok.totp_enabled, true);
        assert_eq!(login_ok.passkey_credential_id, Some(cred_id.into()));

        // C) Passkey login succeeds directly
        let Json(passkey_login_ok) = login_with_passkey(
            State(state.clone()),
            Json(PasskeyLoginRequest {
                email: Some("onboarding.teacher@schule.de".into()),
                credential_id: cred_id.into(),
            }),
        )
        .await
        .expect("passkey login");
        assert_eq!(passkey_login_ok.passkey_encrypted_dek, Some(passkey_enc_dek.into()));

        let _ = fs::remove_file(&state.disk_store_path);
    }

    #[tokio::test]
    async fn test_backup_snapshot_and_schedule_configuration() {
        let state = create_test_state();
        let claims = JwtClaims {
            sub: Uuid::new_v4().to_string(),
            email: "admin@example.com".into(),
            is_admin: true,
            two_factor_verified: true,
            exp: (Utc::now() + chrono::Duration::hours(1)).timestamp() as usize,
        };
        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
        )
        .expect("token");

        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            HeaderValue::from_str(&format!("Bearer {}", token)).unwrap(),
        );

        // 1. Create a snapshot
        let Json(entry) = admin::create_backup_snapshot(State(state.clone()), headers.clone())
            .await
            .expect("create snapshot");
        assert!(entry.filename.starts_with("gradus21_backup_"));
        assert!(entry.size_bytes > 0);

        // 2. List backups
        let Json(backups) = admin::list_backups(State(state.clone()), headers.clone())
            .await
            .expect("list backups");
        assert_eq!(backups.len(), 1);
        assert_eq!(backups[0].filename, entry.filename);

        // 3. Update schedule with alias and custom intervals
        let new_cfg = admin::BackupScheduleConfig {
            auto_backup_enabled: true,
            interval_hours: 12,
            retention_days: 14,
            last_run: None,
        };
        let Json(saved_cfg) = admin::update_backup_config(
            State(state.clone()),
            headers.clone(),
            Json(new_cfg),
        )
        .await
        .expect("update schedule");
        assert_eq!(saved_cfg.interval_hours, 12);
        assert_eq!(saved_cfg.retention_days, 14);

        // 4. Retrieve schedule
        let Json(retrieved_cfg) = admin::get_backup_config(State(state.clone()), headers.clone())
            .await
            .expect("get schedule");
        assert_eq!(retrieved_cfg.auto_backup_enabled, true);
        assert_eq!(retrieved_cfg.interval_hours, 12);
        assert_eq!(retrieved_cfg.retention_days, 14);

        // Cleanup test files
        let backup_dir = state
            .disk_store_path
            .parent()
            .unwrap()
            .join("backups");
        let _ = fs::remove_file(backup_dir.join(&entry.filename));
        let _ = fs::remove_dir(backup_dir);
        let _ = fs::remove_file(&state.disk_store_path);
    }

    #[tokio::test]
    async fn test_default_global_templates_rollout() {
        let default_tpls = admin::default_global_templates();
        assert_eq!(default_tpls.len(), 17);

        let curves = default_tpls.iter().filter(|t| t.template_type == "curve").count();
        let weightings = default_tpls.iter().filter(|t| t.template_type == "weighting").count();
        let levels = default_tpls.iter().filter(|t| t.template_type == "levels").count();

        assert_eq!(curves, 5);
        assert_eq!(weightings, 8);
        assert_eq!(levels, 4);

        let state = create_test_state();
        // Seed default templates into state.mem_global_templates
        {
            let mut map = state.mem_global_templates.write().unwrap();
            for tpl in &default_tpls {
                map.insert(tpl.id, tpl.clone());
            }
        }

        // Unauthenticated client can list global templates
        let empty_headers = HeaderMap::new();
        let Json(listed) = admin::list_global_templates(State(state.clone()), empty_headers)
            .await
            .expect("unauthenticated list global templates");
        assert_eq!(listed.len(), 17);
    }

    #[tokio::test]
    async fn test_multi_passkey_management() {
        use gradus21_core::crypto::{generate_vault_bundle, wrap_dek_with_passkey_secret};
        use base64::{engine::general_purpose::STANDARD as B64, Engine as _};

        let state = create_test_state();
        let bundle = generate_vault_bundle("Password123!").expect("bundle");

        // 1. Register user
        let Json(reg_resp) = register_user(
            State(state.clone()),
            Json(RegisterRequest {
                email: "teacher_multipass@schule.de".into(),
                auth_key_b64: bundle.auth_key_b64.clone(),
                kdf_salt_b64: bundle.kdf_salt_b64.clone(),
                kdf_params: bundle.kdf_params.clone(),
                encrypted_dek: bundle.encrypted_dek.clone(),
                recovery_encrypted_dek: bundle.recovery_encrypted_dek.clone(),
                recovery_auth_key_b64: Some(bundle.recovery_auth_key_b64.clone()),
            }),
        )
        .await
        .expect("register user");

        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            HeaderValue::from_str(&format!("Bearer {}", reg_resp.token)).unwrap(),
        );

        // 2. Register first passkey (iPad)
        let prf_secret_1 = [10u8; 32];
        let enc_dek_1 = wrap_dek_with_passkey_secret(&bundle.dek_b64, &B64.encode(prf_secret_1), "cred_ipad_1")
            .unwrap();
        let _ = register_passkey(
            State(state.clone()),
            headers.clone(),
            Json(PasskeyRegisterRequest {
                credential_id: "cred_ipad_1".into(),
                label: "iPad Air Touch ID".into(),
                passkey_encrypted_dek: enc_dek_1.clone(),
                passkey_prf_salt_b64: Some(B64.encode([1u8; 32])),
                kdf_salt_b64: None,
                encrypted_dek: None,
                recovery_encrypted_dek: None,
                recovery_auth_key_b64: None,
            }),
        )
        .await
        .expect("register ipad passkey");

        // 3. Register second passkey (MacBook)
        let prf_secret_2 = [20u8; 32];
        let enc_dek_2 = wrap_dek_with_passkey_secret(&bundle.dek_b64, &B64.encode(prf_secret_2), "cred_macbook_2")
            .unwrap();
        let _ = register_passkey(
            State(state.clone()),
            headers.clone(),
            Json(PasskeyRegisterRequest {
                credential_id: "cred_macbook_2".into(),
                label: "MacBook Pro Touch ID".into(),
                passkey_encrypted_dek: enc_dek_2.clone(),
                passkey_prf_salt_b64: Some(B64.encode([2u8; 32])),
                kdf_salt_b64: None,
                encrypted_dek: None,
                recovery_encrypted_dek: None,
                recovery_auth_key_b64: None,
            }),
        )
        .await
        .expect("register macbook passkey");

        // 4. List passkeys
        let Json(list) = list_user_passkeys(State(state.clone()), headers.clone())
            .await
            .expect("list passkeys");
        assert_eq!(list.len(), 2);
        let cred_ids: Vec<&str> = list.iter().map(|p| p["credential_id"].as_str().unwrap()).collect();
        assert!(cred_ids.contains(&"cred_ipad_1"));
        assert!(cred_ids.contains(&"cred_macbook_2"));

        let ipad_entry = list.iter().find(|p| p["credential_id"] == "cred_ipad_1").unwrap();
        let ipad_id = Uuid::parse_str(ipad_entry["id"].as_str().unwrap()).unwrap();

        // 5. Rename passkey
        let Json(renamed) = rename_user_passkey(
            State(state.clone()),
            headers.clone(),
            Path(ipad_id),
            Json(RenamePasskeyRequest {
                label: "iPad Schultasche".into(),
            }),
        )
        .await
        .expect("rename passkey");
        assert_eq!(renamed["label"], "iPad Schultasche");

        // 6. Login with second passkey
        let Json(login_mb) = login_with_passkey(
            State(state.clone()),
            Json(PasskeyLoginRequest {
                email: Some("teacher_multipass@schule.de".into()),
                credential_id: "cred_macbook_2".into(),
            }),
        )
        .await
        .expect("login with macbook passkey");
        assert_eq!(login_mb.passkey_credential_id, Some("cred_macbook_2".into()));
        assert_eq!(login_mb.passkey_encrypted_dek, Some(enc_dek_2));

        // 7. Delete first passkey
        let Json(del_resp) = delete_user_passkey_by_id(
            State(state.clone()),
            headers.clone(),
            Path(ipad_id),
        )
        .await
        .expect("delete passkey by id");
        assert_eq!(del_resp["success"], true);

        // 8. Verify list has only 1 remaining passkey
        let Json(list_after) = list_user_passkeys(State(state.clone()), headers.clone())
            .await
            .expect("list passkeys after delete");
        assert_eq!(list_after.len(), 1);
        assert_eq!(list_after[0]["credential_id"], "cred_macbook_2");
    }

    #[test]
    fn test_webauthn_builder_and_origin_configuration() {
        let webauthn = create_webauthn();
        assert!(Arc::strong_count(&webauthn) >= 1);
    }

    #[tokio::test]
    async fn test_granular_class_envelopes_occ_and_deletion() {
        use gradus21_core::crypto::generate_vault_bundle;

        let state = create_test_state();
        let bundle = generate_vault_bundle("GranularSecure2026!").expect("vault bundle");
        let reg_resp = register_user(
            State(state.clone()),
            Json(RegisterRequest {
                email: "teacher_occ@schule.de".into(),
                auth_key_b64: bundle.auth_key_b64.clone(),
                kdf_salt_b64: bundle.kdf_salt_b64.clone(),
                kdf_params: bundle.kdf_params.clone(),
                encrypted_dek: bundle.encrypted_dek.clone(),
                recovery_encrypted_dek: bundle.recovery_encrypted_dek.clone(),
                recovery_auth_key_b64: Some(bundle.recovery_auth_key_b64.clone()),
            }),
        )
        .await
        .expect("register_user")
        .0;

        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            HeaderValue::from_str(&format!("Bearer {}", reg_resp.token)).unwrap(),
        );

        let class_a_id = Uuid::new_v4();
        let class_b_id = Uuid::new_v4();

        // 1. Initial batch sync: save class A and class B
        let Json(synced) = batch_sync_envelopes(
            State(state.clone()),
            headers.clone(),
            Json(BatchSyncRequest {
                envelopes: vec![
                    BatchUpsertItem {
                        id: class_a_id,
                        entity_type: "class_dataset".into(),
                        parent_id: None,
                        class_id: Some(class_a_id),
                        encrypted_payload: "v1:nonce:class_a_payload_v1".into(),
                        expected_version: None,
                    },
                    BatchUpsertItem {
                        id: class_b_id,
                        entity_type: "class_dataset".into(),
                        parent_id: None,
                        class_id: Some(class_b_id),
                        encrypted_payload: "v1:nonce:class_b_payload_v1".into(),
                        expected_version: None,
                    },
                ],
            }),
        )
        .await
        .expect("initial batch sync");

        assert_eq!(synced.len(), 2);
        let rec_a = synced.iter().find(|e| e.id == class_a_id).unwrap();
        assert_eq!(rec_a.version, 1);
        assert_eq!(rec_a.entity_type, "class_dataset");

        // 2. Tab 1 updates Class A with expected_version = 1 -> succeeds to version 2
        let Json(tab1_update) = batch_sync_envelopes(
            State(state.clone()),
            headers.clone(),
            Json(BatchSyncRequest {
                envelopes: vec![BatchUpsertItem {
                    id: class_a_id,
                    entity_type: "class_dataset".into(),
                    parent_id: None,
                    class_id: Some(class_a_id),
                    encrypted_payload: "v1:nonce:class_a_payload_v2".into(),
                    expected_version: Some(1),
                }],
            }),
        )
        .await
        .expect("tab 1 update");
        assert_eq!(tab1_update[0].version, 2);

        // 3. Tab 2 tries to update Class A with stale expected_version = 1 -> must return 409 Conflict with conflict_envelope!
        let tab2_conflict = batch_sync_envelopes(
            State(state.clone()),
            headers.clone(),
            Json(BatchSyncRequest {
                envelopes: vec![BatchUpsertItem {
                    id: class_a_id,
                    entity_type: "class_dataset".into(),
                    parent_id: None,
                    class_id: Some(class_a_id),
                    encrypted_payload: "v1:nonce:class_a_tab2_stale".into(),
                    expected_version: Some(1),
                }],
            }),
        )
        .await;

        assert!(tab2_conflict.is_err());
        let (status, err_body) = tab2_conflict.unwrap_err();
        assert_eq!(status, StatusCode::CONFLICT);
        let err_json: serde_json::Value = serde_json::from_str(&err_body).expect("valid json error response");
        assert_eq!(err_json["error"], "conflict");
        assert_eq!(err_json["server_version"], 2);
        assert_eq!(err_json["expected_version"], 1);
        assert_eq!(err_json["conflict_envelope"]["version"], 2);
        assert_eq!(
            err_json["conflict_envelope"]["encrypted_payload"],
            "v1:nonce:class_a_payload_v2"
        );

        // 4. Tab 2 resolves conflict by submitting with expected_version = 2 -> succeeds to version 3
        let Json(tab2_resolved) = batch_sync_envelopes(
            State(state.clone()),
            headers.clone(),
            Json(BatchSyncRequest {
                envelopes: vec![BatchUpsertItem {
                    id: class_a_id,
                    entity_type: "class_dataset".into(),
                    parent_id: None,
                    class_id: Some(class_a_id),
                    encrypted_payload: "v1:nonce:class_a_merged_v3".into(),
                    expected_version: Some(2),
                }],
            }),
        )
        .await
        .expect("tab 2 resolved update");
        assert_eq!(tab2_resolved[0].version, 3);

        // 5. Delete Class B
        let del_status = delete_envelope(State(state.clone()), headers.clone(), Path(class_b_id))
            .await
            .expect("delete class B");
        assert_eq!(del_status, StatusCode::NO_CONTENT);

        // 6. List envelopes via GET /api/envelopes and GET /api/envelopes/sync
        let Json(envelopes_list) = list_envelopes(State(state.clone()), headers.clone())
            .await
            .expect("list envelopes");
        assert_eq!(envelopes_list.len(), 1);
        assert_eq!(envelopes_list[0].id, class_a_id);
        assert_eq!(envelopes_list[0].version, 3);

        let _ = fs::remove_file(&state.disk_store_path);
    }

    #[tokio::test]
    async fn test_delete_all_user_envelopes_removes_only_own_data() {
        use gradus21_core::crypto::generate_vault_bundle;

        let state = create_test_state();
        let bundle1 = generate_vault_bundle("PasswordTeacher1!").expect("vault bundle 1");
        let bundle2 = generate_vault_bundle("PasswordTeacher2!").expect("vault bundle 2");

        let reg1 = register_user(
            State(state.clone()),
            Json(RegisterRequest {
                email: "teacher_alpha@schule.de".into(),
                auth_key_b64: bundle1.auth_key_b64.clone(),
                kdf_salt_b64: bundle1.kdf_salt_b64.clone(),
                kdf_params: bundle1.kdf_params.clone(),
                encrypted_dek: bundle1.encrypted_dek.clone(),
                recovery_encrypted_dek: bundle1.recovery_encrypted_dek.clone(),
                recovery_auth_key_b64: Some(bundle1.recovery_auth_key_b64.clone()),
            }),
        )
        .await
        .expect("reg1")
        .0;

        let reg2 = register_user(
            State(state.clone()),
            Json(RegisterRequest {
                email: "teacher_beta@schule.de".into(),
                auth_key_b64: bundle2.auth_key_b64.clone(),
                kdf_salt_b64: bundle2.kdf_salt_b64.clone(),
                kdf_params: bundle2.kdf_params.clone(),
                encrypted_dek: bundle2.encrypted_dek.clone(),
                recovery_encrypted_dek: bundle2.recovery_encrypted_dek.clone(),
                recovery_auth_key_b64: Some(bundle2.recovery_auth_key_b64.clone()),
            }),
        )
        .await
        .expect("reg2")
        .0;

        let mut headers1 = HeaderMap::new();
        headers1.insert(
            "authorization",
            HeaderValue::from_str(&format!("Bearer {}", reg1.token)).unwrap(),
        );

        let mut headers2 = HeaderMap::new();
        headers2.insert(
            "authorization",
            HeaderValue::from_str(&format!("Bearer {}", reg2.token)).unwrap(),
        );

        let env1_id = Uuid::new_v4();
        let env2_id = Uuid::new_v4();

        // Teacher 1 saves an envelope
        let _ = batch_sync_envelopes(
            State(state.clone()),
            headers1.clone(),
            Json(BatchSyncRequest {
                envelopes: vec![BatchUpsertItem {
                    id: env1_id,
                    entity_type: "class_dataset".into(),
                    parent_id: None,
                    class_id: Some(env1_id),
                    encrypted_payload: "t1_secret_envelope".into(),
                    expected_version: None,
                }],
            }),
        )
        .await
        .expect("t1 batch sync");

        // Teacher 2 saves an envelope
        let _ = batch_sync_envelopes(
            State(state.clone()),
            headers2.clone(),
            Json(BatchSyncRequest {
                envelopes: vec![BatchUpsertItem {
                    id: env2_id,
                    entity_type: "class_dataset".into(),
                    parent_id: None,
                    class_id: Some(env2_id),
                    encrypted_payload: "t2_secret_envelope".into(),
                    expected_version: None,
                }],
            }),
        )
        .await
        .expect("t2 batch sync");

        // Both have 1 envelope
        let Json(t1_before) = list_envelopes(State(state.clone()), headers1.clone()).await.unwrap();
        assert_eq!(t1_before.len(), 1);
        let Json(t2_before) = list_envelopes(State(state.clone()), headers2.clone()).await.unwrap();
        assert_eq!(t2_before.len(), 1);

        // Teacher 1 deletes all their cloud envelopes (opting out of cloud sync)
        let status = delete_all_user_envelopes(State(state.clone()), headers1.clone()).await.unwrap();
        assert_eq!(status, StatusCode::NO_CONTENT);

        // Teacher 1 now has 0 envelopes
        let Json(t1_after) = list_envelopes(State(state.clone()), headers1.clone()).await.unwrap();
        assert_eq!(t1_after.len(), 0);

        // Teacher 2 still has their 1 envelope intact!
        let Json(t2_after) = list_envelopes(State(state.clone()), headers2.clone()).await.unwrap();
        assert_eq!(t2_after.len(), 1);
        assert_eq!(t2_after[0].id, env2_id);

        let _ = fs::remove_file(&state.disk_store_path);
    }
}

