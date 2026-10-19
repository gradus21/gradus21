-- =============================================================================
-- Migration 002: Admin Control Plane, System Settings & Last Login
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure owner_user_id in grading_templates is nullable for global system presets
ALTER TABLE grading_templates ALTER COLUMN owner_user_id DROP NOT NULL;
