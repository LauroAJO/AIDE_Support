-- v1.9.9 — slot_type em weekly_availability ('available' | 'planned').
-- SQLite não permite remover constraints via ALTER, então recriamos a tabela
-- para que (user_id, slot_type, day_of_week, start_time) seja UNIQUE —
-- assim um mesmo usuário pode ter um slot 'available' E um 'planned' no
-- mesmo horário do mesmo dia.

CREATE TABLE IF NOT EXISTS weekly_availability_new (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  slot_type TEXT NOT NULL DEFAULT 'available',
  day_of_week INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, slot_type, day_of_week, start_time)
);

INSERT INTO weekly_availability_new
  (id, user_id, slot_type, day_of_week, start_time, end_time, active, created_at, updated_at)
SELECT id, user_id, 'available', day_of_week, start_time, end_time, active, created_at, updated_at
FROM weekly_availability;

DROP TABLE weekly_availability;
ALTER TABLE weekly_availability_new RENAME TO weekly_availability;

CREATE INDEX IF NOT EXISTS idx_weekly_availability_user ON weekly_availability(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_availability_type ON weekly_availability(user_id, slot_type);
