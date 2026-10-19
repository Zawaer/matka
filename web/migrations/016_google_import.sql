-- Google Timeline imports (lib/google/import.ts): points that fill gaps in
-- the recorded history get their own source, so they can be removed again.
ALTER TABLE points DROP CONSTRAINT IF EXISTS points_source_check;
ALTER TABLE points ADD CONSTRAINT points_source_check CHECK (source IN ('device', 'import', 'photo', 'google'));
-- Per-import details shown in Settings (status, progress, counts, date range).
ALTER TABLE import_state ADD COLUMN IF NOT EXISTS detail jsonb;
-- For "Remove imported Google points".
CREATE INDEX IF NOT EXISTS points_google_idx ON points (user_id, ts) WHERE source = 'google';
