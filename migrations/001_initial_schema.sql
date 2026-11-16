-- =============================================================================
-- Gradus21 – PostgreSQL Initial Schema (Zero-Knowledge E2EE Envelope Store)
-- Zero-Knowledge E2EE Architecture: All sensitive domain fields are stored inside
-- AES-256-GCM authenticated envelopes (`encrypted_payload`) bound via AAD.
--
-- Hinweis: Die Migrationsdateien `migrations/001..006.sql` initialisieren eine
-- neue PostgreSQL-Datenbank via `/docker-entrypoint-initdb.d`. Für bestehende
-- Datenbanken und Standalone-Deployments führt `crates/gradus21-server/src/state.rs`
-- (`ensure_pg_schema_and_load`) dieselben DDL-Anweisungen beim Start idempotent aus.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users, Authentication & Envelope Encryption Keys
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    auth_key_hash TEXT NOT NULL,              -- Argon2id hash of client-derived AuthKey
    kdf_salt TEXT NOT NULL,                   -- Base64 salt for client-side Argon2id + HKDF
    kdf_params JSONB NOT NULL DEFAULT '{"memory_kib": 19456, "iterations": 2, "parallelism": 1}',
    encrypted_dek TEXT NOT NULL,              -- Master DEK encrypted with user's KEK (AES-256-GCM)
    recovery_encrypted_dek TEXT NOT NULL,     -- Master DEK encrypted with Emergency Recovery Key
    recovery_auth_key_hash TEXT NOT NULL DEFAULT '', -- Argon2id hash of client-derived RecoveryAuthKey
    totp_secret_server_encrypted TEXT,        -- Server-side encrypted TOTP secret (RFC 6238)
    totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    passkey_credential_id TEXT,
    passkey_label TEXT,
    passkey_encrypted_dek TEXT,
    passkey_prf_salt TEXT,
    ui_preferences JSONB NOT NULL DEFAULT '{"theme": "teal", "mode": "light"}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Grading & Subject Templates (Global system presets or user-encrypted templates)
CREATE TABLE IF NOT EXISTS grading_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    is_encrypted BOOLEAN NOT NULL DEFAULT TRUE,
    payload TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Generic Encrypted Envelopes (Workspace, Classes & User Settings Envelopes)
CREATE TABLE IF NOT EXISTS encrypted_envelopes (
    id UUID NOT NULL,
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    parent_id UUID,
    class_id UUID,
    encrypted_payload TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_encrypted_envelopes_owner ON encrypted_envelopes (owner_user_id);

