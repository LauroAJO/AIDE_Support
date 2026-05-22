-- 0011_improvements.sql — AIDE v1.1.0
-- Favorite tasks, Google Calendar event linkage, and Drive attachments.

ALTER TABLE tasks ADD COLUMN favorited INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN google_event_id TEXT;
ALTER TABLE tasks ADD COLUMN drive_attachments TEXT DEFAULT '[]';
