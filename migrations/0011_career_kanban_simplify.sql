-- II.1.7.0 — Kanban de Carreira simplifica para 2 colunas ativas (Mapear/
-- Analisar), pedido pelo Lauro. Cards que já estavam em Preparando/Aplicada/
-- Em Processo (candidatura em andamento) migram para o novo status
-- 'analisar' — decisão explícita do Lauro (mover tudo para Analisar em vez
-- de manter as 3 colunas antigas visíveis como "histórico congelado").
--
-- Nada é apagado: o histórico de mudança de status continua em
-- opportunity_audit_log e no log embutido em `notes` (ver parseStatusLog em
-- careerShared.jsx) — só o status ATUAL do card muda.
--
-- 'to_organize', 'dead' e 'mapped' não são tocados por esta migration.
UPDATE career_opportunities
   SET status = 'analisar', updated_at = unixepoch()
 WHERE status IN ('preparing', 'applied', 'in_process');
