-- Vincula uma oportunidade de carreira ao hub_item de origem (via
-- hub_items.short_id, ver 0043_hub_items_short_id.sql), para permitir voltar
-- direto a vaga original no Hub a partir do card do Kanban de Carreira.
-- NULL para oportunidades criadas manualmente (sem origem no Hub) ou antes
-- desta migracao.
ALTER TABLE career_opportunities
  ADD COLUMN hub_short_id TEXT NULL;
