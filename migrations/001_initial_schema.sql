-- =============================================================================
-- BTE NotenFlow – PostgreSQL Schema (Hybrid Encrypted Envelopes)
-- Zero-Knowledge E2EE Architecture: All sensitive domain fields are stored inside
-- AES-256-GCM authenticated envelopes (`encrypted_payload`) bound via AAD.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users, Authentication & Envelope Encryption Keys
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    auth_key_hash TEXT NOT NULL,              -- Argon2id hash of client-derived AuthKey
    kdf_salt TEXT NOT NULL,                   -- Base64 salt for client-side Argon2id + HKDF
    kdf_params JSONB NOT NULL DEFAULT '{"memory_kib": 65536, "iterations": 3, "parallelism": 4}',
    encrypted_dek TEXT NOT NULL,              -- Master DEK encrypted with user's KEK (AES-256-GCM)
    recovery_encrypted_dek TEXT NOT NULL,     -- Master DEK encrypted with Emergency Recovery Key
    totp_secret_server_encrypted TEXT,        -- Server-side encrypted TOTP secret (RFC 6238)
    totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ui_preferences JSONB NOT NULL DEFAULT '{"theme": "teal", "mode": "light"}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Schools
CREATE TABLE IF NOT EXISTS schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_payload TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- 3. School Years & Terms (Halbjahre / Quartale)
CREATE TABLE IF NOT EXISTS school_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    encrypted_payload TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- 4. Classes / Courses
CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    school_year_id UUID NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
    encrypted_payload TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- 5. Grading & Subject Templates (Global system presets or user-encrypted templates)
CREATE TABLE IF NOT EXISTS grading_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    is_encrypted BOOLEAN NOT NULL DEFAULT TRUE,
    payload TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Subjects of a Class
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    encrypted_payload TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- 7. Grade Categories per Subject (e.g. LNW, Mündlich, Tests)
CREATE TABLE IF NOT EXISTS grade_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    encrypted_payload TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- 8. Assessments / Exams (Columns in the grading matrix, e.g. "Test 1", "LNW 1")
CREATE TABLE IF NOT EXISTS assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES grade_categories(id) ON DELETE CASCADE,
    encrypted_payload TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- 9. Students of a Class
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    encrypted_payload TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- 10. Individual Grades (Student <-> Assessment)
CREATE TABLE IF NOT EXISTS grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    encrypted_payload TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (assessment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_schools_owner ON schools (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_school_years_owner ON school_years (owner_user_id, school_id);
CREATE INDEX IF NOT EXISTS idx_classes_owner ON classes (owner_user_id, school_year_id);
CREATE INDEX IF NOT EXISTS idx_subjects_class_owner ON subjects (owner_user_id, class_id);
CREATE INDEX IF NOT EXISTS idx_categories_subject_owner ON grade_categories (owner_user_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_assessments_subject_owner ON assessments (owner_user_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_students_class_owner ON students (owner_user_id, class_id);
CREATE INDEX IF NOT EXISTS idx_grades_class_owner ON grades (owner_user_id, class_id);
