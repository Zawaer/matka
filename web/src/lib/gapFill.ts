import type { PoolClient } from "pg";

/**
 * Gap-filling insert shared by history imports (Google Timeline, Dawarich
 * top-up). A fix is only added where Matka has no recorded fix of its own
 * within GAP_FILL_WINDOW_S: the recorder already covers that time, and
 * mixing two sources' fixes there only adds jitter. Fixes are deduplicated on
 * (user_id, ts) like everywhere else, so a re-run adds nothing twice.
 *
 * `notRecorded` lists the existing sources that do NOT count as "Matka
 * already has that time"; every other source does. Always the importing
 * source itself (its own earlier fixes are the same history) and photo
 * locations (one fix per photo is not a track; letting a photo veto ten
 * minutes on either side would punch holes in it).
 */
export const GAP_FILL_WINDOW_S = 10 * 60;

export type FillFix = {
  ts: number;
  lat: number;
  lon: number;
  accuracy: number | null;
  altitude?: number | null;
  speed?: number | null;
  battery?: number | null;
  activity?: string | null;
};

export type FillResult = {
  /** Fixes in the batch with a valid position (distinct seconds). */
  candidates: number;
  inserted: number;
  /** Skipped: a recorded fix within the window. */
  covered: number;
  /** Skipped: a fix at that exact second was already there. */
  duplicate: number;
  /** Earliest and latest inserted, epoch seconds. */
  minTs: number | null;
  maxTs: number | null;
};

/**
 * Inserts `fixes` with source `source` into gaps, inside the caller's
 * transaction, and marks the user's history dirty from the earliest insert
 * (same lock and dirty-mark protocol as ingest, see processing/run.ts).
 */
export async function insertIntoGaps(
  c: PoolClient,
  userId: string,
  source: string,
  notRecorded: readonly string[],
  fixes: FillFix[],
  windowS = GAP_FILL_WINDOW_S,
): Promise<FillResult> {
  const empty: FillResult = { candidates: 0, inserted: 0, covered: 0, duplicate: 0, minTs: null, maxTs: null };
  if (fixes.length === 0) return empty;
  await c.query(`SELECT pg_advisory_xact_lock_shared(hashtext('matka_ingest'), $1::int)`, [userId]);
  const { rows } = await c.query<{ candidates: string; covered: string; inserted: string; min_ts: string | null; max_ts: string | null }>(
    `WITH f AS (
       SELECT DISTINCT ON (ts) * FROM unnest($3::int8[], $4::float8[], $5::float8[], $6::real[], $7::real[], $8::real[], $9::int2[], $10::text[])
         AS f(ts, lat, lon, accuracy, altitude, speed, battery, activity)
       WHERE lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180
       ORDER BY ts
     ), c AS (
       SELECT f.*, EXISTS (
         SELECT 1 FROM points p
         WHERE p.user_id = $1 AND p.source <> ALL($11::text[])
           AND p.ts BETWEEN to_timestamp(f.ts - $12) AND to_timestamp(f.ts + $12)
       ) AS covered
       FROM f
     ), ins AS (
       INSERT INTO points (user_id, source, ts, geom, accuracy, altitude, speed, battery, activity)
       SELECT $1, $2, to_timestamp(c.ts), ST_SetSRID(ST_MakePoint(c.lon, c.lat), 4326)::geography,
              c.accuracy, c.altitude, c.speed, CASE WHEN c.battery BETWEEN 0 AND 100 THEN c.battery END,
              CASE WHEN c.activity IN ('still', 'walking', 'running', 'on_bicycle', 'in_vehicle') THEN c.activity END
       FROM c WHERE NOT c.covered
       ON CONFLICT (user_id, ts) DO NOTHING
       RETURNING ts
     )
     SELECT (SELECT count(*) FROM c) AS candidates,
            (SELECT count(*) FROM c WHERE covered) AS covered,
            (SELECT count(*) FROM ins) AS inserted,
            (SELECT extract(epoch FROM min(ts))::int8 FROM ins) AS min_ts,
            (SELECT extract(epoch FROM max(ts))::int8 FROM ins) AS max_ts`,
    [
      userId,
      source,
      fixes.map((f) => Math.floor(f.ts)),
      fixes.map((f) => f.lat),
      fixes.map((f) => f.lon),
      fixes.map((f) => f.accuracy),
      fixes.map((f) => f.altitude ?? null),
      fixes.map((f) => f.speed ?? null),
      fixes.map((f) => (f.battery == null ? null : Math.round(f.battery))),
      fixes.map((f) => f.activity ?? null),
      notRecorded,
      windowS,
    ],
  );
  const r = rows[0];
  const candidates = Number(r.candidates);
  const covered = Number(r.covered);
  const inserted = Number(r.inserted);
  const res: FillResult = {
    candidates,
    inserted,
    covered,
    duplicate: candidates - covered - inserted,
    minTs: r.min_ts == null ? null : Number(r.min_ts),
    maxTs: r.max_ts == null ? null : Number(r.max_ts),
  };
  if (res.minTs != null) {
    await c.query(
      `INSERT INTO processing_state (user_id, dirty_from) VALUES ($1, to_timestamp($2))
       ON CONFLICT (user_id) DO UPDATE
         SET dirty_from = LEAST(COALESCE(processing_state.dirty_from, EXCLUDED.dirty_from), EXCLUDED.dirty_from)`,
      [userId, res.minTs],
    );
  }
  return res;
}
