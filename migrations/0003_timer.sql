-- Phase 2 — Timer & weekly planning.

CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_seconds INTEGER,
  hourly_rate REAL DEFAULT 0,
  paid INTEGER DEFAULT 0,
  paid_at INTEGER,
  notes TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS week_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  week_start TEXT NOT NULL,
  day_plans TEXT DEFAULT '{}',
  weekly_goal TEXT DEFAULT '',
  weekly_review TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, week_start)
);

CREATE TABLE IF NOT EXISTS availability (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) UNIQUE,
  work_days TEXT DEFAULT '[1,2,3,4,5]',
  work_start TEXT DEFAULT '09:00',
  work_end TEXT DEFAULT '18:00',
  lunch_start TEXT DEFAULT '12:00',
  lunch_end TEXT DEFAULT '13:00',
  hourly_rate REAL DEFAULT 0,
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_active ON time_entries(user_id, ended_at);
