-- 0022_multiuser.sql
-- Multi-user schema: expanded roles, permission presets, invitations,
-- chat, archived profiles. No app code wired up yet — only schema + seed.
--
-- New role values:
--   'owner' | 'assistant_fixed' | 'assistant_external' | 'pending'
-- Existing 'assistant' rows are migrated to 'assistant_fixed' below.

-- ---------------------------------------------------------------------------
-- 1) users — add multi-user columns
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN user_type    TEXT DEFAULT 'fixed';
ALTER TABLE users ADD COLUMN status       TEXT DEFAULT 'active';
ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN archived_at  INTEGER;
ALTER TABLE users ADD COLUMN invited_by   TEXT;
ALTER TABLE users ADD COLUMN approved_at  INTEGER;

-- ---------------------------------------------------------------------------
-- 2) permission_presets — system + custom permission bundles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permission_presets (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_system   INTEGER DEFAULT 1,
  permissions TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER DEFAULT (unixepoch())
);

-- ---------------------------------------------------------------------------
-- 3) user_permissions — per-user preset + overrides
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  preset_id  TEXT REFERENCES permission_presets(id),
  overrides  TEXT DEFAULT '{}',
  updated_at INTEGER DEFAULT (unixepoch()),
  updated_by TEXT REFERENCES users(id)
);

-- ---------------------------------------------------------------------------
-- 4) invitations — invite tokens for new users
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 5) chat_messages — general channel
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 6) user_profiles_archive — preserves identity after archival/soft-delete
-- ---------------------------------------------------------------------------
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
-- 7) Seed default system presets
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
-- 8) Migrate existing 'assistant' rows → 'assistant_fixed'
--    Note: handleCallback (_worker.js) still computes role='assistant' on
--    every login via roleForEmail(). The OAuth flow must be updated in a
--    follow-up step (Step 4+) or these rows will revert on next sign-in.
-- ---------------------------------------------------------------------------
UPDATE users
   SET role      = 'assistant_fixed',
       user_type = 'fixed',
       status    = 'active'
 WHERE role = 'assistant';

-- ---------------------------------------------------------------------------
-- 9) Default-bind all current assistant_fixed users to the fixed preset
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO user_permissions (user_id, preset_id)
SELECT id, 'preset_fixed'
  FROM users
 WHERE role = 'assistant_fixed';
