import type { PoolClient } from "pg";
import { pool } from "../db";
import { importDawarichIfNeeded } from "../dawarichImport";
import { refreshFeeds } from "../transit/feed";
import { matchPendingTrips } from "../transit/run";
import { geocodePending } from "./geocode";
import { processUser } from "./run";

// Background loop started from instrumentation.ts. Only one instance across
// all replicas does work at a time (session advisory lock on a dedicated
// connection), so running several pods is safe.

const TICK_MS = Number(process.env.MATKA_WORKER_INTERVAL_MS ?? 30_000);
const WORKER_LOCK = "matka_worker";

let running = false;

export async function tick(): Promise<void> {
  if (running) return;
  running = true;
  let c: PoolClient | null = null;
  let locked = false;
  try {
    c = await pool().connect();
    locked = (
      await c.query<{ ok: boolean }>(`SELECT pg_try_advisory_lock(hashtext($1)) ok`, [WORKER_LOCK])
    ).rows[0].ok;
    if (!locked) return;
    // One-time history import; quiet no-op once finished or when not configured.
    try {
      await importDawarichIfNeeded();
    } catch (err) {
      console.error("[import] dawarich import failed, will retry:", err instanceof Error ? err.message : err);
    }
    const dirty = (
      await c.query<{ user_id: string }>(
        `SELECT user_id FROM processing_state WHERE dirty_from IS NOT NULL`,
      )
    ).rows;
    for (const { user_id } of dirty) {
      const t = Date.now();
      try {
        const n = await processUser(user_id);
        if (n) console.log(`[worker] user ${user_id}: processed ${n} points in ${Date.now() - t} ms`);
      } catch (err) {
        console.error(`[worker] processing user ${user_id} failed:`, err);
      }
    }
    await c.query(`DELETE FROM sessions WHERE expires_at < now()`);
    // Drain the geocoding backlog a batch at a time.
    while ((await geocodePending()) > 0) {}
    // Public transport lines: refresh feeds when due (daily check), then match
    // new trips. A bounded number per tick keeps a big backlog from hogging it.
    try {
      await refreshFeeds();
      for (let n = 0; n < 10 && (await matchPendingTrips(200)) > 0; n++) {}
    } catch (err) {
      console.error("[transit] failed, will retry:", err instanceof Error ? err.message : err);
    }
  } catch (err) {
    console.error("[worker] tick failed:", err);
  } finally {
    if (c) {
      if (locked) await c.query(`SELECT pg_advisory_unlock(hashtext($1))`, [WORKER_LOCK]).catch(() => {});
      c.release();
    }
    running = false;
  }
}

export function startWorker(): void {
  const g = globalThis as unknown as { _matkaWorker?: NodeJS.Timeout };
  if (g._matkaWorker || process.env.MATKA_WORKER === "off") return;
  console.log(`[worker] started, every ${TICK_MS} ms`);
  g._matkaWorker = setInterval(() => void tick(), TICK_MS);
  setTimeout(() => void tick(), 2000);
}
