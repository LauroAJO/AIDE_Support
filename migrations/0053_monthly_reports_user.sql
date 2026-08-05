-- v2.25.20 — Relatório mensal por usuário.
-- `monthly_reports` era desduplicado só por `month`, porque só existia uma
-- assistente. Com mais de uma, o relatório da Milene sobrescrevia o da Alice
-- no mesmo mês (mesma linha, dados de outra pessoa). Agora a chave lógica é
-- (month, user_id).
ALTER TABLE monthly_reports ADD COLUMN user_id TEXT REFERENCES users(id);

-- Linhas existentes foram todas geradas pelo caminho legado "sempre a primeira
-- assistente" — atribui a ela para não virarem relatórios órfãos.
UPDATE monthly_reports
   SET user_id = (
     SELECT id FROM users
      WHERE role = 'assistant_fixed' OR role = 'assistant'
      ORDER BY CASE role WHEN 'assistant_fixed' THEN 0 ELSE 1 END, rowid
      LIMIT 1
   )
 WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_monthly_reports_month_user
  ON monthly_reports(month, user_id);
