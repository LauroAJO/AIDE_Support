-- Notas de reunião persistidas em D1 (antes só em localStorage do navegador).
-- Uma linha por data (UNIQUE meeting_date): agenda + notas, sincronizadas entre
-- dispositivos. Servidas por GET/PUT /api/meeting/notes.
-- NOTA: numerado 0028 por sequência — o prompt pedia "0027", mas
-- 0027_hub_items.sql já existe. O nome lógico é meeting_notes.
CREATE TABLE IF NOT EXISTS meeting_notes (
  id TEXT PRIMARY KEY,
  meeting_date TEXT NOT NULL,
  agenda TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(meeting_date)
);

CREATE INDEX IF NOT EXISTS idx_meeting_notes_date ON meeting_notes(meeting_date);
