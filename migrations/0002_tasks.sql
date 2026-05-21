-- Phase 1 — Task management.
-- Note: the tasks/projects tables were already created by 0001_initial.sql.
-- These IF NOT EXISTS statements are idempotent: on an existing database they
-- are a no-op (the app always sets urgency/importance/energy explicitly, so the
-- default of 5 below only applies to brand-new databases).

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  project_id TEXT,
  assigned_to TEXT REFERENCES users(id),
  created_by TEXT REFERENCES users(id),
  urgency INTEGER DEFAULT 5,
  importance INTEGER DEFAULT 5,
  energy INTEGER DEFAULT 5,
  status TEXT DEFAULT 'backlog',
  due_date TEXT,
  delivery_date TEXT,
  tags TEXT DEFAULT '[]',
  comments TEXT DEFAULT '[]',
  subtasks TEXT DEFAULT '[]',
  time_entries TEXT DEFAULT '[]',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_by TEXT REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
