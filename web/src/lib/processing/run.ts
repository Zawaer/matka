import type { PoolClient } from "pg";
import { pool } from "../db";
import { Detector, STAY_RADIUS_M, type DPoint, type Output } from "./detect";
import { isFerry } from "./ferry";

// Incremental processing for one user. Everything from processing_state.dirty_from
// onward is rebuilt: we rewind to the start of the last visit that began before
// it (so a visit in progress is re-detected whole), delete derived visits/trips
// from there, and stream points through the Detector.
//
// Places persist across rebuilds (they carry user renames); a visit snaps to
// the nearest existing place within PLACE_MATCH_M or creates a new one.

const PLACE_MATCH_M = STAY_RADIUS_M;
const PAGE = 20_000;
const INGEST_LOCK = "matka_ingest";

type PointRow = {
  id: string;
  ts: number;
  lat: number;
  lon: number;
  accuracy: number | null;
  speed: number | null;
};

/** Processes one user if dirty. Returns the number of points processed. */
export async function processUser(userId: string): Promise<number> {
  const c = await pool().connect();
  try {
    // Wait for in-flight inserts (they hold the shared lock), then read the
    // dirty mark and fix the high-water mark under that same lock, so no
    // insert can slip between the two. Points above maxId are left dirty for
    // the next run.
    await c.query("BEGIN");
    await c.query(`SELECT pg_advisory_xact_lock(hashtext($1), $2::int)`, [INGEST_LOCK, userId]);
    const snap = (
      await c.query<{ dirty_from: Date | null; max_id: string | null }>(
        `SELECT (SELECT dirty_from FROM processing_state WHERE user_id = $1) AS dirty_from,
                (SELECT max(id) FROM points WHERE user_id = $1) AS max_id`,
        [userId],
      )
    ).rows[0];
    await c.query("COMMIT");
    const dirtyFrom = snap.dirty_from;
    const maxId = snap.max_id;
    if (!dirtyFrom || maxId == null) return 0;

    await c.query("BEGIN");
    const from = (
      await c.query<{ from: Date }>(
        `SELECT COALESCE(
           (SELECT max(started_at) FROM visits WHERE user_id = $1 AND started_at <= $2),
           (SELECT min(ts) FROM points WHERE user_id = $1)) AS "from"`,
        [userId, dirtyFrom],
      )
    ).rows[0].from;

    await c.query(`DELETE FROM visits WHERE user_id = $1 AND started_at >= $2`, [userId, from]);
    await c.query(`DELETE FROM trips WHERE user_id = $1 AND (started_at >= $2 OR ended_at > $2)`, [
      userId,
      from,
    ]);

    const det = new Detector();
    let n = 0;
    let afterTs = new Date(from.getTime() - 1);
    for (;;) {
      const rows = (
        await c.query<PointRow>(
          `SELECT id, extract(epoch FROM ts)::float8 AS ts,
                  ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon, accuracy, speed, activity
           FROM points
           WHERE user_id = $1 AND ts > $2 AND id <= $3
           ORDER BY ts LIMIT $4`,
          [userId, afterTs, maxId, PAGE],
        )
      ).rows;
      for (const r of rows) det.push(r as DPoint);
      n += rows.length;
      await write(c, userId, det.drain());
      if (rows.length < PAGE) break;
      afterTs = new Date(rows[rows.length - 1].ts * 1000);
    }
    await write(c, userId, det.finish());

    // Places nobody visits any more and the user never named are noise.
    await c.query(
      `DELETE FROM places p WHERE p.user_id = $1 AND p.custom_name IS NULL
         AND NOT EXISTS (SELECT 1 FROM visits v WHERE v.place_id = p.id)`,
      [userId],
    );
    // Only points that arrived after our high-water mark are still dirty.
    // Re-take the ingest lock so uploads in flight commit first and their
    // points (and dirty marks) are visible to this statement.
    await c.query(`SELECT pg_advisory_xact_lock(hashtext($1), $2::int)`, [INGEST_LOCK, userId]);
    await c.query(
      `UPDATE processing_state
          SET dirty_from = (SELECT min(ts) FROM points WHERE user_id = $1 AND id > $2),
              processed_at = now()
        WHERE user_id = $1`,
      [userId, maxId],
    );
    await c.query("COMMIT");
    return n;
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}

async function write(c: PoolClient, userId: string, out: Output[]) {
  for (const o of out) {
    if (o.kind === "stay") {
      const s = o.stay;
      const point = `ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography`;
      const placeId =
        (
          await c.query<{ id: string }>(
            `SELECT id FROM places WHERE user_id = $1 AND ST_DWithin(geom, ${point}, $4)
             ORDER BY geom <-> ${point} LIMIT 1`,
            [userId, s.lon, s.lat, PLACE_MATCH_M],
          )
        ).rows[0]?.id ??
        (
          await c.query<{ id: string }>(
            `INSERT INTO places (user_id, geom) VALUES ($1, ${point}) RETURNING id`,
            [userId, s.lon, s.lat],
          )
        ).rows[0].id;
      await c.query(
        `INSERT INTO visits (user_id, place_id, started_at, ended_at, geom, point_count)
         VALUES ($1, $2, to_timestamp($3), to_timestamp($4), ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, $7)`,
        [userId, placeId, s.start, s.end, s.lon, s.lat, s.count],
      );
    } else {
      const t = o.trip;
      await c.query(
        `INSERT INTO trips (user_id, started_at, ended_at, distance_m, mode, path, point_count)
         VALUES ($1, to_timestamp($2), to_timestamp($3), $4, $5, ST_GeomFromGeoJSON($6)::geography, $7)`,
        [
          userId,
          t.start,
          t.end,
          t.distance,
          isFerry(t) ? "boat" : t.mode,
          JSON.stringify({ type: "LineString", coordinates: t.path }),
          t.count,
        ],
      );
    }
  }
}
