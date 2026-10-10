-- Email verification state and private resume metadata. Safe to apply repeatedly.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS verification_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_attempts SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS password_reset_hash TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_reset_attempts SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS resume_storage_name TEXT,
  ADD COLUMN IF NOT EXISTS resume_original_name TEXT,
  ADD COLUMN IF NOT EXISTS resume_mime_type TEXT;

CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users (email_verified);
