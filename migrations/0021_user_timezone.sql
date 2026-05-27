-- v1.9.11 — Fuso horário por usuário (IANA, ex. "Europe/Amsterdam").
-- Quando NULL, o frontend usa o fuso detectado pelo browser.
-- Usado para converter blocos do calendário entre Alice (BR) e Lauro (NL).

ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT NULL;
