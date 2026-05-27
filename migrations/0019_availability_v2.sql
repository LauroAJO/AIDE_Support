-- v1.9.8 — Disponibilidade semanal recorrente + Horário planejado diário.
-- Substitui o campo único `availability.work_*` por um modelo mais granular
-- que suporta múltiplos blocos por dia (manhã + tarde, etc.) e um cronograma
-- semanal específico por data.

CREATE TABLE IF NOT EXISTS weekly_availability (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  day_of_week INTEGER NOT NULL,   -- 0=Sun, 1=Mon ... 6=Sat
  start_time TEXT NOT NULL,        -- "09:00"
  end_time TEXT NOT NULL,          -- "17:00"
  active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, day_of_week, start_time)
);

CREATE TABLE IF NOT EXISTS daily_work_schedule (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  work_date TEXT NOT NULL,         -- "YYYY-MM-DD"
  start_time TEXT NOT NULL,        -- "09:00"
  end_time TEXT NOT NULL,          -- "17:00"
  notes TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, work_date, start_time)
);

CREATE INDEX IF NOT EXISTS idx_weekly_availability_user ON weekly_availability(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_schedule_user_date ON daily_work_schedule(user_id, work_date);
