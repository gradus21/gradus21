use crate::crypto::{
    decrypt_entity_envelope, derive_recovery_auth_key, encrypt_entity_envelope,
    generate_vault_bundle, rewrap_dek_for_new_password, unlock_dek_with_recovery_key,
    unlock_vault_with_password, unwrap_dek_with_passkey_secret, wrap_dek_with_passkey_secret,
    wrap_dek_with_recovery_key, KdfParams,
};
use crate::grading::{
    calculate_class_report, simulate_needed_score_for_target, AssessmentConfig, CategoryConfig,
    GradeEntry, StudentCalculatedSummary, StudentProfile, SubjectGradingConfig,
};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn wasm_generate_vault(password: &str) -> Result<String, JsValue> {
    let bundle = generate_vault_bundle(password).map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_json::to_string(&bundle).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn wasm_wrap_dek_with_passkey(
    dek_b64: &str,
    passkey_secret_b64: &str,
    credential_id: &str,
) -> Result<String, JsValue> {
    wrap_dek_with_passkey_secret(dek_b64, passkey_secret_b64, credential_id)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn wasm_unwrap_dek_with_passkey(
    passkey_secret_b64: &str,
    credential_id: &str,
    passkey_encrypted_dek: &str,
) -> Result<String, JsValue> {
    unwrap_dek_with_passkey_secret(passkey_secret_b64, credential_id, passkey_encrypted_dek)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn wasm_unlock_vault(
    password: &str,
    salt_b64: &str,
    kdf_params_json: &str,
    encrypted_dek: &str,
) -> Result<String, JsValue> {
    let params: KdfParams =
        serde_json::from_str(kdf_params_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let unlocked = unlock_vault_with_password(password, salt_b64, &params, encrypted_dek)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_json::to_string(&unlocked).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn wasm_unlock_with_recovery(
    recovery_key: &str,
    recovery_encrypted_dek: &str,
) -> Result<String, JsValue> {
    unlock_dek_with_recovery_key(recovery_key, recovery_encrypted_dek)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn wasm_derive_recovery_auth_key(recovery_key: &str) -> Result<String, JsValue> {
    derive_recovery_auth_key(recovery_key).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn wasm_wrap_dek_with_recovery(
    dek_b64: &str,
    existing_recovery_key: &str,
) -> Result<String, JsValue> {
    let opt = if existing_recovery_key.trim().is_empty() {
        None
    } else {
        Some(existing_recovery_key)
    };
    let (formatted, enc_dek) =
        wrap_dek_with_recovery_key(dek_b64, opt).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let recovery_auth_key_b64 =
        derive_recovery_auth_key(&formatted).map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_json::to_string(&serde_json::json!({
        "recovery_key_formatted": formatted,
        "recovery_encrypted_dek": enc_dek,
        "recovery_auth_key_b64": recovery_auth_key_b64,
    }))
    .map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn wasm_rewrap_dek(dek_b64: &str, new_password: &str) -> Result<String, JsValue> {
    let (salt, params, auth_key, enc_dek) =
        rewrap_dek_for_new_password(dek_b64, new_password).map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_json::to_string(&serde_json::json!({
        "kdf_salt_b64": salt,
        "kdf_params": params,
        "auth_key_b64": auth_key,
        "encrypted_dek": enc_dek,
    }))
    .map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn wasm_encrypt_envelope(
    dek_b64: &str,
    owner_user_id: &str,
    entity_id: &str,
    plaintext_json: &str,
) -> Result<String, JsValue> {
    encrypt_entity_envelope(dek_b64, owner_user_id, entity_id, plaintext_json)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn wasm_decrypt_envelope(
    dek_b64: &str,
    owner_user_id: &str,
    entity_id: &str,
    envelope: &str,
) -> Result<String, JsValue> {
    decrypt_entity_envelope(dek_b64, owner_user_id, entity_id, envelope)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

#[derive(Deserialize)]
struct CalculateInput {
    config: SubjectGradingConfig,
    categories: Vec<CategoryConfig>,
    assessments: Vec<AssessmentConfig>,
    students: Vec<StudentProfile>,
    grades: Vec<GradeEntry>,
    term_filter: Option<String>,
}

#[wasm_bindgen]
pub fn wasm_calculate_class_report(input_json: &str) -> Result<String, JsValue> {
    let input: CalculateInput =
        serde_json::from_str(input_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let report = calculate_class_report(
        &input.config,
        &input.categories,
        &input.assessments,
        &input.students,
        &input.grades,
        input.term_filter.as_deref(),
    );
    serde_json::to_string(&report).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn wasm_simulate_needed_score(
    summary_json: &str,
    categories_json: &str,
    target_category_id: &str,
    target_overall_percent: f64,
) -> Result<JsValue, JsValue> {
    let summary: StudentCalculatedSummary =
        serde_json::from_str(summary_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let categories: Vec<CategoryConfig> =
        serde_json::from_str(categories_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let res = simulate_needed_score_for_target(
        &summary,
        &categories,
        target_category_id,
        target_overall_percent,
    );
    Ok(match res {
        Some(v) => JsValue::from_f64(v),
        None => JsValue::NULL,
    })
}
