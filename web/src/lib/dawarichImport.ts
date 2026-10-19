import pg from "pg";
import { q, tx } from "./db";
import { insertIntoGaps } from "./gapFill";
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
 *
 * After that, a top-up (topUpDawarich) copies points Dawarich recorded since
 * (id > cursor) at most once a day, or when asked from Settings. Unlike the
 * first import it only fills gaps: once Matka records on its own, a point
 * within 10 min of one of Matka's (lib/gapFill.ts) is skipped. Top-up points
 * are source 'import' like the first import's: the same Dawarich history, so
 * they don't count against each other, and removing or re-checking "what
 * came from Dawarich" stays one query.
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

type Source = {
  read: <T extends pg.QueryResultRow>(sql: string, params?: unknown[]) => Promise<T[]>;
  /** WHERE clause for the points to copy ($1 = Dawarich user id), or null when it can't be decided yet. */
  where: string | null;
  dUser: string;
  end: () => Promise<void>;
};

/** Read-only connection to Dawarich, and which of its points are ours. */
async function openDawarich(url: string): Promise<Source> {
  const src = new pg.Client({ connectionString: url, options: "-c default_transaction_read_only=on" });
  await src.connect();
  const end = () => src.end().catch(() => {});
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
        return { read, where: null, dUser: "", end };
      }
      dUser = String(du[0].user_id);
    }
    const hasAnomaly =
      (await read(`SELECT 1 FROM information_schema.columns WHERE table_name = 'points' AND column_name = 'anomaly'`)).length > 0;
    const where = `user_id = $1 AND lonlat IS NOT NULL ${hasAnomaly ? "AND anomaly IS NOT TRUE" : ""}`;
    return { read, where, dUser, end };
  } catch (err) {
    await end();
    throw err;
  }
}

type DRow = { id: string; ts: string; lon: number; lat: number; accuracy: number | null; altitude: number | null; battery: number | null };

const page = (s: Source, cursor: number) =>
  s.read<DRow>(
    `SELECT id, timestamp AS ts, ST_X(lonlat::geometry) AS lon, ST_Y(lonlat::geometry) AS lat, accuracy, altitude, battery
     FROM points WHERE ${s.where} AND id > $2 ORDER BY id LIMIT ${PAGE}`,
    [s.dUser, cursor],
  );

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

  const src = await openDawarich(url);
  try {
    if (!src.where) return false;
    const [{ n: total }] = await src.read<{ n: string }>(`SELECT count(*) n FROM points WHERE ${src.where}`, [src.dUser]);

    let cursor = Number(existing?.cursor ?? 0);
    let seen = Number(existing?.seen ?? 0);
    let inserted = Number(existing?.inserted ?? 0);
    if (!existing) {
      await q(`INSERT INTO import_state (source, user_id, total) VALUES ($1, $2, $3)`, [SOURCE, userId, total]);
      console.log(`[import] dawarich: starting, ${total} points from Dawarich user ${src.dUser}`);
    } else {
      console.log(`[import] dawarich: resuming after point ${cursor} (${seen}/${total} read so far)`);
    }

    for (;;) {
      const rows = await page(src, cursor);
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
    await src.end();
  }
}

// ---- Top-up ---------------------------------------------------------------

const TOPUP_SOURCE = "dawarich:topup";
const TOPUP_EVERY_H = 24;
/** Existing points that don't count as "Matka already recorded that time" for a Dawarich point. */
const TOPUP_NOT_RECORDED = ["import", "photo"];

export type TopUpResult = {
  /** New Dawarich points read (id > cursor). */
  read: number;
  inserted: number;
  /** Skipped: Matka recorded within 10 min. */
  covered: number;
  /** Skipped: a point at that second was already there. */
  duplicate: number;
  /** Epoch seconds of the earliest/latest point added. */
  from: number | null;
  to: number | null;
  at: string;
  error?: string;
};

export type DawarichStatus = {
  /** The first import finished (top-ups run). */
  ready: boolean;
  lastCheck: string | null;
  last: TopUpResult | null;
};

let toppingUp = false;

/** For Settings: null when Dawarich isn't configured or its history goes to someone else. */
export async function dawarichStatus(userId: string): Promise<DawarichStatus | null> {
  if (!process.env.DAWARICH_IMPORT_URL?.trim()) return null;
  const rows = await q<{ source: string; user_id: string; finished_at: Date | null; updated_at: Date; detail: TopUpResult | null }>(
    `SELECT source, user_id, finished_at, updated_at, detail FROM import_state WHERE source IN ($1, $2)`,
    [SOURCE, TOPUP_SOURCE],
  );
  const main = rows.find((r) => r.source === SOURCE);
  const top = rows.find((r) => r.source === TOPUP_SOURCE);
  if (main && String(main.user_id) !== String(userId)) return null;
  if (!main && process.env.DAWARICH_IMPORT_TO?.trim() && (await targetUser()) !== String(userId)) return null;
  return { ready: !!main?.finished_at, lastCheck: top?.updated_at.toISOString() ?? null, last: top?.detail ?? null };
}

/**
 * Copies Dawarich points newer than the cursor into gaps. Without `force`
 * only when the last check is TOPUP_EVERY_H old (the worker calls this every
 * tick). Returns null when it didn't run.
 */
export async function topUpDawarich({ force = false }: { force?: boolean } = {}): Promise<TopUpResult | null> {
  const url = process.env.DAWARICH_IMPORT_URL?.trim();
  if (!url || toppingUp) return null;
  const [main] = await q<State>(`SELECT * FROM import_state WHERE source = $1`, [SOURCE]);
  if (!main?.finished_at) return null;
  const userId = String(main.user_id);
  // Claim the run (also when it fails, so a broken Dawarich isn't retried every tick).
  const claimed = await q(
    `INSERT INTO import_state (source, user_id, finished_at) VALUES ($1, $2, now())
     ON CONFLICT (source) DO UPDATE SET updated_at = now(), finished_at = now()
       WHERE $3 OR import_state.updated_at < now() - make_interval(hours => $4)
     RETURNING source`,
    [TOPUP_SOURCE, userId, force, TOPUP_EVERY_H],
  );
  if (claimed.length === 0) return null;

  toppingUp = true;
  const r: TopUpResult = { read: 0, inserted: 0, covered: 0, duplicate: 0, from: null, to: null, at: new Date().toISOString() };
  let cursor = Number(main.cursor);
  const startCursor = cursor;
  const save = () =>
    q(
      `UPDATE import_state SET detail = $2, seen = seen + $3, inserted = inserted + $4, note = $5, updated_at = now()
       WHERE source = $1`,
      [TOPUP_SOURCE, r, r.read, r.inserted, r.error ?? null],
    );
  try {
    const src = await openDawarich(url);
    try {
      if (!src.where) throw new Error("Dawarich has points for several users; set DAWARICH_IMPORT_USER");
      for (;;) {
        const rows = await page(src, cursor);
        if (rows.length === 0) break;
        const next = Number(rows[rows.length - 1].id);
        const res = await tx(async (c) => {
          const res = await insertIntoGaps(
            c,
            userId,
            "import",
            TOPUP_NOT_RECORDED,
            rows.map((p) => ({ ts: Number(p.ts), lat: p.lat, lon: p.lon, accuracy: p.accuracy, altitude: p.altitude, battery: p.battery })),
          );
          await c.query(`UPDATE import_state SET cursor = GREATEST(cursor, $2), updated_at = now() WHERE source = $1`, [SOURCE, next]);
          return res;
        });
        cursor = next;
        r.read += rows.length;
        r.inserted += res.inserted;
        r.covered += res.covered;
        r.duplicate += res.duplicate;
        if (res.minTs != null) r.from = r.from == null ? res.minTs : Math.min(r.from, res.minTs);
        if (res.maxTs != null) r.to = r.to == null ? res.maxTs : Math.max(r.to, res.maxTs);
      }
    } finally {
      await src.end();
    }
    console.log(
      `[import] dawarich top-up: ${r.read} new points in Dawarich after #${startCursor}; ` +
        `${r.inserted} added to gaps, ${r.covered} skipped (Matka recorded within 10 min), ${r.duplicate} already present` +
        (r.read ? `; cursor now #${cursor}` : ""),
    );
  } catch (err) {
    r.error = err instanceof Error ? err.message : String(err);
    console.error(`[import] dawarich top-up failed after ${r.read} points, will retry in ${TOPUP_EVERY_H} h:`, r.error);
  } finally {
    toppingUp = false;
    await save().catch(() => {});
  }
  return r;
}
