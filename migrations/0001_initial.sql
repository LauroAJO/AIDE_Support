CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar TEXT,
  role TEXT DEFAULT 'assistant',
  google_access_token TEXT,
  google_refresh_token TEXT,
  google_token_expires_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  last_seen_at INTEGER
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_by TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  project_id TEXT REFERENCES projects(id),
  assigned_to TEXT REFERENCES users(id),
  created_by TEXT REFERENCES users(id),
  urgency INTEGER DEFAULT 3,
  importance INTEGER DEFAULT 3,
  energy INTEGER DEFAULT 3,
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

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
