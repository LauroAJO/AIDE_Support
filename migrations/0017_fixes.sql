-- v1.8 fixes: bidirectional Drive/Calendar sharing.
-- Replaces the one-way owner→assistant model in 0012 with a symmetric model
-- where either user can grant the other access to their own resources.

CREATE TABLE IF NOT EXISTS drive_sharing_rules (
  id TEXT PRIMARY KEY,
  grantor_user_id TEXT REFERENCES users(id),
  grantee_user_id TEXT REFERENCES users(id),
  google_file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(grantor_user_id, grantee_user_id, google_file_id)
);

CREATE TABLE IF NOT EXISTS calendar_sharing_rules (
  id TEXT PRIMARY KEY,
  grantor_user_id TEXT REFERENCES users(id),
  grantee_user_id TEXT REFERENCES users(id),
  google_calendar_id TEXT NOT NULL,
  calendar_name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(grantor_user_id, grantee_user_id, google_calendar_id)
);

CREATE INDEX IF NOT EXISTS idx_drive_sharing_grantor ON drive_sharing_rules(grantor_user_id);
CREATE INDEX IF NOT EXISTS idx_drive_sharing_grantee ON drive_sharing_rules(grantee_user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sharing_grantor ON calendar_sharing_rules(grantor_user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sharing_grantee ON calendar_sharing_rules(grantee_user_id);
