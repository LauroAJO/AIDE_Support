CREATE TABLE IF NOT EXISTS bridge_mapping (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  lifegame_id TEXT NOT NULL,
  aide_id TEXT NOT NULL,
  aide_entity_type TEXT NOT NULL,
  match_status TEXT NOT NULL DEFAULT 'confirmed',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_by TEXT NOT NULL DEFAULT 'manual'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bridge_mapping_lg_id
ON bridge_mapping(entity_type, lifegame_id);

CREATE INDEX IF NOT EXISTS idx_bridge_mapping_aide_id
ON bridge_mapping(aide_entity_type, aide_id);
