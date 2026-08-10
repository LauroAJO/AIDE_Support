-- 0056_opportunity_audit.sql — histórico de mudanças de career_opportunities
-- (Bloco 3, Parte B). Renumerado de 0055 (o número usado no spec original)
-- para 0056: 0054 e 0055 já foram usados por uma sessão anterior de bridge
-- (0054_bridge_staging_fields.sql, 0055_bridge_mapping.sql) — ver relatório
-- de mudanças do bridge. Sempre confira `migrations/` antes de escolher o
-- próximo número; um spec escrito de antemão pode ficar desatualizado.

CREATE TABLE IF NOT EXISTS opportunity_audit_log (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT REFERENCES career_opportunities(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  -- 'status_change' | 'assignee_change' | 'field_update'
  field_name TEXT DEFAULT '',
  old_value TEXT DEFAULT '',
  new_value TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_audit_opportunity
  ON opportunity_audit_log(opportunity_id, created_at);
