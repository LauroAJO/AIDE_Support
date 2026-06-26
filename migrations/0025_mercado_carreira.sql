-- 0025 — Mercado & Carreira
-- Todas as tabelas são NOVAS (verificado contra 0001-0024 na auditoria etapa0).
-- Regras: CREATE TABLE IF NOT EXISTS sempre; sem DROP/DELETE; um statement por linha.

-- =============================================
-- ÁREA MERCADO
-- =============================================

-- Organizações (empresas, universidades, institutos, financiadores)
CREATE TABLE IF NOT EXISTS market_organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'company',
  -- tipos: company | university | research_institute | funder | consortium | other
  subtype TEXT DEFAULT '',
  -- ex: 'spin-off', 'startup', 'public_university', 'eu_program', 'national_funder'
  country TEXT DEFAULT 'NL',
  city TEXT DEFAULT '',
  website TEXT DEFAULT '',
  linkedin TEXT DEFAULT '',
  description TEXT DEFAULT '',
  relevance_score INTEGER DEFAULT 3,
  -- 1-5: quão relevante para busca de emprego/PhD
  relevance_notes TEXT DEFAULT '',
  -- por que é relevante
  tags TEXT DEFAULT '[]',
  -- ex: ['H2', 'modelagem', 'PEM', 'AEL', 'e-SAF']
  status TEXT DEFAULT 'prospect',
  -- prospect | active | partner | inactive
  source TEXT DEFAULT '',
  -- de onde veio essa info (ex: 'relatório Twente H2')
  created_by TEXT REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Projetos e programas de P&D
CREATE TABLE IF NOT EXISTS market_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  acronym TEXT DEFAULT '',
  type TEXT DEFAULT 'research',
  -- research | funding_call | consortium | phd_program | job_opening | collaboration
  organization_id TEXT REFERENCES market_organizations(id),
  -- organização coordenadora
  description TEXT DEFAULT '',
  budget TEXT DEFAULT '',
  -- ex: '€23.5M total, €20M EC'
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  -- active | completed | planned | call_open
  relevance_score INTEGER DEFAULT 3,
  relevance_notes TEXT DEFAULT '',
  url TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  partner_org_ids TEXT DEFAULT '[]',
  -- IDs de market_organizations parceiras
  source TEXT DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Enriquecer contatos existentes com contexto profissional
-- (extensão da tabela network_people existente)
CREATE TABLE IF NOT EXISTS contact_professional (
  person_id TEXT PRIMARY KEY REFERENCES network_people(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES market_organizations(id),
  -- organização principal atual
  outreach_status TEXT DEFAULT 'not_contacted',
  -- not_contacted | contacted | responded | meeting_scheduled | ongoing | converted | inactive
  outreach_channel TEXT DEFAULT '',
  -- linkedin | email | event | referral
  last_contact_date TEXT DEFAULT '',
  next_action TEXT DEFAULT '',
  next_action_date TEXT DEFAULT '',
  relevance_for_phd INTEGER DEFAULT 0,
  -- 0-5
  relevance_for_job INTEGER DEFAULT 0,
  -- 0-5
  relevance_for_spinoff INTEGER DEFAULT 0,
  -- 0-5
  interaction_history TEXT DEFAULT '[]',
  -- array de { date, type, notes }
  confirmed_email TEXT DEFAULT '',
  confirmed_linkedin TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Vínculo entre contatos e organizações/projetos
CREATE TABLE IF NOT EXISTS contact_org_links (
  id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES network_people(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES market_organizations(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES market_projects(id) ON DELETE SET NULL,
  role_at_org TEXT DEFAULT '',
  -- cargo/função nesta organização
  relevance_notes TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch())
);

-- =============================================
-- ÁREA CARREIRA
-- =============================================

-- Oportunidades (vagas, PhDs, bolsas, colaborações)
CREATE TABLE IF NOT EXISTS career_opportunities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'job',
  -- job | phd | postdoc | grant | collaboration | spinoff_support | contract
  track TEXT DEFAULT 'job',
  -- Trilha: phd | job | spinoff
  organization_id TEXT REFERENCES market_organizations(id),
  contact_id TEXT REFERENCES network_people(id),
  project_id TEXT REFERENCES market_projects(id),
  -- se relacionado a um projeto específico
  description TEXT DEFAULT '',
  requirements TEXT DEFAULT '',
  location TEXT DEFAULT '',
  salary_range TEXT DEFAULT '',
  deadline TEXT DEFAULT '',
  -- data limite para aplicar
  status TEXT DEFAULT 'identified',
  -- identified | researching | preparing | applied | interviewing | offer | rejected | closed
  priority INTEGER DEFAULT 3,
  -- 1-5
  fit_score INTEGER DEFAULT 3,
  -- 1-5: quão bem você se encaixa
  url TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  assigned_to TEXT REFERENCES users(id),
  -- quem está trabalhando nessa oportunidade
  created_by TEXT REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Documentos de carreira (CV, cartas, propostas)
CREATE TABLE IF NOT EXISTS career_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'cv',
  -- cv | cover_letter | research_statement | phd_proposal | spinoff_pitch | other
  version TEXT DEFAULT 'v1',
  opportunity_id TEXT REFERENCES career_opportunities(id) ON DELETE SET NULL,
  -- se específico para uma oportunidade
  drive_file_id TEXT DEFAULT '',
  -- ID do arquivo no Google Drive
  drive_link TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Metas de carreira
CREATE TABLE IF NOT EXISTS career_goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  track TEXT DEFAULT 'job',
  -- phd | job | spinoff
  description TEXT DEFAULT '',
  target_date TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  -- active | achieved | paused | cancelled
  priority INTEGER DEFAULT 3,
  notes TEXT DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Sistema de importação em massa
CREATE TABLE IF NOT EXISTS import_log (
  id TEXT PRIMARY KEY,
  import_type TEXT NOT NULL,
  -- 'organizations' | 'contacts' | 'opportunities'
  source_description TEXT DEFAULT '',
  -- ex: 'relatório Twente H2 2026'
  items_imported INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  error_log TEXT DEFAULT '[]',
  imported_by TEXT REFERENCES users(id),
  imported_at INTEGER DEFAULT (unixepoch())
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_market_org_type ON market_organizations(type);
CREATE INDEX IF NOT EXISTS idx_market_org_status ON market_organizations(status);
CREATE INDEX IF NOT EXISTS idx_market_proj_org ON market_projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_contact_prof_status ON contact_professional(outreach_status);
CREATE INDEX IF NOT EXISTS idx_career_opp_status ON career_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_career_opp_track ON career_opportunities(track);
CREATE INDEX IF NOT EXISTS idx_career_opp_deadline ON career_opportunities(deadline);
