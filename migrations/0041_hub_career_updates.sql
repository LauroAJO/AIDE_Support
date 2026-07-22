-- Campo archived_at em hub_items (quando o item é enviado para Carreira e
-- some da lista ativa do Hub, sem ser deletado).
ALTER TABLE hub_items ADD COLUMN archived_at DATETIME NULL;
CREATE INDEX IF NOT EXISTS idx_hub_items_archived
  ON hub_items(archived_at);

-- Campo extract_knowledge em career_opportunities (toggle "Extrair
-- Conhecimento" no Kanban de Carreira).
ALTER TABLE career_opportunities ADD COLUMN extract_knowledge INTEGER DEFAULT 0;
