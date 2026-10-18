import pg from "pg";
import { q, tx } from "./db";
import { KEY_OWNER_SUB, authMode } from "./keyAuth";

/**
 * One-time, automatic copy of location history from a Dawarich database.
 * Runs from the worker (so only one replica does it) and is safe on every boot:
 *
 * - Off unless DAWARICH_IMPORT_URL is set (a read-only role, e.g. matka_ro).
 *   Every read runs in a READ ONLY transaction: Matka never writes to Dawarich.
 * - Goes to DAWARICH_IMPORT_TO (email or OIDC sub). In key mode it defaults to
 *   the owner. If that user doesn't exist yet (OIDC: before the first sign-in)
 *   it waits and tries again on a later tick.
 * - Progress lives in import_state; each page commits its points together with
 *   the cursor, so an interrupted import resumes without gaps or duplicates.
 *   Points are deduplicated on (user_id, ts) anyway.
 * - Skips quietly once finished, and also when the user already has imported
 *   points from an earlier manual run of scripts/import-dawarich.mjs.
 */
const SOURCE = "dawarich";
const PAGE = 5000;

type State = { user_id: string; cursor: string; total: string | null; seen: string; inserted: string; finished_at: Date | null };

let lastWaitLog = 0;
const logWait = (msg: string) => {
  if (Date.now() - lastWaitLog < 60 * 60_000) return;
  lastWaitLog = Date.now();
  console.log(`[import] ${msg}`);
};

async function targetUser(): Promise<string | null> {
  const to = process.env.DAWARICH_IMPORT_TO?.trim();
  if (!to) {
    if (authMode() !== "key") {
      logWait("DAWARICH_IMPORT_URL is set but DAWARICH_IMPORT_TO isn't; set it to your email or OIDC sub");
      return null;
    }
    const [u] = await q<{ id: string }>(
      `INSERT INTO users (oidc_sub, name, timezone) VALUES ($1, 'Owner', $2)
       ON CONFLICT (oidc_sub) DO UPDATE SET oidc_sub = EXCLUDED.oidc_sub RETURNING id`,
      [KEY_OWNER_SUB, process.env.MATKA_DEFAULT_TIMEZONE ?? "Europe/Helsinki"],
    );
    return u.id;
  }
  const rows = await q<{ id: string }>(`SELECT id FROM users WHERE oidc_sub = $1 OR lower(email) = lower($1)`, [to]);
  if (rows.length !== 1) {
    logWait(`waiting for "${to}" to sign in to Matka once before importing Dawarich history`);
    return null;
  }
  return rows[0].id;
}

/** Returns true when it did any work (so the caller can process right after). */
export async function importDawarichIfNeeded(): Promise<boolean> {
  const url = process.env.DAWARICH_IMPORT_URL?.trim();
  if (!url) return false;

  const [existing] = await q<State>(`SELECT * FROM import_state WHERE source = $1`, [SOURCE]);
  if (existing?.finished_at) return false;

  const userId = existing?.user_id ?? (await targetUser());
  if (!userId) return false;

  if (!existing) {
    const [{ n }] = await q<{ n: string }>(`SELECT count(*) n FROM points WHERE user_id = $1 AND source = 'import'`, [userId]);
    if (Number(n) > 0) {
      await q(
        `INSERT INTO import_state (source, user_id, finished_at, note) VALUES ($1, $2, now(), $3)`,
        [SOURCE, userId, `skipped: ${n} imported points were already present`],
      );
      console.log(`[import] dawarich: skipped, ${n} imported points already present`);
      return false;
    }
  }

  const src = new pg.Client({ connectionString: url, options: "-c default_transaction_read_only=on" });
  await src.connect();
  try {
    const read = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => {
      await src.query("BEGIN READ ONLY");
      try {
        return (await src.query<T>(sql, params)).rows;
      } finally {
        await src.query("COMMIT");
      }
    };

    let dUser = process.env.DAWARICH_IMPORT_USER;
    if (!dUser) {
      const du = await read<{ user_id: string }>(`SELECT DISTINCT user_id FROM points LIMIT 2`);
      if (du.length !== 1) {
        logWait(`Dawarich has points for several users (${du.map((r) => r.user_id).join(", ")}); set DAWARICH_IMPORT_USER`);
        return false;
      }
      dUser = String(du[0].user_id);
    }
    const hasAnomaly =
      (await read(`SELECT 1 FROM information_schema.columns WHERE table_name = 'points' AND column_name = 'anomaly'`)).length > 0;
    const where = `user_id = $1 AND lonlat IS NOT NULL ${hasAnomaly ? "AND anomaly IS NOT TRUE" : ""}`;
    const [{ n: total }] = await read<{ n: string }>(`SELECT count(*) n FROM points WHERE ${where}`, [dUser]);

    let cursor = Number(existing?.cursor ?? 0);
    let seen = Number(existing?.seen ?? 0);
    let inserted = Number(existing?.inserted ?? 0);
    if (!existing) {
      await q(`INSERT INTO import_state (source, user_id, total) VALUES ($1, $2, $3)`, [SOURCE, userId, total]);
      console.log(`[import] dawarich: starting, ${total} points from Dawarich user ${dUser}`);
    } else {
      console.log(`[import] dawarich: resuming after point ${cursor} (${seen}/${total} read so far)`);
    }

    for (;;) {
      const rows = await read<{ id: string; ts: string; lon: number; lat: number; accuracy: number | null; altitude: number | null; battery: number | null }>(
        `SELECT id, timestamp AS ts, ST_X(lonlat::geometry) AS lon, ST_Y(lonlat::geometry) AS lat, accuracy, altitude, battery
         FROM points WHERE ${where} AND id > $2 ORDER BY id LIMIT ${PAGE}`,
        [dUser, cursor],
      );
      if (rows.length === 0) break;
      const next = Number(rows[rows.length - 1].id);
      const added = await tx(async (c) => {
        // Same lock and dirty-mark protocol as ingest (see processing/run.ts).
        await c.query(`SELECT pg_advisory_xact_lock_shared(hashtext('matka_ingest'), $1::int)`, [userId]);
        const res = await c.query(
          `INSERT INTO points (user_id, source, ts, geom, accuracy, altitude, battery)
           SELECT $1, 'import', to_timestamp(t.ts), ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326)::geography,
                  t.accuracy, t.altitude, CASE WHEN t.battery BETWEEN 0 AND 100 THEN t.battery END
           FROM unnest($2::int8[], $3::float8[], $4::float8[], $5::real[], $6::real[], $7::int2[])
             AS t(ts, lon, lat, accuracy, altitude, battery)
           WHERE t.lat BETWEEN -90 AND 90 AND t.lon BETWEEN -180 AND 180
           ON CONFLICT (user_id, ts) DO NOTHING`,
          [
            userId,
            rows.map((r) => Number(r.ts)),
            rows.map((r) => r.lon),
            rows.map((r) => r.lat),
            rows.map((r) => r.accuracy),
            rows.map((r) => r.altitude),
            rows.map((r) => (r.battery == null ? null : Math.round(r.battery))),
          ],
        );
        const minTs = new Date(Math.min(...rows.map((r) => Number(r.ts))) * 1000);
        await c.query(
          `INSERT INTO processing_state (user_id, dirty_from) VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE
             SET dirty_from = LEAST(COALESCE(processing_state.dirty_from, EXCLUDED.dirty_from), EXCLUDED.dirty_from)`,
          [userId, minTs],
        );
        await c.query(
          `UPDATE import_state SET cursor = $2, seen = seen + $3, inserted = inserted + $4, updated_at = now() WHERE source = $1`,
          [SOURCE, next, rows.length, res.rowCount ?? 0],
        );
        return res.rowCount ?? 0;
      });
      cursor = next;
      seen += rows.length;
      inserted += added;
      const pct = Number(total) > 0 ? Math.round((seen / Number(total)) * 100) : 100;
      console.log(`[import] dawarich: ${seen}/${total} read (${pct}%), ${inserted} new`);
    }
    await q(`UPDATE import_state SET finished_at = now(), updated_at = now() WHERE source = $1`, [SOURCE]);
    console.log(`[import] dawarich: done, ${inserted} new points (${seen - inserted} already present). Visits and trips follow shortly.`);
    return true;
  } finally {
    await src.end().catch(() => {});
  }
}
