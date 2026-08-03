-- 0051 — Sessão de reunião compartilhada (v2.25.17)
--
-- Até aqui não existia nenhum registro de "reunião": /api/meeting/start apenas
-- abria uma linha em time_entries com o user_id de quem clicou. Resultado: cada
-- participante via um cronômetro diferente (ver relatório da auditoria).
--
-- Esta tabela guarda a sessão COMPARTILHADA — um relógio só para todo mundo.
-- time_entries continua intacta e por usuário, porque é ela que alimenta o
-- cálculo de pagamento da assistente; a sessão não substitui nada, só coordena.
--
-- NOTA sobre a unicidade: `meeting_date` NÃO é UNIQUE de coluna. Se fosse, a
-- segunda reunião do mesmo dia falharia com UNIQUE constraint violation ao
-- tentar inserir (a primeira sessão, já encerrada, ocuparia a data). O índice
-- parcial abaixo dá a garantia que realmente interessa — no máximo UMA sessão
-- ABERTA por data — permitindo quantas sessões encerradas o dia tiver.
CREATE TABLE IF NOT EXISTS meeting_sessions (
  id           TEXT PRIMARY KEY,
  meeting_date TEXT NOT NULL,
  started_at   INTEGER NOT NULL,
  ended_at     INTEGER,
  started_by   TEXT REFERENCES users(id),
  ended_by     TEXT REFERENCES users(id),
  created_at   INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_meeting_sessions_date
  ON meeting_sessions(meeting_date);

-- No máximo uma sessão aberta por data.
CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_sessions_open
  ON meeting_sessions(meeting_date) WHERE ended_at IS NULL;

-- Busca da sessão ativa (status/stop) — não filtra por data, então precisa de
-- índice próprio: uma sessão aberta é uma sessão aberta, independente do
-- "bucket" de data em que caiu (relevante perto da meia-noite UTC).
CREATE INDEX IF NOT EXISTS idx_meeting_sessions_ended
  ON meeting_sessions(ended_at, started_at);
