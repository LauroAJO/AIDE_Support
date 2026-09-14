-- Fase 5 do plano de Integração de Dados Externos — campos extra em
-- hub_items para vagas vindas do EURAXESS (renumerada de 0060, já usada
-- nesta sessão por notification_link — ver 0062_external_integrations.sql
-- para o mesmo padrão de renumeração).
--
-- Idempotente: ALTER TABLE ADD COLUMN não é idempotente no SQLite (padrão
-- já tolerado nas migrações do AIDE — rerun loga "duplicate column name" e
-- o migrate.ps1 segue em frente).

ALTER TABLE hub_items ADD COLUMN euraxess_id TEXT DEFAULT '';
ALTER TABLE hub_items ADD COLUMN host_institution TEXT DEFAULT '';
ALTER TABLE hub_items ADD COLUMN application_deadline TEXT DEFAULT '';
ALTER TABLE hub_items ADD COLUMN funding_programme TEXT DEFAULT '';
ALTER TABLE hub_items ADD COLUMN contract_type TEXT DEFAULT '';
ALTER TABLE hub_items ADD COLUMN euraxess_url TEXT DEFAULT '';
ALTER TABLE hub_items ADD COLUMN euraxess_sync_note TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_hub_items_euraxess ON hub_items(euraxess_id);
