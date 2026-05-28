-- 0023_multiuser_repair.sql
-- Recovery migration: 0022 may have crashed mid-way on remote (the bare
-- `ALTER TABLE ADD COLUMN` statements run first and are not idempotent, so
-- a second invocation aborts at the first one even when later steps had
-- already landed). This file contains ONLY the idempotent parts of 0022:
-- CREATE TABLE IF NOT EXISTS, INSERT OR IGNORE, and a WHERE-filtered UPDATE.
-- Safe to run multiple times on any environment regardless of which subset
-- of 0022 has already been applied.

-- ---------------------------------------------------------------------------
-- 1) Tables (all conditional, all idempotent)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS permission_presets (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_system   INTEGER DEFAULT 1,
  permissions TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  preset_id  TEXT REFERENCES permission_presets(id),
  overrides  TEXT DEFAULT '{}',
  updated_at INTEGER DEFAULT (unixepoch()),
  updated_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  user_type   TEXT NOT NULL,
  invited_by  TEXT REFERENCES users(id),
  token       TEXT UNIQUE NOT NULL,
  status      TEXT DEFAULT 'pending',
  created_at  INTEGER DEFAULT (unixepoch()),
  expires_at  INTEGER NOT NULL,
  accepted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_invitations_token  ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email  ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id),
  content    TEXT NOT NULL,
  mentions   TEXT DEFAULT '[]',
  created_at INTEGER DEFAULT (unixepoch()),
  edited_at  INTEGER,
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user    ON chat_messages(user_id);

CREATE TABLE IF NOT EXISTS user_profiles_archive (
  user_id                TEXT PRIMARY KEY,
  email                  TEXT NOT NULL,
  name                   TEXT NOT NULL,
  avatar                 TEXT DEFAULT '',
  user_type              TEXT NOT NULL,
  total_tasks_completed  INTEGER DEFAULT 0,
  total_hours_worked     REAL DEFAULT 0,
  total_paid             REAL DEFAULT 0,
  first_seen_at          INTEGER,
  last_seen_at           INTEGER,
  archived_at            INTEGER,
  archived_by            TEXT
);

-- ---------------------------------------------------------------------------
-- 2) Seed system presets (no-op if already present)
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO permission_presets (id, name, description, is_system, permissions) VALUES
(
  'preset_fixed',
  'Assistente Fixo',
  'Acesso amplo — colaborador regular',
  1,
  '{"tasks":"full","planning":"full","timer":"full","calendar":"view","drive":"view","notes":"full","payment":"own","meeting":"full","areas":"view","networking":"view","alerts":"none","settings":"none","chat":"full","dashboard":"none"}'
),
(
  'preset_external',
  'Assistente Externo',
  'Acesso restrito — contratado pontual',
  1,
  '{"tasks":"assigned_only","planning":"none","timer":"full","calendar":"none","drive":"none","notes":"own_and_tagged","payment":"own","meeting":"full","areas":"none","networking":"none","alerts":"none","settings":"none","chat":"full","dashboard":"none"}'
);

-- ---------------------------------------------------------------------------
-- 3) Rename legacy role + bind default preset
--    The WHERE clause makes this a no-op after first successful run.
-- ---------------------------------------------------------------------------

UPDATE users
   SET role      = 'assistant_fixed',
       user_type = 'fixed',
       status    = 'active'
 WHERE role = 'assistant';

INSERT OR IGNORE INTO user_permissions (user_id, preset_id)
SELECT id, 'preset_fixed'
  FROM users
 WHERE role = 'assistant_fixed';
