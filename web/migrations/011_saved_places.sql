-- Saved places: the user labels a place by kind (home, a relative's home,
-- school, work, other) and may give it its own size. Visits whose centre falls
-- within radius_m of a saved place snap to it (lib/processing/run.ts), and
-- home/family places count as home for trips (lib/insights/awayTrips.ts).
-- kind NULL = not saved; radius_m NULL = the default STAY_RADIUS_M (100 m).
ALTER TABLE places
  ADD COLUMN IF NOT EXISTS kind text CHECK (kind IN ('home', 'family', 'school', 'work', 'other')),
  ADD COLUMN IF NOT EXISTS radius_m integer CHECK (radius_m BETWEEN 50 AND 1000),
  ADD COLUMN IF NOT EXISTS saved_at timestamptz;
CREATE INDEX IF NOT EXISTS places_saved_idx ON places (user_id) WHERE kind IS NOT NULL;
