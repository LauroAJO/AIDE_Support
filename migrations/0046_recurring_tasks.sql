-- Tarefas recorrentes: uma tarefa pode se repetir automaticamente apos ser
-- concluida (ver _worker.js::handleTaskItem, PUT /api/tasks/:id).
ALTER TABLE tasks ADD COLUMN is_recurring INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN recurrence_type TEXT DEFAULT '';
-- none | daily | weekly | monthly
ALTER TABLE tasks ADD COLUMN recurrence_interval INTEGER DEFAULT 1;
-- a cada N dias/semanas/meses
ALTER TABLE tasks ADD COLUMN recurrence_days TEXT DEFAULT '[]';
-- JSON array de dias da semana [0-6] (0=domingo, mesma convencao de Date.getDay())
-- para recorrencia semanal; ex: [1,3,5] = Seg/Qua/Sex
ALTER TABLE tasks ADD COLUMN recurrence_end_date TEXT DEFAULT '';
-- YYYY-MM-DD ou vazio para sem data de termino
ALTER TABLE tasks ADD COLUMN recurrence_count INTEGER DEFAULT 0;
-- quantas vezes essa cadeia de recorrencia ja gerou uma nova tarefa
ALTER TABLE tasks ADD COLUMN parent_task_id TEXT REFERENCES tasks(id)
  ON DELETE SET NULL;
-- tarefa original que gerou esta recorrencia

CREATE INDEX IF NOT EXISTS idx_tasks_recurring
  ON tasks(is_recurring) WHERE is_recurring = 1;
CREATE INDEX IF NOT EXISTS idx_tasks_parent
  ON tasks(parent_task_id);
