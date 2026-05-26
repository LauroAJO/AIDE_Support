-- Suporte a importação de tarefas e pessoas do Lifegame.
-- Idempotente no worker (try/catch envolve os ALTER em ensureLifegameColumns).

ALTER TABLE tasks ADD COLUMN source TEXT DEFAULT 'aide';
ALTER TABLE tasks ADD COLUMN lifegame_id TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_lifegame_id ON tasks(lifegame_id);
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source);

-- network_people já tem lifegame_person_id (migration 0007/bridge). Só
-- garantimos a coluna source pra simetria.
ALTER TABLE network_people ADD COLUMN source TEXT DEFAULT 'aide';

-- Cache opcional dos pulls — útil pra debugging/auditoria sem ler o log.
CREATE TABLE IF NOT EXISTS lifegame_cache (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  synced_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lifegame_cache_type ON lifegame_cache(entity_type, synced_at DESC);
