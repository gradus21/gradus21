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
use crate::middleware::{
    authenticate_request, check_auth_rate_limit, extract_client_ip, hash_client_key, issue_jwt,
};
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
    #[serde(default)]
    pub invite_token: Option<String>,
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
    #[serde(default)]
    pub totp_code: Option<String>,
}

#[derive(Deserialize)]
pub struct RotateRecoveryKeyRequest {
    pub recovery_encrypted_dek: String,
    pub recovery_auth_key_b64: String,
    #[serde(default)]
    pub auth_key_b64: Option<String>,
    #[serde(default)]
    pub totp_code: Option<String>,
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

    let commit_sha = option_env!("GIT_COMMIT_SHA")
        .map(|s| if s.len() > 7 { &s[..7] } else { s })
        .unwrap_or("unknown");
    let git_branch = option_env!("GIT_BRANCH").unwrap_or("unknown");

    Json(serde_json::json!({
        "status": "ok",
        "service": "gradus21-server",
        "version": env!("CARGO_PKG_VERSION"),
        "commit_sha": commit_sha,
        "git_branch": git_branch,
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

    let auth_key_hash = if req.auth_key_b64.trim().is_empty() {
        String::new()
    } else {
        hash_client_key(&req.auth_key_b64)?
    };
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

    // Check invite token if present
    let mut invited_admin = false;
    let mut invite_to_remove: Option<String> = None;
    if let Some(ref inv) = req.invite_token {
        let trimmed_inv = inv.trim();
        if !trimmed_inv.is_empty() {
            let settings = state.mem_settings.read().unwrap();
            if let Some(invites) = settings.get("pending_invites").and_then(|v| v.as_object()) {
                if let Some(invite_data) = invites.get(trimmed_inv) {
                    let inv_email = invite_data.get("email").and_then(|e| e.as_str()).unwrap_or("");
                    if inv_email.eq_ignore_ascii_case(&email) {
                        invited_admin = invite_data.get("is_admin").and_then(|a| a.as_bool()).unwrap_or(false);
                        invite_to_remove = Some(trimmed_inv.to_string());
                    }
                }
            }
        }
    }

    let is_admin = is_first_user || invited_admin || state.admin_emails.contains(&email);
    let is_active = true;
    let now = Utc::now();

    let user_exists = {
        let users = state.mem_users.read().unwrap();
        users.values().any(|u| u.email == email)
    };
    if user_exists {
        return Err((StatusCode::CONFLICT, "Diese E-Mail ist bereits registriert".into()));
    }

    let was_verified = {
        let verifs = state.mem_email_verifications.read().unwrap();
        verifs
            .get(&email)
            .map(|v| v.code.is_empty() && v.expires_at >= now)
            .unwrap_or(false)
    } || invite_to_remove.is_some();

    if !is_first_user && state.is_test_or_production_env() && !was_verified {
        return Err((
            StatusCode::FORBIDDEN,
            "E-Mail-Verifikation erforderlich: In Test- und Produktivsystemen muss die E-Mail-Adresse vor der Kontoerstellung verifiziert werden.".into(),
        ));
    }

    let new_user = {
        let mut users = state.mem_users.write().unwrap();
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

    if was_verified {
        let mut verifs = state.mem_email_verifications.write().unwrap();
        verifs.remove(&email);
    }

    if let Some(inv_key) = invite_to_remove {
        let updated_invites = {
            let mut settings = state.mem_settings.write().unwrap();
            let mut invites = settings.get("pending_invites").cloned().unwrap_or_else(|| serde_json::json!({}));
            if let Some(map) = invites.as_object_mut() {
                map.remove(&inv_key);
            }
            settings.insert("pending_invites".into(), invites.clone());
            invites
        };
        crate::admin::save_setting_to_pg(&state, "pending_invites", &updated_invites).await;
    }

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

    if user.auth_key_hash.is_empty() || req.auth_key_b64.trim().is_empty() {
        return Err((
            StatusCode::UNAUTHORIZED,
            "Dieses Konto nutzt Passkey-only-Anmeldung. Bitte melde dich mit deinem Passkey an.".into(),
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

        if !totp::verify_totp_code_once(user.id, &secret_b32, code) {
            return Err((StatusCode::UNAUTHORIZED, "Ungültiger oder bereits verwendeter 6-stelliger 2FA-TOTP-Code".into()));
        }
    }

    // Invariant I-6: Admin role is governed by the persisted UserRecord (`user.is_admin`),
    // never silently re-promoted from `state.admin_emails` after an admin demotes the account.
    let is_admin = user.is_admin;
    let now = Utc::now();
    {
        let mut users = state.mem_users.write().unwrap();
        if let Some(u) = users.get_mut(&user.id) {
            u.last_login_at = Some(now);
        }
    }
    if let Some(mut updated_user) = find_user_by_email(&state, &email).await {
        updated_user.last_login_at = Some(now);
        sync_user_to_pg(&state, &updated_user).await;
    }
    persist_to_disk(&state);

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

    // Invariant I-6: When 2FA (TOTP) is enabled on the account, password recovery must also
    // verify a single-use TOTP code via verify_user_step_up_auth so possession of the paper
    // recovery sheet alone cannot bypass 2FA.
    if existing_user.totp_enabled {
        let Some(code) = req.totp_code.as_deref().map(str::trim).filter(|s| !s.is_empty()) else {
            return Err((StatusCode::UNAUTHORIZED, "2FA_REQUIRED".into()));
        };
        if !verify_user_step_up_auth(&state, &existing_user, None, Some(code)) {
            return Err((
                StatusCode::UNAUTHORIZED,
                "Ungültiger oder bereits verwendeter 6-stelliger 2FA-Sicherheitscode".into(),
            ));
        }
    }

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
    state
        .reg_challenges
        .write()
        .unwrap()
        .remove(&existing_user.id.to_string());
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

/// Architectural Invariant (I-1 & I-2): Single source of truth for step-up authentication
/// (verifying either the user's Master Password `auth_key_b64` or a single-use TOTP code).
fn verify_user_step_up_auth(
    state: &AppState,
    user: &UserRecord,
    auth_key_b64: Option<&str>,
    totp_code: Option<&str>,
) -> bool {
    if let Some(auth_key) = auth_key_b64 {
        if !user.auth_key_hash.is_empty() {
            if let Ok(parsed) = PasswordHash::new(&user.auth_key_hash) {
                if Argon2::default()
                    .verify_password(auth_key.as_bytes(), &parsed)
                    .is_ok()
                {
                    return true;
                }
            }
        }
    }
    if user.totp_enabled {
        if let Some(code) = totp_code {
            if let Some(ref enc) = user.totp_secret_server_encrypted {
                if let Ok(totp_secret) = decrypt_entity_envelope(
                    &state.server_encryption_key_b64,
                    "server",
                    &user.id.to_string(),
                    enc,
                ) {
                    if totp::verify_totp_code_once(user.id, &totp_secret, code) {
                        return true;
                    }
                }
            }
        }
    }
    false
}

pub async fn rotate_recovery_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<RotateRecoveryKeyRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;
    check_auth_rate_limit(&state, &format!("rotate_recovery:{}", user_id))?;

    let rec_hash = hash_client_key(&req.recovery_auth_key_b64)?;

    let updated_record = {
        let mut users = state.mem_users.write().unwrap();
        let user = users
            .get_mut(&user_id)
            .ok_or((StatusCode::NOT_FOUND, "Benutzer:in nicht gefunden".into()))?;

        let authorized = verify_user_step_up_auth(
            &state,
            user,
            req.auth_key_b64.as_deref(),
            req.totp_code.as_deref(),
        );
        if !authorized && !user.auth_key_hash.is_empty() {
            return Err((
                StatusCode::UNAUTHORIZED,
                "Zur Erneuerung des Notfall-Schlüssels ist dein Master-Passwort oder ein 2FA-Code erforderlich.".into(),
            ));
        }

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
            return Err((StatusCode::NOT_FOUND, "Benutzer:in nicht gefunden".into()));
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

                if !totp::verify_totp_enrollment_code(&secret_b32, &req.totp_code) {
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

#[derive(Debug, Deserialize, Default)]
pub struct Reconfigure2faRequest {
    #[serde(default)]
    pub auth_key_b64: Option<String>,
    #[serde(default)]
    pub totp_code: Option<String>,
}

pub async fn reconfigure_2fa(
    State(state): State<AppState>,
    headers: HeaderMap,
    payload: Option<Json<Reconfigure2faRequest>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;
    check_auth_rate_limit(&state, &format!("2fa_reconfigure:{}", user_id))?;

    let req = payload.map(|Json(r)| r).unwrap_or_default();

    let new_secret_b32 = totp::generate_totp_secret_base32();

    let (email, updated_user) = {
        let mut users = state.mem_users.write().unwrap();
        let user_opt = if let Some(u) = users.get_mut(&user_id) {
            Some(u)
        } else {
            users.values_mut().find(|u| u.email == claims.email)
        };

        if let Some(user) = user_opt {
            if user.totp_enabled {
                if !verify_user_step_up_auth(
                    &state,
                    user,
                    req.auth_key_b64.as_deref(),
                    req.totp_code.as_deref(),
                ) {
                    return Err((
                        StatusCode::UNAUTHORIZED,
                        "Zur Neukonfiguration von 2FA ist dein Master-Passwort oder ein aktueller 2FA-Code erforderlich.".into(),
                    ));
                }
            }

            let enc = encrypt_entity_envelope(
                &state.server_encryption_key_b64,
                "server",
                &user.id.to_string(),
                &new_secret_b32,
            )
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            user.totp_secret_server_encrypted = Some(enc);
            user.totp_enabled = false;
            totp::clear_totp_replay_state(user.id);
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

#[derive(Debug, Deserialize, Default)]
pub struct Disable2faRequest {
    #[serde(default)]
    pub auth_key_b64: Option<String>,
    #[serde(default)]
    pub totp_code: Option<String>,
}

pub async fn disable_2fa(
    State(state): State<AppState>,
    headers: HeaderMap,
    payload: Option<Json<Disable2faRequest>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;
    check_auth_rate_limit(&state, &format!("2fa_disable:{}", user_id))?;

    let req = payload.map(|Json(r)| r).unwrap_or_default();

    let new_secret_b32 = totp::generate_totp_secret_base32();

    let (email, updated_user) = {
        let mut users = state.mem_users.write().unwrap();
        let user_opt = if let Some(u) = users.get_mut(&user_id) {
            Some(u)
        } else {
            users.values_mut().find(|u| u.email == claims.email)
        };

        if let Some(user) = user_opt {
            if user.totp_enabled {
                if !verify_user_step_up_auth(
                    &state,
                    user,
                    req.auth_key_b64.as_deref(),
                    req.totp_code.as_deref(),
                ) {
                    return Err((
                        StatusCode::UNAUTHORIZED,
                        "Zur Deaktivierung von 2FA ist dein Master-Passwort oder ein aktueller 2FA-Code erforderlich.".into(),
                    ));
                }
            }

            let enc = encrypt_entity_envelope(
                &state.server_encryption_key_b64,
                "server",
                &user.id.to_string(),
                &new_secret_b32,
            )
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            user.totp_secret_server_encrypted = Some(enc);
            user.totp_enabled = false;
            totp::clear_totp_replay_state(user.id);
            (user.email.clone(), user.clone())
        } else {
            return Err((StatusCode::NOT_FOUND, "Benutzer:in nicht gefunden".into()));
        }
    };

    sync_user_to_pg(&state, &updated_user).await;
    persist_to_disk(&state);

    let uri = totp::build_otpauth_uri(&email, &new_secret_b32);
    Ok(Json(serde_json::json!({
        "success": true,
        "totp_enabled": false,
        "totp_secret_base32": new_secret_b32,
        "totp_setup_uri": uri
    })))
}

#[derive(Debug, Deserialize, Default)]
pub struct UpdateUserEmailRequest {
    pub new_email: String,
    #[serde(default)]
    pub auth_key_b64: Option<String>,
    #[serde(default)]
    pub totp_code: Option<String>,
}

pub async fn update_user_email(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<UpdateUserEmailRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;
    check_auth_rate_limit(&state, &format!("email_update:{}", user_id))?;

    let new_email = req.new_email.trim().to_lowercase();
    if !new_email.contains('@') || new_email.len() < 5 {
        return Err((StatusCode::BAD_REQUEST, "Ungültige E-Mail-Adresse".into()));
    }

    if new_email == claims.email.to_lowercase() {
        return Ok(Json(serde_json::json!({
            "status": "ok",
            "email": new_email,
        })));
    }

    // 1. Prevent privilege escalation to admin accounts (Finding 1) & require mandatory step-up auth (Invariant I-2)
    {
        let users = state.mem_users.read().unwrap();
        if let Some(user) = users.get(&user_id) {
            if !user.is_admin && state.admin_emails.contains(&new_email) {
                return Err((
                    StatusCode::FORBIDDEN,
                    "Diese E-Mail-Adresse ist für Administrator:innen reserviert.".into(),
                ));
            }
            if (!user.auth_key_hash.is_empty() || user.totp_enabled)
                && !verify_user_step_up_auth(
                    &state,
                    user,
                    req.auth_key_b64.as_deref(),
                    req.totp_code.as_deref(),
                )
            {
                return Err((
                    StatusCode::UNAUTHORIZED,
                    "Zur Änderung der E-Mail-Adresse ist die Bestätigung durch dein Master-Passwort oder einen 2FA-Code erforderlich.".into(),
                ));
            }
        }
    }

    // 2. Check if new_email is already used by another account
    {
        let users = state.mem_users.read().unwrap();
        if users.values().any(|u| u.email == new_email && u.id != user_id) {
            return Err((StatusCode::CONFLICT, "Diese E-Mail-Adresse wird bereits verwendet.".into()));
        }
    }

    // 3. In test/production environment, require verified ownership of the new email address
    let was_verified = {
        let verifs = state.mem_email_verifications.read().unwrap();
        verifs
            .get(&new_email)
            .map(|v| v.code.is_empty() && v.expires_at >= Utc::now())
            .unwrap_or(false)
    };

    if state.is_test_or_production_env() && !was_verified {
        return Err((
            StatusCode::FORBIDDEN,
            "Die neue E-Mail-Adresse muss vor der Übernahme über den Verifikations-Code bestätigt werden.".into(),
        ));
    }

    // Clean up consumed verification entry
    if was_verified {
        let mut verifs = state.mem_email_verifications.write().unwrap();
        verifs.remove(&new_email);
    }

    let updated_user = {
        let mut users = state.mem_users.write().unwrap();
        let user = users.get_mut(&user_id)
            .ok_or_else(|| (StatusCode::NOT_FOUND, "Benutzer:in nicht gefunden".into()))?;
        user.email = new_email.clone();
        user.email_verified = true;
        user.clone()
    };

    sync_user_to_pg(&state, &updated_user).await;
    persist_to_disk(&state);

    let new_token = issue_jwt(&state.jwt_secret, updated_user.id, &updated_user.email, updated_user.is_admin, true)?;

    Ok(Json(serde_json::json!({
        "status": "ok",
        "email": new_email,
        "token": new_token,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mail_error: Option<String>,
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
        // Prune expired entries to prevent unbounded RAM growth under automated scans
        verifs.retain(|_, v| v.expires_at >= now);
        if !verifs.contains_key(&email) && verifs.len() >= 2048 {
            return Err((
                StatusCode::TOO_MANY_REQUESTS,
                "Zu viele gleichzeitige E-Mail-Verifikationen aktiv. Bitte kurz warten.".into(),
            ));
        }
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

    let is_prod = state.is_production_env();
    let mut dev_code = None;
    let mut mail_error = None;

    if let Some(cfg) = smtp_cfg {
        if !cfg.host.is_empty() {
            let subject = "Gradus21: Bestätigungscode für Cloud-Synchronisation";
            let body = format!(
                "Hallo,\n\ndein 6-stelliger Bestätigungscode für die Aktivierung der Gradus21 Cloud-Synchronisation lautet:\n\n    {}\n\nDieser Code ist 15 Minuten gültig.\nFalls du diese Anfrage nicht gestellt hast, kannst du diese Nachricht ignorieren.\n\nMit freundlichen Grüßen,\nDein Gradus21 System",
                code
            );
            if let Err(e) = admin::send_email_internal(&cfg, &email, subject, &body).await {
                tracing::warn!("Fehler beim SMTP-Versand des Verifikations-Codes an {}: {}", email, e);
                if !is_prod {
                    tracing::info!("Verifikationscode für {}: {}", email, code);
                    dev_code = Some(code);
                }
                mail_error = Some(format!("SMTP-Versand fehlgeschlagen: {}", e));
            }
        } else {
            if !is_prod {
                tracing::info!("SMTP nicht konfiguriert. Verifikationscode für {}: {}", email, code);
                dev_code = Some(code);
            }
            mail_error = Some("SMTP-Mailversand ist auf diesem Server nicht konfiguriert.".into());
        }
    } else {
        if !is_prod {
            tracing::info!("SMTP nicht konfiguriert. Verifikationscode für {}: {}", email, code);
            dev_code = Some(code);
        }
        mail_error = Some("SMTP-Mailversand ist auf diesem Server nicht konfiguriert.".into());
    }

    Ok(Json(VerifyEmailStartResponse {
        status: "code_sent".into(),
        smtp_configured,
        cooldown_seconds: 60,
        dev_code,
        mail_error,
    }))
}

pub async fn verify_email_confirm(
    State(state): State<AppState>,
    Json(req): Json<VerifyEmailConfirmRequest>,
) -> Result<Json<VerifyEmailConfirmResponse>, (StatusCode, String)> {
    let email = req.email.trim().to_lowercase();
    let submitted_code = req.code.trim();

    if submitted_code.len() != 6 || !submitted_code.chars().all(|c| c.is_ascii_digit()) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Bitte gib einen gültigen 6-stelligen Bestätigungscode ein.".into(),
        ));
    }

    check_auth_rate_limit(&state, &format!("verify_confirm:{}", email))?;

    let now = Utc::now();
    let (is_valid, remaining) = {
        let mut verifs = state.mem_email_verifications.write().unwrap();
        let entry = verifs.get_mut(&email).ok_or((
            StatusCode::BAD_REQUEST,
            "Kein aktiver Bestätigungscode für diese E-Mail gefunden. Bitte fordere einen neuen Code an.".into(),
        ))?;

        if entry.expires_at < now || entry.code.is_empty() {
            if entry.expires_at < now {
                verifs.remove(&email);
            }
            return Err((
                StatusCode::BAD_REQUEST,
                "Der Bestätigungscode ist bereits eingelöst oder abgelaufen. Bitte fordere bei Bedarf einen neuen Code an.".into(),
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
    headers: HeaderMap,
) -> Result<Json<DesktopRelayInitResponse>, (StatusCode, String)> {
    let client_ip = extract_client_ip(&headers);
    check_auth_rate_limit(&state, &format!("relay_init:{}", client_ip))?;
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

    // Invariant I-6: Cap total active relay sessions to prevent unbounded memory growth
    if sessions.len() >= 1024 {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            "Zu viele aktive Desktop-Autorisierungssitzungen. Bitte versuche es in Kürze erneut.".into(),
        ));
    }

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
    // Invariant I-6: Reject oversized relay payloads (> 16 KB) at the boundary
    if payload.encrypted_payload.len() > 16_384 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Verschlüsselte Relay-Nutzlast überschreitet das zulässige Größenlimit (max. 16 KB).".into(),
        ));
    }
    check_auth_rate_limit(&state, &format!("relay_complete:{}", token))?;

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


