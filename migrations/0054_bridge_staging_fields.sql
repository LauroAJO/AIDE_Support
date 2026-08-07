-- 0054_bridge_staging_fields.sql — bridge completa: área, projecto, prazo e
-- energia sobrevivem ao Lifegame → AIDE.
--
-- Porquê: `bridge_task_staging` (0032) só tinha title/description/urgency/
-- importance/status/tags. O Lifegame enviava projecto, frente, prazo e energia,
-- mas não havia coluna nenhuma onde os pôr: caíam todos no `raw_payload` (que
-- só serve para diagnóstico) e o INSERT do approve criava a task real sem eles.
-- A área NÃO ganha coluna de propósito — na AIDE ela deriva do projecto
-- (projects.area_id) e uma segunda fonte de verdade só podia divergir.
-- `lifegame_area_id` é metadata: guarda a área que a tarefa tinha no Lifegame
-- para o caminho de volta a conseguir repô-la quando a tarefa não tem projecto
-- (essa é a única em que a AIDE não tem por onde derivar a área).
--
-- NOTA: ALTER TABLE ... ADD COLUMN não é idempotente no SQLite. Se esta
-- migração já correu, os comandos abaixo falham com "duplicate column name" —
-- é esperado e inofensivo.

ALTER TABLE bridge_task_staging ADD COLUMN project_id TEXT;
ALTER TABLE bridge_task_staging ADD COLUMN front_id TEXT;
ALTER TABLE bridge_task_staging ADD COLUMN due_date TEXT;
ALTER TABLE bridge_task_staging ADD COLUMN energy INTEGER DEFAULT 5;
ALTER TABLE bridge_task_staging ADD COLUMN lifegame_area_id TEXT;

CREATE INDEX IF NOT EXISTS idx_staging_project ON bridge_task_staging(project_id);
