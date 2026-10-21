use super::*;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode},
    Json,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chrono::Utc;
use gradus21_core::crypto::{
    derive_recovery_auth_key, generate_vault_bundle, rewrap_dek_for_new_password,
    wrap_dek_with_recovery_key, KdfParams,
};
use jsonwebtoken::{encode, EncodingKey, Header};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::sync::{Arc, RwLock};
use url::Url;
use uuid::Uuid;
use webauthn_rs::prelude::*;

fn create_test_state() -> AppState {
    let tmp_file = std::env::temp_dir().join(format!("gradus21_test_vault_{}.json", Uuid::new_v4()));
    let key_digest = Sha256::digest(b"test_server_encryption_key_2026");
    let rp_id = "localhost";
    let rp_origin = Url::parse("http://localhost:5173").unwrap();
    let webauthn = Arc::new(
        WebauthnBuilder::new(rp_id, &rp_origin)
            .unwrap()
            .rp_name("Gradus21 Test")
            .append_allowed_origin(&Url::parse("http://localhost:3080").unwrap())
            .build()
            .unwrap(),
    );

    AppState {
        db: None,
        disk_store_path: tmp_file,
        mem_users: Arc::new(RwLock::new(HashMap::new())),
        mem_passkeys: Arc::new(RwLock::new(HashMap::new())),
        mem_envelopes: Arc::new(RwLock::new(HashMap::new())),
        mem_settings: Arc::new(RwLock::new(HashMap::new())),
        mem_global_templates: Arc::new(RwLock::new(HashMap::new())),
        auth_rate_limits: Arc::new(RwLock::new(HashMap::new())),
        jwt_secret: "test_jwt_secret_2026".into(),
        server_encryption_key_b64: B64.encode(key_digest),
        admin_emails: vec!["admin@example.com".into()],
        enable_admin_panel: true,
        webauthn,
        reg_challenges: Arc::new(RwLock::new(HashMap::new())),
        auth_challenges: Arc::new(RwLock::new(HashMap::new())),
        legal_config: LegalConfig::default(),
        mem_email_verifications: Arc::new(RwLock::new(HashMap::new())),
    }
}

#[test]
fn test_rejects_offline_demo_jwt_backdoor() {
    let state = create_test_state();
    let mut headers = HeaderMap::new();
    headers.insert(
        "authorization",
        HeaderValue::from_static("Bearer offline_demo_jwt"),
    );
    let res = authenticate_request(&state, &headers);
    assert!(res.is_err());
    assert_eq!(res.unwrap_err().0, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_register_login_and_cryptographic_recovery_verification() {
    let state = create_test_state();
    let bundle = generate_vault_bundle("InitialPassword123!").expect("bundle");

    // 1. Register user with recovery_auth_key_b64
    let Json(reg_resp) = register_user(
        State(state.clone()),
        Json(RegisterRequest {
            email: "teacher@schule.de".into(),
            auth_key_b64: bundle.auth_key_b64.clone(),
            kdf_salt_b64: bundle.kdf_salt_b64.clone(),
            kdf_params: bundle.kdf_params.clone(),
            encrypted_dek: bundle.encrypted_dek.clone(),
            recovery_encrypted_dek: bundle.recovery_encrypted_dek.clone(),
            recovery_auth_key_b64: Some(bundle.recovery_auth_key_b64.clone()),
            user_id: None,
        }),
    )
    .await
    .expect("register_user");
    assert_eq!(reg_resp.email, "teacher@schule.de");

    // 2. Verify salt endpoint does NOT leak passkey_credential_id
    let Json(salt_resp) = get_user_salt(
        State(state.clone()),
        Json(SaltQueryRequest {
            email: "teacher@schule.de".into(),
        }),
    )
    .await
    .expect("get_user_salt");
    assert!(!salt_resp.has_passkey);

    // 3. Attempt password recovery with WRONG recovery_auth_key_b64 -> must fail with 401
    let (new_salt, new_params, new_auth_key, new_enc_dek) =
        rewrap_dek_for_new_password(&bundle.dek_b64, "NewPassword456!").expect("rewrap");
    let wrong_rec_key = derive_recovery_auth_key("AAAA-BBBB-CCCC-DDDD-EEEE-FFFF").unwrap();

    let bad_recover = recover_password(
        State(state.clone()),
        Json(RecoverPasswordRequest {
            email: "teacher@schule.de".into(),
            recovery_auth_key_b64: wrong_rec_key,
            new_auth_key_b64: new_auth_key.clone(),
            new_kdf_salt_b64: new_salt.clone(),
            new_kdf_params: new_params.clone(),
            new_encrypted_dek: new_enc_dek.clone(),
            new_recovery_encrypted_dek: None,
            new_recovery_auth_key_b64: None,
        }),
    )
    .await;
    assert!(bad_recover.is_err());
    assert_eq!(bad_recover.err().unwrap().0, StatusCode::UNAUTHORIZED);

    // 4. Attempt password recovery with VALID recovery_auth_key_b64 -> succeeds
    let Json(good_recover) = recover_password(
        State(state.clone()),
        Json(RecoverPasswordRequest {
            email: "teacher@schule.de".into(),
            recovery_auth_key_b64: bundle.recovery_auth_key_b64.clone(),
            new_auth_key_b64: new_auth_key.clone(),
            new_kdf_salt_b64: new_salt,
            new_kdf_params: new_params,
            new_encrypted_dek: new_enc_dek,
            new_recovery_encrypted_dek: None,
            new_recovery_auth_key_b64: None,
        }),
    )
    .await
    .expect("valid recovery");
    assert_eq!(good_recover.user_id, reg_resp.user_id);

    // 5. Test rotating recovery key for logged-in user (e.g. if original sheet lost)
    let mut auth_headers = HeaderMap::new();
    auth_headers.insert(
        "authorization",
        HeaderValue::from_str(&format!("Bearer {}", good_recover.token)).unwrap(),
    );

    let (new_formatted_rec, new_rec_enc_dek) = wrap_dek_with_recovery_key(&bundle.dek_b64, None).expect("wrap new rec");
    let new_rec_auth_b64 = derive_recovery_auth_key(&new_formatted_rec).expect("derive new rec auth");

    let Json(rot_resp) = rotate_recovery_key(
        State(state.clone()),
        auth_headers,
        Json(RotateRecoveryKeyRequest {
            recovery_encrypted_dek: new_rec_enc_dek.clone(),
            recovery_auth_key_b64: new_rec_auth_b64.clone(),
        }),
    )
    .await
    .expect("rotate recovery key");
    assert_eq!(rot_resp["success"], true);

    // Verify that the new recovery key works to recover password again
    let Json(recover_with_new_key) = recover_password(
        State(state.clone()),
        Json(RecoverPasswordRequest {
            email: "teacher@schule.de".into(),
            recovery_auth_key_b64: new_rec_auth_b64,
            new_auth_key_b64: "new_auth_key_2".into(),
            new_kdf_salt_b64: "new_salt_2".into(),
            new_kdf_params: KdfParams::default(),
            new_encrypted_dek: "v1:nonce:new_dek_payload".into(),
            new_recovery_encrypted_dek: None,
            new_recovery_auth_key_b64: None,
        }),
    )
    .await
    .expect("recover with rotated key");
    assert_eq!(recover_with_new_key.user_id, reg_resp.user_id);

    // Clean up temporary vault file
    let _ = fs::remove_file(&state.disk_store_path);
}

#[tokio::test]
async fn test_2fa_setup_locks_after_enabling_and_tenant_isolation() {
    let state = create_test_state();
    let bundle = generate_vault_bundle("Teacher2FA!").expect("bundle");

    let Json(reg_resp) = register_user(
        State(state.clone()),
        Json(RegisterRequest {
            email: "2fa@schule.de".into(),
            auth_key_b64: bundle.auth_key_b64,
            kdf_salt_b64: bundle.kdf_salt_b64,
            kdf_params: bundle.kdf_params,
            encrypted_dek: bundle.encrypted_dek,
            recovery_encrypted_dek: bundle.recovery_encrypted_dek,
            recovery_auth_key_b64: Some(bundle.recovery_auth_key_b64),
            user_id: None,
        }),
    )
    .await
    .expect("register");

    let mut headers = HeaderMap::new();
    headers.insert(
        "authorization",
        HeaderValue::from_str(&format!("Bearer {}", reg_resp.token)).unwrap(),
    );

    // 1. Setup 2FA before enabling -> returns secret_base32, no totp_current_code_hint
    let Json(setup_info) = get_2fa_setup_info(State(state.clone()), headers.clone())
        .await
        .expect("2fa setup");
    assert!(setup_info.get("totp_current_code_hint").is_none());
    let secret_b32 = setup_info["totp_secret_base32"].as_str().unwrap().to_string();

    // 2. Verify and enable 2FA using valid TOTP code
    let valid_code = totp::current_totp_code(&secret_b32).expect("code");
    let Json(verified_info) = verify_and_enable_2fa(
        State(state.clone()),
        headers.clone(),
        Json(VerifyTotpRequest {
            totp_code: valid_code,
        }),
    )
    .await
    .expect("enable 2fa");
    assert_eq!(verified_info["totp_enabled"], true);

    // 3. Calling get_2fa_setup_info again after 2FA is enabled must be rejected with 409 CONFLICT
    let second_setup = get_2fa_setup_info(State(state.clone()), headers.clone()).await;
    assert!(second_setup.is_err());
    assert_eq!(second_setup.unwrap_err().0, StatusCode::CONFLICT);

    // 3b. Reconfiguring 2FA generates a new secret and temporarily resets totp_enabled to false until verified
    let Json(reconf_info) = reconfigure_2fa(State(state.clone()), headers.clone())
        .await
        .expect("reconfigure 2fa");
    assert_eq!(reconf_info["totp_enabled"], false);
    let new_secret_b32 = reconf_info["totp_secret_base32"].as_str().unwrap().to_string();
    assert_ne!(new_secret_b32, secret_b32);

    // Verify with new secret enables 2FA again
    let new_valid_code = totp::current_totp_code(&new_secret_b32).expect("new code");
    let Json(re_verified) = verify_and_enable_2fa(
        State(state.clone()),
        headers.clone(),
        Json(VerifyTotpRequest {
            totp_code: new_valid_code,
        }),
    )
    .await
    .expect("re-enable 2fa");
    assert_eq!(re_verified["totp_enabled"], true);

    // 3c. Disabling 2FA resets totp_enabled to false
    let Json(disabled_info) = disable_2fa(State(state.clone()), headers.clone())
        .await
        .expect("disable 2fa");
    assert_eq!(disabled_info["totp_enabled"], false);

    // Re-enable again for remaining tests
    let valid_code_again = totp::current_totp_code(&new_secret_b32).expect("code again");
    let _ = verify_and_enable_2fa(
        State(state.clone()),
        headers.clone(),
        Json(VerifyTotpRequest {
            totp_code: valid_code_again,
        }),
    )
    .await
    .expect("re-enable 2fa again");

    // 4. Upsert envelope and verify tenant isolation + OCC
    let env_id = Uuid::new_v4();
    let Json(env_rec) = upsert_envelope(
        State(state.clone()),
        headers.clone(),
        Json(UpsertEnvelopeRequest {
            id: env_id,
            entity_type: "workspace_v2".into(),
            parent_id: None,
            class_id: None,
            encrypted_payload: "v1:nonce:cipher".into(),
            expected_version: None,
        }),
    )
    .await
    .expect("upsert");
    assert_eq!(env_rec.owner_user_id, reg_resp.user_id);
    assert_eq!(env_rec.version, 1);

    // OCC Test: Updating with wrong expected_version must fail with 409 Conflict
    let conflict_res = upsert_envelope(
        State(state.clone()),
        headers.clone(),
        Json(UpsertEnvelopeRequest {
            id: env_id,
            entity_type: "workspace_v2".into(),
            parent_id: None,
            class_id: None,
            encrypted_payload: "v1:nonce:cipher_conflict".into(),
            expected_version: Some(999),
        }),
    )
    .await;
    assert!(conflict_res.is_err());
    assert_eq!(conflict_res.unwrap_err().0, StatusCode::CONFLICT);

    // OCC Test: Updating with correct expected_version (1) succeeds and advances to version 2
    let Json(updated_rec) = upsert_envelope(
        State(state.clone()),
        headers.clone(),
        Json(UpsertEnvelopeRequest {
            id: env_id,
            entity_type: "workspace_v2".into(),
            parent_id: None,
            class_id: None,
            encrypted_payload: "v1:nonce:cipher_updated".into(),
            expected_version: Some(1),
        }),
    )
    .await
    .expect("valid occ update");
    assert_eq!(updated_rec.version, 2);

    let _ = fs::remove_file(&state.disk_store_path);
}

#[tokio::test]
async fn test_passkey_prf_registration_and_login_flow() {
    use gradus21_core::crypto::{generate_vault_bundle, wrap_dek_with_passkey_secret, unwrap_dek_with_passkey_secret};
    use base64::{engine::general_purpose::STANDARD as B64, Engine as _};

    let state = create_test_state();
    let bundle = generate_vault_bundle("Password123!").expect("bundle");

    // 1. Register base user
    let Json(reg_resp) = register_user(
        State(state.clone()),
        Json(RegisterRequest {
            email: "passkey_user@schule.de".into(),
            auth_key_b64: bundle.auth_key_b64.clone(),
            kdf_salt_b64: bundle.kdf_salt_b64.clone(),
            kdf_params: bundle.kdf_params.clone(),
            encrypted_dek: bundle.encrypted_dek.clone(),
            recovery_encrypted_dek: bundle.recovery_encrypted_dek.clone(),
            recovery_auth_key_b64: Some(bundle.recovery_auth_key_b64.clone()),
            user_id: None,
        }),
    )
    .await
    .expect("register user");

    let mut headers = HeaderMap::new();
    headers.insert(
        "authorization",
        HeaderValue::from_str(&format!("Bearer {}", reg_resp.token)).unwrap(),
    );

    // 2. Simulate WebAuthn PRF extension output (32 random bytes derived by authenticator)
    let prf_salt_bytes = [7u8; 32];
    let prf_salt_b64 = B64.encode(prf_salt_bytes);
    let prf_secret_bytes = [42u8; 32];
    let prf_secret_b64 = B64.encode(prf_secret_bytes);
    let cred_id = "cred_prf_hardware_touchid_12345";

    let passkey_encrypted_dek = wrap_dek_with_passkey_secret(&bundle.dek_b64, &prf_secret_b64, cred_id)
        .expect("wrap dek with prf secret");

    // 3. Register Passkey with PRF salt
    let Json(passkey_reg_resp) = register_passkey(
        State(state.clone()),
        headers.clone(),
        Json(PasskeyRegisterRequest {
            credential_id: cred_id.into(),
            label: "MacBook Touch ID".into(),
            passkey_encrypted_dek: passkey_encrypted_dek.clone(),
            passkey_prf_salt_b64: Some(prf_salt_b64.clone()),
            kdf_salt_b64: Some(bundle.kdf_salt_b64.clone()),
            encrypted_dek: Some(bundle.encrypted_dek.clone()),
            recovery_encrypted_dek: Some(bundle.recovery_encrypted_dek.clone()),
            recovery_auth_key_b64: Some(bundle.recovery_auth_key_b64.clone()),
        }),
    )
    .await
    .expect("register passkey");
    assert_eq!(passkey_reg_resp["passkey_credential_id"], cred_id);
    assert_eq!(passkey_reg_resp["passkey_prf_salt_b64"], prf_salt_b64);

    // 4. Verify salt query returns has_passkey = true and passkey_prf_salt_b64
    let Json(salt_info) = get_user_salt(
        State(state.clone()),
        Json(SaltQueryRequest {
            email: "passkey_user@schule.de".into(),
        }),
    )
    .await
    .expect("get salt");
    assert!(salt_info.has_passkey);
    assert_eq!(salt_info.passkey_prf_salt_b64, Some(prf_salt_b64.clone()));

    // 5. Verify unauthenticated legacy passkey login endpoint is strictly disabled (Issue #8)
    let legacy_attempt = legacy_passkey_login_disabled(
        State(state.clone()),
        Json(PasskeyLoginRequest {
            email: Some("passkey_user@schule.de".into()),
            credential_id: cred_id.into(),
        }),
    )
    .await;
    assert!(legacy_attempt.is_err());
    assert_eq!(legacy_attempt.unwrap_err().0, StatusCode::GONE);

    // 6. Client unwraps DEK using the hardware PRF secret
    let unwrapped_dek = unwrap_dek_with_passkey_secret(&prf_secret_b64, cred_id, &passkey_encrypted_dek)
        .expect("unwrap dek");
    assert_eq!(unwrapped_dek, bundle.dek_b64);

    // 7. Delete Passkey and verify state is cleared
    let Json(del_resp) = delete_passkey(
        State(state.clone()),
        headers,
    )
    .await
    .expect("delete passkey");
    assert_eq!(del_resp["success"], true);

    let Json(salt_after_del) = get_user_salt(
        State(state.clone()),
        Json(SaltQueryRequest {
            email: "passkey_user@schule.de".into(),
        }),
    )
    .await
    .expect("get salt after del");
    assert!(!salt_after_del.has_passkey);

    let _ = fs::remove_file(&state.disk_store_path);
}

#[tokio::test]
async fn test_admin_permissions_user_management_and_templates() {
    let state = create_test_state();
    let bundle1 = generate_vault_bundle("AdminPass123!").expect("bundle1");
    let bundle2 = generate_vault_bundle("TeacherPass123!").expect("bundle2");

    // 1. Register first user (automatically becomes admin)
    let Json(admin_auth) = register_user(
        State(state.clone()),
        Json(RegisterRequest {
            email: "admin@schule.de".into(),
            auth_key_b64: bundle1.auth_key_b64.clone(),
            kdf_salt_b64: bundle1.kdf_salt_b64.clone(),
            kdf_params: bundle1.kdf_params.clone(),
            encrypted_dek: bundle1.encrypted_dek.clone(),
            recovery_encrypted_dek: bundle1.recovery_encrypted_dek.clone(),
            recovery_auth_key_b64: None,
            user_id: None,
        }),
    )
    .await
    .expect("admin register");
    assert!(admin_auth.is_admin);

    // 2. Register second user (standard user)
    let Json(teacher_auth) = register_user(
        State(state.clone()),
        Json(RegisterRequest {
            email: "teacher@schule.de".into(),
            auth_key_b64: bundle2.auth_key_b64.clone(),
            kdf_salt_b64: bundle2.kdf_salt_b64.clone(),
            kdf_params: bundle2.kdf_params.clone(),
            encrypted_dek: bundle2.encrypted_dek.clone(),
            recovery_encrypted_dek: bundle2.recovery_encrypted_dek.clone(),
            recovery_auth_key_b64: None,
            user_id: None,
        }),
    )
    .await
    .expect("teacher register");
    assert!(!teacher_auth.is_admin);

    // 3. Teacher attempts to access admin endpoint -> 403 Forbidden
    let mut teacher_headers = HeaderMap::new();
    teacher_headers.insert("authorization", format!("Bearer {}", teacher_auth.token).parse().unwrap());
    let forbidden_res = admin::list_users(State(state.clone()), teacher_headers.clone()).await;
    assert!(forbidden_res.is_err());
    assert_eq!(forbidden_res.unwrap_err().0, StatusCode::FORBIDDEN);

    // 4. Admin accesses admin endpoint -> success, returns user list with last_login_at
    let mut admin_headers = HeaderMap::new();
    admin_headers.insert("authorization", format!("Bearer {}", admin_auth.token).parse().unwrap());
    let Json(users_list) = admin::list_users(State(state.clone()), admin_headers.clone())
        .await
        .expect("admin list users");
    assert_eq!(users_list.len(), 2);
    let teacher_entry = users_list.iter().find(|u| u.email == "teacher@schule.de").unwrap();
    assert!(teacher_entry.last_login_at.is_some());
    assert_eq!(teacher_entry.is_admin, false);

    // 5. Demoting the only admin must fail
    let demote_req = admin::UpdateUserStatusRequest {
        is_admin: Some(false),
        is_active: None,
    };
    let demote_res = admin::update_user_status(
        State(state.clone()),
        admin_headers.clone(),
        Path(admin_auth.user_id),
        Json(demote_req),
    )
    .await;
    assert!(demote_res.is_err());
    assert_eq!(demote_res.unwrap_err().0, StatusCode::BAD_REQUEST);

    // 6. Deactivating oneself must fail
    let deactivate_self_req = admin::UpdateUserStatusRequest {
        is_admin: None,
        is_active: Some(false),
    };
    let deactivate_self_res = admin::update_user_status(
        State(state.clone()),
        admin_headers.clone(),
        Path(admin_auth.user_id),
        Json(deactivate_self_req),
    )
    .await;
    assert!(deactivate_self_res.is_err());
    assert_eq!(deactivate_self_res.unwrap_err().0, StatusCode::BAD_REQUEST);

    // 7. Admin creates global template
    let tpl_req = admin::UpsertGlobalTemplateRequest {
        template_type: "curve".into(),
        title: "Standard IHK Schlüssel".into(),
        description: "Globale Vorlage für Notenschlüssel".into(),
        payload: serde_json::json!({ "linear": true, "pass_percentage": 50 }),
    };
    let Json(created_tpl) = admin::create_global_template(
        State(state.clone()),
        admin_headers.clone(),
        Json(tpl_req),
    )
    .await
    .expect("create global template");
    assert_eq!(created_tpl.title, "Standard IHK Schlüssel");

    // 8. Teacher can list global templates
    let Json(public_tpls) = admin::list_global_templates(State(state.clone()), teacher_headers.clone())
        .await
        .expect("public tpls");
    assert_eq!(public_tpls.len(), 1);
    assert_eq!(public_tpls[0].title, "Standard IHK Schlüssel");

    // 9. Admin updates global template
    let update_req = admin::UpsertGlobalTemplateRequest {
        template_type: "curve".into(),
        title: "Standard IHK Schlüssel v2".into(),
        description: "Aktualisierte globale Vorlage".into(),
        payload: serde_json::json!({ "linear": true, "pass_percentage": 50 }),
    };
    let Json(updated_tpl) = admin::update_global_template(
        State(state.clone()),
        admin_headers.clone(),
        Path(created_tpl.id),
        Json(update_req),
    )
    .await
    .expect("update global template");
    assert_eq!(updated_tpl.title, "Standard IHK Schlüssel v2");

    // 10. Teacher can list updated templates
    let Json(updated_public_tpls) = admin::list_global_templates(State(state.clone()), teacher_headers.clone())
        .await
        .expect("public tpls");
    assert_eq!(updated_public_tpls.len(), 1);
    assert_eq!(updated_public_tpls[0].title, "Standard IHK Schlüssel v2");

    let _ = fs::remove_file(&state.disk_store_path);
}

#[tokio::test]
async fn test_full_registration_onboarding_recovery_totp_and_passkey_flow() {
    let state = create_test_state();
    let password = "SuperSecretPassword2026!";
    let bundle = generate_vault_bundle(password).expect("bundle");

    // 1. Initial registration step (Credentials & Master Password)
    let Json(reg_resp) = register_user(
        State(state.clone()),
        Json(RegisterRequest {
            email: "onboarding.teacher@schule.de".into(),
            auth_key_b64: bundle.auth_key_b64.clone(),
            kdf_salt_b64: bundle.kdf_salt_b64.clone(),
            kdf_params: bundle.kdf_params.clone(),
            encrypted_dek: bundle.encrypted_dek.clone(),
            recovery_encrypted_dek: bundle.recovery_encrypted_dek.clone(),
            recovery_auth_key_b64: Some(bundle.recovery_auth_key_b64.clone()),
            user_id: None,
        }),
    )
    .await
    .expect("register user");

    assert_eq!(reg_resp.email, "onboarding.teacher@schule.de");
    assert_eq!(reg_resp.totp_enabled, false);
    assert!(reg_resp.totp_setup_uri.is_some());
    assert!(reg_resp.totp_secret_base32.is_some());

    let mut auth_headers = HeaderMap::new();
    auth_headers.insert(
        "authorization",
        format!("Bearer {}", reg_resp.token).parse().unwrap(),
    );

    // 2. Recovery Key verification: Ensure recovery key allows DEK recovery
    let rec_auth_key = derive_recovery_auth_key(&bundle.recovery_key_formatted).unwrap();
    assert_eq!(rec_auth_key, bundle.recovery_auth_key_b64);

    // 3. Mandatory 2FA Setup Step
    let totp_secret_b32 = reg_resp.totp_secret_base32.unwrap();
    // Trying with invalid 2FA code must fail with 400 Bad Request
    let bad_2fa = verify_and_enable_2fa(
        State(state.clone()),
        auth_headers.clone(),
        Json(VerifyTotpRequest {
            totp_code: "000000".into(),
        }),
    )
    .await;
    assert!(bad_2fa.is_err());
    assert_eq!(bad_2fa.unwrap_err().0, StatusCode::BAD_REQUEST);

    // Verifying with valid 6-digit TOTP code must succeed and enable 2FA
    let valid_totp = totp::current_totp_code(&totp_secret_b32).expect("valid totp code");
    let Json(verified_info) = verify_and_enable_2fa(
        State(state.clone()),
        auth_headers.clone(),
        Json(VerifyTotpRequest {
            totp_code: valid_totp.clone(),
        }),
    )
    .await
    .expect("verify 2fa");
    assert_eq!(verified_info["totp_enabled"], true);

    // 4. Optional Passkey Registration Step
    let cred_id = "test_passkey_cred_123";
    let passkey_enc_dek = "v1:nonce:passkey_encrypted_dek_payload";
    let prf_salt_b64 = "prf_salt_sample_base64";
    let Json(passkey_reg_resp) = register_passkey(
        State(state.clone()),
        auth_headers.clone(),
        Json(PasskeyRegisterRequest {
            credential_id: cred_id.into(),
            label: "MacBook Touch ID".into(),
            passkey_encrypted_dek: passkey_enc_dek.into(),
            passkey_prf_salt_b64: Some(prf_salt_b64.into()),
            kdf_salt_b64: Some(bundle.kdf_salt_b64.clone()),
            encrypted_dek: Some(bundle.encrypted_dek.clone()),
            recovery_encrypted_dek: Some(bundle.recovery_encrypted_dek.clone()),
            recovery_auth_key_b64: Some(bundle.recovery_auth_key_b64.clone()),
        }),
    )
    .await
    .expect("register passkey");
    assert_eq!(passkey_reg_resp["passkey_credential_id"], cred_id);

    // 5. Subsequent Login Verification:
    // A) Password login without TOTP code must now be rejected with 2FA_REQUIRED
    let login_no_2fa = login_user(
        State(state.clone()),
        Json(LoginRequest {
            email: "onboarding.teacher@schule.de".into(),
            auth_key_b64: bundle.auth_key_b64.clone(),
            totp_code: None,
        }),
    )
    .await;
    assert!(login_no_2fa.is_err());
    assert_eq!(login_no_2fa.unwrap_err().1, "2FA_REQUIRED");

    // B) Password login with valid TOTP code succeeds
    let Json(login_ok) = login_user(
        State(state.clone()),
        Json(LoginRequest {
            email: "onboarding.teacher@schule.de".into(),
            auth_key_b64: bundle.auth_key_b64.clone(),
            totp_code: Some(valid_totp),
        }),
    )
    .await
    .expect("login with 2fa");
    assert_eq!(login_ok.totp_enabled, true);
    assert_eq!(login_ok.passkey_credential_id, Some(cred_id.into()));

    // C) Verify unauthenticated passkey login bypass is strictly disabled (Issue #8)
    let passkey_login_legacy = legacy_passkey_login_disabled(
        State(state.clone()),
        Json(PasskeyLoginRequest {
            email: Some("onboarding.teacher@schule.de".into()),
            credential_id: cred_id.into(),
        }),
    )
    .await;
    assert!(passkey_login_legacy.is_err());
    assert_eq!(passkey_login_legacy.unwrap_err().0, StatusCode::GONE);

    let _ = fs::remove_file(&state.disk_store_path);
}

#[tokio::test]
async fn test_backup_snapshot_and_schedule_configuration() {
    let state = create_test_state();
    let claims = JwtClaims {
        sub: Uuid::new_v4().to_string(),
        email: "admin@example.com".into(),
        is_admin: true,
        two_factor_verified: true,
        exp: (Utc::now() + chrono::Duration::hours(1)).timestamp() as usize,
    };
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .expect("token");

    let mut headers = HeaderMap::new();
    headers.insert(
        "authorization",
        HeaderValue::from_str(&format!("Bearer {}", token)).unwrap(),
    );

    // 1. Create a snapshot
    let Json(entry) = admin::create_backup_snapshot(State(state.clone()), headers.clone())
        .await
        .expect("create snapshot");
    assert!(entry.filename.starts_with("gradus21_backup_"));
    assert!(entry.size_bytes > 0);

    // 2. List backups
    let Json(backups) = admin::list_backups(State(state.clone()), headers.clone())
        .await
        .expect("list backups");
    assert_eq!(backups.len(), 1);
    assert_eq!(backups[0].filename, entry.filename);

    // 3. Update schedule with alias and custom intervals
    let new_cfg = admin::BackupScheduleConfig {
        auto_backup_enabled: true,
        interval_hours: 12,
        retention_days: 14,
        last_run: None,
    };
    let Json(saved_cfg) = admin::update_backup_config(
        State(state.clone()),
        headers.clone(),
        Json(new_cfg),
    )
    .await
    .expect("update schedule");
    assert_eq!(saved_cfg.interval_hours, 12);
    assert_eq!(saved_cfg.retention_days, 14);

    // 4. Retrieve schedule
    let Json(retrieved_cfg) = admin::get_backup_config(State(state.clone()), headers.clone())
        .await
        .expect("get schedule");
    assert_eq!(retrieved_cfg.auto_backup_enabled, true);
    assert_eq!(retrieved_cfg.interval_hours, 12);
    assert_eq!(retrieved_cfg.retention_days, 14);

    // Cleanup test files
    let backup_dir = state
        .disk_store_path
        .parent()
        .unwrap()
        .join("backups");
    let _ = fs::remove_file(backup_dir.join(&entry.filename));
    let _ = fs::remove_dir(backup_dir);
    let _ = fs::remove_file(&state.disk_store_path);
}

#[tokio::test]
async fn test_default_global_templates_rollout() {
    let default_tpls = admin::default_global_templates();
    assert_eq!(default_tpls.len(), 17);

    let curves = default_tpls.iter().filter(|t| t.template_type == "curve").count();
    let weightings = default_tpls.iter().filter(|t| t.template_type == "weighting").count();
    let levels = default_tpls.iter().filter(|t| t.template_type == "levels").count();

    assert_eq!(curves, 5);
    assert_eq!(weightings, 8);
    assert_eq!(levels, 4);

    let state = create_test_state();
    // Seed default templates into state.mem_global_templates
    {
        let mut map = state.mem_global_templates.write().unwrap();
        for tpl in &default_tpls {
            map.insert(tpl.id, tpl.clone());
        }
    }

    // Unauthenticated client can list global templates
    let empty_headers = HeaderMap::new();
    let Json(listed) = admin::list_global_templates(State(state.clone()), empty_headers)
        .await
        .expect("unauthenticated list global templates");
    assert_eq!(listed.len(), 17);
}

#[tokio::test]
async fn test_multi_passkey_management() {
    use gradus21_core::crypto::{generate_vault_bundle, wrap_dek_with_passkey_secret};
    use base64::{engine::general_purpose::STANDARD as B64, Engine as _};

    let state = create_test_state();
    let bundle = generate_vault_bundle("Password123!").expect("bundle");

    // 1. Register user
    let Json(reg_resp) = register_user(
        State(state.clone()),
        Json(RegisterRequest {
            email: "teacher_multipass@schule.de".into(),
            auth_key_b64: bundle.auth_key_b64.clone(),
            kdf_salt_b64: bundle.kdf_salt_b64.clone(),
            kdf_params: bundle.kdf_params.clone(),
            encrypted_dek: bundle.encrypted_dek.clone(),
            recovery_encrypted_dek: bundle.recovery_encrypted_dek.clone(),
            recovery_auth_key_b64: Some(bundle.recovery_auth_key_b64.clone()),
            user_id: None,
        }),
    )
    .await
    .expect("register user");

    let mut headers = HeaderMap::new();
    headers.insert(
        "authorization",
        HeaderValue::from_str(&format!("Bearer {}", reg_resp.token)).unwrap(),
    );

    // 2. Register first passkey (iPad)
    let prf_secret_1 = [10u8; 32];
    let enc_dek_1 = wrap_dek_with_passkey_secret(&bundle.dek_b64, &B64.encode(prf_secret_1), "cred_ipad_1")
        .unwrap();
    let _ = register_passkey(
        State(state.clone()),
        headers.clone(),
        Json(PasskeyRegisterRequest {
            credential_id: "cred_ipad_1".into(),
            label: "iPad Air Touch ID".into(),
            passkey_encrypted_dek: enc_dek_1.clone(),
            passkey_prf_salt_b64: Some(B64.encode([1u8; 32])),
            kdf_salt_b64: None,
            encrypted_dek: None,
            recovery_encrypted_dek: None,
            recovery_auth_key_b64: None,
        }),
    )
    .await
    .expect("register ipad passkey");

    // 3. Register second passkey (MacBook)
    let prf_secret_2 = [20u8; 32];
    let enc_dek_2 = wrap_dek_with_passkey_secret(&bundle.dek_b64, &B64.encode(prf_secret_2), "cred_macbook_2")
        .unwrap();
    let _ = register_passkey(
        State(state.clone()),
        headers.clone(),
        Json(PasskeyRegisterRequest {
            credential_id: "cred_macbook_2".into(),
            label: "MacBook Pro Touch ID".into(),
            passkey_encrypted_dek: enc_dek_2.clone(),
            passkey_prf_salt_b64: Some(B64.encode([2u8; 32])),
            kdf_salt_b64: None,
            encrypted_dek: None,
            recovery_encrypted_dek: None,
            recovery_auth_key_b64: None,
        }),
    )
    .await
    .expect("register macbook passkey");

    // 4. List passkeys
    let Json(list) = list_user_passkeys(State(state.clone()), headers.clone())
        .await
        .expect("list passkeys");
    assert_eq!(list.len(), 2);
    let cred_ids: Vec<&str> = list.iter().map(|p| p["credential_id"].as_str().unwrap()).collect();
    assert!(cred_ids.contains(&"cred_ipad_1"));
    assert!(cred_ids.contains(&"cred_macbook_2"));

    let ipad_entry = list.iter().find(|p| p["credential_id"] == "cred_ipad_1").unwrap();
    let ipad_id = Uuid::parse_str(ipad_entry["id"].as_str().unwrap()).unwrap();

    // 5. Rename passkey
    let Json(renamed) = rename_user_passkey(
        State(state.clone()),
        headers.clone(),
        Path(ipad_id),
        Json(RenamePasskeyRequest {
            label: "iPad Schultasche".into(),
        }),
    )
    .await
    .expect("rename passkey");
    assert_eq!(renamed["label"], "iPad Schultasche");

    // 6. Verify legacy passkey login attempt returns 410 GONE (Issue #8)
    let login_mb = legacy_passkey_login_disabled(
        State(state.clone()),
        Json(PasskeyLoginRequest {
            email: Some("teacher_multipass@schule.de".into()),
            credential_id: "cred_macbook_2".into(),
        }),
    )
    .await;
    assert!(login_mb.is_err());
    assert_eq!(login_mb.unwrap_err().0, StatusCode::GONE);

    // 7. Delete first passkey
    let Json(del_resp) = delete_user_passkey_by_id(
        State(state.clone()),
        headers.clone(),
        Path(ipad_id),
    )
    .await
    .expect("delete passkey by id");
    assert_eq!(del_resp["success"], true);

    // 8. Verify list has only 1 remaining passkey
    let Json(list_after) = list_user_passkeys(State(state.clone()), headers.clone())
        .await
        .expect("list passkeys after delete");
    assert_eq!(list_after.len(), 1);
    assert_eq!(list_after[0]["credential_id"], "cred_macbook_2");
}

#[tokio::test]
async fn test_webauthn_builder_and_origin_configuration() {
    let webauthn = create_webauthn();
    assert!(Arc::strong_count(&webauthn) >= 1);
    let user_id = Uuid::new_v4();
    let (creation_challenge, _) = webauthn.start_passkey_registration(user_id, "test@schule.de", "test@schule.de", None).unwrap();
    
    let resp = PasskeyRegisterStartResponse {
        session_id: "test_session".into(),
        public_key: creation_challenge,
    };
    let val = serde_json::to_value(&resp).unwrap();
    assert!(val.get("session_id").is_some());
    assert!(val.get("publicKey").is_some());

    // Test PasskeyLoginStartResponse serialization with PRF salt for new device onboarding
    let (login_challenge, _) = webauthn.start_passkey_authentication(&[]).unwrap();
    let login_resp = PasskeyLoginStartResponse {
        session_id: "test_login_session".into(),
        passkey_prf_salt_b64: Some("prf_salt_sample".into()),
        public_key: login_challenge,
    };
    let login_val = serde_json::to_value(&login_resp).unwrap();
    assert!(login_val.get("session_id").is_some());
    assert_eq!(login_val.get("passkey_prf_salt_b64").unwrap(), "prf_salt_sample");
    assert!(login_val.get("publicKey").is_some());

    let state = create_test_state();
    let err = passkey_login_start(
        State(state),
        Json(PasskeyLoginStartRequest {
            email: Some("nonexistent@schule.de".into()),
        }),
    )
    .await
    .unwrap_err();
    assert_eq!(err.0, StatusCode::BAD_REQUEST);
    assert!(err.1.contains("Kein passender Passkey"));
}

#[tokio::test]
async fn test_granular_class_envelopes_occ_and_deletion() {
    use gradus21_core::crypto::generate_vault_bundle;

    let state = create_test_state();
    let bundle = generate_vault_bundle("GranularSecure2026!").expect("vault bundle");
    let reg_resp = register_user(
        State(state.clone()),
        Json(RegisterRequest {
            email: "teacher_occ@schule.de".into(),
            auth_key_b64: bundle.auth_key_b64.clone(),
            kdf_salt_b64: bundle.kdf_salt_b64.clone(),
            kdf_params: bundle.kdf_params.clone(),
            encrypted_dek: bundle.encrypted_dek.clone(),
            recovery_encrypted_dek: bundle.recovery_encrypted_dek.clone(),
            recovery_auth_key_b64: Some(bundle.recovery_auth_key_b64.clone()),
            user_id: None,
        }),
    )
    .await
    .expect("register_user")
    .0;

    let mut headers = HeaderMap::new();
    headers.insert(
        "authorization",
        HeaderValue::from_str(&format!("Bearer {}", reg_resp.token)).unwrap(),
    );

    let class_a_id = Uuid::new_v4();
    let class_b_id = Uuid::new_v4();

    // 1. Initial batch sync: save class A and class B
    let Json(synced) = batch_sync_envelopes(
        State(state.clone()),
        headers.clone(),
        Json(BatchSyncRequest {
            envelopes: vec![
                BatchUpsertItem {
                    id: class_a_id,
                    entity_type: "class_dataset".into(),
                    parent_id: None,
                    class_id: Some(class_a_id),
                    encrypted_payload: "v1:nonce:class_a_payload_v1".into(),
                    expected_version: None,
                },
                BatchUpsertItem {
                    id: class_b_id,
                    entity_type: "class_dataset".into(),
                    parent_id: None,
                    class_id: Some(class_b_id),
                    encrypted_payload: "v1:nonce:class_b_payload_v1".into(),
                    expected_version: None,
                },
            ],
        }),
    )
    .await
    .expect("initial batch sync");

    assert_eq!(synced.len(), 2);
    let rec_a = synced.iter().find(|e| e.id == class_a_id).unwrap();
    assert_eq!(rec_a.version, 1);
    assert_eq!(rec_a.entity_type, "class_dataset");

    // 2. Tab 1 updates Class A with expected_version = 1 -> succeeds to version 2
    let Json(tab1_update) = batch_sync_envelopes(
        State(state.clone()),
        headers.clone(),
        Json(BatchSyncRequest {
            envelopes: vec![BatchUpsertItem {
                id: class_a_id,
                entity_type: "class_dataset".into(),
                parent_id: None,
                class_id: Some(class_a_id),
                encrypted_payload: "v1:nonce:class_a_payload_v2".into(),
                expected_version: Some(1),
            }],
        }),
    )
    .await
    .expect("tab 1 update");
    assert_eq!(tab1_update[0].version, 2);

    // 3. Tab 2 tries to update Class A with stale expected_version = 1 -> must return 409 Conflict with conflict_envelope!
    let tab2_conflict = batch_sync_envelopes(
        State(state.clone()),
        headers.clone(),
        Json(BatchSyncRequest {
            envelopes: vec![BatchUpsertItem {
                id: class_a_id,
                entity_type: "class_dataset".into(),
                parent_id: None,
                class_id: Some(class_a_id),
                encrypted_payload: "v1:nonce:class_a_tab2_stale".into(),
                expected_version: Some(1),
            }],
        }),
    )
    .await;

    assert!(tab2_conflict.is_err());
    let (status, err_body) = tab2_conflict.unwrap_err();
    assert_eq!(status, StatusCode::CONFLICT);
    let err_json: serde_json::Value = serde_json::from_str(&err_body).expect("valid json error response");
    assert_eq!(err_json["error"], "conflict");
    assert_eq!(err_json["server_version"], 2);
    assert_eq!(err_json["expected_version"], 1);
    assert_eq!(err_json["conflict_envelope"]["version"], 2);
    assert_eq!(
        err_json["conflict_envelope"]["encrypted_payload"],
        "v1:nonce:class_a_payload_v2"
    );

    // 4. Tab 2 resolves conflict by submitting with expected_version = 2 -> succeeds to version 3
    let Json(tab2_resolved) = batch_sync_envelopes(
        State(state.clone()),
        headers.clone(),
        Json(BatchSyncRequest {
            envelopes: vec![BatchUpsertItem {
                id: class_a_id,
                entity_type: "class_dataset".into(),
                parent_id: None,
                class_id: Some(class_a_id),
                encrypted_payload: "v1:nonce:class_a_merged_v3".into(),
                expected_version: Some(2),
            }],
        }),
    )
    .await
    .expect("tab 2 resolved update");
    assert_eq!(tab2_resolved[0].version, 3);

    // 5. Delete Class B
    let del_status = delete_envelope(State(state.clone()), headers.clone(), Path(class_b_id))
        .await
        .expect("delete class B");
    assert_eq!(del_status, StatusCode::NO_CONTENT);

    // 6. List envelopes via GET /api/envelopes and GET /api/envelopes/sync
    let Json(envelopes_list) = list_envelopes(State(state.clone()), headers.clone())
        .await
        .expect("list envelopes");
    assert_eq!(envelopes_list.len(), 1);
    assert_eq!(envelopes_list[0].id, class_a_id);
    assert_eq!(envelopes_list[0].version, 3);

    let _ = fs::remove_file(&state.disk_store_path);
}

#[tokio::test]
async fn test_delete_all_user_envelopes_removes_only_own_data() {
    use gradus21_core::crypto::generate_vault_bundle;

    let state = create_test_state();
    let bundle1 = generate_vault_bundle("PasswordTeacher1!").expect("vault bundle 1");
    let bundle2 = generate_vault_bundle("PasswordTeacher2!").expect("vault bundle 2");

    let reg1 = register_user(
        State(state.clone()),
        Json(RegisterRequest {
            email: "teacher_alpha@schule.de".into(),
            auth_key_b64: bundle1.auth_key_b64.clone(),
            kdf_salt_b64: bundle1.kdf_salt_b64.clone(),
            kdf_params: bundle1.kdf_params.clone(),
            encrypted_dek: bundle1.encrypted_dek.clone(),
            recovery_encrypted_dek: bundle1.recovery_encrypted_dek.clone(),
            recovery_auth_key_b64: Some(bundle1.recovery_auth_key_b64.clone()),
            user_id: None,
        }),
    )
    .await
    .expect("reg1")
    .0;

    let reg2 = register_user(
        State(state.clone()),
        Json(RegisterRequest {
            email: "teacher_beta@schule.de".into(),
            auth_key_b64: bundle2.auth_key_b64.clone(),
            kdf_salt_b64: bundle2.kdf_salt_b64.clone(),
            kdf_params: bundle2.kdf_params.clone(),
            encrypted_dek: bundle2.encrypted_dek.clone(),
            recovery_encrypted_dek: bundle2.recovery_encrypted_dek.clone(),
            recovery_auth_key_b64: Some(bundle2.recovery_auth_key_b64.clone()),
            user_id: None,
        }),
    )
    .await
    .expect("reg2")
    .0;

    let mut headers1 = HeaderMap::new();
    headers1.insert(
        "authorization",
        HeaderValue::from_str(&format!("Bearer {}", reg1.token)).unwrap(),
    );

    let mut headers2 = HeaderMap::new();
    headers2.insert(
        "authorization",
        HeaderValue::from_str(&format!("Bearer {}", reg2.token)).unwrap(),
    );

    let env1_id = Uuid::new_v4();
    let env2_id = Uuid::new_v4();

    // Teacher 1 saves an envelope
    let _ = batch_sync_envelopes(
        State(state.clone()),
        headers1.clone(),
        Json(BatchSyncRequest {
            envelopes: vec![BatchUpsertItem {
                id: env1_id,
                entity_type: "class_dataset".into(),
                parent_id: None,
                class_id: Some(env1_id),
                encrypted_payload: "t1_secret_envelope".into(),
                expected_version: None,
            }],
        }),
    )
    .await
    .expect("t1 batch sync");

    // Teacher 2 saves an envelope
    let _ = batch_sync_envelopes(
        State(state.clone()),
        headers2.clone(),
        Json(BatchSyncRequest {
            envelopes: vec![BatchUpsertItem {
                id: env2_id,
                entity_type: "class_dataset".into(),
                parent_id: None,
                class_id: Some(env2_id),
                encrypted_payload: "t2_secret_envelope".into(),
                expected_version: None,
            }],
        }),
    )
    .await
    .expect("t2 batch sync");

    // Both have 1 envelope
    let Json(t1_before) = list_envelopes(State(state.clone()), headers1.clone()).await.unwrap();
    assert_eq!(t1_before.len(), 1);
    let Json(t2_before) = list_envelopes(State(state.clone()), headers2.clone()).await.unwrap();
    assert_eq!(t2_before.len(), 1);

    // Teacher 2 (standard non-admin) deletes all their cloud envelopes (opting out of cloud sync)
    let Json(del_resp) = delete_all_user_envelopes(State(state.clone()), headers2.clone()).await.unwrap();
    assert!(del_resp.user_deleted);
    assert!(!del_resp.is_admin);

    // Teacher 2 now has 0 envelopes
    let t2_store = state.mem_envelopes.read().unwrap();
    assert_eq!(t2_store.values().filter(|e| e.owner_user_id == reg2.user_id).count(), 0);

    // Teacher 2 user account is completely deleted from memory! (GDPR Art. 17)
    let users_store = state.mem_users.read().unwrap();
    assert!(!users_store.contains_key(&reg2.user_id));

    // Teacher 1 still has their 1 envelope and user record intact!
    let Json(t1_after) = list_envelopes(State(state.clone()), headers1.clone()).await.unwrap();
    assert_eq!(t1_after.len(), 1);
    assert_eq!(t1_after[0].id, env1_id);
    assert!(users_store.contains_key(&reg1.user_id));

    let _ = fs::remove_file(&state.disk_store_path);
}

#[tokio::test]
async fn test_admin_cloud_purge_preserves_admin_account() {
    use gradus21_core::crypto::generate_vault_bundle;

    let state = create_test_state();
    let bundle = generate_vault_bundle("PasswordAdmin123!").expect("vault bundle admin");

    // The first user registered in test state is admin
    let reg = register_user(
        State(state.clone()),
        Json(RegisterRequest {
            email: "admin@example.com".into(),
            auth_key_b64: bundle.auth_key_b64.clone(),
            kdf_salt_b64: bundle.kdf_salt_b64.clone(),
            kdf_params: bundle.kdf_params.clone(),
            encrypted_dek: bundle.encrypted_dek.clone(),
            recovery_encrypted_dek: bundle.recovery_encrypted_dek.clone(),
            recovery_auth_key_b64: Some(bundle.recovery_auth_key_b64.clone()),
            user_id: None,
        }),
    )
    .await
    .expect("admin reg")
    .0;

    assert!(reg.is_admin);

    let mut headers = HeaderMap::new();
    headers.insert(
        "authorization",
        HeaderValue::from_str(&format!("Bearer {}", reg.token)).unwrap(),
    );

    let env_id = Uuid::new_v4();
    let _ = batch_sync_envelopes(
        State(state.clone()),
        headers.clone(),
        Json(BatchSyncRequest {
            envelopes: vec![BatchUpsertItem {
                id: env_id,
                entity_type: "class_dataset".into(),
                parent_id: None,
                class_id: Some(env_id),
                encrypted_payload: "admin_class_data".into(),
                expected_version: None,
            }],
        }),
    )
    .await
    .unwrap();

    // Admin purges cloud data
    let Json(del_resp) = delete_all_user_envelopes(State(state.clone()), headers.clone()).await.unwrap();
    assert!(!del_resp.user_deleted, "Admin account must NOT be deleted");
    assert!(del_resp.is_admin);

    // Envelopes are purged
    let Json(after_envs) = list_envelopes(State(state.clone()), headers.clone()).await.unwrap();
    assert_eq!(after_envs.len(), 0);

    // Admin account still exists in state
    let users = state.mem_users.read().unwrap();
    assert!(users.contains_key(&reg.user_id));

    let _ = fs::remove_file(&state.disk_store_path);
}

#[tokio::test]
async fn test_email_verification_flow_and_brute_force_limits() {
    let state = create_test_state();
    let test_email = "test_teacher_verify@schule.de".to_string();

    // 1. Request verification code
    let Json(start_resp) = verify_email_start(
        State(state.clone()),
        Json(VerifyEmailStartRequest {
            email: test_email.clone(),
        }),
    )
    .await
    .expect("start verify");

    assert_eq!(start_resp.status, "code_sent");
    let dev_code = start_resp.dev_code.expect("dev_code present in test env");
    assert_eq!(dev_code.len(), 6);

    // 2. Cooldown check: Immediate second request within 60s is rejected with 429
    let cooldown_err = verify_email_start(
        State(state.clone()),
        Json(VerifyEmailStartRequest {
            email: test_email.clone(),
        }),
    )
    .await;
    assert!(cooldown_err.is_err());
    assert_eq!(cooldown_err.unwrap_err().0, StatusCode::TOO_MANY_REQUESTS);

    // 3. Failed attempts counter test: Try wrong codes
    for _ in 1..=4 {
        let res = verify_email_confirm(
            State(state.clone()),
            Json(VerifyEmailConfirmRequest {
                email: test_email.clone(),
                code: "000000".into(),
            }),
        )
        .await;
        assert!(res.is_err());
        assert_eq!(res.unwrap_err().0, StatusCode::BAD_REQUEST);
    }

    // 4. Correct code verification succeeds
    let Json(confirm_resp) = verify_email_confirm(
        State(state.clone()),
        Json(VerifyEmailConfirmRequest {
            email: test_email.clone(),
            code: dev_code,
        }),
    )
    .await
    .expect("confirm code");

    assert!(confirm_resp.verified);

    let _ = fs::remove_file(&state.disk_store_path);
}

#[tokio::test]
async fn test_envelopes_summary_endpoint() {
    use gradus21_core::crypto::generate_vault_bundle;

    let state = create_test_state();
    let bundle = generate_vault_bundle("PasswordSummary!").expect("vault bundle");
    let reg = register_user(
        State(state.clone()),
        Json(RegisterRequest {
            email: "summary_user@schule.de".into(),
            auth_key_b64: bundle.auth_key_b64.clone(),
            kdf_salt_b64: bundle.kdf_salt_b64.clone(),
            kdf_params: bundle.kdf_params.clone(),
            encrypted_dek: bundle.encrypted_dek.clone(),
            recovery_encrypted_dek: bundle.recovery_encrypted_dek.clone(),
            recovery_auth_key_b64: Some(bundle.recovery_auth_key_b64.clone()),
            user_id: None,
        }),
    )
    .await
    .unwrap()
    .0;

    let mut headers = HeaderMap::new();
    headers.insert(
        "authorization",
        HeaderValue::from_str(&format!("Bearer {}", reg.token)).unwrap(),
    );

    let c1_id = Uuid::new_v4();
    let c2_id = Uuid::new_v4();
    let _ = batch_sync_envelopes(
        State(state.clone()),
        headers.clone(),
        Json(BatchSyncRequest {
            envelopes: vec![
                BatchUpsertItem {
                    id: c1_id,
                    entity_type: "class_dataset".into(),
                    parent_id: None,
                    class_id: Some(c1_id),
                    encrypted_payload: "payload_1".into(),
                    expected_version: None,
                },
                BatchUpsertItem {
                    id: c2_id,
                    entity_type: "class_dataset".into(),
                    parent_id: None,
                    class_id: Some(c2_id),
                    encrypted_payload: "payload_2".into(),
                    expected_version: None,
                },
            ],
        }),
    )
    .await
    .unwrap();

    let Json(summary) = get_envelopes_summary(State(state.clone()), headers.clone()).await.unwrap();
    assert_eq!(summary.envelope_count, 2);
    assert_eq!(summary.class_count, 2);
    assert!(summary.class_ids.contains(&c1_id));
    assert!(summary.class_ids.contains(&c2_id));
    assert!(summary.last_updated_at.is_some());

    let _ = fs::remove_file(&state.disk_store_path);
}
