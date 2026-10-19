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
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub db: Option<PgPool>,
    pub disk_store_path: PathBuf,
    pub mem_users: Arc<RwLock<HashMap<Uuid, UserRecord>>>,
    pub mem_envelopes: Arc<RwLock<HashMap<Uuid, EncryptedEnvelopeRecord>>>,
    pub mem_settings: Arc<RwLock<HashMap<String, serde_json::Value>>>,
    pub mem_global_templates: Arc<RwLock<HashMap<Uuid, admin::GlobalTemplateRecord>>>,
    pub auth_rate_limits: Arc<RwLock<HashMap<String, Vec<Instant>>>>,
    pub jwt_secret: String,
    pub server_encryption_key_b64: String,
    pub admin_emails: Vec<String>,
    pub enable_admin_panel: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PersistentDiskStore {
    pub users: HashMap<Uuid, UserRecord>,
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

#[derive(Deserialize, Clone)]
struct UpsertEnvelopeRequest {
    id: Uuid,
    entity_type: String,
    parent_id: Option<Uuid>,
    class_id: Option<Uuid>,
    encrypted_payload: String,
    #[serde(default)]
    expected_version: Option<i32>,
}

#[derive(Deserialize)]
struct BatchSyncRequest {
    envelopes: Vec<UpsertEnvelopeRequest>,
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
            let parsed: serde_json::Value = serde_json::from_str(&payload_str).unwrap_or_default();
            let title = parsed.get("title").and_then(|v| v.as_str()).unwrap_or("Globale Vorlage").to_string();
            let desc = parsed.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let template_type = parsed.get("template_type").and_then(|v| v.as_str()).unwrap_or("curve").to_string();
            templates_map.insert(
                id,
                admin::GlobalTemplateRecord {
                    id,
                    template_type,
                    title,
                    description: desc,
                    payload: parsed,
                    created_at: row.get("created_at"),
                    updated_at: row.get("updated_at"),
                },
            );
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

    let admin_emails: Vec<String> = std::env::var("ADMIN_EMAILS")
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();

    let enable_admin_panel = std::env::var("ENABLE_ADMIN_PANEL")
        .map(|v| v.trim() != "false" && v.trim() != "0")
        .unwrap_or(true);

    let state = AppState {
        db,
        disk_store_path,
        mem_users: Arc::new(RwLock::new(initial_disk.users)),
        mem_envelopes: Arc::new(RwLock::new(initial_disk.envelopes)),
        mem_settings: Arc::new(RwLock::new(initial_disk.system_settings)),
        mem_global_templates: Arc::new(RwLock::new(initial_disk.global_templates)),
        auth_rate_limits: Arc::new(RwLock::new(HashMap::new())),
        jwt_secret,
        server_encryption_key_b64,
        admin_emails,
        enable_admin_panel,
    };

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
        .route("/api/auth/salt", post(get_user_salt))
        .route("/api/auth/register", post(register_user))
        .route("/api/auth/login", post(login_user))
        .route("/api/auth/recover", post(recover_password))
        .route("/api/auth/recovery/rotate", post(rotate_recovery_key))
        .route("/api/auth/passkey/register", post(register_passkey))
        .route("/api/auth/passkey/login", post(login_with_passkey))
        .route("/api/auth/passkey", delete(delete_passkey))
        .route("/api/auth/2fa/setup", get(get_2fa_setup_info))
        .route("/api/auth/2fa/verify", post(verify_and_enable_2fa))
        .route("/api/envelopes", get(list_envelopes).post(upsert_envelope))
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
        .route("/api/admin/backups", get(admin::list_backups))
        .route("/api/admin/backups/create", post(admin::create_backup_snapshot))
        .route(
            "/api/admin/backups/download/:filename",
            get(admin::download_backup),
        )
        .route("/api/admin/backups/restore", post(admin::restore_backup))
        .route(
            "/api/admin/backups/config",
            get(admin::get_backup_config).put(admin::update_backup_config),
        )
        .route("/api/admin/templates", post(admin::create_global_template))
        .route(
            "/api/admin/templates/:id",
            delete(admin::delete_global_template),
        )
        .route(
            "/api/admin/smtp",
            get(admin::get_smtp_config).put(admin::update_smtp_config),
        )
        .route("/api/admin/smtp/test", post(admin::test_smtp))
        .route(
            "/api/admin/mail-templates",
            get(admin::list_mail_templates),
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
    tracing::info!("BTE NotenFlow Zero-Knowledge API listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

pub fn persist_to_disk(state: &AppState) {
    let users = state.mem_users.read().unwrap().clone();
    let envelopes = state.mem_envelopes.read().unwrap().clone();
    let system_settings = state.mem_settings.read().unwrap().clone();
    let global_templates = state.mem_global_templates.read().unwrap().clone();
    let store = PersistentDiskStore {
        users,
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

async fn get_user_salt(
    State(state): State<AppState>,
    Json(req): Json<SaltQueryRequest>,
) -> Result<Json<SaltQueryResponse>, (StatusCode, String)> {
    let email = req.email.trim().to_lowercase();
    check_auth_rate_limit(&state, &format!("salt:{}", email))?;

    if let Some(u) = find_user_by_email(&state, &email).await {
        return Ok(Json(SaltQueryResponse {
            kdf_salt_b64: u.kdf_salt,
            kdf_params: u.kdf_params,
            encrypted_dek: u.encrypted_dek,
            recovery_encrypted_dek: u.recovery_encrypted_dek,
            totp_enabled: u.totp_enabled,
            has_passkey: u.passkey_credential_id.is_some(),
            passkey_label: u.passkey_label,
            passkey_prf_salt_b64: u.passkey_prf_salt,
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
            .ok_or((StatusCode::NOT_FOUND, "Benutzer nicht gefunden".into()))?;
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
            .ok_or((StatusCode::NOT_FOUND, "Benutzer nicht gefunden".into()))?;
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
            .ok_or((StatusCode::NOT_FOUND, "Benutzer nicht gefunden".into()))?;
        user.passkey_credential_id = None;
        user.passkey_label = None;
        user.passkey_encrypted_dek = None;
        user.passkey_prf_salt = None;
        user.clone()
    };

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

    let user_opt = {
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
            "Dein Benutzerkonto wurde von einem Administrator deaktiviert.".into(),
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
        passkey_credential_id: user.passkey_credential_id,
        passkey_label: user.passkey_label,
        passkey_encrypted_dek: user.passkey_encrypted_dek,
        passkey_prf_salt_b64: user.passkey_prf_salt,
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
            return Err((StatusCode::NOT_FOUND, "Benutzer nicht gefunden".into()));
        }
    };
    if let Some(saved_user) = updated_user_opt {
        sync_user_to_pg(&state, &saved_user).await;
    }
    persist_to_disk(&state);
    Ok(Json(serde_json::json!({ "totp_enabled": true })))
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
        if let Some(existing) = store.get(&effective_id) {
            if existing.owner_user_id != owner_id {
                return Err((StatusCode::FORBIDDEN, "Zugriff verweigert (Mandantentrennung)".into()));
            }
            // Issue #2: Optimistic Concurrency Control
            if let Some(exp_ver) = req.expected_version {
                if existing.version != exp_ver {
                    return Err((
                        StatusCode::CONFLICT,
                        format!(
                            "Konflikt: Datensatz hat Version {}, erwartete Version war {}",
                            existing.version, exp_ver
                        ),
                    ));
                }
            }
        }

        let next_version = store.get(&effective_id).map(|e| e.version + 1).unwrap_or(1);
        let rec = EncryptedEnvelopeRecord {
            id: effective_id,
            owner_user_id: owner_id,
            entity_type: req.entity_type,
            parent_id: req.parent_id,
            class_id: req.class_id,
            encrypted_payload: req.encrypted_payload,
            version: next_version,
            updated_at: Utc::now(),
        };
        store.insert(effective_id, rec.clone());
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
            if let Some(existing) = store.get(&effective_id) {
                if existing.owner_user_id != owner_id {
                    return Err((StatusCode::FORBIDDEN, "Zugriff verweigert".into()));
                }
                if let Some(exp_ver) = item.expected_version {
                    if existing.version != exp_ver {
                        return Err((
                            StatusCode::CONFLICT,
                            format!(
                                "Konflikt bei Envelope {}: Server hat Version {}, erwartet war {}",
                                item.id, existing.version, exp_ver
                            ),
                        ));
                    }
                }
            }
        }

        let mut out = Vec::with_capacity(req.envelopes.len());

        for item in req.envelopes {
            let effective_id = resolve_tenant_envelope_id(owner_id, item.id);
            let next_version = store.get(&effective_id).map(|e| e.version + 1).unwrap_or(1);
            let record = EncryptedEnvelopeRecord {
                id: effective_id,
                owner_user_id: owner_id,
                entity_type: item.entity_type,
                parent_id: item.parent_id,
                class_id: item.class_id,
                encrypted_payload: item.encrypted_payload,
                version: next_version,
                updated_at: Utc::now(),
            };
            store.insert(effective_id, record.clone());
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
        AppState {
            db: None,
            disk_store_path: tmp_file,
            mem_users: Arc::new(RwLock::new(HashMap::new())),
            mem_envelopes: Arc::new(RwLock::new(HashMap::new())),
            mem_settings: Arc::new(RwLock::new(HashMap::new())),
            mem_global_templates: Arc::new(RwLock::new(HashMap::new())),
            auth_rate_limits: Arc::new(RwLock::new(HashMap::new())),
            jwt_secret: "test_jwt_secret_2026".into(),
            server_encryption_key_b64: B64.encode(key_digest),
            admin_emails: vec!["admin@example.com".into()],
            enable_admin_panel: true,
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
}

