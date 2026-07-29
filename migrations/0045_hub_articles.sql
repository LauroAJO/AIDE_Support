-- Campos específicos de artigos científicos em hub_items (subaba "Artigos
-- Científicos"). project_id = 'artigos' quando o Intelligence Hub passar a
-- coletar periódicos. publication_venues já tem impact_factor mas é uma
-- tabela totalmente separada (organizações/eventos de mercado) — não mesclar.
ALTER TABLE hub_items ADD COLUMN doi TEXT DEFAULT '';
ALTER TABLE hub_items ADD COLUMN journal_name TEXT DEFAULT '';
ALTER TABLE hub_items ADD COLUMN impact_factor REAL;
ALTER TABLE hub_items ADD COLUMN sjr_quartile TEXT DEFAULT '';
ALTER TABLE hub_items ADD COLUMN access_type TEXT DEFAULT '';
ALTER TABLE hub_items ADD COLUMN article_type TEXT DEFAULT '';
ALTER TABLE hub_items ADD COLUMN publication_year INTEGER;

CREATE INDEX IF NOT EXISTS idx_hub_items_doi
  ON hub_items(doi);
CREATE INDEX IF NOT EXISTS idx_hub_items_journal
  ON hub_items(journal_name);
