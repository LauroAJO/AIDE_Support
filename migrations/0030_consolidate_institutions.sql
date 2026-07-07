-- 0030_consolidate_institutions.sql
-- Consolida network_institutions → market_organizations (OPÇÃO B, aprovada).
-- Reconstrói person_roles para a FK de institution_id apontar a
-- market_organizations e reaponta a única função (University of Twente) para o
-- market_org já existente. Insere NovalT (Novel-T) em market_organizations.
--
-- ATENÇÃO: reconstrói (DROP + RENAME) a tabela person_roles — exceção à regra
-- "never drop tables" autorizada explicitamente para esta consolidação.
--
-- IDs EXATOS (verificados no D1 remoto):
--   NovalT  (network_institutions) : 8eb81345-4231-465b-9d34-80646f0fba01
--   UTwente (network_institutions) : 3b31a997-885a-4d61-bbf8-1776828fd5b6
--   UTwente (market_organizations) : cc4bdd0c-6a50-490e-8adb-91e4594173d8  (JÁ EXISTE)
-- Motivo do id fixo p/ UT: há DOIS "University of Twente" tipo university no
-- Mercado ("University of Twente" cc4bdd0c e "University of Twente — HyUT / SEED"
-- a7841bd6); o subquery por LIKE seria ambíguo, então usamos o id exato.

-- ── 1) NovalT → market_organizations (id dedicado à migração) ────────────────
INSERT OR IGNORE INTO market_organizations
  (id, name, type, subtype, tags, status, created_at, updated_at)
VALUES (
  '8eb81345-nova-t-migration',
  'Novel-T',
  'other',
  'startup',
  '["StartUp","RHYSE_Sim","spin-off","UTwente"]',
  'prospect',
  unixepoch(),
  unixepoch()
);

-- ── 2) Reconstrói person_roles: institution_id passa a referenciar
--        market_organizations. A cópia já reaponta os ids, então o INSERT é
--        FK-válido contra o novo destino (não precisa desligar foreign_keys). ──
CREATE TABLE person_roles_new (
  id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES network_people(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  institution_id TEXT REFERENCES market_organizations(id) ON DELETE SET NULL,
  institution_name TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  current INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch())
);

INSERT INTO person_roles_new
  (id, person_id, role, institution_id, institution_name, start_date, end_date, current, created_at)
SELECT
  id, person_id, role,
  CASE institution_id
    WHEN '3b31a997-885a-4d61-bbf8-1776828fd5b6' THEN 'cc4bdd0c-6a50-490e-8adb-91e4594173d8'
    WHEN '8eb81345-4231-465b-9d34-80646f0fba01' THEN '8eb81345-nova-t-migration'
    ELSE NULL
  END,
  institution_name, start_date, end_date, current, created_at
FROM person_roles;

DROP TABLE person_roles;
ALTER TABLE person_roles_new RENAME TO person_roles;

CREATE INDEX IF NOT EXISTS idx_person_roles_person ON person_roles(person_id);
CREATE INDEX IF NOT EXISTS idx_person_roles_institution ON person_roles(institution_id);

-- ── 3) network_entity_links: 0 linhas com network_institution_id (verificado no
--        backup) → nada a reapontar. Tabela deprecada junto com a UI; FK mantida.
