-- Hub de inteligência: itens coletados externamente (notícias, editais, papers)
-- por projeto (h2 | energia | ia | ...) com pontuação de relevância vinda do LLM.
-- Ingestão via POST /api/hub/items autenticado por API key (header ApiKey).
-- NOTA: numerado 0027 por sequência — o prompt original pedia "0009", mas
-- 0009_ensure_tables.sql já existe. O nome lógico é hub_items.
CREATE TABLE IF NOT EXISTS hub_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  source_name TEXT,
  published_at DATETIME,
  relevancia REAL,
  prioridade TEXT,
  tipo TEXT,
  resumo TEXT,
  topicos TEXT,
  justificativa TEXT,
  collected_at DATETIME,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(external_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_items_project
  ON hub_items(project_id);
CREATE INDEX IF NOT EXISTS idx_hub_items_relevancia
  ON hub_items(relevancia DESC);
CREATE INDEX IF NOT EXISTS idx_hub_items_received
  ON hub_items(received_at DESC);
