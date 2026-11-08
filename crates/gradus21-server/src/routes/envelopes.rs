use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::middleware::authenticate_request;
use crate::state::{
    delete_all_envelopes_from_pg, delete_envelope_from_pg, persist_to_disk, sync_user_to_pg,
    tenant_env_key, AppState, EncryptedEnvelopeRecord,
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

    let list: Vec<EncryptedEnvelopeRecord> = if let Some(pool) = &state.db {
        if let Ok(rows) = sqlx::query(
            "SELECT id, owner_user_id, entity_type, parent_id, class_id, encrypted_payload, version, updated_at FROM encrypted_envelopes WHERE owner_user_id = $1"
        )
        .bind(owner_id)
        .fetch_all(pool)
        .await {
            rows.into_iter().map(|row| EncryptedEnvelopeRecord {
                id: row.get("id"),
                owner_user_id: row.get("owner_user_id"),
                entity_type: row.get("entity_type"),
                parent_id: row.get("parent_id"),
                class_id: row.get("class_id"),
                encrypted_payload: row.get("encrypted_payload"),
                version: row.get("version"),
                updated_at: row.get("updated_at"),
            }).collect()
        } else {
            let store = state.mem_envelopes.read().unwrap();
            store
                .values()
                .filter(|e| e.owner_user_id == owner_id)
                .cloned()
                .collect()
        }
    } else {
        let store = state.mem_envelopes.read().unwrap();
        store
            .values()
            .filter(|e| e.owner_user_id == owner_id)
            .cloned()
            .collect()
    };

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

/// Architectural Invariant (I-3): Single atomic implementation for both single-envelope and
/// batch-envelope upserts. Enforces strict Optimistic Concurrency Control (`expected_version`
/// must match `Some(existing.version)` whenever an envelope already exists; `None` is only
/// permitted for initial creation) and executes all PostgreSQL writes in a single transaction
/// before mutating `state.mem_envelopes`.
async fn apply_envelope_upserts(
    state: &AppState,
    owner_id: Uuid,
    items: Vec<BatchUpsertItem>,
) -> Result<Vec<EncryptedEnvelopeRecord>, (StatusCode, String)> {
    if items.len() > 500 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Maximal 500 Umschläge pro Batch-Synchronisation erlaubt.".into(),
        ));
    }
    for item in &items {
        let et = item.entity_type.trim();
        if et.is_empty() || et.len() > 64 {
            return Err((
                StatusCode::BAD_REQUEST,
                "Ungültiger entity_type (1 bis 64 Zeichen erforderlich).".into(),
            ));
        }
    }

    let staged: Vec<(String, String, Option<i32>, EncryptedEnvelopeRecord)> = {
        let store = state.mem_envelopes.read().unwrap();

        // Pre-validation pass: verify all expected_versions before mutating any record
        for item in &items {
            let primary_key = tenant_env_key(&owner_id, &item.id);
            let legacy_namespaced_id = resolve_tenant_envelope_id(owner_id, item.id);
            let legacy_key = tenant_env_key(&owner_id, &legacy_namespaced_id);

            let existing = store.get(&primary_key).or_else(|| store.get(&legacy_key));
            if let Some(existing) = existing {
                if item.expected_version != Some(existing.version) {
                    let err_json = serde_json::json!({
                        "error": "conflict",
                        "message": format!(
                            "Konflikt bei Envelope {}: Server hat Version {}, erwartet war {:?}",
                            item.id, existing.version, item.expected_version
                        ),
                        "conflict_envelope": existing,
                        "current_envelope": existing,
                        "server_version": existing.version,
                        "expected_version": item.expected_version,
                        "envelope_id": item.id
                    });
                    return Err((StatusCode::CONFLICT, err_json.to_string()));
                }
            }
        }

        let mut out = Vec::with_capacity(items.len());
        for item in items {
            let primary_key = tenant_env_key(&owner_id, &item.id);
            let legacy_namespaced_id = resolve_tenant_envelope_id(owner_id, item.id);
            let legacy_key = tenant_env_key(&owner_id, &legacy_namespaced_id);
            let exp_ver = item.expected_version;

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
            out.push((primary_key, legacy_key, exp_ver, record));
        }
        out
    };

    let pg_staged: Vec<(Option<i32>, EncryptedEnvelopeRecord)> = staged
        .iter()
        .map(|(_, _, exp_ver, rec)| (*exp_ver, rec.clone()))
        .collect();

    match crate::state::sync_envelopes_batch_to_pg_checked(state, &pg_staged).await {
        Ok(Some(conflict_id)) => {
            let store = state.mem_envelopes.read().unwrap();
            let primary_key = tenant_env_key(&owner_id, &conflict_id);
            let existing = store.get(&primary_key);
            let exp_ver = staged
                .iter()
                .find(|(_, _, _, r)| r.id == conflict_id)
                .and_then(|(_, _, ev, _)| *ev);
            let err_json = serde_json::json!({
                "error": "conflict",
                "message": format!("Versionskonflikt in der Datenbank bei Envelope {}", conflict_id),
                "conflict_envelope": existing,
                "current_envelope": existing,
                "expected_version": exp_ver,
                "envelope_id": conflict_id
            });
            return Err((StatusCode::CONFLICT, err_json.to_string()));
        }
        Ok(None) => {}
        Err(err_msg) => {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Datenbankfehler beim Speichern der Umschläge: {}", err_msg),
            ));
        }
    }

    let updated = {
        let mut store = state.mem_envelopes.write().unwrap();
        let mut out = Vec::with_capacity(staged.len());
        for (primary_key, legacy_key, _, rec) in staged {
            if legacy_key != primary_key {
                store.remove(&legacy_key);
            }
            store.insert(primary_key, rec.clone());
            out.push(rec);
        }
        out
    };
    persist_to_disk(state);
    Ok(updated)
}

pub async fn upsert_envelope(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<UpsertEnvelopeRequest>,
) -> Result<Json<EncryptedEnvelopeRecord>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let owner_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    let mut updated = apply_envelope_upserts(
        &state,
        owner_id,
        vec![BatchUpsertItem {
            id: req.id,
            entity_type: req.entity_type,
            parent_id: req.parent_id,
            class_id: req.class_id,
            encrypted_payload: req.encrypted_payload,
            expected_version: req.expected_version,
        }],
    )
    .await?;

    Ok(Json(updated.pop().expect("single item batch returns one record")))
}

pub async fn batch_sync_envelopes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<BatchSyncRequest>,
) -> Result<Json<Vec<EncryptedEnvelopeRecord>>, (StatusCode, String)> {
    let claims = authenticate_request(&state, &headers)?;
    let owner_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Ungültige User-ID".into()))?;

    let updated = apply_envelope_upserts(&state, owner_id, req.envelopes).await?;
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

    // If PostgreSQL is active, delete from DB first and fail if query fails
    let pg_deleted = if state.db.is_some() {
        let res1 = delete_envelope_from_pg(&state, id, owner_id)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Datenbankfehler beim Löschen: {}", e)))?;
        let res2 = if legacy_namespaced_id != id {
            delete_envelope_from_pg(&state, legacy_namespaced_id, owner_id)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Datenbankfehler beim Löschen: {}", e)))?
        } else {
            0
        };
        res1 > 0 || res2 > 0
    } else {
        false
    };

    let removed = {
        let mut store = state.mem_envelopes.write().unwrap();
        store.remove(&primary_key).or_else(|| store.remove(&legacy_key))
    };

    if pg_deleted || removed.is_some() {
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

    if let Some(ref pool) = state.db {
        if let Ok(rows) = sqlx::query(
            "SELECT id, entity_type, updated_at FROM encrypted_envelopes WHERE owner_user_id = $1"
        )
        .bind(owner_id)
        .fetch_all(pool)
        .await
        {
            let envelope_count = rows.len();
            let mut class_count = 0;
            let mut class_ids = Vec::new();
            let mut last_updated_at: Option<DateTime<Utc>> = None;

            for r in rows {
                let id: Uuid = r.get("id");
                let entity_type: String = r.get("entity_type");
                let updated_at: DateTime<Utc> = r.get("updated_at");

                if entity_type == "class_dataset" {
                    class_count += 1;
                    class_ids.push(id);
                }

                if last_updated_at.map_or(true, |prev| updated_at > prev) {
                    last_updated_at = Some(updated_at);
                }
            }

            return Ok(Json(EnvelopesSummaryResponse {
                envelope_count,
                class_count,
                class_ids,
                last_updated_at,
            }));
        }
    }

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

    let user_deleted = if !claims.is_admin {
        crate::state::delete_user_account_everywhere(&state, owner_id).await;
        true
    } else {
        {
            let mut store = state.mem_envelopes.write().unwrap();
            store.retain(|_, env| env.owner_user_id != owner_id);
        }
        delete_all_envelopes_from_pg(&state, owner_id).await;
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


