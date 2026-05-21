-- Phase 6 — Lifegame bridge.

CREATE TABLE IF NOT EXISTS bridge_sync_log (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  status TEXT DEFAULT 'pending',
  payload TEXT,
  error TEXT,
  synced_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS bridge_config (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  lifegame_url TEXT DEFAULT '',
  bridge_secret TEXT DEFAULT '',
  sync_enabled INTEGER DEFAULT 0,
  last_sync_at INTEGER,
  updated_at INTEGER DEFAULT (unixepoch())
);
