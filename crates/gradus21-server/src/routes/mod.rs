pub mod auth;
pub mod envelopes;
pub mod passkey;

pub use auth::*;
pub use envelopes::*;
pub use passkey::*;

use axum::{
    extract::DefaultBodyLimit,
    routing::{delete, get, post, put},
    Router,
};
use tower_http::cors::CorsLayer;

use crate::admin;
use crate::state::AppState;

pub fn create_app_router(state: AppState, cors: CorsLayer) -> Router {
    Router::new()
        .route("/.well-known/webauthn", get(well_known_webauthn))
        .route("/.well-known/apple-app-site-association", get(well_known_apple_app_site_association))
        .route("/api/health", get(health_check))
        .route("/api/legal/info", get(get_legal_info))
        .route("/api/auth/salt", post(get_user_salt))
        .route("/api/auth/register", post(register_user))
        .route("/api/auth/login", post(login_user))
        .route("/api/auth/recover", post(recover_password))
        .route("/api/auth/recovery/rotate", post(rotate_recovery_key))
        .route("/api/auth/passkey/register/start", post(passkey_register_start))
        .route("/api/auth/passkey/register/finish", post(passkey_register_finish))
        .route("/api/auth/passkey/login/start", post(passkey_login_start))
        .route("/api/auth/passkey/login/finish", post(passkey_login_finish))
        .route("/api/auth/passkey/list", get(list_user_passkeys))
        .route(
            "/api/auth/passkey/:id",
            delete(delete_user_passkey_by_id).patch(rename_user_passkey),
        )
        .route("/api/auth/passkey/register", post(register_passkey))
        .route("/api/auth/passkey/login", post(legacy_passkey_login_disabled))
        .route("/api/auth/passkey", delete(delete_passkey))
        .route("/api/auth/verify-email/start", post(verify_email_start))
        .route("/api/auth/verify-email/confirm", post(verify_email_confirm))
        .route("/api/auth/2fa/setup", get(get_2fa_setup_info))
        .route("/api/auth/2fa/verify", post(verify_and_enable_2fa))
        .route("/api/auth/2fa/reconfigure", post(reconfigure_2fa))
        .route("/api/auth/2fa/disable", post(disable_2fa))
        .route(
            "/api/envelopes",
            get(list_envelopes)
                .post(upsert_envelope)
                .delete(delete_all_user_envelopes),
        )
        .route("/api/envelopes/summary", get(get_envelopes_summary))
        .route("/api/envelopes/sync", get(list_envelopes))
        .route("/api/envelopes/batch", post(batch_sync_envelopes))
        .route("/api/envelopes/:id", delete(delete_envelope))
        .route("/api/preferences", put(update_preferences))
        // Admin & Global Template routes:
        .route("/api/templates", get(admin::list_global_templates))
        .route("/api/admin/users", get(admin::list_users))
        .route("/api/admin/users/invite", post(admin::invite_user))
        .route(
            "/api/admin/users/:id",
            delete(admin::delete_user).patch(admin::update_user_status),
        )
        .route(
            "/api/admin/users/:id/status",
            post(admin::update_user_status).patch(admin::update_user_status),
        )
        .route("/api/admin/backups", get(admin::list_backups))
        .route("/api/admin/backups/create", post(admin::create_backup_snapshot))
        .route("/api/admin/backups/snapshot", post(admin::create_backup_snapshot))
        .route(
            "/api/admin/backups/download/:filename",
            get(admin::download_backup),
        )
        .route("/api/admin/backups/restore", post(admin::restore_backup))
        .route(
            "/api/admin/backups/config",
            get(admin::get_backup_config)
                .put(admin::update_backup_config)
                .post(admin::update_backup_config),
        )
        .route(
            "/api/admin/backups/schedule",
            get(admin::get_backup_config)
                .put(admin::update_backup_config)
                .post(admin::update_backup_config),
        )
        .route(
            "/api/admin/templates",
            get(admin::list_global_templates).post(admin::create_global_template),
        )
        .route(
            "/api/admin/templates/:id",
            put(admin::update_global_template).delete(admin::delete_global_template),
        )
        .route(
            "/api/admin/smtp",
            get(admin::get_smtp_config)
                .put(admin::update_smtp_config)
                .post(admin::update_smtp_config),
        )
        .route("/api/admin/smtp/test", post(admin::test_smtp))
        .route(
            "/api/admin/mail-templates",
            get(admin::list_mail_templates)
                .post(admin::save_all_mail_templates)
                .put(admin::save_all_mail_templates),
        )
        .route(
            "/api/admin/mail-templates/:id",
            put(admin::update_mail_template),
        )
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024))
        .layer(cors)
        .with_state(state)
}
