-- Phase 2 — alerts, payment rates, personal data, monthly reports.

CREATE TABLE IF NOT EXISTS alert_rules (
  id TEXT PRIMARY KEY,
  created_by TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  trigger_type TEXT NOT NULL,
  trigger_config TEXT DEFAULT '{}',
  target_user TEXT DEFAULT 'both',
  channel TEXT DEFAULT 'both',
  active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

ALTER TABLE projects ADD COLUMN rate_type TEXT DEFAULT 'hourly';
ALTER TABLE projects ADD COLUMN rate_value REAL DEFAULT 0;

ALTER TABLE tasks ADD COLUMN rate_type TEXT DEFAULT 'inherit';
ALTER TABLE tasks ADD COLUMN rate_value REAL DEFAULT 0;

CREATE TABLE IF NOT EXISTS user_profile_data (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  phone TEXT DEFAULT '',
  pix_key TEXT DEFAULT '',
  pix_key_type TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  extra_info TEXT DEFAULT '{}',
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS monthly_reports (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  generated_at INTEGER DEFAULT (unixepoch()),
  generated_by TEXT REFERENCES users(id),
  total_hours REAL DEFAULT 0,
  total_due REAL DEFAULT 0,
  total_paid REAL DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  report_data TEXT DEFAULT '{}'
);
