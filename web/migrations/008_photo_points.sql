-- Photo locations from Immich fill gaps in the recorded history.
ALTER TABLE points DROP CONSTRAINT IF EXISTS points_source_check;
ALTER TABLE points ADD CONSTRAINT points_source_check CHECK (source IN ('device', 'import', 'photo'));
ALTER TABLE users ADD COLUMN photo_points boolean NOT NULL DEFAULT true;
