-- The user's own fix for a trip's mode and public transport lines ("Fix this
-- trip" on the timeline). Keyed by time range, not trip id: trips are rebuilt
-- whenever points are reprocessed. Applied on read to any trip it overlaps for
-- at least 70 % of that trip's duration (src/lib/corrections.ts).
-- legs: ordered [{kind, line, fromStop, toStop, startedAt, endedAt, distance}],
-- times and stops estimated when the correction was made; [] = none.
-- diagnostics: what the points and the matcher showed for that trip then
-- (src/lib/transit/diagnose.ts); no coordinates.
CREATE TABLE trip_corrections (
  id          bigserial PRIMARY KEY,
  user_id     bigint      NOT NULL REFERENCES users ON DELETE CASCADE,
  started_at  timestamptz NOT NULL,
  ended_at    timestamptz NOT NULL CHECK (ended_at >= started_at),
  mode        text        NOT NULL,
  legs        jsonb       NOT NULL DEFAULT '[]',
  diagnostics jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trip_corrections_user_time_idx ON trip_corrections (user_id, started_at, ended_at);

-- How many timetabled trips use each shape, so a line's rare variants (an M2
-- that starts in Kivenlahti a few times a day) don't count as its route.
-- Clearing the feed version makes the worker load the feed again to fill it in.
ALTER TABLE transit_shapes ADD COLUMN trips integer;
UPDATE transit_feeds SET version = NULL, checked_at = NULL;
