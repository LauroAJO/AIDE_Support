-- Alerts v2 — scoped/scheduled rules and scheduled notifications.

ALTER TABLE alert_rules ADD COLUMN task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE alert_rules ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE alert_rules ADD COLUMN run_hour INTEGER DEFAULT 8;
ALTER TABLE alert_rules ADD COLUMN last_run_at INTEGER;
ALTER TABLE alert_rules ADD COLUMN last_result TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id TEXT PRIMARY KEY,
  from_user_id TEXT REFERENCES users(id),
  to_user_id TEXT REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  send_at INTEGER NOT NULL,
  sent INTEGER DEFAULT 0,
  sent_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_scheduled_send_at ON scheduled_notifications(send_at, sent);
