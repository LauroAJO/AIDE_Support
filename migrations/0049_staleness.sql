-- 0049_staleness.sql — rastreamento de desatualizacao de perfis
-- (pessoas, organizacoes e iniciativas do Mercado) + tarefas automaticas
-- de revisao.

-- Staleness configuration per entity
CREATE TABLE IF NOT EXISTS staleness_config (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  -- 'person' | 'organization' | 'project'
  entity_id TEXT NOT NULL,
  enabled INTEGER DEFAULT 0,
  -- 0 = staleness tracking disabled for this entity
  threshold_days INTEGER DEFAULT 60,
  -- alert after N days without update
  assigned_to TEXT REFERENCES users(id),
  -- who gets the auto-task (null = owner)
  last_reviewed_at INTEGER,
  -- manual "mark as reviewed" timestamp
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_staleness_type
  ON staleness_config(entity_type, enabled);
