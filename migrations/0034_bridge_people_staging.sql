-- 0034_bridge_people_staging.sql — curadoria de pessoas do Lifegame (v2.4.6).
-- Contatos novos importados pela bridge deixam de entrar direto em
-- network_people: passam por staging até o owner aprovar em "Revisar Bridge".

CREATE TABLE IF NOT EXISTS bridge_person_staging (
  id TEXT PRIMARY KEY,
  lifegame_person_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT '',
  area_ids TEXT DEFAULT '[]',
  connection_strength INTEGER DEFAULT 5,
  last_contact_at TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  source TEXT DEFAULT 'lifegame',
  raw_payload TEXT DEFAULT '{}',
  staged_at INTEGER DEFAULT (unixepoch()),
  reviewed INTEGER DEFAULT 0,
  approved INTEGER DEFAULT 0,
  imported_at INTEGER,
  imported_person_id TEXT REFERENCES network_people(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_person_staging_reviewed ON bridge_person_staging(reviewed, approved);
CREATE INDEX IF NOT EXISTS idx_person_staging_lgid ON bridge_person_staging(lifegame_person_id);
