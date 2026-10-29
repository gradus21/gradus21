pub mod admin;
pub mod middleware;
pub mod routes;
pub mod state;
pub mod totp;

#[cfg(test)]
mod tests;

pub use admin::*;
pub use middleware::*;
pub use routes::*;
pub use state::*;

use std::{
    collections::HashMap,
    fs,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, RwLock},
};
use axum::http::HeaderValue;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chrono::Utc;
use sha2::{Digest, Sha256};
use sqlx::postgres::PgPoolOptions;
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

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
    let app_env = std::env::var("APP_ENV")
        .or_else(|_| std::env::var("ENVIRONMENT"))
        .or_else(|_| std::env::var("NODE_ENV"))
        .unwrap_or_else(|_| "production".into());

    let mut normalized_envelopes = HashMap::new();
    for (_, mut env) in initial_disk.envelopes {
        if env.entity_type == "user_settings" {
            env.id = Uuid::parse_str("00000000-0000-4000-8000-000000000002").unwrap();
        } else if env.entity_type == "workspace" {
            env.id = Uuid::parse_str("00000000-0000-4000-8000-000000000001").unwrap();
        }
        let key = tenant_env_key(&env.owner_user_id, &env.id);
        normalized_envelopes.insert(key, env);
    }

    let state = AppState {
        db,
        disk_store_path,
        mem_users: Arc::new(RwLock::new(initial_disk.users)),
        mem_passkeys: Arc::new(RwLock::new(initial_disk.passkeys)),
        mem_envelopes: Arc::new(RwLock::new(normalized_envelopes)),
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
        mem_email_verifications: Arc::new(RwLock::new(HashMap::new())),
        desktop_relay_sessions: Arc::new(RwLock::new(HashMap::new())),
        app_env,
    };

    // Spawn background tasks (Automated snapshot scheduler & retention)
    tokio::spawn(admin::start_backup_scheduler(state.clone()));

    let cors = if let Ok(origin) = std::env::var("CORS_ALLOWED_ORIGIN") {
        let origins: Vec<HeaderValue> = origin
            .split(',')
            .filter_map(|s| s.trim().parse::<HeaderValue>().ok())
            .collect();
        if !origins.is_empty() {
            CorsLayer::new()
                .allow_origin(origins)
                .allow_methods(Any)
                .allow_headers(Any)
        } else {
            CorsLayer::new().allow_methods(Any).allow_headers(Any)
        }
    } else {
        // Fallback to configured WEBAUTHN_RP_ORIGIN and WEBAUTHN_ALLOWED_ORIGINS (no wildcard Any fallback)
        let mut origins: Vec<HeaderValue> = Vec::new();
        if let Ok(rp_origin) = std::env::var("WEBAUTHN_RP_ORIGIN") {
            if let Ok(hv) = rp_origin.trim().parse::<HeaderValue>() {
                origins.push(hv);
            }
        }
        if let Ok(allowed) = std::env::var("WEBAUTHN_ALLOWED_ORIGINS") {
            for o in allowed.split(',') {
                if let Ok(hv) = o.trim().parse::<HeaderValue>() {
                    if !origins.contains(&hv) {
                        origins.push(hv);
                    }
                }
            }
        }
        for fallback in &[
            "http://localhost:5173",
            "http://localhost:3080",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:3080",
            "tauri://localhost",
            "https://tauri.localhost",
            "http://tauri.localhost",
        ] {
            if let Ok(hv) = fallback.parse::<HeaderValue>() {
                if !origins.contains(&hv) {
                    origins.push(hv);
                }
            }
        }
        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods(Any)
            .allow_headers(Any)
    };

    let app = routes::create_app_router(state, cors);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Gradus21 Zero-Knowledge API listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
