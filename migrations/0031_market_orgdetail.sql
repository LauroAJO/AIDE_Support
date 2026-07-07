-- 0031 — OrgDetailPage (v2.4.2)
-- Adiciona: colunas de relevância por trilha na organização, tabela de notas de
-- mercado (independente de /notes) e tabela de anexos Drive por organização.
-- Regras: CREATE TABLE IF NOT EXISTS; ALTER só em colunas novas (primeira e
-- única execução — não é idempotente para ADD COLUMN). Sem DROP/DELETE.

-- =============================================
-- Relevância por trilha na organização (0-5).
-- Mantém o relevance_score legado; estas são complementares.
-- =============================================
ALTER TABLE market_organizations ADD COLUMN relevance_for_phd INTEGER DEFAULT 0;
ALTER TABLE market_organizations ADD COLUMN relevance_for_job INTEGER DEFAULT 0;
ALTER TABLE market_organizations ADD COLUMN relevance_for_spinoff INTEGER DEFAULT 0;

-- =============================================
-- Notas de mercado — separadas por completo de /notes (tabela notes).
-- =============================================
CREATE TABLE IF NOT EXISTS market_notes (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES market_organizations(id) ON DELETE CASCADE,
  title TEXT DEFAULT '',
  body TEXT DEFAULT '',
  note_type TEXT DEFAULT 'other',
  -- research | funding | culture | news | contact | other
  tags TEXT DEFAULT '[]',
  pinned INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_market_notes_org ON market_notes(organization_id);
CREATE INDEX IF NOT EXISTS idx_market_notes_pinned ON market_notes(pinned);

-- =============================================
-- Anexos Drive por organização — mesmo padrão de note_drive_links/task_drive_links.
-- Uploads vão para AIDE_SUPPORT/MERCADO/<orgId>/.
-- =============================================
CREATE TABLE IF NOT EXISTS market_org_drive_links (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES market_organizations(id) ON DELETE CASCADE,
  google_file_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT DEFAULT '',
  web_view_link TEXT DEFAULT '',
  icon_link TEXT DEFAULT '',
  is_upload INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_market_org_drive_links_org ON market_org_drive_links(org_id);
