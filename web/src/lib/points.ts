import type { PoolClient } from "pg";
import { tx } from "./db";
import type { Fix } from "./ingest";

/**
 * Inserts fixes, skipping ones whose (user, second) already exists, and marks
 * the user's history dirty from the earliest new fix so processing picks it
 * up. Returns how many were inserted.
 */
export async function insertPoints(
  userId: string,
  fixes: Fix[],
  opts: { deviceId?: string | null; source: "device" | "import"; client?: PoolClient },
): Promise<number> {
  if (fixes.length === 0) return 0;
  const run = async (c: PoolClient) => {
    // Shared with other inserts; processing takes it exclusively to wait for us (run.ts).
    await c.query(`SELECT pg_advisory_xact_lock_shared(hashtext('matka_ingest'), $1::int)`, [userId]);
    const res = await c.query<{ min: Date | null; n: string }>(
      `WITH ins AS (
         INSERT INTO points (user_id, device_id, source, ts, geom, accuracy, altitude, speed, battery)
         SELECT $1, $2, $3, to_timestamp(t.ts), ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326)::geography,
                t.accuracy, t.altitude, t.speed, t.battery
         FROM unnest($4::float8[], $5::float8[], $6::int8[], $7::real[], $8::real[], $9::real[], $10::int2[])
           AS t(lon, lat, ts, accuracy, altitude, speed, battery)
         ON CONFLICT (user_id, ts) DO NOTHING
         RETURNING ts
       )
       SELECT min(ts) AS min, count(*) AS n FROM ins`,
      [
        userId,
        opts.deviceId ?? null,
        opts.source,
        fixes.map((f) => f.lon),
        fixes.map((f) => f.lat),
        fixes.map((f) => f.ts),
        fixes.map((f) => f.accuracy),
        fixes.map((f) => f.altitude),
        fixes.map((f) => f.speed),
        fixes.map((f) => f.battery),
      ],
    );
    const { min, n } = res.rows[0];
    if (min) await markDirty(c, userId, min);
    return Number(n);
  };
  return opts.client ? run(opts.client) : tx(run);
}

/** Processing must redo everything from `from` onward. */
export async function markDirty(c: PoolClient, userId: string, from: Date): Promise<void> {
  await c.query(
    `INSERT INTO processing_state (user_id, dirty_from) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE
       SET dirty_from = LEAST(COALESCE(processing_state.dirty_from, EXCLUDED.dirty_from), EXCLUDED.dirty_from)`,
    [userId, from],
  );
}
