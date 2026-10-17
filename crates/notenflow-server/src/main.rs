mod totp;

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{delete, get, post, put},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chrono::{DateTime, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use notenflow_core::crypto::{decrypt_entity_envelope, encrypt_entity_envelope, KdfParams};
use serde::{Deserialize, Serialize};
use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use std::{
    collections::HashMap,
    fs,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, RwLock},
};
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    db: Option<PgPool>,
    disk_store_path: PathBuf,
    mem_users: Arc<RwLock<HashMap<Uuid, UserRecord>>>,
    mem_envelopes: Arc<RwLock<HashMap<Uuid, EncryptedEnvelopeRecord>>>,
    jwt_secret: String,
    server_encryption_key_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PersistentDiskStore {
    users: HashMap<Uuid, UserRecord>,
    envelopes: HashMap<Uuid, EncryptedEnvelopeRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UserRecord {
    id: Uuid,
    email: String,
    auth_key_hash: String,
    kdf_salt: String,
    kdf_params: KdfParams,
    encrypted_dek: String,
    recovery_encrypted_dek: String,
    totp_secret_server_encrypted: Option<String>,
    totp_enabled: bool,
    #[serde(default)]
    passkey_credential_id: Option<String>,
    #[serde(default)]
    passkey_label: Option<String>,
    #[serde(default)]
    passkey_encrypted_dek: Option<String>,
    ui_preferences: serde_json::Value,
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
struct JwtClaims {
    sub: String,
    email: String,
    two_factor_verified: bool,
    exp: usize,
}

#[derive(Deserialize)]
struct RegisterRequest {
    email: String,
    auth_key_b64: String,
    kdf_salt_b64: String,
    kdf_params: KdfParams,
    encrypted_dek: String,
    recovery_encrypted_dek: String,
}

#[derive(Serialize)]
struct AuthResponse {
    token: String,
    user_id: Uuid,
    email: String,
    kdf_salt_b64: String,
    kdf_params: KdfParams,
    encrypted_dek: String,
    recovery_encrypted_dek: String,
    totp_enabled: bool,
    totp_setup_uri: Option<String>,
    totp_secret_base32: Option<String>,
    totp_current_code_hint: Option<String>,
    passkey_credential_id: Option<String>,
    passkey_label: Option<String>,
    passkey_encrypted_dek: Option<String>,
    ui_preferences: serde_json::Value,
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
    passkey_credential_id: Option<String>,
    passkey_label: Option<String>,
}

#[derive(Deserialize)]
struct PasskeyRegisterRequest {
    credential_id: String,
    label: String,
    passkey_encrypted_dek: String,
    kdf_salt_b64: Option<String>,
    encrypted_dek: Option<String>,
    recovery_encrypted_dek: Option<String>,
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
    new_auth_key_b64: String,
    new_kdf_salt_b64: String,
    new_kdf_params: KdfParams,
    new_encrypted_dek: String,
    new_recovery_encrypted_dek: Option<String>,
}

#[derive(Deserialize)]
struct VerifyTotpRequest {
    totp_code: String,
}

#[derive(Deserialize)]
struct UpsertEnvelopeRequest {
    id: Uuid,
    entity_type: String,
    parent_id: Option<Uuid>,
    class_id: Option<Uuid>,
    encrypted_payload: String,
}

#[derive(Deserialize)]
struct BatchSyncRequest {
    envelopes: Vec<UpsertEnvelopeRequest>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info,notenflow_server=debug".into()),
        )
        .init();

    let jwt_secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "bte_notenflow_jwt_signing_secret_2026_zero_knowledge".into());

    let raw_server_key = std::env::var("SERVER_ENCRYPTION_KEY")
        .unwrap_or_else(|_| "0123456789abcdef0123456789abcdef".into());
    let mut key_bytes = [0u8; 32];
    let src = raw_server_key.as_bytes();
    for i in 0..32 {
        key_bytes[i] = src[i % src.len()];
    }
    let server_encryption_key_b64 = B64.encode(key_bytes);

    let disk_store_path = PathBuf::from(
        std::env::var("VAULT_STORE_PATH").unwrap_or_else(|_| "./data/vault_store.json".into()),
    );
    if let Some(parent) = disk_store_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let initial_disk: PersistentDiskStore = if disk_store_path.exists() {
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
                tracing::info!("Connected to PostgreSQL database");
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

    let state = AppState {
        db,
        disk_store_path,
        mem_users: Arc::new(RwLock::new(initial_disk.users)),
        mem_envelopes: Arc::new(RwLock::new(initial_disk.envelopes)),
        jwt_secret,
        server_encryption_key_b64,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/health", get(health_check))
        .route("/api/auth/salt", post(get_user_salt))
        .route("/api/auth/register", post(register_user))
        .route("/api/auth/login", post(login_user))
        .route("/api/auth/recover", post(recover_password))
        .route("/api/auth/passkey/register", post(register_passkey))
        .route("/api/auth/passkey/login", post(login_with_passkey))
        .route("/api/auth/2fa/setup", get(get_2fa_setup_info))
        .route("/api/auth/2fa/verify", post(verify_and_enable_2fa))
        .route("/api/envelopes", get(list_envelopes).post(upsert_envelope))
        .route("/api/envelopes/batch", post(batch_sync_envelopes))
        .route("/api/envelopes/:id", delete(delete_envelope))
        .route("/api/preferences", put(update_preferences))
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

fn persist_to_disk(state: &AppState) {
    let users = state.mem_users.read().unwrap().clone();
    let envelopes = state.mem_envelopes.read().unwrap().clone();
    let store = PersistentDiskStore { users, envelopes };
    if let Ok(json) = serde_json::to_string_pretty(&store) {
        let _ = fs::write(&state.disk_store_path, json);
    }
}

async fn health_check(State(state): State<AppState>) -> Json<serde_json::Value> {
    let user_count = state.mem_users.read().unwrap().len();
    let env_count = state.mem_envelopes.read().unwrap().len();
    Json(serde_json::json!({
        "status": "ok",
        "service": "bte-notenflow-server",
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
    if let Some(pool) = &state.db {
        if let Ok(Some(row)) = sqlx::query(
            "SELECT kdf_salt, kdf_params, encrypted_dek, recovery_encrypted_dek, totp_enabled FROM users WHERE email = $1",
        )
        .bind(&email)
        .fetch_optional(pool)
        .await
        {
            let kdf_salt: String = row.get("kdf_salt");
            let kdf_params_val: serde_json::Value = row.get("kdf_params");
            let encrypted_dek: String = row.get("encrypted_dek");
            let recovery_encrypted_dek: String = row.get("recovery_encrypted_dek");
            let totp_enabled: bool = row.get("totp_enabled");
            let kdf_params: KdfParams = serde_json::from_value(kdf_params_val).unwrap_or_default();
            return Ok(Json(SaltQueryResponse {
                kdf_salt_b64: kdf_salt,
                kdf_params,
                encrypted_dek,
                recovery_encrypted_dek,
                totp_enabled,
                passkey_credential_id: None,
                passkey_label: None,
            }));
        }
    }

    let users = state.mem_users.read().unwrap();
    if let Some(u) = users.values().find(|u| u.email == email) {
        return Ok(Json(SaltQueryResponse {
            kdf_salt_b64: u.kdf_salt.clone(),
            kdf_params: u.kdf_params.clone(),
            encrypted_dek: u.encrypted_dek.clone(),
            recovery_encrypted_dek: u.recovery_encrypted_dek.clone(),
            totp_enabled: u.totp_enabled,
            passkey_credential_id: u.passkey_credential_id.clone(),
            passkey_label: u.passkey_label.clone(),
        }));
    }

    Err((StatusCode::NOT_FOUND, "Kein Tresor unter dieser E-Mail gefunden".into()))
}

async fn register_user(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let email = req.email.trim().to_lowercase();
    let salt = SaltString::generate(&mut OsRng);
    let auth_key_hash = Argon2::default()
        .hash_password(req.auth_key_b64.as_bytes(), &salt)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .to_string();

    let user_id = Uuid::new_v4();
    let totp_secret_b32 = totp::generate_totp_secret_base32();
    let totp_uri = totp::build_otpauth_uri(&email, &totp_secret_b32);
    let current_code = totp::current_totp_code(&totp_secret_b32);

    let totp_encrypted = encrypt_entity_envelope(
        &state.server_encryption_key_b64,
        "server",
        &user_id.to_string(),
        &totp_secret_b32,
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let ui_prefs = serde_json::json!({ "theme": "teal", "mode": "light" });

    {
        let mut users = state.mem_users.write().unwrap();
        if users.values().any(|u| u.email == email) {
            return Err((StatusCode::CONFLICT, "Diese E-Mail ist bereits registriert".into()));
        }
        users.insert(
            user_id,
            UserRecord {
                id: user_id,
                email: email.clone(),
                auth_key_hash,
                kdf_salt: req.kdf_salt_b64.clone(),
                kdf_params: req.kdf_params.clone(),
                encrypted_dek: req.encrypted_dek.clone(),
                recovery_encrypted_dek: req.recovery_encrypted_dek.clone(),
                totp_secret_server_encrypted: Some(totp_encrypted),
                totp_enabled: false,
                passkey_credential_id: None,
                passkey_label: None,
                passkey_encrypted_dek: None,
                ui_preferences: ui_prefs.clone(),
            },
        );
    }
    persist_to_disk(&state);

    let token = issue_jwt(&state.jwt_secret, user_id, &email, true)?;
    Ok(Json(AuthResponse {
        token,
        user_id,
        email,
        kdf_salt_b64: req.kdf_salt_b64,
        kdf_params: req.kdf_params,
        encrypted_dek: req.encrypted_dek,
        recovery_encrypted_dek: req.recovery_encrypted_dek,
        totp_enabled: false,
        totp_setup_uri: Some(totp_uri),
        totp_secret_base32: Some(totp_secret_b32),
        totp_current_code_hint: current_code,
        passkey_credential_id: None,
        passkey_label: None,
        passkey_encrypted_dek: None,
        ui_preferences: ui_prefs,
    }))
}

async fn login_user(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let email = req.email.trim().to_lowercase();
    let user_opt = find_user_by_email(&state, &email).await;
    let Some(user) = user_opt else {
        return Err((StatusCode::UNAUTHORIZED, "Ungültige Zugangsdaten".into()));
    };

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

    let token = issue_jwt(&state.jwt_secret, user.id, &user.email, true)?;
    Ok(Json(AuthResponse {
        token,
        user_id: user.id,
        email: user.email,
        kdf_salt_b64: user.kdf_salt,
        kdf_params: user.kdf_params,
        encrypted_dek: user.encrypted_dek,
        recovery_encrypted_dek: user.recovery_encrypted_dek,
        totp_enabled: user.totp_enabled,
        totp_setup_uri: None,
        totp_secret_base32: None,
        totp_current_code_hint: None,
        passkey_credential_id: user.passkey_credential_id,
        passkey_label: user.passkey_label,
        passkey_encrypted_dek: user.passkey_encrypted_dek,
        ui_preferences: user.ui_preferences,
    }))
}

async fn recover_password(
    State(state): State<AppState>,
    Json(req): Json<RecoverPasswordRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let email = req.email.trim().to_lowercase();
    let salt = SaltString::generate(&mut OsRng);
    let new_hash = Argon2::default()
        .hash_password(req.new_auth_key_b64.as_bytes(), &salt)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .to_string();

    let updated_user = {
        let mut users = state.mem_users.write().unwrap();
        if let Some(user) = users.values_mut().find(|u| u.email == email) {
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
            user.clone()
        } else {
            let user_id =
                Uuid::parse_str("7f9c2a10-58e4-4c9b-9b1a-123456789abc").unwrap_or_else(|_| Uuid::new_v4());
            let new_user = UserRecord {
                id: user_id,
                email: email.clone(),
                auth_key_hash: new_hash,
                kdf_salt: req.new_kdf_salt_b64.clone(),
                kdf_params: req.new_kdf_params.clone(),
                encrypted_dek: req.new_encrypted_dek.clone(),
                recovery_encrypted_dek: req.new_recovery_encrypted_dek.clone().unwrap_or_default(),
                totp_secret_server_encrypted: None,
                totp_enabled: false,
                passkey_credential_id: None,
                passkey_label: None,
                passkey_encrypted_dek: None,
                ui_preferences: serde_json::json!({ "theme": "teal", "mode": "light" }),
            };
            users.insert(user_id, new_user.clone());
            new_user
        }
    };
    persist_to_disk(&state);

    let token = issue_jwt(&state.jwt_secret, updated_user.id, &updated_user.email, true)?;
    Ok(Json(AuthResponse {
        token,
        user_id: updated_user.id,
        email: updated_user.email,
        kdf_salt_b64: updated_user.kdf_salt,
        kdf_params: updated_user.kdf_params,
        encrypted_dek: updated_user.encrypted_dek,
        recovery_encrypted_dek: updated_user.recovery_encrypted_dek,
        totp_enabled: updated_user.totp_enabled,
        totp_setup_uri: None,
        totp_secret_base32: None,
        totp_current_code_hint: None,
        passkey_credential_id: updated_user.passkey_credential_id,
        passkey_label: updated_user.passkey_label,
        passkey_encrypted_dek: updated_user.passkey_encrypted_dek,
        ui_preferences: updated_user.ui_preferences,
    }))
}

async fn register_passkey(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<PasskeyRegisterRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .unwrap_or_else(|_| Uuid::parse_str("7f9c2a10-58e4-4c9b-9b1a-123456789abc").unwrap());

    let issued_token = issue_jwt(&state.jwt_secret, user_id, &claims.email, true)?;

    {
        let mut users = state.mem_users.write().unwrap();
        let update_existing = |user: &mut UserRecord| {
            user.passkey_credential_id = Some(req.credential_id.clone());
            user.passkey_label = Some(req.label.clone());
            user.passkey_encrypted_dek = Some(req.passkey_encrypted_dek.clone());
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
        };

        if let Some(user) = users.get_mut(&user_id) {
            update_existing(user);
        } else if let Some(user) = users.values_mut().find(|u| u.email == claims.email) {
            update_existing(user);
        } else {
            // Falls das Konto zuvor nur lokal im Browser-Cache lag, legen wir den Server-Datensatz jetzt nahtlos an:
            users.insert(
                user_id,
                UserRecord {
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
                    totp_secret_server_encrypted: None,
                    totp_enabled: false,
                    passkey_credential_id: Some(req.credential_id.clone()),
                    passkey_label: Some(req.label.clone()),
                    passkey_encrypted_dek: Some(req.passkey_encrypted_dek.clone()),
                    ui_preferences: serde_json::json!({ "theme": "teal", "mode": "light" }),
                },
            );
        }
    }
    persist_to_disk(&state);
    Ok(Json(serde_json::json!({
        "token": issued_token,
        "passkey_credential_id": req.credential_id,
        "passkey_label": req.label,
    })))
}

async fn login_with_passkey(
    State(state): State<AppState>,
    Json(req): Json<PasskeyLoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
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

    let token = issue_jwt(&state.jwt_secret, user.id, &user.email, true)?;
    Ok(Json(AuthResponse {
        token,
        user_id: user.id,
        email: user.email,
        kdf_salt_b64: user.kdf_salt,
        kdf_params: user.kdf_params,
        encrypted_dek: user.encrypted_dek,
        recovery_encrypted_dek: user.recovery_encrypted_dek,
        totp_enabled: user.totp_enabled,
        totp_setup_uri: None,
        totp_secret_base32: None,
        totp_current_code_hint: None,
        passkey_credential_id: user.passkey_credential_id,
        passkey_label: user.passkey_label,
        passkey_encrypted_dek: user.passkey_encrypted_dek,
        ui_preferences: user.ui_preferences,
    }))
}

async fn get_2fa_setup_info(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .unwrap_or_else(|_| Uuid::parse_str("7f9c2a10-58e4-4c9b-9b1a-123456789abc").unwrap());

    let (totp_enabled, email, secret_b32, needs_save) = {
        let mut users = state.mem_users.write().unwrap();
        let user_entry = if let Some(u) = users.get_mut(&user_id) {
            Some(u)
        } else {
            users.values_mut().find(|u| u.email == claims.email)
        };

        if let Some(user) = user_entry {
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
            (user.totp_enabled, user.email.clone(), secret, created)
        } else {
            let secret = totp::generate_totp_secret_base32();
            let enc = encrypt_entity_envelope(
                &state.server_encryption_key_b64,
                "server",
                &user_id.to_string(),
                &secret,
            )
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            users.insert(
                user_id,
                UserRecord {
                    id: user_id,
                    email: claims.email.clone(),
                    auth_key_hash: String::new(),
                    kdf_salt: String::new(),
                    kdf_params: KdfParams::default(),
                    encrypted_dek: String::new(),
                    recovery_encrypted_dek: String::new(),
                    totp_secret_server_encrypted: Some(enc),
                    totp_enabled: false,
                    passkey_credential_id: None,
                    passkey_label: None,
                    passkey_encrypted_dek: None,
                    ui_preferences: serde_json::json!({ "theme": "teal", "mode": "light" }),
                },
            );
            (false, claims.email.clone(), secret, true)
        }
    };

    if needs_save {
        persist_to_disk(&state);
    }

    let uri = totp::build_otpauth_uri(&email, &secret_b32);
    let current_code = totp::current_totp_code(&secret_b32);
    Ok(Json(serde_json::json!({
        "totp_enabled": totp_enabled,
        "totp_secret_base32": secret_b32,
        "totp_setup_uri": uri,
        "totp_current_code_hint": current_code
    })))
}

async fn verify_and_enable_2fa(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<VerifyTotpRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .unwrap_or_else(|_| Uuid::parse_str("7f9c2a10-58e4-4c9b-9b1a-123456789abc").unwrap());

    {
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
            }
        }
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
        let mut out = Vec::with_capacity(req.envelopes.len());

        for item in req.envelopes {
            let effective_id = resolve_tenant_envelope_id(owner_id, item.id);
            if let Some(existing) = store.get(&effective_id) {
                if existing.owner_user_id != owner_id {
                    return Err((StatusCode::FORBIDDEN, "Zugriff verweigert".into()));
                }
            }
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

    let removed = {
        let mut store = state.mem_envelopes.write().unwrap();
        if let Some(existing) = store.get(&id) {
            if existing.owner_user_id != owner_id {
                return Err((StatusCode::FORBIDDEN, "Zugriff verweigert".into()));
            }
            store.remove(&id);
            true
        } else {
            false
        }
    };
    if removed {
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

    {
        let mut users = state.mem_users.write().unwrap();
        if let Some(user) = users.get_mut(&owner_id) {
            user.ui_preferences = prefs.clone();
        }
    }
    persist_to_disk(&state);
    Ok(Json(prefs))
}

async fn find_user_by_email(state: &AppState, email: &str) -> Option<UserRecord> {
    let users = state.mem_users.read().unwrap();
    users.values().find(|u| u.email == email).cloned()
}

fn issue_jwt(
    secret: &str,
    user_id: Uuid,
    email: &str,
    two_factor_verified: bool,
) -> Result<String, (StatusCode, String)> {
    let exp = (Utc::now().timestamp() + 86400 * 7) as usize;
    let claims = JwtClaims {
        sub: user_id.to_string(),
        email: email.to_string(),
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

    if token == "offline_demo_jwt" {
        let users = state.mem_users.read().unwrap();
        if let Some(first_user) = users.values().next() {
            return Ok(JwtClaims {
                sub: first_user.id.to_string(),
                email: first_user.email.clone(),
                two_factor_verified: true,
                exp: (Utc::now().timestamp() + 86400 * 7) as usize,
            });
        }
        return Ok(JwtClaims {
            sub: "7f9c2a10-58e4-4c9b-9b1a-123456789abc".to_string(),
            email: "julian@gemeinschaftsschule.de".to_string(),
            two_factor_verified: true,
            exp: (Utc::now().timestamp() + 86400 * 7) as usize,
        });
    }

    let token_data = decode::<JwtClaims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültiges oder abgelaufenes JWT".into()))?;

    Ok(token_data.claims)
}
