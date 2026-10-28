import type { PoolClient } from "pg";
import { pool } from "../db";
import { importDawarichIfNeeded, topUpDawarich } from "../dawarichImport";
import { sweepAbandonedUploads } from "../google/import";
import { syncPhotoPoints } from "../photoPoints";
import { refreshFeeds } from "../transit/feed";
import { matchPendingTrips } from "../transit/run";
import { pickPlaceNamesWithAi } from "./aiPlaces";
import { geocodePending } from "./geocode";
import { processUser } from "./run";
import { batteryLogLine, dailyBattery, dischargeSegments } from "../insights/battery";
import { loadBatteryReadings, loadQuality } from "../insights/load";
import { usageLogText } from "../insights/matkaPower";
import { qualityLogLine } from "../insights/quality";
import { addDays, dayBounds, localDate } from "../insights/time";

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
    // After it, a daily top-up of what Dawarich recorded since, into gaps only.
    try {
      if (!(await importDawarichIfNeeded())) await topUpDawarich();
    } catch (err) {
      console.error("[import] dawarich import failed, will retry:", err instanceof Error ? err.message : err);
    }
    // Photo locations from Immich fill gaps (every few hours per user).
    try {
      await syncPhotoPoints();
    } catch (err) {
      console.error("[photos] sync failed, will retry:", err instanceof Error ? err.message : err);
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
    // Google Timeline uploads abandoned half-way: their temp files go.
    await sweepAbandonedUploads().catch((err) => console.error("[google] sweep failed:", err));
    // Drain the geocoding backlog a batch at a time.
    let named = 0;
    for (let n = await geocodePending(); n > 0; n = await geocodePending()) named += n;
    if (named) console.log(`[geocode] named ${named} places`);
    // Opt-in AI place picker; one bounded request per tick at most.
    try {
      await pickPlaceNamesWithAi();
    } catch (err) {
      console.error("[ai-places] failed, will retry:", err instanceof Error ? err.message : err);
    }
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

/**
 * Diagnostics, once per process: each user's phone battery drain over the last
 * 21 days, one line per user, aggregate numbers only. Fire-and-forget: it never
 * throws into or delays the worker.
 */
async function logBatteryStats(): Promise<void> {
  const users = (await pool().query<{ id: string; timezone: string }>(`SELECT id::text, timezone FROM users ORDER BY id`))
    .rows;
  for (const u of users) {
    const toDate = localDate(Date.now(), u.timezone);
    const fromDate = addDays(toDate, -20);
    const [from] = dayBounds(fromDate, u.timezone);
    const series = await loadBatteryReadings(u.id, from - 24 * 3_600_000, Date.now());
    if (!series.length) continue;
    const segments = series.flatMap((s) => dischargeSegments(s));
    console.log(batteryLogLine(u.id, dailyBattery(segments, fromDate, toDate, u.timezone)));
  }
}

/**
 * One `[stats] quality user N: <period>: <numbers> | … || matka ≈ <per-day estimate and measurements>`
 * line per user with app fixes (aggregates only, no coordinates).
 */
async function logQualityStats(): Promise<void> {
  const users = (await pool().query<{ id: string; timezone: string }>(`SELECT id::text, timezone FROM users ORDER BY id`))
    .rows;
  for (const u of users) {
    const q = await loadQuality(u, 21);
    if (!q.report.periods.some((p) => p.total.fixes > 0) && q.usage.length === 0) continue;
    const usage = q.usage.length ? ` || matka (estimate, calibrated ${q.model.calibrated}): ${usageLogText(q.usage)}` : "";
    console.log(`${qualityLogLine(u.id, q.report, u.timezone)}${usage}`);
  }
}

export function startWorker(): void {
  const g = globalThis as unknown as { _matkaWorker?: NodeJS.Timeout };
  if (g._matkaWorker || process.env.MATKA_WORKER === "off") return;
  console.log(`[worker] started, every ${TICK_MS} ms`);
  g._matkaWorker = setInterval(() => void tick(), TICK_MS);
  setTimeout(() => void tick(), 2000);
  setTimeout(() => {
    try {
      logBatteryStats().catch((err) => console.error("[stats] battery failed:", err instanceof Error ? err.message : err));
      logQualityStats().catch((err) => console.error("[stats] quality failed:", err instanceof Error ? err.message : err));
    } catch {}
  }, 5000);
}
