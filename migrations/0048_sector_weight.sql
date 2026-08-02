-- "Peso setorial" de um contato: quanto de influência/relevância a pessoa
-- tem no setor (1-10), com justificativa e fontes — avaliação manual,
-- editada no DetailPanel do Networking (v2.25.9).
ALTER TABLE network_people
  ADD COLUMN sector_weight INTEGER DEFAULT NULL;
ALTER TABLE network_people
  ADD COLUMN sector_weight_notes TEXT DEFAULT '';
ALTER TABLE network_people
  ADD COLUMN sector_weight_sources TEXT DEFAULT '';
ALTER TABLE network_people
  ADD COLUMN sector_weight_updated_at INTEGER;
ALTER TABLE network_people
  ADD COLUMN sector_weight_updated_by TEXT
    REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_np_sector_weight
  ON network_people(sector_weight);
