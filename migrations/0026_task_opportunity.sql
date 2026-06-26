-- Etapa 6: Integração entre áreas.
-- Vínculo opcional entre uma tarefa e uma oportunidade de carreira.
-- ON DELETE SET NULL: ao encerrar/remover a oportunidade, a tarefa permanece.
ALTER TABLE tasks ADD COLUMN opportunity_id TEXT REFERENCES career_opportunities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_opportunity ON tasks(opportunity_id);
