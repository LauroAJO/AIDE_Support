-- Waiting room para contatos importados do DEX CRM (getdex.com) — mesma
-- ideia da curadoria da bridge do Lifegame: contatos ficam em staging para
-- revisao antes de virar registro em network_people (v2.25.8).
CREATE TABLE IF NOT EXISTS dex_contact_staging (
  id TEXT PRIMARY KEY,
  dex_contact_id TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  job_title TEXT DEFAULT '',
  company TEXT DEFAULT '',
  description TEXT DEFAULT '',
  linkedin TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  raw_payload TEXT DEFAULT '{}',
  staged_at INTEGER DEFAULT (unixepoch()),
  reviewed INTEGER DEFAULT 0,
  approved INTEGER DEFAULT 0,
  rejected INTEGER DEFAULT 0,
  imported_person_id TEXT REFERENCES network_people(id)
    ON DELETE SET NULL,
  imported_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_dex_staging_reviewed
  ON dex_contact_staging(reviewed);
CREATE INDEX IF NOT EXISTS idx_dex_staging_dex_id
  ON dex_contact_staging(dex_contact_id);
