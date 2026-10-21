use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::middleware::authenticate_request;
use crate::state::{
    delete_all_envelopes_from_pg, delete_all_passkeys_for_user_from_pg, delete_envelope_from_pg,
    delete_user_from_pg, persist_to_disk, sync_envelope_to_pg, sync_user_to_pg, tenant_env_key,
    AppState, EncryptedEnvelopeRecord,
};

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
pub struct BatchSyncRequest {
    pub envelopes: Vec<BatchUpsertItem>,
}


pub async fn list_envelopes(
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

pub fn resolve_tenant_envelope_id(owner_id: Uuid, requested_id: Uuid) -> Uuid {
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

pub async fn upsert_envelope(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<UpsertEnvelopeRequest>,
) -> Result<Json<EncryptedEnvelopeRecord>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let owner_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    let primary_key = tenant_env_key(&owner_id, &req.id);
    let legacy_namespaced_id = resolve_tenant_envelope_id(owner_id, req.id);
    let legacy_key = tenant_env_key(&owner_id, &legacy_namespaced_id);

    let record = {
        let mut store = state.mem_envelopes.write().unwrap();
        let existing = store.get(&primary_key).or_else(|| store.get(&legacy_key));
        if let Some(existing) = existing {
            // Optimistic Concurrency Control
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

        let next_version = existing.map(|e| e.version + 1).unwrap_or(1);
        let rec = EncryptedEnvelopeRecord {
            id: req.id,
            owner_user_id: owner_id,
            entity_type: req.entity_type,
            parent_id: req.parent_id,
            class_id: req.class_id,
            encrypted_payload: req.encrypted_payload,
            version: next_version,
            updated_at: Utc::now(),
        };
        if legacy_key != primary_key {
            store.remove(&legacy_key);
        }
        store.insert(primary_key, rec.clone());
        rec
    };
    sync_envelope_to_pg(&state, &record).await;
    persist_to_disk(&state);
    Ok(Json(record))
}

pub async fn batch_sync_envelopes(
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
            let primary_key = tenant_env_key(&owner_id, &item.id);
            let legacy_namespaced_id = resolve_tenant_envelope_id(owner_id, item.id);
            let legacy_key = tenant_env_key(&owner_id, &legacy_namespaced_id);

            let existing = store.get(&primary_key).or_else(|| store.get(&legacy_key));
            if let Some(existing) = existing {
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
            let primary_key = tenant_env_key(&owner_id, &item.id);
            let legacy_namespaced_id = resolve_tenant_envelope_id(owner_id, item.id);
            let legacy_key = tenant_env_key(&owner_id, &legacy_namespaced_id);

            let next_version = store
                .get(&primary_key)
                .or_else(|| store.get(&legacy_key))
                .map(|e| e.version + 1)
                .unwrap_or(1);

            let record = EncryptedEnvelopeRecord {
                id: item.id,
                owner_user_id: owner_id,
                entity_type: item.entity_type,
                parent_id: item.parent_id,
                class_id: item.class_id,
                encrypted_payload: item.encrypted_payload,
                version: next_version,
                updated_at: Utc::now(),
            };
            if legacy_key != primary_key {
                store.remove(&legacy_key);
            }
            store.insert(primary_key, record.clone());
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

pub async fn delete_envelope(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let owner_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    let primary_key = tenant_env_key(&owner_id, &id);
    let legacy_namespaced_id = resolve_tenant_envelope_id(owner_id, id);
    let legacy_key = tenant_env_key(&owner_id, &legacy_namespaced_id);

    let removed = {
        let mut store = state.mem_envelopes.write().unwrap();
        store.remove(&primary_key).or_else(|| store.remove(&legacy_key))
    };
    if let Some(_rec) = removed {
        delete_envelope_from_pg(&state, id, owner_id).await;
        persist_to_disk(&state);
        return Ok(StatusCode::NO_CONTENT);
    }
    Err((StatusCode::NOT_FOUND, "Nicht gefunden".into()))
}


#[derive(Debug, Serialize, Deserialize)]
pub struct DeleteCloudDataResponse {
    pub user_deleted: bool,
    pub is_admin: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EnvelopesSummaryResponse {
    pub envelope_count: usize,
    pub class_count: usize,
    pub class_ids: Vec<Uuid>,
    pub last_updated_at: Option<DateTime<Utc>>,
}



pub async fn get_envelopes_summary(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<EnvelopesSummaryResponse>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let owner_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    let store = state.mem_envelopes.read().unwrap();
    let user_envs: Vec<_> = store.values().filter(|e| e.owner_user_id == owner_id).collect();

    let envelope_count = user_envs.len();
    let class_envs: Vec<_> = user_envs.iter().filter(|e| e.entity_type == "class_dataset").collect();
    let class_count = class_envs.len();
    let class_ids: Vec<Uuid> = class_envs.iter().map(|e| e.id).collect();
    let last_updated_at = user_envs.iter().map(|e| e.updated_at).max();

    Ok(Json(EnvelopesSummaryResponse {
        envelope_count,
        class_count,
        class_ids,
        last_updated_at,
    }))
}

pub async fn delete_all_user_envelopes(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DeleteCloudDataResponse>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let owner_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    // 1. Delete all envelopes for this user
    {
        let mut store = state.mem_envelopes.write().unwrap();
        store.retain(|_, env| env.owner_user_id != owner_id);
    }
    delete_all_envelopes_from_pg(&state, owner_id).await;

    // 2. If non-admin: cascade delete passkeys and user account completely
    let user_deleted = if !claims.is_admin {
        // Remove passkeys from memory and PG
        {
            let mut pks = state.mem_passkeys.write().unwrap();
            pks.retain(|_, p| p.user_id != owner_id);
        }
        delete_all_passkeys_for_user_from_pg(&state, owner_id).await;

        // Remove user from memory and PG
        {
            let mut users = state.mem_users.write().unwrap();
            users.remove(&owner_id);
        }
        delete_user_from_pg(&state, owner_id).await;
        true
    } else {
        false
    };

    persist_to_disk(&state);

    let message = if user_deleted {
        "Alle Cloud-Daten und dein Benutzerkonto wurden vollständig vom Server gelöscht. Gradus21 arbeitet nun rein lokal.".to_string()
    } else {
        "Alle verschlüsselten Cloud-Datensätze wurden gelöscht. Dein Administratorkonto bleibt zur Verwaltung aktiv.".to_string()
    };

    Ok(Json(DeleteCloudDataResponse {
        user_deleted,
        is_admin: claims.is_admin,
        message,
    }))
}

pub async fn update_preferences(
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


