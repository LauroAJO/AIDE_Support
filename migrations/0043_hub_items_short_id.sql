-- ID curto e legível para um hub_item (ex.: "a3f9k2"), usado em links
-- compartilháveis (/hub?vaga=...) e no badge #ID do card. Gerado sob demanda
-- em handleHubIngest (LOWER(HEX(RANDOMBLOB(3))) -- 3 bytes = 6 hex chars) --
-- NULL para itens legados até o backfill abaixo rodar.
ALTER TABLE hub_items
  ADD COLUMN short_id TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_hub_items_short_id ON hub_items(short_id)
  WHERE short_id IS NOT NULL;
