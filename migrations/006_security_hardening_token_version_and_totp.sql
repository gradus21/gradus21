-- =============================================================================
-- Migration 006: Security Hardening (JWT Token Version, Persistent TOTP Replay
-- Protection & Schema Alignment)
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS passkey_prf_salt TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_used_totp_step BIGINT;
ALTER TABLE grading_templates ALTER COLUMN owner_user_id DROP NOT NULL;
