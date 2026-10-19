-- =============================================================================
-- Migration 003: Multi-Passkey Support (1:n user_passkeys) & WebAuthn Credentials
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_passkeys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    passkey_label TEXT NOT NULL,
    passkey_encrypted_dek TEXT NOT NULL,
    passkey_prf_salt TEXT,
    passkey_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON user_passkeys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_credential_id ON user_passkeys(credential_id);

-- Migrate existing single passkeys from users table if not already present
INSERT INTO user_passkeys (id, user_id, credential_id, passkey_label, passkey_encrypted_dek, passkey_prf_salt, created_at, last_used_at)
SELECT gen_random_uuid(), id, passkey_credential_id, COALESCE(NULLIF(passkey_label, ''), 'Passkey (Standard)'), passkey_encrypted_dek, NULL, NOW(), last_login_at
FROM users
WHERE passkey_credential_id IS NOT NULL AND passkey_credential_id != ''
ON CONFLICT (credential_id) DO NOTHING;
