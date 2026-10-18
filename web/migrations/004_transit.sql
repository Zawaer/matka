-- Public transport line matching (GTFS feeds, e.g. HSL). Trips are matched
-- against the routes' shapes in the background; a match becomes one or more
-- legs ("bus 159 Leppävaara -> Kamppi", then "metro M1"). See docs/DECISIONS.md.

ALTER TABLE users ADD COLUMN transit_lines boolean NOT NULL DEFAULT true;

CREATE TABLE transit_feeds (
  id          text PRIMARY KEY,          -- e.g. "hsl"
  url         text NOT NULL,
  version     text,                      -- Last-Modified / ETag of the loaded file
  loaded_at   timestamptz,
  checked_at  timestamptz
);

CREATE TABLE transit_routes (
  feed_id     text NOT NULL REFERENCES transit_feeds ON DELETE CASCADE,
  route_id    text NOT NULL,
  short_name  text NOT NULL,             -- "159", "M1", "4"
  long_name   text,
  kind        text NOT NULL,             -- bus | tram | metro | train | boat
  PRIMARY KEY (feed_id, route_id)
);

-- Shapes are kept across feed updates (seen_at), so trips from before a route
-- change still match the geometry that existed then.
CREATE TABLE transit_shapes (
  feed_id     text NOT NULL REFERENCES transit_feeds ON DELETE CASCADE,
  shape_id    text NOT NULL,
  route_id    text NOT NULL,
  headsign    text,
  path        geography(LineString, 4326) NOT NULL,
  seen_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feed_id, shape_id)
);

CREATE TABLE transit_stops (
  feed_id     text NOT NULL REFERENCES transit_feeds ON DELETE CASCADE,
  stop_id     text NOT NULL,
  name        text NOT NULL,
  geom        geography(Point, 4326) NOT NULL,
  PRIMARY KEY (feed_id, stop_id)
);
CREATE INDEX transit_stops_geom_idx ON transit_stops USING gist (geom);

CREATE TABLE trip_legs (
  trip_id     bigint NOT NULL REFERENCES trips ON DELETE CASCADE,
  seq         smallint NOT NULL,
  kind        text NOT NULL,             -- bus | tram | metro | train | boat
  lines       text[] NOT NULL,           -- candidates on a shared corridor, best first
  from_stop   text,
  to_stop     text,
  started_at  timestamptz NOT NULL,
  ended_at    timestamptz NOT NULL,
  distance_m  real NOT NULL,
  PRIMARY KEY (trip_id, seq)
);

-- Which feed data a trip was last matched against (NULL = not yet).
ALTER TABLE trips ADD COLUMN transit_checked text;
CREATE INDEX trips_transit_unchecked_idx ON trips (user_id) WHERE transit_checked IS NULL;
