-- Fase 0 do plano de Integração de Dados Externos (ORCID, OpenAlex, ROR,
-- CORDIS, EURAXESS). Renumerada de 0059→0062: o spec original assumia
-- versão II.1.0.0 e migrações 0059/0060 livres; na prática este repositório
-- já estava em II.1.8.0 com 0059 (meeting_attendance), 0060 (notification_link)
-- e 0061 (fix_attendance_timestamp_column) já commitadas nesta sessão.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS em todo o arquivo. Os ALTER
-- TABLE ADD COLUMN não são idempotentes no SQLite (padrão já tolerado nas
-- migrações anteriores do AIDE — rerun loga "duplicate column name" e o
-- migrate.ps1 segue em frente).

-- ── Colunas novas em tabelas existentes ─────────────────────────────────────

ALTER TABLE network_people ADD COLUMN orcid_id TEXT DEFAULT '';
ALTER TABLE network_people ADD COLUMN openalex_author_id TEXT DEFAULT '';

ALTER TABLE market_organizations ADD COLUMN ror_id TEXT DEFAULT '';
ALTER TABLE market_organizations ADD COLUMN cordis_org_id TEXT DEFAULT '';
ALTER TABLE market_organizations ADD COLUMN wikidata_id TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_np_orcid ON network_people(orcid_id);
CREATE INDEX IF NOT EXISTS idx_np_openalex ON network_people(openalex_author_id);
CREATE INDEX IF NOT EXISTS idx_mo_ror ON market_organizations(ror_id);
CREATE INDEX IF NOT EXISTS idx_mo_cordis ON market_organizations(cordis_org_id);

-- ── Perfis externos (cache de ORCID/OpenAlex/ROR por entidade AIDE) ─────────

CREATE TABLE IF NOT EXISTS external_profiles (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,         -- 'person' | 'organization'
  entity_id TEXT NOT NULL,
  source TEXT NOT NULL,              -- 'orcid' | 'openalex' | 'ror'
  external_id TEXT NOT NULL,
  raw_json TEXT DEFAULT '',
  fetched_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_ext_profiles_entity ON external_profiles(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ext_profiles_source ON external_profiles(source, external_id);

-- ── Fila de enriquecimento assíncrono (processada em lote pelo cron diário) ─

CREATE TABLE IF NOT EXISTS enrichment_queue (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,         -- 'person' | 'organization'
  entity_id TEXT NOT NULL,
  source TEXT NOT NULL,              -- 'orcid' | 'openalex' | 'ror' | 'cordis'
  priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',     -- 'pending' | 'processing' | 'done' | 'error'
  attempts INTEGER DEFAULT 0,
  last_error TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch()),
  processed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_enrich_queue_status ON enrichment_queue(status, priority);
CREATE INDEX IF NOT EXISTS idx_enrich_queue_entity ON enrichment_queue(entity_type, entity_id);

-- ── Publicações externas (OpenAlex → possível linkagem com hub_items) ───────

CREATE TABLE IF NOT EXISTS external_publications (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'openalex',
  external_id TEXT NOT NULL,
  doi TEXT DEFAULT '',
  title TEXT DEFAULT '',
  journal_name TEXT DEFAULT '',
  publication_year INTEGER,
  cited_by_count INTEGER DEFAULT 0,
  raw_json TEXT DEFAULT '',
  fetched_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_ext_pubs_doi ON external_publications(doi);
CREATE INDEX IF NOT EXISTS idx_ext_pubs_external_id ON external_publications(source, external_id);

CREATE TABLE IF NOT EXISTS publication_entity_links (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES external_publications(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,         -- 'person' | 'organization'
  entity_id TEXT NOT NULL,
  role TEXT DEFAULT '',              -- ex.: 'author'
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_pub_links_pub ON publication_entity_links(publication_id);
CREATE INDEX IF NOT EXISTS idx_pub_links_entity ON publication_entity_links(entity_type, entity_id);

-- ── Projetos externos (CORDIS → financiamento EU) ───────────────────────────

CREATE TABLE IF NOT EXISTS external_projects (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'cordis',
  external_id TEXT NOT NULL,
  title TEXT DEFAULT '',
  acronym TEXT DEFAULT '',
  total_cost REAL,
  eu_contribution REAL,
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  raw_json TEXT DEFAULT '',
  fetched_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_ext_projects_external_id ON external_projects(source, external_id);

CREATE TABLE IF NOT EXISTS project_org_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES external_projects(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES market_organizations(id) ON DELETE SET NULL,
  role TEXT DEFAULT '',              -- ex.: 'coordinator' | 'participant'
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_proj_org_links_project ON project_org_links(project_id);
CREATE INDEX IF NOT EXISTS idx_proj_org_links_org ON project_org_links(organization_id);

-- ── Log do cálculo de peso setorial (auditoria de cada recomputo) ──────────

CREATE TABLE IF NOT EXISTS sector_weight_log (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES network_people(id) ON DELETE CASCADE,
  computed_score REAL,
  manual_component REAL,
  openalex_component REAL,
  cordis_component REAL,
  journal_component REAL,
  details_json TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_sector_weight_log_person ON sector_weight_log(person_id, created_at);
