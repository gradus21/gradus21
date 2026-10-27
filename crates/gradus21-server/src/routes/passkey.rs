
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chrono::Utc;
use gradus21_core::crypto::KdfParams;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use uuid::Uuid;
use webauthn_rs::prelude::*;

use crate::middleware::{authenticate_request, check_auth_rate_limit, hash_client_key, issue_jwt};
use crate::routes::auth::AuthResponse;
use crate::state::{
    delete_passkey_from_pg, persist_to_disk, sync_passkey_to_pg, sync_user_to_pg, AppState,
    UserPasskeyRecord, UserRecord,
};

#[derive(Deserialize)]
pub struct PasskeyRegisterRequest {
    pub credential_id: String,
    pub label: String,
    pub passkey_encrypted_dek: String,
    #[serde(default)]
    pub passkey_prf_salt_b64: Option<String>,
    pub kdf_salt_b64: Option<String>,
    pub encrypted_dek: Option<String>,
    pub recovery_encrypted_dek: Option<String>,
    #[serde(default)]
    pub recovery_auth_key_b64: Option<String>,
}

#[derive(Deserialize)]
pub struct PasskeyLoginRequest {
    pub email: Option<String>,
    pub credential_id: String,
}


#[derive(Serialize)]
pub struct PasskeyRegisterStartResponse {
    pub session_id: String,
    #[serde(flatten)]
    pub public_key: CreationChallengeResponse,
}

#[derive(Deserialize)]
pub struct PasskeyRegisterFinishRequest {
    pub session_id: String,
    pub registration_response: RegisterPublicKeyCredential,
    pub label: Option<String>,
    pub passkey_encrypted_dek: String,
    #[serde(default)]
    pub passkey_prf_salt_b64: Option<String>,
    #[serde(default)]
    pub kdf_salt_b64: Option<String>,
    #[serde(default)]
    pub encrypted_dek: Option<String>,
    #[serde(default)]
    pub recovery_encrypted_dek: Option<String>,
    #[serde(default)]
    pub recovery_auth_key_b64: Option<String>,
}

#[derive(Deserialize)]
pub struct PasskeyLoginStartRequest {
    #[serde(default)]
    pub email: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PasskeyLoginStartResponse {
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub passkey_prf_salt_b64: Option<String>,
    #[serde(flatten)]
    pub public_key: RequestChallengeResponse,
}

#[derive(Deserialize)]
pub struct PasskeyLoginFinishRequest {
    pub session_id: String,
    pub assertion_response: PublicKeyCredential,
}

#[derive(Deserialize)]
pub struct RenamePasskeyRequest {
    pub label: String,
}

pub async fn passkey_register_start(
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

pub async fn passkey_register_finish(
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

pub async fn passkey_login_start(
    State(state): State<AppState>,
    Json(req): Json<PasskeyLoginStartRequest>,
) -> Result<Json<PasskeyLoginStartResponse>, (StatusCode, String)> {
    let has_requested_email = req.email.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false);
    let user_opt = if has_requested_email {
        let clean = req.email.as_deref().unwrap().trim().to_lowercase();
        check_auth_rate_limit(&state, &format!("passkey_start:{}", clean))?;
        let users = state.mem_users.read().unwrap();
        users.values().find(|u| u.email.to_lowercase() == clean).cloned()
    } else {
        None
    };

    if has_requested_email && user_opt.is_none() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Kein passender Passkey für diesen Benutzer hinterlegt. Bitte melde dich mit deinem Passwort an.".into(),
        ));
    }

    let (passkeys_to_allow, prf_salt_opt) = {
        let pks = state.mem_passkeys.read().unwrap();
        let user_pks: Vec<_> = pks
            .values()
            .filter(|p| {
                if let Some(u) = &user_opt {
                    p.user_id == u.id
                } else {
                    true
                }
            })
            .cloned()
            .collect();

        let pk_objs: Vec<Passkey> = user_pks
            .iter()
            .filter_map(|p| {
                if let Some(val) = &p.passkey_data {
                    serde_json::from_value::<Passkey>(val.clone()).ok()
                } else {
                    None
                }
            })
            .collect();

        let prf_salt = if let Some(u) = &user_opt {
            user_pks
                .iter()
                .find(|p| u.passkey_credential_id.as_deref() == Some(&p.credential_id) && p.passkey_prf_salt.is_some())
                .and_then(|p| p.passkey_prf_salt.clone())
                .or_else(|| user_pks.iter().find_map(|p| p.passkey_prf_salt.clone()))
                .or_else(|| u.passkey_prf_salt.clone())
        } else {
            None
        };

        (pk_objs, prf_salt)
    };

    if has_requested_email && passkeys_to_allow.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Kein passender Passkey für diesen Benutzer hinterlegt. Bitte melde dich mit deinem Passwort an.".into(),
        ));
    }

    if !has_requested_email && passkeys_to_allow.is_empty() {
        let pks = state.mem_passkeys.read().unwrap();
        if pks.is_empty() {
            return Err((
                StatusCode::BAD_REQUEST,
                "Es sind noch keine Passkeys im System hinterlegt. Bitte melde dich mit deinem Passwort an.".into(),
            ));
        }
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
        passkey_prf_salt_b64: prf_salt_opt,
        public_key: request_challenge,
    }))
}

pub async fn passkey_login_finish(
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

pub async fn list_user_passkeys(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<serde_json::Value>>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    let pks = state.mem_passkeys.read().unwrap();
    let mut user_pks: Vec<_> = pks.values().filter(|p| p.user_id == user_id).cloned().collect();
    user_pks.sort_by_key(|a| std::cmp::Reverse(a.created_at));

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

pub async fn delete_user_passkey_by_id(
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

pub async fn rename_user_passkey(
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

pub async fn register_passkey(
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
                email_verified: false,
                email_verification_code: None,
                email_verification_expires_at: None,
                email_verification_attempts: 0,
                email_verification_cooldown_until: None,
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

pub async fn delete_passkey(
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

pub async fn legacy_passkey_login_disabled(
    State(state): State<AppState>,
    Json(req): Json<PasskeyLoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let rate_key = req
        .email
        .as_deref()
        .unwrap_or(req.credential_id.as_str())
        .trim()
        .to_lowercase();
    let _ = check_auth_rate_limit(&state, &format!("passkey:{}", rate_key));

    tracing::warn!(
        "Abgelehnt: Aufruf des veralteten, ungesicherten Passkey-Login Endpoints für cred_id {}",
        req.credential_id
    );
    Err((
        StatusCode::GONE,
        "POST /api/auth/passkey/login wurde aus Sicherheitsgründen entfernt (Issue #8: Unauthenticated Passkey Login Bypass). Authentifizierung erfordert den kryptografischen WebAuthn-Challenge-Handshake über /api/auth/passkey/login/start und /finish.".into(),
    ))
}

pub async fn well_known_webauthn() -> ([(axum::http::header::HeaderName, &'static str); 1], &'static str) {
    (
        [(axum::http::header::CONTENT_TYPE, "application/json")],
        r#"{"origins":["https://gradus21.app","https://gradus21.de","https://tauri.localhost","tauri://localhost","http://localhost","http://localhost:5173","http://localhost:3080","http://127.0.0.1:5173","http://127.0.0.1:3080"]}"#,
    )
}

pub async fn well_known_apple_app_site_association() -> ([(axum::http::header::HeaderName, &'static str); 1], &'static str) {
    (
        [(axum::http::header::CONTENT_TYPE, "application/json")],
        r#"{"webcredentials":{"apps":["5X3CWU4583.de.gradus21.app"]}}"#,
    )
}



