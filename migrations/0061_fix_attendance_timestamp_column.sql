-- 0061 — Corrige meeting_attendance_log criada com o schema antigo
--
-- A tentativa de rodar 0059_meeting_attendance.sql no remoto falhou com
-- "no such column: timestamp" porque a tabela `meeting_attendance_log` já
-- existia lá com a coluna antiga `at` (de uma execução anterior desta mesma
-- migração, antes dela ser renomeada nesta sessão) — o `CREATE TABLE IF NOT
-- EXISTS` não fez nada, e os `CREATE INDEX ...timestamp)` falharam. D1 reverte
-- o arquivo inteiro em caso de erro, então nada mudou — mas o código já
-- implantado (_worker.js) grava em `timestamp`, não em `at`.
--
-- Renomeia a coluna existente e recria os índices que a 0059 não conseguiu
-- criar. Idempotente na parte dos índices (IF NOT EXISTS); o RENAME COLUMN
-- roda só uma vez — se já tiver sido corrigido manualmente, reexecutar este
-- arquivo vai falhar no RENAME (coluna `at` não existe mais), o que é seguro:
-- só rode de novo se a coluna `at` ainda estiver lá.
ALTER TABLE meeting_attendance_log RENAME COLUMN at TO timestamp;

CREATE INDEX IF NOT EXISTS idx_meeting_attendance_session
  ON meeting_attendance_log(session_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_meeting_attendance_user
  ON meeting_attendance_log(user_id, timestamp);
