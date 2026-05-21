-- Phase 3 — Google Calendar & Drive caches.

CREATE TABLE IF NOT EXISTS calendar_events_cache (
  id TEXT PRIMARY KEY,
  google_event_id TEXT UNIQUE,
  user_id TEXT REFERENCES users(id),
  calendar_id TEXT,
  title TEXT,
  description TEXT,
  start_datetime TEXT,
  end_datetime TEXT,
  all_day INTEGER DEFAULT 0,
  location TEXT,
  attendees TEXT DEFAULT '[]',
  color TEXT,
  synced_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS drive_items_cache (
  id TEXT PRIMARY KEY,
  google_file_id TEXT UNIQUE,
  user_id TEXT REFERENCES users(id),
  name TEXT,
  mime_type TEXT,
  web_view_link TEXT,
  icon_link TEXT,
  modified_time TEXT,
  size TEXT,
  parent_id TEXT,
  is_favorite INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  synced_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_drive_fav ON drive_items_cache(user_id, is_favorite);
