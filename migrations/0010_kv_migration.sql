-- Move KV-backed deduplication into D1 (KV write limit is shared with Lifegame).
CREATE TABLE IF NOT EXISTS dedup_log (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_dedup_key ON dedup_log(key);
CREATE INDEX IF NOT EXISTS idx_dedup_expires ON dedup_log(expires_at);
