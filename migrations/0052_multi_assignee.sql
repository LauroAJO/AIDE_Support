-- v2.25.19 — Multiplos responsaveis por tarefa + subtarefas como linhas reais.
--
-- Parte 1: task_assignees (junction). O responsavel principal continua vivendo
-- em tasks.assigned_to (nada quebra); a junction guarda a MESMA pessoa com
-- role='owner' + os co-responsaveis com role='assignee'. Ou seja, a junction e
-- a fonte completa e assigned_to e o atalho legado que segue sincronizado.
--
-- Parte 2: subtarefas deixam de ser JSON em tasks.subtasks e passam a ser
-- linhas reais em tasks com is_subtask=1 e parent_task_id apontando para a mae.
-- ATENCAO: parent_task_id JA e usado desde a 0046 para a linhagem de
-- recorrencia (a proxima ocorrencia aponta para a tarefa concluida). Por isso
-- TODA consulta de subtarefa precisa filtrar TAMBEM is_subtask = 1 — so
-- parent_task_id nao distingue subtarefa de proxima ocorrencia.

CREATE TABLE IF NOT EXISTS task_assignees (
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'assignee',
  -- 'assignee' | 'owner' (responsavel principal, espelha tasks.assigned_to)
  added_at INTEGER DEFAULT (unixepoch()),
  added_by TEXT REFERENCES users(id),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_user
  ON task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task
  ON task_assignees(task_id);

-- Backfill: todo assigned_to atual vira o 'owner' da tarefa na junction.
INSERT OR IGNORE INTO task_assignees (task_id, user_id, role)
SELECT id, assigned_to, 'owner'
FROM tasks
WHERE assigned_to IS NOT NULL;

-- Colunas das subtarefas-linha. Nao sao idempotentes (SQLite nao tem
-- ADD COLUMN IF NOT EXISTS) — numa reexecucao o migrate.ps1 loga
-- "duplicate column name" e segue, como nas demais migracoes.
ALTER TABLE tasks ADD COLUMN is_subtask INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN subtask_order INTEGER DEFAULT 0;

-- A migracao das subtarefas JSON existentes para linhas reais e feita em
-- codigo de aplicacao: POST /api/tasks/migrate-subtasks (somente owner).

-- idx_tasks_parent ja existe desde a 0046 (ON tasks(parent_task_id)); recriar
-- com o mesmo nome seria um no-op silencioso por causa do IF NOT EXISTS. Este
-- indice e outro: cobre exatamente a consulta de subtarefas (filtro por mae +
-- ordenacao), entao tem nome proprio.
CREATE INDEX IF NOT EXISTS idx_tasks_subtask_parent
  ON tasks(parent_task_id, subtask_order) WHERE is_subtask = 1;
CREATE INDEX IF NOT EXISTS idx_tasks_subtask
  ON tasks(is_subtask);
