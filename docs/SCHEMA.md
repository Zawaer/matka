# Matka DB schema (Dawarich snapshot)

Local dev DB: `postgresql://matka:matka@localhost:5544/matka` (PostGIS). Single user, `user_id = 1`.
Data is read-only for Matka. Coordinates are stored as PostGIS `geography` in `lonlat`;
get lon/lat with `ST_X(lonlat::geometry)` / `ST_Y(lonlat::geometry)`.

## points  (113,871 rows)
Key cols: `id`, `lonlat geography`, `timestamp int4` (**Unix epoch seconds**), `altitude int4`,
`accuracy int4`, `velocity varchar` (string number), `battery int4`, `city varchar`, `country varchar`,
`track_id int8`, `visit_id int8`, `anomaly bool`, `user_id int8`.
- `city`/`country` populate as reverse-geocoding backfill drains (was 0; filling now).
- Filter noise with `accuracy < 100` when you need clean points; `anomaly = false` drops flagged jumps.

## visits  (1,007 rows)
`id`, `started_at`/`ended_at timestamp`, `duration int4` (**seconds**), `name varchar`,
`status int4`, `place_id int8`, `confidence int2`, `user_id int8`, `deleted_at timestamp`.
- Most are `name = 'Unknown Location'`, `place_id = NULL` until place geocoding runs.
- Exclude soft-deleted: `deleted_at IS NULL`.
- A visit has no own coords — derive from its points (`WHERE visit_id = v.id`) or its place.

## places  (0 rows today; fills after geocoding)
`id`, `name varchar`, `longitude`/`latitude numeric`, `lonlat geography`, `city`, `country`,
`source int4`, `geodata jsonb`, `reverse_geocoded_at timestamp`, `user_id int8`.
- **`geodata` holds the Photon reverse-geocode result** → OSM category lives here
  (e.g. `geodata->'properties'->>'osm_value'` = `cafe`, `school`, …). Use it for place category/icon.

## place_visits  (join)
`place_id`, `visit_id`.

## tracks  (697 rows) — automatic movement segments ("trips")
`id`, `start_at`/`end_at timestamp`, `distance int8` (**meters**), `duration int4` (**seconds**),
`avg_speed float8`, `dominant_mode int4`, elevation_{gain,loss,max,min} int4, `original_path geometry`, `user_id`.
- `dominant_mode` → see TRANSPORTATION_MODES below.

## track_segments  (7k rows)
`id`, `track_id`, `transportation_mode int4`, `distance int4` (m), `duration int4` (s),
`avg_speed float8`, `max_speed float8`, `path geometry`, `start_at`/`end_at timestamptz`, `confidence int4`.

## stats  (per year/month, precomputed)
`year`, `month`, `distance int8` (**meters/month**), `daily_distance jsonb`, `toponyms jsonb`, `h3_hex_ids jsonb`.
- Fast source for monthly distance totals & heatmap hints.

## TRANSPORTATION_MODES (int → key), authoritative from Dawarich
`0 unknown, 1 stationary, 2 walking, 3 running, 4 cycling, 5 driving, 6 bus, 7 train, 8 flying, 9 boat, 10 motorcycle`
Use `src/lib/modes.ts` (`modeFromInt`, `MODE_META`) — do not re-hardcode.

## Shared frontend libs (use these, don't duplicate)
- `src/lib/db.ts` → `q<T>(sql, params)`, `pool`, `USER_ID`.
- `src/lib/types.ts` → `GeoPoint`, `Visit`, `Place`, `TrackSummary`, `TimelineDay`, `TimelineItem`.
- `src/lib/format.ts` → `formatDuration`, `formatDistance`, `formatTime`, `formatDateLong`.
- `src/lib/modes.ts` → `ModeKey`, `MODE_META`, `modeFromInt`.
- Theme tokens (Tailwind utils): `bg-bg bg-surface bg-surface-2 border-border text-text text-muted text-primary text-accent`. Card helper class: `.mk-card`.
