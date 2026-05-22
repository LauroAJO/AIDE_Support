-- Owner-managed access control for Alice (Drive folders/files + calendars).

CREATE TABLE IF NOT EXISTS drive_access_rules (
  id TEXT PRIMARY KEY,
  created_by TEXT REFERENCES users(id),
  google_file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT DEFAULT '',
  access_type TEXT DEFAULT 'allow',
  applies_to TEXT DEFAULT 'alice',
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS calendar_access_rules (
  id TEXT PRIMARY KEY,
  created_by TEXT REFERENCES users(id),
  google_calendar_id TEXT NOT NULL,
  calendar_name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  access_type TEXT DEFAULT 'allow',
  applies_to TEXT DEFAULT 'alice',
  created_at INTEGER DEFAULT (unixepoch())
);
