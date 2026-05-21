-- Idempotent repair migration. Safe to run any number of times.
-- Re-creates any tables a partially-applied migration left missing, WITHOUT
-- any ALTER statements (those already applied and would error on re-run).

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY, title TEXT DEFAULT '', body TEXT NOT NULL DEFAULT '',
  tags TEXT DEFAULT '[]', project_id TEXT, created_by TEXT, updated_by TEXT,
  pinned INTEGER DEFAULT 0, created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, from_user_id TEXT, to_user_id TEXT, type TEXT NOT NULL,
  title TEXT NOT NULL, body TEXT DEFAULT '', task_id TEXT, note_id TEXT,
  read INTEGER DEFAULT 0, created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY, user_id TEXT, endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS month_plans (
  id TEXT PRIMARY KEY, user_id TEXT, month_start TEXT NOT NULL, day_plans TEXT DEFAULT '{}',
  strategic_goal TEXT DEFAULT '', key_results TEXT DEFAULT '[]', notes TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, month_start)
);

CREATE TABLE IF NOT EXISTS bridge_sync_log (
  id TEXT PRIMARY KEY, direction TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT,
  status TEXT DEFAULT 'pending', payload TEXT, error TEXT, synced_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS bridge_config (
  id TEXT PRIMARY KEY DEFAULT 'singleton', lifegame_url TEXT DEFAULT '', bridge_secret TEXT DEFAULT '',
  sync_enabled INTEGER DEFAULT 0, last_sync_at INTEGER, updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id TEXT PRIMARY KEY, created_by TEXT, name TEXT NOT NULL, description TEXT DEFAULT '',
  trigger_type TEXT NOT NULL, trigger_config TEXT DEFAULT '{}', target_user TEXT DEFAULT 'both',
  channel TEXT DEFAULT 'both', active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS user_profile_data (
  user_id TEXT PRIMARY KEY, phone TEXT DEFAULT '', pix_key TEXT DEFAULT '', pix_key_type TEXT DEFAULT '',
  bank_name TEXT DEFAULT '', extra_info TEXT DEFAULT '{}', updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS monthly_reports (
  id TEXT PRIMARY KEY, month TEXT NOT NULL, generated_at INTEGER DEFAULT (unixepoch()), generated_by TEXT,
  total_hours REAL DEFAULT 0, total_due REAL DEFAULT 0, total_paid REAL DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0, report_data TEXT DEFAULT '{}'
);
