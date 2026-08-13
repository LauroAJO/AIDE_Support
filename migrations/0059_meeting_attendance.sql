-- 0059 — Log de presença em reunião (attendance log)
--
-- NOTA sobre o número (deviation reportada ao usuário): o spec original pedia
-- o arquivo "0057_meeting_attendance.sql", mas 0057 (drive_hidden) e 0058
-- (market_org_geo) já foram criados e aplicados nesta mesma sessão de
-- desenvolvimento. Este arquivo assume o próximo número livre, 0059.
--
-- Este log é independente de meeting_sessions: registra CADA entrada/saída de
-- CADA usuário na tarefa da reunião (join order incluído), mesmo quando não
-- existe sessão compartilhada aberta (ex.: assistente entra sozinha, antes do
-- Lauro — regra 1/2 da investigação task↔career/meeting). meeting_sessions
-- continua sendo só o relógio compartilhado; este log é o histórico de quem
-- entrou/saiu e quando, usado pela tela de "Ver histórico completo".
CREATE TABLE IF NOT EXISTS meeting_attendance_log (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  action     TEXT NOT NULL CHECK (action IN ('joined', 'left')),
  session_id TEXT REFERENCES meeting_sessions(id),
  task_id    TEXT REFERENCES tasks(id),
  at         INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_meeting_attendance_user
  ON meeting_attendance_log(user_id, at);

CREATE INDEX IF NOT EXISTS idx_meeting_attendance_at
  ON meeting_attendance_log(at);
