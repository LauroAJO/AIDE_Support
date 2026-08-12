-- 0058_market_org_geo.sql
-- Mapa geográfico de Mercado (fase 1: organizações + projetos).
--
-- Projetos não ganham coordenada própria: um projeto não tem "endereço", ele
-- aparece no mapa na posição da organização coordenadora (market_projects.
-- organization_id, já existente). Pessoas (fase 2, futura) também vão se
-- ancorar na organização vinculada — nada de coordenada por pessoa por ora.
--
-- geocode_source: 'auto' (resolvido via Nominatim a partir de city/country),
-- 'manual' (usuário posicionou/arrastou o pino), ou NULL (nunca geocodificado).
ALTER TABLE market_organizations ADD COLUMN lat REAL;
ALTER TABLE market_organizations ADD COLUMN lng REAL;
ALTER TABLE market_organizations ADD COLUMN geocode_source TEXT;
ALTER TABLE market_organizations ADD COLUMN geocoded_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_market_org_geo ON market_organizations(lat, lng);
