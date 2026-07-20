-- Campos editáveis manualmente em hub_items (Hub > Vagas PhD / Empregos):
-- país, área temática, notas pessoais e overrides de título/resumo, mais o
-- timestamp da última edição (usado para exibir o indicador "editado" na UI).
-- NOTA: numerado 0038 por sequência — o prompt original pedia "0031", mas
-- 0031_market_orgdetail.sql já existe. Nome lógico: hub_items_editable.
ALTER TABLE hub_items ADD COLUMN country TEXT NULL;
ALTER TABLE hub_items ADD COLUMN area TEXT NULL;
ALTER TABLE hub_items ADD COLUMN user_notes TEXT NULL;
ALTER TABLE hub_items ADD COLUMN title_override TEXT NULL;
ALTER TABLE hub_items ADD COLUMN resumo_override TEXT NULL;
ALTER TABLE hub_items ADD COLUMN edited_at DATETIME NULL;
