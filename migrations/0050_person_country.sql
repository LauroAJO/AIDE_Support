-- 0050_person_country.sql — pais da pessoa (v2.25.15)
--
-- Ate aqui a nacionalidade so existia nas organizacoes
-- (market_organizations.country); o Networking inferia o pais de uma pessoa
-- pelas orgs vinculadas. Com o Brasil virando um segundo contexto do AIDE ao
-- lado da Holanda, a pessoa passa a ter pais proprio (codigo ISO alpha-2,
-- ex.: 'NL', 'BR'). Vazio = NL, o default assumido do ecossistema.

ALTER TABLE network_people ADD COLUMN country TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_network_people_country
  ON network_people(country);
