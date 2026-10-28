use chrono::{DateTime, Utc};
use gradus21_core::crypto::KdfParams;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{Arc, RwLock},
    time::Instant,
};
use url::Url;
use uuid::Uuid;
use webauthn_rs::prelude::*;

use crate::admin;

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
    pub avv_url: String,
    pub avv_download_url: Option<String>,
    pub avv_custom_text: Option<String>,
    pub terms_url: String,
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
            avv_url: std::env::var("LEGAL_AVV_URL")
                .unwrap_or_else(|_| "https://gradus21.de/avv.html".into()),
            avv_download_url: std::env::var("LEGAL_AVV_DOWNLOAD_URL")
                .ok()
                .filter(|s| !s.trim().is_empty())
                .or_else(|| Some("https://gradus21.de/downloads/gradus21-muster-avv.pdf".into())),
            avv_custom_text: std::env::var("LEGAL_AVV_CUSTOM_TEXT")
                .ok()
                .filter(|s| !s.trim().is_empty()),
            terms_url: std::env::var("LEGAL_TERMS_URL")
                .unwrap_or_else(|_| "https://gradus21.de/nutzungsbedingungen.html".into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailVerificationEntry {
    pub email: String,
    pub code: String,
    pub expires_at: DateTime<Utc>,
    pub attempts: u32,
    pub cooldown_until: DateTime<Utc>,
}

pub type RegChallengeMap = Arc<RwLock<HashMap<String, (Instant, PasskeyRegistration, Uuid)>>>;
pub type AuthChallengeMap = Arc<RwLock<HashMap<String, (Instant, PasskeyAuthentication, Option<Uuid>)>>>;

#[inline]
pub fn tenant_env_key(owner_id: &Uuid, envelope_id: &Uuid) -> String {
    format!("{}:{}", owner_id, envelope_id)
}

#[derive(Clone)]
pub struct AppState {
    pub db: Option<PgPool>,
    pub disk_store_path: PathBuf,
    pub mem_users: Arc<RwLock<HashMap<Uuid, UserRecord>>>,
    pub mem_passkeys: Arc<RwLock<HashMap<Uuid, UserPasskeyRecord>>>,
    pub mem_envelopes: Arc<RwLock<HashMap<String, EncryptedEnvelopeRecord>>>,
    pub mem_settings: Arc<RwLock<HashMap<String, serde_json::Value>>>,
    pub mem_global_templates: Arc<RwLock<HashMap<Uuid, admin::GlobalTemplateRecord>>>,
    pub auth_rate_limits: Arc<RwLock<HashMap<String, Vec<Instant>>>>,
    pub jwt_secret: String,
    pub server_encryption_key_b64: String,
    pub admin_emails: Vec<String>,
    pub enable_admin_panel: bool,
    pub webauthn: Arc<Webauthn>,
    pub reg_challenges: RegChallengeMap,
    pub auth_challenges: AuthChallengeMap,
    pub legal_config: LegalConfig,
    pub mem_email_verifications: Arc<RwLock<HashMap<String, EmailVerificationEntry>>>,
    pub app_env: String,
}

impl AppState {
    pub fn is_test_or_production_env(&self) -> bool {
        let env = self.app_env.trim().to_lowercase();
        env == "production" || env == "prod" || env == "produktiv" || env == "test" || env == "testing"
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PersistentDiskStore {
    pub users: HashMap<Uuid, UserRecord>,
    #[serde(default)]
    pub passkeys: HashMap<Uuid, UserPasskeyRecord>,
    pub envelopes: HashMap<String, EncryptedEnvelopeRecord>,
    #[serde(default)]
    pub system_settings: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub global_templates: HashMap<Uuid, admin::GlobalTemplateRecord>,
}

pub fn default_true() -> bool {
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
    #[serde(default)]
    pub email_verified: bool,
    #[serde(default)]
    pub email_verification_code: Option<String>,
    #[serde(default)]
    pub email_verification_expires_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub email_verification_attempts: i32,
    #[serde(default)]
    pub email_verification_cooldown_until: Option<DateTime<Utc>>,
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


pub async fn ensure_pg_schema_and_load(
    pool: &PgPool,
    users_map: &mut HashMap<Uuid, UserRecord>,
    passkeys_map: &mut HashMap<Uuid, UserPasskeyRecord>,
    envelopes_map: &mut HashMap<String, EncryptedEnvelopeRecord>,
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
            id UUID NOT NULL,
            owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            entity_type TEXT NOT NULL,
            parent_id UUID,
            class_id UUID,
            encrypted_payload TEXT NOT NULL,
            version INT NOT NULL DEFAULT 1,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (owner_user_id, id)
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
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_code TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_attempts INT NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_cooldown_until TIMESTAMPTZ",
    ];

    for q in schema_queries {
        if let Err(e) = sqlx::query(q).execute(pool).await {
            tracing::warn!("Schema initialization statement warning: {}", e);
        }
    }

    if let Ok(rows) = sqlx::query(
        "SELECT id, email, auth_key_hash, kdf_salt, kdf_params, encrypted_dek, recovery_encrypted_dek, recovery_auth_key_hash, totp_secret_server_encrypted, totp_enabled, passkey_credential_id, passkey_label, passkey_encrypted_dek, passkey_prf_salt, ui_preferences, is_admin, is_active, created_at, last_login_at, email_verified, email_verification_code, email_verification_expires_at, email_verification_attempts, email_verification_cooldown_until FROM users",
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
                email_verified: row.try_get("email_verified").unwrap_or(false),
                email_verification_code: row.try_get("email_verification_code").ok().flatten(),
                email_verification_expires_at: row.try_get("email_verification_expires_at").ok().flatten(),
                email_verification_attempts: row.try_get("email_verification_attempts").unwrap_or(0),
                email_verification_cooldown_until: row.try_get("email_verification_cooldown_until").ok().flatten(),
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
            let owner_user_id: Uuid = row.get("owner_user_id");
            let env = EncryptedEnvelopeRecord {
                id,
                owner_user_id,
                entity_type: row.get("entity_type"),
                parent_id: row.get("parent_id"),
                class_id: row.get("class_id"),
                encrypted_payload: row.get("encrypted_payload"),
                version: row.get("version"),
                updated_at: row.get("updated_at"),
            };
            let key = tenant_env_key(&env.owner_user_id, &env.id);
            envelopes_map.insert(key, env);
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
            passkey_prf_salt, ui_preferences, is_admin, is_active, last_login_at,
            email_verified, email_verification_code, email_verification_expires_at,
            email_verification_attempts, email_verification_cooldown_until, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW())
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
            email_verified = EXCLUDED.email_verified,
            email_verification_code = EXCLUDED.email_verification_code,
            email_verification_expires_at = EXCLUDED.email_verification_expires_at,
            email_verification_attempts = EXCLUDED.email_verification_attempts,
            email_verification_cooldown_until = EXCLUDED.email_verification_cooldown_until,
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
    .bind(user.email_verified)
    .bind(&user.email_verification_code)
    .bind(user.email_verification_expires_at)
    .bind(user.email_verification_attempts)
    .bind(user.email_verification_cooldown_until)
    .execute(pool)
    .await
    {
        tracing::error!("Failed to sync user {} to PostgreSQL: {}", user.id, e);
    }
}

pub async fn sync_envelope_to_pg(state: &AppState, env: &EncryptedEnvelopeRecord) {
    let Some(pool) = &state.db else {
        return;
    };
    if let Err(e) = sqlx::query(
        r#"INSERT INTO encrypted_envelopes (
            id, owner_user_id, entity_type, parent_id, class_id, encrypted_payload, version, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (owner_user_id, id) DO UPDATE SET
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

pub async fn delete_envelope_from_pg(state: &AppState, id: Uuid, owner_id: Uuid) {
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

pub async fn delete_all_envelopes_from_pg(state: &AppState, owner_id: Uuid) {
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

pub async fn delete_user_from_pg(state: &AppState, user_id: Uuid) {
    let Some(pool) = &state.db else {
        return;
    };
    if let Err(e) = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id)
        .execute(pool)
        .await
    {
        tracing::error!("Failed to delete user {} from PostgreSQL: {}", user_id, e);
    }
}

pub async fn delete_all_passkeys_for_user_from_pg(state: &AppState, user_id: Uuid) {
    let Some(pool) = &state.db else {
        return;
    };
    if let Err(e) = sqlx::query("DELETE FROM user_passkeys WHERE user_id = $1")
        .bind(user_id)
        .execute(pool)
        .await
    {
        tracing::error!("Failed to delete passkeys for user {} from PostgreSQL: {}", user_id, e);
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

    // Native Tauri app schemes (iOS WKWebView, Android, Desktop), Web domains & Localhost
    let default_origins = [
        "https://gradus21.app",
        "https://gradus21.app/",
        "https://gradus21.de",
        "https://gradus21.de/",
        "tauri://localhost",
        "tauri://localhost/",
        "http://tauri.localhost",
        "http://tauri.localhost/",
        "https://tauri.localhost",
        "https://tauri.localhost/",
        "http://localhost:5173",
        "http://localhost:3080",
        "http://localhost",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3080",
        "http://127.0.0.1",
    ];

    for def in &default_origins {
        if let Ok(u) = Url::parse(def) {
            if u != rp_origin {
                builder = builder.append_allowed_origin(&u);
            }
        }
    }

    if let Ok(allowed_origins_str) = std::env::var("WEBAUTHN_ALLOWED_ORIGINS") {
        for orig_str in allowed_origins_str.split(',') {
            let trimmed = orig_str.trim();
            if !trimmed.is_empty() {
                if let Ok(u) = Url::parse(trimmed) {
                    if u != rp_origin {
                        builder = builder.append_allowed_origin(&u);
                    }
                }
                let alt = if trimmed.ends_with('/') {
                    trimmed.trim_end_matches('/')
                } else {
                    &format!("{}/", trimmed)
                };
                if let Ok(u) = Url::parse(alt) {
                    if u != rp_origin {
                        builder = builder.append_allowed_origin(&u);
                    }
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

pub async fn find_user_by_email(state: &AppState, email: &str) -> Option<UserRecord> {
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
            "SELECT id, email, auth_key_hash, kdf_salt, kdf_params, encrypted_dek, recovery_encrypted_dek, recovery_auth_key_hash, totp_secret_server_encrypted, totp_enabled, passkey_credential_id, passkey_label, passkey_encrypted_dek, passkey_prf_salt, ui_preferences, is_admin, is_active, created_at, last_login_at, email_verified, email_verification_code, email_verification_expires_at, email_verification_attempts, email_verification_cooldown_until FROM users WHERE email = $1",
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
                email_verified: row.try_get("email_verified").unwrap_or(false),
                email_verification_code: row.try_get("email_verification_code").ok().flatten(),
                email_verification_expires_at: row.try_get("email_verification_expires_at").ok().flatten(),
                email_verification_attempts: row.try_get("email_verification_attempts").unwrap_or(0),
                email_verification_cooldown_until: row.try_get("email_verification_cooldown_until").ok().flatten(),
            };
            state.mem_users.write().unwrap().insert(id, user.clone());
            return Some(user);
        }
    }
    None
}


