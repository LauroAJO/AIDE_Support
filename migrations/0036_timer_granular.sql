-- 0036_timer_granular.sql
-- Consistência do grid granular: a feature "timer" nunca teve linhas em
-- preset_granular_permissions (0024 não a incluiu). Hoje o timer é liberado
-- para TODOS os usuários — nenhum endpoint chama canDo(..., 'timer', ...),
-- então a ausência dessas linhas é inócua. Semeamos allowed=1 em ambos os
-- presets como salvaguarda: se algum dia um gate `canDo(user.granular,
-- 'timer', 'use')` for adicionado, os usuários já terão acesso (fail-open por
-- dado) em vez de serem bloqueados por um grid vazio (fail-closed).

INSERT OR IGNORE INTO preset_granular_permissions (id, preset_id, feature, action, allowed) VALUES
('pgp_f_tm1', 'preset_fixed',    'timer', 'use', 1),
('pgp_e_tm1', 'preset_external', 'timer', 'use', 1);
