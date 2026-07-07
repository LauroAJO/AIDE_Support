-- 0031_contact_enrichment.sql — enriquecimento de perfis de contato (Prompt G).

-- Histórico de interações estruturado (substitui o array JSON legado).
CREATE TABLE IF NOT EXISTS contact_interactions (
  id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES network_people(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL,
  -- email_sent | email_received | linkedin_connected | linkedin_message |
  -- meeting | coffee_chat | paper_mentioned | event | other
  date TEXT NOT NULL,          -- YYYY-MM-DD
  summary TEXT DEFAULT '',
  outcome TEXT DEFAULT '',
  next_step TEXT DEFAULT '',
  next_step_date TEXT DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_interactions_person ON contact_interactions(person_id);
CREATE INDEX IF NOT EXISTS idx_interactions_date ON contact_interactions(date);

-- Contexto de como se conheceram + potencial de indicação (estende contact_professional).
ALTER TABLE contact_professional ADD COLUMN acquaintance_context TEXT DEFAULT '';
ALTER TABLE contact_professional ADD COLUMN acquaintance_notes TEXT DEFAULT '';
ALTER TABLE contact_professional ADD COLUMN referral_potential TEXT DEFAULT '';
ALTER TABLE contact_professional ADD COLUMN referral_score INTEGER DEFAULT 0;
