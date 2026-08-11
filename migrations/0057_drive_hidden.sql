-- 0057_drive_hidden.sql
-- "Meu Drive" curadoria (fix — item oculto por usuário). Antes, a página
-- espelhava 100% da raiz do Google Drive sem nenhuma forma de curadoria.
-- Espelha o padrão já existente de favoritos (is_favorite) na mesma tabela.
ALTER TABLE drive_items_cache ADD COLUMN is_hidden INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_drive_hidden ON drive_items_cache(user_id, is_hidden);
