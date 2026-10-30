use argon2::{
    password_hash::{PasswordHash, PasswordVerifier},
    Argon2,
};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::Utc;
use gradus21_core::crypto::{decrypt_entity_envelope, encrypt_entity_envelope, KdfParams};
use rand::Rng;
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;
use uuid::Uuid;

use crate::admin;
use crate::middleware::{authenticate_request, check_auth_rate_limit, hash_client_key, issue_jwt};
use crate::state::{
    find_user_by_email, persist_to_disk, sync_user_to_pg, AppState, EmailVerificationEntry,
    LegalConfig, UserRecord,
};
use crate::totp;

fn deserialize_kdf_params<'de, D>(deserializer: D) -> Result<KdfParams, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum KdfParamsOrString {
        Struct(KdfParams),
        String(String),
    }

    match KdfParamsOrString::deserialize(deserializer)? {
        KdfParamsOrString::Struct(params) => Ok(params),
        KdfParamsOrString::String(s) => serde_json::from_str(&s).map_err(serde::de::Error::custom),
    }
}

fn deserialize_optional_uuid<'de, D>(deserializer: D) -> Result<Option<Uuid>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let opt = Option::<String>::deserialize(deserializer)?;
    let Some(raw) = opt else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if let Ok(uuid) = Uuid::parse_str(trimmed) {
        return Ok(Some(uuid));
    }
    // Deterministic fallback matching frontend ensureValidUuid for legacy "local_..." IDs
    let mut h1: u32 = 0xdeadbeef;
    let mut h2: u32 = 0x41c6ce57;
    let mut h3: u32 = 0x7fed211b;
    let mut h4: u32 = 0x9e3779b9;
    for ch in trimmed.encode_utf16() {
        let c = ch as u32;
        h1 = (h1 ^ c).wrapping_mul(2654435761);
        h2 = (h2 ^ c).wrapping_mul(1597334677);
        h3 = (h3 ^ c).wrapping_mul(2246822519);
        h4 = (h4 ^ c).wrapping_mul(3266489917);
    }
    let hex = format!("{:08x}{:08x}{:08x}{:08x}", h1, h2, h3, h4);
    let uuid_str = format!(
        "{}-{}-4{}-a{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[13..16],
        &hex[17..20],
        &hex[20..32]
    );
    Ok(Uuid::parse_str(&uuid_str).ok())
}

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub auth_key_b64: String,
    pub kdf_salt_b64: String,
    #[serde(deserialize_with = "deserialize_kdf_params")]
    pub kdf_params: KdfParams,
    pub encrypted_dek: String,
    pub recovery_encrypted_dek: String,
    #[serde(default)]
    pub recovery_auth_key_b64: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_uuid")]
    pub user_id: Option<Uuid>,
    #[serde(default)]
    pub totp_secret_base32: Option<String>,
    #[serde(default)]
    pub totp_enabled: Option<bool>,
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
pub struct SaltQueryRequest {
    pub email: String,
}

#[derive(Serialize)]
pub struct SaltQueryResponse {
    pub kdf_salt_b64: String,
    pub kdf_params: KdfParams,
    pub encrypted_dek: String,
    pub recovery_encrypted_dek: String,
    pub totp_enabled: bool,
    pub has_passkey: bool,
    pub passkey_label: Option<String>,
    pub passkey_prf_salt_b64: Option<String>,
}


#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub auth_key_b64: String,
    pub totp_code: Option<String>,
}

#[derive(Deserialize)]
pub struct RecoverPasswordRequest {
    pub email: String,
    pub recovery_auth_key_b64: String,
    pub new_auth_key_b64: String,
    pub new_kdf_salt_b64: String,
    pub new_kdf_params: KdfParams,
    pub new_encrypted_dek: String,
    pub new_recovery_encrypted_dek: Option<String>,
    #[serde(default)]
    pub new_recovery_auth_key_b64: Option<String>,
}

#[derive(Deserialize)]
pub struct RotateRecoveryKeyRequest {
    pub recovery_encrypted_dek: String,
    pub recovery_auth_key_b64: String,
}

#[derive(Deserialize)]
pub struct VerifyTotpRequest {
    pub totp_code: String,
}

pub async fn health_check(State(state): State<AppState>) -> Json<serde_json::Value> {
    let user_count = state.mem_users.read().unwrap().len();
    let env_count = state.mem_envelopes.read().unwrap().len();
    let is_first_user = user_count == 0;
    let is_test_or_prod = state.is_test_or_production_env();
    let email_verification_required = is_test_or_prod && !is_first_user;

    Json(serde_json::json!({
        "status": "ok",
        "service": "gradus21-server",
        "zero_knowledge_e2ee": true,
        "storage_mode": if state.db.is_some() { "postgresql" } else { "persistent_disk_vault" },
        "registered_users": user_count,
        "stored_envelopes": env_count,
        "app_env": state.app_env,
        "is_first_user": is_first_user,
        "email_verification_required": email_verification_required,
    }))
}

pub async fn get_legal_info(State(state): State<AppState>) -> Json<LegalConfig> {
    Json(state.legal_config.clone())
}

pub async fn get_user_salt(
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

pub async fn register_user(
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

    let user_id = req.user_id.unwrap_or_else(Uuid::new_v4);
    let totp_secret_b32 = req
        .totp_secret_base32
        .as_deref()
        .map(|s| s.trim().to_uppercase())
        .filter(|s| s.len() >= 16)
        .unwrap_or_else(totp::generate_totp_secret_base32);
    let totp_enabled = req.totp_enabled.unwrap_or(false) && req.totp_secret_base32.is_some();
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

    let was_verified = {
        let verifs = state.mem_email_verifications.read().unwrap();
        verifs
            .get(&email)
            .map(|v| v.code.is_empty() && v.expires_at >= now)
            .unwrap_or(false)
    };

    if !is_first_user && state.is_test_or_production_env() && !was_verified {
        return Err((
            StatusCode::FORBIDDEN,
            "E-Mail-Verifikation erforderlich: In Test- und Produktivsystemen muss die E-Mail-Adresse vor der Kontoerstellung verifiziert werden.".into(),
        ));
    }

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
            totp_enabled,
            passkey_credential_id: None,
            passkey_label: None,
            passkey_encrypted_dek: None,
            passkey_prf_salt: None,
            ui_preferences: ui_prefs.clone(),
            is_admin,
            is_active,
            created_at: Some(now),
            last_login_at: Some(now),
            email_verified: was_verified,
            email_verification_code: None,
            email_verification_expires_at: None,
            email_verification_attempts: 0,
            email_verification_cooldown_until: None,
        };
        users.insert(user_id, record.clone());
        record
    };
    sync_user_to_pg(&state, &new_user).await;
    persist_to_disk(&state);

    if was_verified {
        let mut verifs = state.mem_email_verifications.write().unwrap();
        verifs.remove(&email);
    }

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
        totp_enabled,
        totp_setup_uri: Some(totp_uri),
        totp_secret_base32: Some(totp_secret_b32),
        passkey_credential_id: None,
        passkey_label: None,
        passkey_encrypted_dek: None,
        passkey_prf_salt_b64: None,
        ui_preferences: ui_prefs,
    }))
}

pub async fn login_user(
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

pub async fn recover_password(
    State(state): State<AppState>,
    Json(req): Json<RecoverPasswordRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let email = req.email.trim().to_lowercase();
    check_auth_rate_limit(&state, &format!("recover:{}", email))?;

    let Some(existing_user) = find_user_by_email(&state, &email).await else {
        return Err((StatusCode::NOT_FOUND, "Kein Tresor unter dieser E-Mail gefunden".into()));
    };

    if !existing_user.is_active {
        return Err((
            StatusCode::FORBIDDEN,
            "Dieses Benutzerkonto wurde von der Administration vorübergehend deaktiviert.".into(),
        ));
    }

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

pub async fn rotate_recovery_key(
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

pub async fn get_2fa_setup_info(
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
                email_verified: false,
                email_verification_code: None,
                email_verification_expires_at: None,
                email_verification_attempts: 0,
                email_verification_cooldown_until: None,
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

pub async fn verify_and_enable_2fa(
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

pub async fn reconfigure_2fa(
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

pub async fn disable_2fa(
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

#[derive(Debug, Deserialize)]
pub struct VerifyEmailStartRequest {
    pub email: String,
}

#[derive(Debug, Serialize)]
pub struct VerifyEmailStartResponse {
    pub status: String,
    pub smtp_configured: bool,
    pub cooldown_seconds: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dev_code: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct VerifyEmailConfirmRequest {
    pub email: String,
    pub code: String,
}

#[derive(Debug, Serialize)]
pub struct VerifyEmailConfirmResponse {
    pub verified: bool,
    pub message: String,
}

pub async fn verify_email_start(
    State(state): State<AppState>,
    Json(req): Json<VerifyEmailStartRequest>,
) -> Result<Json<VerifyEmailStartResponse>, (StatusCode, String)> {
    let email = req.email.trim().to_lowercase();
    if !email.contains('@') || email.len() < 5 {
        return Err((StatusCode::BAD_REQUEST, "Ungültige E-Mail-Adresse".into()));
    }

    // Rate-limiting: max 3 requests per 15 minutes
    check_auth_rate_limit(&state, &format!("verify_start:{}", email))?;

    let now = Utc::now();

    // Check cooldown
    {
        let verifs = state.mem_email_verifications.read().unwrap();
        if let Some(entry) = verifs.get(&email) {
            if entry.cooldown_until > now {
                let wait_secs = (entry.cooldown_until - now).num_seconds().max(1) as u64;
                return Err((
                    StatusCode::TOO_MANY_REQUESTS,
                    format!("Bitte warte noch {} Sekunden vor einer erneuten Code-Anforderung.", wait_secs),
                ));
            }
        }
    }

    let code = format!("{:06}", rand::thread_rng().gen_range(100000..=999999));
    let expires_at = now + chrono::Duration::minutes(15);
    let cooldown_until = now + chrono::Duration::seconds(60);

    let entry = EmailVerificationEntry {
        email: email.clone(),
        code: code.clone(),
        expires_at,
        attempts: 0,
        cooldown_until,
    };

    {
        let mut verifs = state.mem_email_verifications.write().unwrap();
        verifs.insert(email.clone(), entry);
    }

    // Also update user record if user exists
    {
        let mut users = state.mem_users.write().unwrap();
        if let Some(user) = users.values_mut().find(|u| u.email == email) {
            user.email_verification_code = Some(code.clone());
            user.email_verification_expires_at = Some(expires_at);
            user.email_verification_attempts = 0;
            user.email_verification_cooldown_until = Some(cooldown_until);
        }
    }

    let smtp_cfg = admin::get_smtp_config_internal(&state);
    let smtp_configured = smtp_cfg.is_some() && !smtp_cfg.as_ref().unwrap().host.is_empty();

    let mut dev_code = None;

    if let Some(cfg) = smtp_cfg {
        if !cfg.host.is_empty() {
            let subject = "Gradus21: Bestätigungscode für Cloud-Synchronisation";
            let body = format!(
                "Hallo,\n\ndein 6-stelliger Bestätigungscode für die Aktivierung der Gradus21 Cloud-Synchronisation lautet:\n\n    {}\n\nDieser Code ist 15 Minuten gültig.\nFalls du diese Anfrage nicht gestellt hast, kannst du diese Nachricht ignorieren.\n\nMit freundlichen Grüßen,\nDein Gradus21 System",
                code
            );
            if let Err(e) = admin::send_email_internal(&cfg, &email, subject, &body).await {
                tracing::warn!("Fehler beim SMTP-Versand des Verifikations-Codes an {}: {}", email, e);
                tracing::info!("Verifikationscode für {}: {}", email, code);
                dev_code = Some(code);
            }
        } else {
            tracing::info!("SMTP nicht konfiguriert. Verifikationscode für {}: {}", email, code);
            dev_code = Some(code);
        }
    } else {
        tracing::info!("SMTP nicht konfiguriert. Verifikationscode für {}: {}", email, code);
        dev_code = Some(code);
    }

    Ok(Json(VerifyEmailStartResponse {
        status: "code_sent".into(),
        smtp_configured,
        cooldown_seconds: 60,
        dev_code,
    }))
}

pub async fn verify_email_confirm(
    State(state): State<AppState>,
    Json(req): Json<VerifyEmailConfirmRequest>,
) -> Result<Json<VerifyEmailConfirmResponse>, (StatusCode, String)> {
    let email = req.email.trim().to_lowercase();
    let submitted_code = req.code.trim();

    check_auth_rate_limit(&state, &format!("verify_confirm:{}", email))?;

    let now = Utc::now();
    let (is_valid, remaining) = {
        let mut verifs = state.mem_email_verifications.write().unwrap();
        let entry = verifs.get_mut(&email).ok_or((
            StatusCode::BAD_REQUEST,
            "Kein aktiver Bestätigungscode für diese E-Mail gefunden. Bitte fordere einen neuen Code an.".into(),
        ))?;

        if entry.expires_at < now {
            verifs.remove(&email);
            return Err((
                StatusCode::BAD_REQUEST,
                "Der Bestätigungscode ist abgelaufen. Bitte fordere einen neuen Code an.".into(),
            ));
        }

        entry.attempts += 1;
        if entry.attempts > 5 {
            verifs.remove(&email);
            return Err((
                StatusCode::TOO_MANY_REQUESTS,
                "Zu viele Fehlversuche. Der Code wurde aus Sicherheitsgründen gesperrt. Bitte fordere einen neuen Code an.".into(),
            ));
        }

        let valid: bool = entry.code.as_bytes().ct_eq(submitted_code.as_bytes()).into();
        let remaining = 5usize.saturating_sub(entry.attempts as usize);
        if valid {
            entry.code.clear();
            entry.expires_at = now + chrono::Duration::hours(24);
        }
        (valid, remaining)
    };

    if !is_valid {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("Ungültiger Bestätigungscode. Noch {} Versuch(e) übrig.", remaining),
        ));
    }

    // Update user record if existing
    let user_to_sync = {
        let mut users = state.mem_users.write().unwrap();
        if let Some(user) = users.values_mut().find(|u| u.email == email) {
            user.email_verified = true;
            user.email_verification_code = None;
            user.email_verification_expires_at = None;
            Some(user.clone())
        } else {
            None
        }
    };

    if let Some(u) = user_to_sync {
        sync_user_to_pg(&state, &u).await;
        persist_to_disk(&state);
    }

    Ok(Json(VerifyEmailConfirmResponse {
        verified: true,
        message: "E-Mail-Adresse erfolgreich verifiziert.".into(),
    }))
}

// ==============================================================================
// DESKTOP RELAY (RFC 8628 Device Flow / E2EE Transit for Native Apps)
// ==============================================================================

#[derive(Serialize)]
pub struct DesktopRelayInitResponse {
    pub session_token: String,
}

#[derive(Deserialize)]
pub struct DesktopRelayCompleteRequest {
    pub session_token: String,
    pub encrypted_payload: String,
}

#[derive(Deserialize)]
pub struct DesktopRelayPollQuery {
    pub session_token: String,
}

#[derive(Serialize)]
pub struct DesktopRelayPollResponse {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encrypted_payload: Option<String>,
}

pub async fn desktop_relay_init(
    State(state): State<AppState>,
) -> Result<Json<DesktopRelayInitResponse>, (StatusCode, String)> {
    let mut rng = rand::thread_rng();
    let mut token_bytes = [0u8; 32];
    rng.fill(&mut token_bytes);
    let session_token: String = token_bytes.iter().map(|b| format!("{:02x}", b)).collect();

    let mut sessions = state
        .desktop_relay_sessions
        .write()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Lock error: {}", e)))?;

    // Prune expired entries older than 300 seconds
    sessions.retain(|_, entry| entry.created_at.elapsed().as_secs() < 300);

    sessions.insert(
        session_token.clone(),
        crate::state::DesktopRelayEntry {
            created_at: std::time::Instant::now(),
            encrypted_payload: None,
        },
    );

    Ok(Json(DesktopRelayInitResponse { session_token }))
}

pub async fn desktop_relay_complete(
    State(state): State<AppState>,
    Json(payload): Json<DesktopRelayCompleteRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let token = payload.session_token.trim();
    if token.is_empty() || payload.encrypted_payload.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Ungültige Parameter".into()));
    }

    let mut sessions = state
        .desktop_relay_sessions
        .write()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Lock error: {}", e)))?;

    // Prune expired entries
    sessions.retain(|_, entry| entry.created_at.elapsed().as_secs() < 300);

    match sessions.get_mut(token) {
        Some(entry) => {
            entry.encrypted_payload = Some(payload.encrypted_payload);
            Ok(Json(serde_json::json!({ "success": true })))
        }
        None => Err((
            StatusCode::NOT_FOUND,
            "Autorisierungssitzung nicht gefunden oder abgelaufen".into(),
        )),
    }
}

pub async fn desktop_relay_poll(
    State(state): State<AppState>,
    axum::extract::Query(query): axum::extract::Query<DesktopRelayPollQuery>,
) -> Result<Json<DesktopRelayPollResponse>, (StatusCode, String)> {
    let token = query.session_token.trim();
    if token.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Fehlendes Token".into()));
    }

    let mut sessions = state
        .desktop_relay_sessions
        .write()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Lock error: {}", e)))?;

    match sessions.get(token) {
        None => Ok(Json(DesktopRelayPollResponse {
            status: "expired".into(),
            encrypted_payload: None,
        })),
        Some(entry) => {
            if entry.created_at.elapsed().as_secs() >= 300 {
                sessions.remove(token);
                Ok(Json(DesktopRelayPollResponse {
                    status: "expired".into(),
                    encrypted_payload: None,
                }))
            } else if let Some(ref enc) = entry.encrypted_payload {
                let enc_clone = enc.clone();
                sessions.remove(token); // Single-use consumption
                Ok(Json(DesktopRelayPollResponse {
                    status: "ready".into(),
                    encrypted_payload: Some(enc_clone),
                }))
            } else {
                Ok(Json(DesktopRelayPollResponse {
                    status: "pending".into(),
                    encrypted_payload: None,
                }))
            }
        }
    }
}


