-- 0059 — Log de presença em reunião (attendance log)
--
-- NOTA sobre o número (deviation reportada ao usuário): o spec original pedia
-- o arquivo "0057_meeting_attendance.sql", mas 0057 (drive_hidden) e 0058
-- (market_org_geo) já foram criados e aplicados nesta mesma sessão de
-- desenvolvimento. Este arquivo assume o próximo número livre, 0059.
--
-- v-notif-redesign — coluna de timestamp renomeada de `at` para `timestamp`
-- para casar com o spec mais recente (Bloco C, Fix C4/migration). Como este
-- arquivo ainda não tinha sido aplicado em produção (nenhuma migração desta
-- sessão foi rodada com `wrangler d1 execute --remote` ainda), a renomeação é
-- segura — não há dado real em cima do nome antigo para migrar.
--
-- Este log é independente de meeting_sessions: registra CADA entrada/saída de
-- CADA usuário na tarefa da reunião (join order incluído), mesmo quando não
-- existe sessão compartilhada aberta (ex.: assistente entra sozinha, antes do
-- Lauro — regra 1/2). meeting_sessions continua sendo só o relógio
-- compartilhado; este log é o histórico de quem entrou/saiu e quando, usado
-- pela tela de "Ver histórico completo".
--
-- DEVIATION vs. spec Fix C4: o helper `logMeetingAttendance` do spec só grava
-- quando há `session_id` (`if (!sessionId) return;`). Isso violaria a Regra 4
-- ("Every join/leave recorded") sempre que alguém entra ANTES do Lauro — o
-- caso central da Regra 1/2. Por isso `session_id` fica opcional aqui (sem
-- NOT NULL) e o helper grava incondicionalmente; `task_id` é mantido (extra,
-- fora do spec) para o registro continuar identificável como "reunião" mesmo
-- nas linhas sem sessão.
CREATE TABLE IF NOT EXISTS meeting_attendance_log (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  action     TEXT NOT NULL CHECK (action IN ('joined', 'left')),
  session_id TEXT REFERENCES meeting_sessions(id) ON DELETE CASCADE,
  task_id    TEXT REFERENCES tasks(id),
  timestamp  INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_meeting_attendance_session
  ON meeting_attendance_log(session_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_meeting_attendance_user
  ON meeting_attendance_log(user_id, timestamp);
