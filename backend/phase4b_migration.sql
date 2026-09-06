-- Phase 4B Security & RBAC Schema Migration

-- 1. Users table for Role-Based Access Control
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'CASHIER',
    full_name VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- 2. Persistent Login Rate Limiting Table
CREATE TABLE IF NOT EXISTS login_attempts (
    ip_address VARCHAR(64) PRIMARY KEY,
    failed_count INTEGER NOT NULL DEFAULT 1,
    first_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_locked_until ON login_attempts(locked_until);

-- 3. Session role and user tracking
ALTER TABLE active_sessions ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
ALTER TABLE active_sessions ADD COLUMN IF NOT EXISTS role VARCHAR(32);

-- 4. Invalidate pre-RBAC legacy sessions so all users must re-authenticate freshly
-- Legacy sessions without user_id or role must never receive administrative privileges
UPDATE active_sessions 
SET revoked_at = NOW() 
WHERE (user_id IS NULL OR role IS NULL) AND revoked_at IS NULL;
