-- Migration 0037 — Eventos & Venues de Publicação (v2.5.0)
-- Banco dedicado para conferências acadêmicas, eventos de networking e venues
-- de publicação (journals / proceedings). Todas as tabelas usam IF NOT EXISTS
-- para reexecução segura.

-- Events table (conferences, workshops, networking events)
CREATE TABLE IF NOT EXISTS career_events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  acronym TEXT DEFAULT '',
  type TEXT DEFAULT 'conference_academic',
  -- conference_academic | conference_commercial |
  -- conference_hybrid | workshop | networking_informal |
  -- networking_formal | summer_school
  area TEXT DEFAULT 'energy_systems',
  -- hydrogen | energy_systems | process_engineering |
  -- simulation | control_automation | power_systems |
  -- mechanical_engineering | thermal_engineering |
  -- deeptech | other
  date_start TEXT DEFAULT '',
  date_end TEXT DEFAULT '',
  location TEXT DEFAULT '',
  city TEXT DEFAULT '',
  country TEXT DEFAULT '',
  organizer TEXT DEFAULT '',
  indexing TEXT DEFAULT '',
  publication_route TEXT DEFAULT '',
  relevance_phd INTEGER DEFAULT 3,
  relevance_spinoff INTEGER DEFAULT 3,
  relevance_networking INTEGER DEFAULT 3,
  cost_level TEXT DEFAULT 'medium',
  -- low | medium | high
  peer_review INTEGER DEFAULT 0,
  hybrid INTEGER DEFAULT 0,
  deadline_abstract TEXT DEFAULT '',
  deadline_paper TEXT DEFAULT '',
  website TEXT DEFAULT '',
  status TEXT DEFAULT 'identified',
  -- identified | priority | submitting | submitted |
  -- accepted | registered | attended | rejected | discarded
  strategic_phase TEXT DEFAULT '',
  -- 1 | 2 | 3
  notes TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  opportunity_id TEXT REFERENCES career_opportunities(id)
    ON DELETE SET NULL,
  -- linked to pipeline when decision made
  created_by TEXT REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Publication venues (journals, proceedings series)
CREATE TABLE IF NOT EXISTS publication_venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  acronym TEXT DEFAULT '',
  publisher TEXT DEFAULT '',
  type TEXT DEFAULT 'journal',
  -- journal | proceedings_journal | book_series | preprint
  indexing TEXT DEFAULT '',
  impact_factor REAL,
  quartile TEXT DEFAULT '',
  -- Q1 | Q2 | Q3 | Q4
  area TEXT DEFAULT 'energy_systems',
  relevance_phd INTEGER DEFAULT 3,
  open_access INTEGER DEFAULT 0,
  website TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  created_by TEXT REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Link events to publication venues
CREATE TABLE IF NOT EXISTS event_venue_links (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES career_events(id)
    ON DELETE CASCADE,
  venue_id TEXT REFERENCES publication_venues(id)
    ON DELETE CASCADE,
  link_type TEXT DEFAULT 'proceedings',
  -- proceedings | special_issue | invitation
  notes TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch())
);

-- Import log for events/venues
CREATE TABLE IF NOT EXISTS events_import_log (
  id TEXT PRIMARY KEY,
  source_description TEXT DEFAULT '',
  events_imported INTEGER DEFAULT 0,
  venues_imported INTEGER DEFAULT 0,
  imported_by TEXT REFERENCES users(id),
  imported_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_events_type
  ON career_events(type);
CREATE INDEX IF NOT EXISTS idx_events_area
  ON career_events(area);
CREATE INDEX IF NOT EXISTS idx_events_status
  ON career_events(status);
CREATE INDEX IF NOT EXISTS idx_events_date_start
  ON career_events(date_start);
CREATE INDEX IF NOT EXISTS idx_events_deadline_abstract
  ON career_events(deadline_abstract);
CREATE INDEX IF NOT EXISTS idx_venues_type
  ON publication_venues(type);
CREATE INDEX IF NOT EXISTS idx_venues_area
  ON publication_venues(area);
