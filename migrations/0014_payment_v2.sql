-- Payment v2 — multi-currency (BRL primary, EUR derived) + exchange rates.
-- NOTE: ALTER ... ADD COLUMN is NOT idempotent in SQLite. If these columns
-- already exist, comment out the ALTER lines before re-running.

ALTER TABLE availability ADD COLUMN currency TEXT DEFAULT 'BRL';
ALTER TABLE availability ADD COLUMN hourly_rate_brl REAL DEFAULT 0;

CREATE TABLE IF NOT EXISTS exchange_rates (
  id TEXT PRIMARY KEY DEFAULT 'brl_eur',
  rate REAL NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);
