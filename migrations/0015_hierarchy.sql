-- Hierarchy (Áreas > Projetos > Frentes) + Networking (people, connections,
-- institutions). NOTE: ALTER ... ADD COLUMN is not idempotent in SQLite.

CREATE TABLE IF NOT EXISTS areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  description TEXT DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS fronts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#6366f1',
  created_by TEXT REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

ALTER TABLE projects ADD COLUMN area_id TEXT REFERENCES areas(id);
ALTER TABLE projects ADD COLUMN description TEXT DEFAULT '';
ALTER TABLE tasks ADD COLUMN front_id TEXT REFERENCES fronts(id);

CREATE INDEX IF NOT EXISTS idx_fronts_project ON fronts(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_area ON projects(area_id);
CREATE INDEX IF NOT EXISTS idx_tasks_front ON tasks(front_id);

-- Networking ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS network_people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'person',
  institution TEXT DEFAULT '',
  role TEXT DEFAULT '',
  area_of_work TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  linkedin TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  connection_to_lauro TEXT DEFAULT '',
  connection_strength INTEGER DEFAULT 3,
  tags TEXT DEFAULT '[]',
  lifegame_person_id TEXT DEFAULT '',
  dex_contact_id TEXT DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS network_connections (
  id TEXT PRIMARY KEY,
  person_a_id TEXT REFERENCES network_people(id) ON DELETE CASCADE,
  person_b_id TEXT REFERENCES network_people(id) ON DELETE CASCADE,
  connection_type TEXT DEFAULT '',
  description TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS network_institutions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'company',
  area TEXT DEFAULT '',
  website TEXT DEFAULT '',
  linkedin TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  created_by TEXT REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_network_people_lifegame ON network_people(lifegame_person_id);
CREATE INDEX IF NOT EXISTS idx_network_connections_a ON network_connections(person_a_id);
CREATE INDEX IF NOT EXISTS idx_network_connections_b ON network_connections(person_b_id);
