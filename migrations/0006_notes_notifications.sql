-- Phase A+B+Planning — notes, notifications, push subscriptions, month plans.

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  tags TEXT DEFAULT '[]',
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  pinned INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  from_user_id TEXT REFERENCES users(id),
  to_user_id TEXT REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
  read INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS month_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  month_start TEXT NOT NULL,
  strategic_goal TEXT DEFAULT '',
  key_results TEXT DEFAULT '[]',
  notes TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, month_start)
);

CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned, updated_at);
CREATE INDEX IF NOT EXISTS idx_notif_to ON notifications(to_user_id, read, created_at);
