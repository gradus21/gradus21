use crate::{
    authenticate_request, persist_to_disk, AppState, EncryptedEnvelopeRecord, JwtClaims, UserRecord,
};
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{DateTime, Utc};
use lettre::{
    message::{
        header::{ContentType, HeaderName, HeaderValue},
        Mailbox,
    },
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use uuid::Uuid;

// =============================================================================
// Guard / Helper
// =============================================================================

pub fn require_admin(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<JwtClaims, (StatusCode, String)> {
    if !state.enable_admin_panel {
        return Err((
            StatusCode::FORBIDDEN,
            "Die Admin-Oberfläche ist auf dieser Instanz deaktiviert.".into(),
        ));
    }
    let claims = authenticate_request(state, headers)?;
    if !claims.is_admin {
        return Err((
            StatusCode::FORBIDDEN,
            "Administrator-Rechte erforderlich.".into(),
        ));
    }
    Ok(claims)
}

// =============================================================================
// 1. Userverwaltung Models & Endpoints
// =============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AdminUserSummary {
    pub id: Uuid,
    pub email: String,
    pub is_admin: bool,
    pub is_active: bool,
    pub totp_enabled: bool,
    pub has_passkey: bool,
    pub created_at: Option<DateTime<Utc>>,
    pub last_login_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserStatusRequest {
    pub is_admin: Option<bool>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct InviteUserRequest {
    pub email: String,
    pub is_admin: Option<bool>,
    pub send_mail: Option<bool>,
}

pub async fn list_users(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<AdminUserSummary>>, (StatusCode, String)> {
    require_admin(&state, &headers)?;
    let users = state.mem_users.read().unwrap();
    let mut list: Vec<AdminUserSummary> = users
        .values()
        .map(|u| AdminUserSummary {
            id: u.id,
            email: u.email.clone(),
            is_admin: u.is_admin,
            is_active: u.is_active,
            totp_enabled: u.totp_enabled,
            has_passkey: u.passkey_credential_id.is_some(),
            created_at: u.created_at,
            last_login_at: u.last_login_at,
        })
        .collect();
    list.sort_by(|a, b| a.email.cmp(&b.email));
    Ok(Json(list))
}

pub async fn update_user_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(target_id): Path<Uuid>,
    Json(payload): Json<UpdateUserStatusRequest>,
) -> Result<Json<AdminUserSummary>, (StatusCode, String)> {
    let claims = require_admin(&state, &headers)?;

    let (summary, user_clone) = {
        let mut users = state.mem_users.write().unwrap();
        let current_is_admin = users.get(&target_id).map(|u| u.is_admin).ok_or((
            StatusCode::NOT_FOUND,
            "Benutzerkonto nicht gefunden.".into(),
        ))?;

        if let Some(new_admin) = payload.is_admin {
            // Prevent demoting the last admin
            if !new_admin && current_is_admin {
                let admin_count = users.values().filter(|u| u.is_admin).count();
                if admin_count <= 1 {
                    return Err((
                        StatusCode::BAD_REQUEST,
                        "Der letzte Administrator kann nicht degradiert werden.".into(),
                    ));
                }
            }
        }

        if let Some(new_active) = payload.is_active {
            // Prevent deactivating oneself
            if !new_active && target_id.to_string() == claims.sub {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "Du kannst dein eigenes Administratorkonto nicht deaktivieren.".into(),
                ));
            }
        }

        let user = users.get_mut(&target_id).ok_or((
            StatusCode::NOT_FOUND,
            "Benutzerkonto nicht gefunden.".into(),
        ))?;

        if let Some(new_admin) = payload.is_admin {
            user.is_admin = new_admin;
        }

        if let Some(new_active) = payload.is_active {
            user.is_active = new_active;
        }

        let summary = AdminUserSummary {
            id: user.id,
            email: user.email.clone(),
            is_admin: user.is_admin,
            is_active: user.is_active,
            totp_enabled: user.totp_enabled,
            has_passkey: user.passkey_credential_id.is_some(),
            created_at: user.created_at,
            last_login_at: user.last_login_at,
        };

        let user_clone = user.clone();
        (summary, user_clone)
    };

    crate::sync_user_to_pg(&state, &user_clone).await;
    persist_to_disk(&state);

    Ok(Json(summary))
}

pub async fn delete_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(target_id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, String)> {
    let claims = require_admin(&state, &headers)?;

    if target_id.to_string() == claims.sub {
        return Err((
            StatusCode::BAD_REQUEST,
            "Du kannst dein eigenes Administratorkonto nicht selbst löschen.".into(),
        ));
    }

    {
        let users = state.mem_users.read().unwrap();
        if let Some(u) = users.get(&target_id) {
            if u.is_admin {
                let admin_count = users.values().filter(|a| a.is_admin).count();
                if admin_count <= 1 {
                    return Err((
                        StatusCode::BAD_REQUEST,
                        "Der letzte Administrator kann nicht gelöscht werden.".into(),
                    ));
                }
            }
        } else {
            return Err((StatusCode::NOT_FOUND, "Benutzer nicht gefunden.".into()));
        }
    }

    // 1. Remove from memory
    {
        let mut users = state.mem_users.write().unwrap();
        users.remove(&target_id);
    }
    {
        let mut envelopes = state.mem_envelopes.write().unwrap();
        envelopes.retain(|_, env| env.owner_user_id != target_id);
    }

    // 2. Cascade remove from PostgreSQL
    if let Some(pool) = &state.db {
        let _ = sqlx::query("DELETE FROM encrypted_envelopes WHERE owner_user_id = $1")
            .bind(target_id)
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(target_id)
            .execute(pool)
            .await;
    }

    persist_to_disk(&state);

    Ok(StatusCode::NO_CONTENT)
}

pub async fn invite_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<InviteUserRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let _ = require_admin(&state, &headers)?;

    let clean_email = payload.email.trim().to_lowercase();
    if clean_email.is_empty() || !clean_email.contains('@') {
        return Err((StatusCode::BAD_REQUEST, "Ungültige E-Mail-Adresse.".into()));
    }

    // Check if user already exists
    {
        let users = state.mem_users.read().unwrap();
        if users.values().any(|u| u.email.to_lowercase() == clean_email) {
            return Err((
                StatusCode::CONFLICT,
                "Ein Benutzerkonto mit dieser E-Mail-Adresse existiert bereits.".into(),
            ));
        }
    }

    let invite_token = format!("g21_inv_{}", Uuid::new_v4().simple());

    // Store invite in system_settings under `invites`
    let invites = {
        let mut settings = state.mem_settings.write().unwrap();
        let mut invites = settings
            .get("pending_invites")
            .cloned()
            .unwrap_or_else(|| serde_json::json!({}));
        if let Some(map) = invites.as_object_mut() {
            map.insert(
                invite_token.clone(),
                serde_json::json!({
                    "email": clean_email,
                    "is_admin": payload.is_admin.unwrap_or(false),
                    "created_at": Utc::now(),
                }),
            );
        }
        settings.insert("pending_invites".into(), invites.clone());
        invites
    };
    save_setting_to_pg(&state, "pending_invites", &invites).await;

    let base_url = headers
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .or_else(|| {
            let host = headers
                .get("x-forwarded-host")
                .or_else(|| headers.get("host"))
                .and_then(|v| v.to_str().ok())?;
            let proto = headers
                .get("x-forwarded-proto")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("https");
            Some(format!("{}://{}", proto, host))
        })
        .unwrap_or_else(|| "https://g21-dev.kallidat.com".to_string());

    let invite_full_url = format!("{}/#invite={}", base_url.trim_end_matches('/'), invite_token);

    // If send_mail is true and SMTP is configured, trigger invite mail
    if payload.send_mail.unwrap_or(false) {
        let smtp_cfg = get_smtp_config_internal(&state);
        if let Some(cfg) = smtp_cfg {
            let templates = get_mail_templates_internal(&state);
            let invite_tpl = templates
                .into_iter()
                .find(|t| t.id == "user_invite")
                .unwrap_or_else(default_invite_template);

            let body = invite_tpl
                .body_text
                .replace("{{user_email}}", &clean_email)
                .replace("{{invite_url}}", &invite_full_url)
                .replace("{{school_name}}", "Gradus21");

            let subject = invite_tpl
                .subject
                .replace("{{school_name}}", "Gradus21");

            match send_email_internal(&cfg, &clean_email, &subject, &body).await {
                Ok(_) => {
                    tracing::info!("Einladungs-E-Mail erfolgreich an {} versendet", clean_email);
                }
                Err(e) => {
                    tracing::error!("Fehler beim Senden der Einladungs-E-Mail an {}: {}", clean_email, e);
                }
            }
        }
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "email": clean_email,
        "invite_token": invite_token,
        "invite_url": invite_full_url
    })))
}

// =============================================================================
// 2. Backup & Snapshot Endpoints
// =============================================================================

fn default_true() -> bool {
    true
}

fn default_interval() -> u32 {
    24
}

fn default_retention() -> u32 {
    30
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupEntry {
    pub filename: String,
    pub size_bytes: u64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupScheduleConfig {
    #[serde(alias = "enabled", default = "default_true")]
    pub auto_backup_enabled: bool,
    #[serde(default = "default_interval")]
    pub interval_hours: u32,
    #[serde(default = "default_retention")]
    pub retention_days: u32,
    #[serde(default)]
    pub last_run: Option<DateTime<Utc>>,
}

fn get_backup_dir(state: &AppState) -> PathBuf {
    let parent = state
        .disk_store_path
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    let backup_dir = parent.join("backups");
    let _ = fs::create_dir_all(&backup_dir);
    backup_dir
}

pub fn perform_backup_snapshot(state: &AppState) -> Result<BackupEntry, String> {
    let users = state.mem_users.read().unwrap().clone();
    let envelopes = state.mem_envelopes.read().unwrap().clone();
    let settings = state.mem_settings.read().unwrap().clone();
    let templates = state.mem_global_templates.read().unwrap().clone();

    let snapshot = serde_json::json!({
        "version": 2,
        "format": "gradus21_e2ee_full_backup",
        "created_at": Utc::now(),
        "users": users,
        "envelopes": envelopes,
        "system_settings": settings,
        "global_templates": templates,
    });

    let filename = format!("gradus21_backup_{}.json", Utc::now().format("%Y%m%d_%H%M%S"));
    let backup_dir = get_backup_dir(state);
    let target_path = backup_dir.join(&filename);

    let content = serde_json::to_string_pretty(&snapshot)
        .map_err(|e| e.to_string())?;

    fs::write(&target_path, content.as_bytes())
        .map_err(|e| format!("Dateischreibfehler: {}", e))?;

    let size_bytes = content.len() as u64;

    Ok(BackupEntry {
        filename,
        size_bytes,
        created_at: Utc::now(),
    })
}

pub fn cleanup_old_backups(state: &AppState, retention_days: u32) -> usize {
    if retention_days == 0 {
        return 0;
    }
    let backup_dir = get_backup_dir(state);
    let cutoff = Utc::now() - chrono::Duration::days(retention_days as i64);
    let mut deleted_count = 0;

    if let Ok(entries) = fs::read_dir(backup_dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with("gradus21_backup_") && name.ends_with(".json") {
                        let created: DateTime<Utc> = meta
                            .created()
                            .or_else(|_| meta.modified())
                            .map(DateTime::from)
                            .unwrap_or_else(|_| Utc::now());
                        if created < cutoff {
                            if fs::remove_file(entry.path()).is_ok() {
                                deleted_count += 1;
                                tracing::info!("Altes Backup gemäß Retention gelöscht: {}", name);
                            }
                        }
                    }
                }
            }
        }
    }
    deleted_count
}

pub async fn start_backup_scheduler(state: AppState) {
    tracing::info!("Automatischer Backup-Scheduler gestartet (Prüfintervall: 5 Minuten)");
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(300));
    loop {
        interval.tick().await;

        let cfg_opt = {
            let settings = state.mem_settings.read().unwrap();
            settings
                .get("backup_schedule")
                .and_then(|v| serde_json::from_value::<BackupScheduleConfig>(v.clone()).ok())
        };

        if let Some(mut cfg) = cfg_opt {
            if !cfg.auto_backup_enabled {
                continue;
            }

            let interval_hours = if cfg.interval_hours == 0 { 24 } else { cfg.interval_hours };
            let is_due = match cfg.last_run {
                None => true,
                Some(last) => {
                    let elapsed = Utc::now().signed_duration_since(last);
                    elapsed >= chrono::Duration::hours(interval_hours as i64)
                }
            };

            if is_due {
                tracing::info!("Führe geplanten automatischen Backup-Snapshot aus...");
                match perform_backup_snapshot(&state) {
                    Ok(entry) => {
                        tracing::info!("Automatischer Snapshot erfolgreich: {}", entry.filename);
                        cleanup_old_backups(&state, cfg.retention_days);
                        cfg.last_run = Some(Utc::now());
                        if let Ok(val) = serde_json::to_value(&cfg) {
                            {
                                let mut settings = state.mem_settings.write().unwrap();
                                settings.insert("backup_schedule".into(), val.clone());
                            }
                            save_setting_to_pg(&state, "backup_schedule", &val).await;
                            persist_to_disk(&state);
                        }
                    }
                    Err(e) => {
                        tracing::error!("Fehler beim automatischen Backup-Snapshot: {}", e);
                    }
                }
            }
        }
    }
}

pub async fn list_backups(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<BackupEntry>>, (StatusCode, String)> {
    require_admin(&state, &headers)?;
    let backup_dir = get_backup_dir(&state);
    let mut list = Vec::new();

    if let Ok(entries) = fs::read_dir(backup_dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.ends_with(".json") {
                        let created: DateTime<Utc> = meta
                            .created()
                            .or_else(|_| meta.modified())
                            .map(DateTime::from)
                            .unwrap_or_else(|_| Utc::now());
                        list.push(BackupEntry {
                            filename: name,
                            size_bytes: meta.len(),
                            created_at: created,
                        });
                    }
                }
            }
        }
    }

    list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(Json(list))
}

pub async fn create_backup_snapshot(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BackupEntry>, (StatusCode, String)> {
    require_admin(&state, &headers)?;

    let entry = perform_backup_snapshot(&state)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(entry))
}

pub async fn download_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(filename): Path<String>,
) -> Result<Response, (StatusCode, String)> {
    require_admin(&state, &headers)?;

    // Prevent path traversal
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err((StatusCode::BAD_REQUEST, "Ungültiger Dateiname".into()));
    }

    let backup_dir = get_backup_dir(&state);
    let file_path = backup_dir.join(&filename);

    if !file_path.exists() {
        return Err((StatusCode::NOT_FOUND, "Backup-Datei nicht gefunden".into()));
    }

    let content = fs::read_to_string(file_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let response = (
        [
            ("content-type", "application/json"),
            (
                "content-disposition",
                &format!("attachment; filename=\"{}\"", filename),
            ),
        ],
        content,
    )
        .into_response();

    Ok(response)
}

pub async fn restore_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    require_admin(&state, &headers)?;

    let users_val = payload.get("users").ok_or((
        StatusCode::BAD_REQUEST,
        "Ungültiges Backup-Format: 'users' fehlt".into(),
    ))?;
    let envelopes_val = payload.get("envelopes").ok_or((
        StatusCode::BAD_REQUEST,
        "Ungültiges Backup-Format: 'envelopes' fehlt".into(),
    ))?;

    let restored_users: std::collections::HashMap<Uuid, UserRecord> =
        serde_json::from_value(users_val.clone())
            .map_err(|e| (StatusCode::BAD_REQUEST, format!("Fehler beim Parsen der Benutzer: {}", e)))?;

    let mut restored_envelopes: std::collections::HashMap<Uuid, EncryptedEnvelopeRecord> =
        serde_json::from_value(envelopes_val.clone())
            .map_err(|e| (StatusCode::BAD_REQUEST, format!("Fehler beim Parsen der Envelopes: {}", e)))?;

    // Filter out orphaned envelopes whose owner does not exist in restored_users
    restored_envelopes.retain(|_, env| restored_users.contains_key(&env.owner_user_id));

    // 1. Wipe and replace memory
    {
        let mut users = state.mem_users.write().unwrap();
        *users = restored_users.clone();
    }
    {
        let mut envelopes = state.mem_envelopes.write().unwrap();
        *envelopes = restored_envelopes.clone();
    }

    // 2. Sync to PostgreSQL if connected
    if let Some(pool) = &state.db {
        let _ = sqlx::query("DELETE FROM encrypted_envelopes").execute(pool).await;
        let _ = sqlx::query("DELETE FROM users").execute(pool).await;

        for user in restored_users.values() {
            crate::sync_user_to_pg(&state, user).await;
        }
        for env in restored_envelopes.values() {
            crate::sync_envelope_to_pg(&state, env).await;
        }
    }

    // 3. Restore system_settings & global_templates if present
    if let Some(settings_val) = payload.get("system_settings") {
        if let Ok(settings) = serde_json::from_value::<std::collections::HashMap<String, serde_json::Value>>(settings_val.clone()) {
            {
                let mut mem_set = state.mem_settings.write().unwrap();
                *mem_set = settings.clone();
            }
            if let Some(pool) = &state.db {
                let _ = sqlx::query("DELETE FROM system_settings").execute(pool).await;
                for (k, v) in settings {
                    save_setting_to_pg(&state, &k, &v).await;
                }
            }
        }
    }

    if let Some(templates_val) = payload.get("global_templates") {
        if let Ok(templates) = serde_json::from_value::<std::collections::HashMap<Uuid, GlobalTemplateRecord>>(templates_val.clone()) {
            {
                let mut mem_tpl = state.mem_global_templates.write().unwrap();
                *mem_tpl = templates.clone();
            }
            if let Some(pool) = &state.db {
                let _ = sqlx::query("DELETE FROM grading_templates WHERE owner_user_id IS NULL").execute(pool).await;
                for tpl in templates.values() {
                    let payload_str = serde_json::to_string(tpl).unwrap_or_default();
                    let _ = sqlx::query(
                        r#"INSERT INTO grading_templates (id, owner_user_id, is_encrypted, payload, created_at, updated_at)
                        VALUES ($1, NULL, FALSE, $2, $3, $4)
                        ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at"#,
                    )
                    .bind(tpl.id)
                    .bind(payload_str)
                    .bind(tpl.created_at)
                    .bind(tpl.updated_at)
                    .execute(pool)
                    .await;
                }
            }
        }
    }

    persist_to_disk(&state);

    Ok(Json(serde_json::json!({
        "success": true,
        "restored_users_count": restored_users.len(),
        "restored_envelopes_count": restored_envelopes.len()
    })))
}

pub async fn get_backup_config(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BackupScheduleConfig>, (StatusCode, String)> {
    require_admin(&state, &headers)?;
    let settings = state.mem_settings.read().unwrap();
    let cfg: BackupScheduleConfig = settings
        .get("backup_schedule")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or(BackupScheduleConfig {
            auto_backup_enabled: true,
            interval_hours: 24,
            retention_days: 14,
            last_run: None,
        });
    Ok(Json(cfg))
}

pub async fn update_backup_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<BackupScheduleConfig>,
) -> Result<Json<BackupScheduleConfig>, (StatusCode, String)> {
    require_admin(&state, &headers)?;
    let val = serde_json::to_value(&payload).unwrap();
    {
        let mut settings = state.mem_settings.write().unwrap();
        settings.insert("backup_schedule".into(), val.clone());
    }
    save_setting_to_pg(&state, "backup_schedule", &val).await;
    persist_to_disk(&state);
    Ok(Json(payload))
}

// =============================================================================
// 3. Globale Templates Endpoints
// =============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GlobalTemplateRecord {
    pub id: Uuid,
    pub template_type: String, // "curve", "weighting", "levels"
    pub title: String,
    pub description: String,
    pub payload: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct UpsertGlobalTemplateRequest {
    pub template_type: String,
    pub title: String,
    pub description: String,
    pub payload: serde_json::Value,
}

pub async fn list_global_templates(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<GlobalTemplateRecord>>, (StatusCode, String)> {
    // Both normal authenticated teachers and admins can view global templates!
    let _ = authenticate_request(&state, &headers)?;
    let tpls = state.mem_global_templates.read().unwrap();
    let mut list: Vec<GlobalTemplateRecord> = tpls.values().cloned().collect();
    list.sort_by(|a, b| a.title.cmp(&b.title));
    Ok(Json(list))
}

pub async fn create_global_template(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpsertGlobalTemplateRequest>,
) -> Result<Json<GlobalTemplateRecord>, (StatusCode, String)> {
    require_admin(&state, &headers)?;

    let record = GlobalTemplateRecord {
        id: Uuid::new_v4(),
        template_type: payload.template_type,
        title: payload.title,
        description: payload.description,
        payload: payload.payload,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    {
        let mut map = state.mem_global_templates.write().unwrap();
        map.insert(record.id, record.clone());
    }

    if let Some(pool) = &state.db {
        let payload_str = serde_json::to_string(&record).unwrap_or_default();
        let _ = sqlx::query(
            r#"INSERT INTO grading_templates (id, owner_user_id, is_encrypted, payload, created_at, updated_at)
            VALUES ($1, NULL, FALSE, $2, $3, $4)
            ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at"#,
        )
        .bind(record.id)
        .bind(payload_str)
        .bind(record.created_at)
        .bind(record.updated_at)
        .execute(pool)
        .await;
    }

    persist_to_disk(&state);
    Ok(Json(record))
}

pub async fn update_global_template(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpsertGlobalTemplateRequest>,
) -> Result<Json<GlobalTemplateRecord>, (StatusCode, String)> {
    require_admin(&state, &headers)?;

    let record = {
        let mut map = state.mem_global_templates.write().unwrap();
        let existing = map.get_mut(&id).ok_or((
            StatusCode::NOT_FOUND,
            "Globale Vorlage nicht gefunden.".into(),
        ))?;
        existing.template_type = payload.template_type;
        existing.title = payload.title;
        existing.description = payload.description;
        existing.payload = payload.payload;
        existing.updated_at = Utc::now();
        existing.clone()
    };

    if let Some(pool) = &state.db {
        let payload_str = serde_json::to_string(&record).unwrap_or_default();
        let _ = sqlx::query(
            r#"INSERT INTO grading_templates (id, owner_user_id, is_encrypted, payload, created_at, updated_at)
            VALUES ($1, NULL, FALSE, $2, $3, $4)
            ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at"#,
        )
        .bind(record.id)
        .bind(payload_str)
        .bind(record.created_at)
        .bind(record.updated_at)
        .execute(pool)
        .await;
    }

    persist_to_disk(&state);
    Ok(Json(record))
}

pub async fn delete_global_template(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, String)> {
    require_admin(&state, &headers)?;

    {
        let mut map = state.mem_global_templates.write().unwrap();
        map.remove(&id);
    }

    if let Some(pool) = &state.db {
        let _ = sqlx::query("DELETE FROM grading_templates WHERE id = $1 AND owner_user_id IS NULL")
            .bind(id)
            .execute(pool)
            .await;
    }

    persist_to_disk(&state);
    Ok(StatusCode::NO_CONTENT)
}

// =============================================================================
// 4. SMTP & E-Mail Configuration
// =============================================================================

fn default_smtp_security() -> String {
    "starttls".into()
}

fn default_smtp_port() -> u16 {
    587
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SmtpConfig {
    pub host: String,
    #[serde(default = "default_smtp_port")]
    pub port: u16,
    #[serde(default = "default_smtp_security")]
    pub security: String, // "starttls", "tls", "none"
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub from_email: String,
    #[serde(default)]
    pub from_name: String,
}

fn get_smtp_config_internal(state: &AppState) -> Option<SmtpConfig> {
    let settings = state.mem_settings.read().unwrap();
    settings
        .get("smtp_config")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
}

pub async fn get_smtp_config(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    require_admin(&state, &headers)?;
    let cfg = get_smtp_config_internal(&state);
    match cfg {
        Some(mut c) => {
            if !c.password.is_empty() {
                c.password = "********".into();
            }
            Ok(Json(serde_json::to_value(&c).unwrap()))
        }
        None => Ok(Json(serde_json::json!({
            "host": "",
            "port": 587,
            "security": "starttls",
            "username": "",
            "password": "",
            "from_email": "",
            "from_name": "Gradus21 Notenverwaltung"
        }))),
    }
}

pub async fn update_smtp_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(mut payload): Json<SmtpConfig>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    require_admin(&state, &headers)?;

    if payload.port == 0 {
        payload.port = 587;
    }

    // If password is masked or empty, retain old password
    if payload.password == "********" || payload.password.is_empty() {
        if let Some(existing) = get_smtp_config_internal(&state) {
            payload.password = existing.password;
        }
    }

    let val = serde_json::to_value(&payload).unwrap();
    {
        let mut settings = state.mem_settings.write().unwrap();
        settings.insert("smtp_config".into(), val.clone());
    }
    save_setting_to_pg(&state, "smtp_config", &val).await;
    persist_to_disk(&state);

    let mut response = payload;
    if !response.password.is_empty() {
        response.password = "********".into();
    }
    Ok(Json(serde_json::to_value(&response).unwrap()))
}

async fn send_email_internal(
    cfg: &SmtpConfig,
    to_email: &str,
    subject: &str,
    body: &str,
) -> Result<(), String> {
    let from_mailbox: Mailbox = format!("{} <{}>", cfg.from_name, cfg.from_email)
        .parse()
        .map_err(|e| format!("Ungültige Absender-Adresse: {}", e))?;

    let to_mailbox: Mailbox = to_email
        .parse()
        .map_err(|e| format!("Ungültige Empfänger-Adresse: {}", e))?;

    let hdr_auto = HeaderName::new_from_ascii_str("Auto-Submitted");
    let hdr_suppress = HeaderName::new_from_ascii_str("X-Auto-Response-Suppress");
    let email = Message::builder()
        .from(from_mailbox)
        .to(to_mailbox)
        .subject(subject)
        .header(ContentType::TEXT_PLAIN)
        .raw_header(HeaderValue::new(hdr_auto, "auto-generated".into()))
        .raw_header(HeaderValue::new(hdr_suppress, "All".into()))
        .body(body.to_string())
        .map_err(|e| format!("Fehler beim Erstellen der E-Mail: {}", e))?;

    let creds = Credentials::new(cfg.username.clone(), cfg.password.clone());

    match cfg.security.to_lowercase().as_str() {
        "tls" | "ssl" => {
            let mailer = AsyncSmtpTransport::<Tokio1Executor>::relay(&cfg.host)
                .map_err(|e| format!("SMTP Relay Fehler: {}", e))?
                .port(cfg.port)
                .credentials(creds)
                .build();
            mailer
                .send(email)
                .await
                .map_err(|e| format!("SMTP Versandfehler: {}", e))?;
        }
        "none" => {
            let mailer = AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&cfg.host)
                .port(cfg.port)
                .credentials(creds)
                .build();
            mailer
                .send(email)
                .await
                .map_err(|e| format!("SMTP Versandfehler: {}", e))?;
        }
        _ => {
            // Default: STARTTLS
            let mailer = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&cfg.host)
                .map_err(|e| format!("SMTP STARTTLS Relay Fehler: {}", e))?
                .port(cfg.port)
                .credentials(creds)
                .build();
            mailer
                .send(email)
                .await
                .map_err(|e| format!("SMTP Versandfehler: {}", e))?;
        }
    }

    Ok(())
}

pub async fn test_smtp(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let claims = require_admin(&state, &headers)?;
    let cfg = get_smtp_config_internal(&state).ok_or((
        StatusCode::BAD_REQUEST,
        "SMTP ist noch nicht konfiguriert.".into(),
    ))?;

    let subject = "Gradus21: SMTP-Test erfolgreich";
    let body = format!(
        "Hallo {},\n\ndiese Test-E-Mail bestätigt, dass die SMTP-Konfiguration in deiner Gradus21 Homelab-Instanz einwandfrei funktioniert!\n\nServer: {}:{}\nAbsender: {} <{}>\nZeitstempel: {}\n\nMit freundlichen Grüßen,\nDein Gradus21 System",
        claims.email,
        cfg.host,
        cfg.port,
        cfg.from_name,
        cfg.from_email,
        Utc::now().to_rfc3339()
    );

    send_email_internal(&cfg, &claims.email, subject, &body)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "sent_to": claims.email
    })))
}

// =============================================================================
// 5. Mail-Vorlagen Endpoints
// =============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MailTemplateRecord {
    pub id: String,
    #[serde(alias = "name")]
    pub title: String,
    pub subject: String,
    pub body_text: String,
    #[serde(default, alias = "variables")]
    pub available_placeholders: Vec<String>,
}

fn default_invite_template() -> MailTemplateRecord {
    MailTemplateRecord {
        id: "user_invite".into(),
        title: "Benutzer-Einladung".into(),
        subject: "Einladung zu Gradus21 Notenverwaltung".into(),
        body_text: "Hallo,\n\ndu wurdest eingeladen, Gradus21 für deine Notenverwaltung an {{school_name}} zu nutzen.\n\nKlicke auf den folgenden Link, um deinen Zero-Knowledge Vault mit deinem persönlichen Master-Passwort einzurichten:\n{{invite_url}}\n\nWichtig: Dein Passwort verlässt dein Endgerät niemals im Klartext. Bitte notiere dir bei der Einrichtung deinen 24-stelligen Notfall-Schlüssel!\n\nViele Grüße,\n{{school_name}}".into(),
        available_placeholders: vec![
            "{{user_email}}".into(),
            "{{invite_url}}".into(),
            "{{school_name}}".into(),
        ],
    }
}

fn default_mail_templates() -> Vec<MailTemplateRecord> {
    vec![
        default_invite_template(),
        MailTemplateRecord {
            id: "inactivity_warning".into(),
            title: "Inaktivitäts-Warnung & Kontolöschung".into(),
            subject: "Gradus21: Wichtiger Hinweis zu deinem Benutzerkonto".into(),
            body_text: "Hallo {{user_email}},\n\ndein Konto bei Gradus21 war seit längerer Zeit inaktiv. Gemäß den Schul-Datenschutzrichtlinien werden inaktive Konten nach Ablauf der Frist automatisch bereinigt.\n\nFalls du dein Konto weiterhin benötigst, melde dich bitte zeitnah unter {{app_url}} an.\n\nViele Grüße,\nAdministration".into(),
            available_placeholders: vec!["{{user_email}}".into(), "{{app_url}}".into(), "{{last_login}}".into()],
        },
        MailTemplateRecord {
            id: "security_alert".into(),
            title: "Sicherheits-Benachrichtigung".into(),
            subject: "Gradus21: Neue Sicherheitsaktivität in deinem Konto".into(),
            body_text: "Hallo {{user_email}},\n\nin deinem Gradus21-Konto wurde eine Sicherheitsänderung registriert (z. B. Aktivierung von 2FA/Passkey oder Passwort-Änderung).\n\nZeitpunkt: {{timestamp}}\n\nFalls du diese Änderung nicht selbst durchgeführt hast, wende dich bitte sofort an die Administration.\n\nViele Grüße,\nGradus21 Security".into(),
            available_placeholders: vec!["{{user_email}}".into(), "{{timestamp}}".into()],
        },
    ]
}

fn get_mail_templates_internal(state: &AppState) -> Vec<MailTemplateRecord> {
    let settings = state.mem_settings.read().unwrap();
    settings
        .get("mail_templates")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_else(default_mail_templates)
}

pub async fn list_mail_templates(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<MailTemplateRecord>>, (StatusCode, String)> {
    require_admin(&state, &headers)?;
    Ok(Json(get_mail_templates_internal(&state)))
}

pub async fn update_mail_template(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<MailTemplateRecord>,
) -> Result<Json<MailTemplateRecord>, (StatusCode, String)> {
    require_admin(&state, &headers)?;
    let mut list = get_mail_templates_internal(&state);
    if let Some(pos) = list.iter().position(|t| t.id == id) {
        list[pos] = payload.clone();
    } else {
        list.push(payload.clone());
    }

    let val = serde_json::to_value(&list).unwrap();
    {
        let mut settings = state.mem_settings.write().unwrap();
        settings.insert("mail_templates".into(), val.clone());
    }
    save_setting_to_pg(&state, "mail_templates", &val).await;
    persist_to_disk(&state);
    Ok(Json(payload))
}

pub async fn save_all_mail_templates(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Vec<MailTemplateRecord>>,
) -> Result<Json<Vec<MailTemplateRecord>>, (StatusCode, String)> {
    require_admin(&state, &headers)?;
    let val = serde_json::to_value(&payload).unwrap();
    {
        let mut settings = state.mem_settings.write().unwrap();
        settings.insert("mail_templates".into(), val.clone());
    }
    save_setting_to_pg(&state, "mail_templates", &val).await;
    persist_to_disk(&state);
    Ok(Json(payload))
}

// =============================================================================
// Helper: Save system_settings to PG
// =============================================================================

pub async fn save_setting_to_pg(state: &AppState, key: &str, val: &serde_json::Value) {
    if let Some(pool) = &state.db {
        let _ = sqlx::query(
            r#"INSERT INTO system_settings (key, value, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()"#,
        )
        .bind(key)
        .bind(val)
        .execute(pool)
        .await;
    }
}
