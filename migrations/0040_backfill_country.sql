-- Backfill de country para hub_items ingeridos antes do IntelligenceHub
-- passar a enviar country no payload (Problema 3). So altera linhas com
-- country ainda NULL -- idempotente, seguro para reexecutar.

UPDATE hub_items SET country = 'NL'
WHERE country IS NULL
AND (
  source_name LIKE '%AcademicTransfer%'
  OR source_name LIKE '%Techniekwerkt%'
);

UPDATE hub_items SET country = 'DE'
WHERE country IS NULL
AND source_name LIKE '%Academics.de%';
