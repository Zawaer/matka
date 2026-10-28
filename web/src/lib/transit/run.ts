import { correctionJoin } from "../corrections";
import { q, tx } from "../db";
import { configuredFeeds } from "./feed";
import { MATCHER_VERSION, TransitIndex, matchLegs, type Shape, type Stop, type TransitKind } from "./match";

export { MATCHER_VERSION };
const SKIP_MODES = new Set(["walking", "flying", "stationary"]);

let cache: { key: string; index: TransitIndex } | null = null;

export async function loadIndex(): Promise<TransitIndex | null> {
  const [{ key }] = await q<{ key: string | null }>(
    `SELECT string_agg(id || ':' || coalesce(version, ''), ',' ORDER BY id) AS key FROM transit_feeds WHERE loaded_at IS NOT NULL`,
  );
  if (!key) return null;
  if (cache?.key === key) return cache.index;
  const shapes = await q<Shape>(
    `SELECT s.feed_id || '/' || s.shape_id AS key, r.kind, r.short_name AS line,
            ST_AsGeoJSON(s.path::geometry)::json -> 'coordinates' AS coords, s.trips
     FROM transit_shapes s JOIN transit_routes r USING (feed_id, route_id)`,
  );
  const stops = await q<Stop>(`SELECT name, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon FROM transit_stops`);
  const t = Date.now();
  cache = { key, index: new TransitIndex(shapes, stops) };
  console.log(`[transit] index of ${shapes.length} shapes and ${stops.length} stops built in ${Date.now() - t} ms`);
  return cache.index;
}

let requeued = false;

/**
 * Matches up to `limit` not-yet-checked trips of users who have line matching
 * on, newest first. Returns how many trips it looked at.
 */
export async function matchPendingTrips(limit = 200): Promise<number> {
  if (configuredFeeds().length === 0) return 0;
  const index = await loadIndex();
  if (!index) return 0;
  if (!requeued) {
    // Once per process: trips matched by an older matcher are matched again.
    await q(`UPDATE trips SET transit_checked = NULL WHERE transit_checked IS NOT NULL AND transit_checked <> $1`, [MATCHER_VERSION]);
    requeued = true;
  }
  const trips = await q<{ id: string; user_id: string; mode: string; started_at: Date; ended_at: Date }>(
    `SELECT t.id, t.user_id, t.mode, t.started_at, t.ended_at
     FROM trips t JOIN users u ON u.id = t.user_id
     WHERE t.transit_checked IS NULL AND u.transit_lines
     ORDER BY t.started_at DESC LIMIT $1`,
    [limit],
  );
  let legsFound = 0;
  for (const trip of trips) {
    try {
      let legs: ReturnType<typeof matchLegs> = [];
      if (!SKIP_MODES.has(trip.mode)) {
        const pts = await q<{ ts: number; lat: number; lon: number; accuracy: number | null }>(
          `SELECT extract(epoch FROM ts)::float8 AS ts, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon, accuracy
           FROM points WHERE user_id = $1 AND ts BETWEEN $2 AND $3 ORDER BY ts`,
          [trip.user_id, trip.started_at, trip.ended_at],
        );
        if (pts.length >= 2 && pts.some((p) => index.covers(p.lat, p.lon))) legs = matchLegs(index, pts);
      }
      await tx(async (c) => {
        await c.query(`DELETE FROM trip_legs WHERE trip_id = $1`, [trip.id]);
        for (const [seq, l] of legs.entries()) {
          await c.query(
            `INSERT INTO trip_legs (trip_id, seq, kind, lines, from_stop, to_stop, started_at, ended_at, distance_m)
             VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7), to_timestamp($8), $9)`,
            [trip.id, seq, l.kind, l.lines, l.fromStop, l.toStop, l.start, l.end, l.distanceM],
          );
        }
        await c.query(`UPDATE trips SET transit_checked = $2 WHERE id = $1`, [trip.id, MATCHER_VERSION]);
      });
      legsFound += legs.length;
    } catch (err) {
      // Usually the trip was rebuilt meanwhile; its replacement gets matched next time.
      console.warn(`[transit] trip ${trip.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (trips.length) console.log(`[transit] matched ${trips.length} trips, ${legsFound} legs`);
  return trips.length;
}

export type LegRow = {
  trip_id: string;
  kind: TransitKind;
  lines: string[];
  from_stop: string | null;
  to_stop: string | null;
  started_at: Date;
  ended_at: Date;
  distance_m: number;
};

/**
 * The mode to show for a trip: the main transit kind when matched legs cover at
 * least half of it, else the speed-based guess.
 */
export function displayMode(mode: string, distanceM: number, legs: Pick<LegRow, "kind" | "distance_m">[]): string {
  if (legs.length === 0) return mode;
  const covered = legs.reduce((a, l) => a + l.distance_m, 0);
  if (covered < 0.5 * distanceM) return mode;
  const byKind = new Map<string, number>();
  for (const l of legs) byKind.set(l.kind, (byKind.get(l.kind) ?? 0) + l.distance_m);
  return [...byKind].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * displayMode in SQL, for queries over trips aliased `t`: add displayModeJoin(flag)
 * and select displayModeSql(flag), flag being the SQL for "line matching on"
 * (the legs aren't read when it is off). The user's own correction of the
 * trip (lib/corrections.ts) comes first, whatever the flag.
 * Sums leg distance per kind like displayMode; ties go to the kind seen first
 * (lowest seq), as displayMode's stable sort over legs in seq order does.
 */
export const displayModeJoin = (flag: string) => `LEFT JOIN LATERAL (
       SELECT sum(d) AS covered, (array_agg(kind ORDER BY d DESC, first_seq))[1] AS kind
       FROM (SELECT kind, sum(distance_m::float8) AS d, min(seq) AS first_seq
             FROM trip_legs WHERE trip_id = t.id GROUP BY kind) k
     ) l ON ${flag}
     ${correctionJoin("tcorr")}`;
export const displayModeSql = (flag: string) =>
  `COALESCE(tcorr.mode, CASE WHEN ${flag} AND l.covered >= 0.5 * t.distance_m THEN l.kind ELSE t.mode END)`;

/** Legs of these trips, grouped by trip id (empty when none). */
export async function legsByTrip(tripIds: (string | number)[]): Promise<Map<string, LegRow[]>> {
  const out = new Map<string, LegRow[]>();
  if (tripIds.length === 0) return out;
  const rows = await q<LegRow>(
    `SELECT trip_id, kind, lines, from_stop, to_stop, started_at, ended_at, distance_m
     FROM trip_legs WHERE trip_id = ANY($1::bigint[]) ORDER BY trip_id, seq`,
    [tripIds.map(String)],
  );
  for (const r of rows) {
    const k = String(r.trip_id);
    const a = out.get(k);
    if (a) a.push(r);
    else out.set(k, [r]);
  }
  return out;
}
