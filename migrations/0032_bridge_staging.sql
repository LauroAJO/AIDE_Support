-- 0032_bridge_staging.sql — curadoria de tarefas do Lifegame (v2.4.4).
-- Tarefas importadas pela bridge deixam de entrar direto em `tasks`: passam por
-- esta área de staging até o owner aprovar/rejeitar em "Revisar Bridge".

CREATE TABLE IF NOT EXISTS bridge_task_staging (
  id TEXT PRIMARY KEY,
  lifegame_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  urgency INTEGER DEFAULT 5,
  importance INTEGER DEFAULT 5,
  status TEXT DEFAULT 'backlog',
  tags TEXT DEFAULT '[]',
  source TEXT DEFAULT 'lifegame',
  raw_payload TEXT DEFAULT '{}',
  staged_at INTEGER DEFAULT (unixepoch()),
  staged_by TEXT DEFAULT 'bridge',
  reviewed INTEGER DEFAULT 0,
  approved INTEGER DEFAULT 0,
  imported_at INTEGER,
  imported_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staging_reviewed ON bridge_task_staging(reviewed, approved);
CREATE INDEX IF NOT EXISTS idx_staging_lifegame_id ON bridge_task_staging(lifegame_id);
