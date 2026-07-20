-- Soft delete para hub_items: deleted_at marca quando um item foi removido
-- (via UI ou limpeza em massa) sem apagar a linha. Todas as leituras (GET
-- /api/hub/items, /api/hub/stats) devem filtrar WHERE deleted_at IS NULL.
ALTER TABLE hub_items ADD COLUMN deleted_at DATETIME NULL;
CREATE INDEX IF NOT EXISTS idx_hub_items_deleted
  ON hub_items(deleted_at);
