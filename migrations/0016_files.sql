-- Files attached to notes/tasks + multi-role / AIDE-entity links for networking.

CREATE TABLE IF NOT EXISTS note_drive_links (
  id TEXT PRIMARY KEY,
  note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
  google_file_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT DEFAULT '',
  web_view_link TEXT DEFAULT '',
  icon_link TEXT DEFAULT '',
  is_upload INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS task_drive_links (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  google_file_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT DEFAULT '',
  web_view_link TEXT DEFAULT '',
  icon_link TEXT DEFAULT '',
  is_upload INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_note_drive_links_note ON note_drive_links(note_id);
CREATE INDEX IF NOT EXISTS idx_task_drive_links_task ON task_drive_links(task_id);

-- Networking v2: a person can hold multiple roles in multiple institutions
-- over time (current=1 marks the active one).
CREATE TABLE IF NOT EXISTS person_roles (
  id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES network_people(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  institution_id TEXT REFERENCES network_institutions(id) ON DELETE SET NULL,
  institution_name TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  current INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_person_roles_person ON person_roles(person_id);
CREATE INDEX IF NOT EXISTS idx_person_roles_institution ON person_roles(institution_id);

-- Cross-links between a person/institution and AIDE entities (area/project/
-- front/task). entity_type is one of: 'area' | 'project' | 'front' | 'task'.
CREATE TABLE IF NOT EXISTS network_entity_links (
  id TEXT PRIMARY KEY,
  network_person_id TEXT REFERENCES network_people(id) ON DELETE CASCADE,
  network_institution_id TEXT REFERENCES network_institutions(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_network_entity_links_person ON network_entity_links(network_person_id);
CREATE INDEX IF NOT EXISTS idx_network_entity_links_institution ON network_entity_links(network_institution_id);
CREATE INDEX IF NOT EXISTS idx_network_entity_links_entity ON network_entity_links(entity_type, entity_id);
