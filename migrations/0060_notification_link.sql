-- 0060 — Deep-link fields para notificações (Bloco A do redesign de notificações)
--
-- NOTA sobre o número (deviation reportada ao usuário): o spec pedia
-- "0058_notification_link.sql", mas 0057, 0058 e 0059 já foram usados nesta
-- mesma sessão de desenvolvimento (drive_hidden, market_org_geo,
-- meeting_attendance). Este arquivo assume o próximo número livre, 0060.
--
-- entity_type/entity_id permitem reconstruir de qual registro concreto a
-- notificação fala (ex.: 'opportunity'/<id>), mesmo quando não é uma
-- tarefa/nota (que já têm task_id/note_id). `link` guarda o caminho pronto
-- (ex.: '/career?opportunity=<id>') para o clique não depender de um mapa de
-- rotas no frontend ficar sincronizado com cada tipo de notificação.
ALTER TABLE notifications ADD COLUMN entity_type TEXT DEFAULT '';
ALTER TABLE notifications ADD COLUMN entity_id TEXT DEFAULT '';
ALTER TABLE notifications ADD COLUMN link TEXT DEFAULT '';
