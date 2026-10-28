// Web stand-in for src/db.ts: an in-memory queue and key/value table, seeded
// from the page URL (?queued=37&tracking=1&preset=custom&authLost=1&failing=1&standby=1).
import type { QueuedPoint } from "../../src/points";
import { flag, params } from "./params";

export const QUEUE_CAP = 200_000;

const now = Date.now();

/** Today's recorder usage (usage-logic.ts UsageState): GPS and standby time, fixes, phone current draw. */
function usageToday() {
  const d = new Date(now);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const agg = (ma: number, n: number) => ({ n, sum: ma * n, hist: { [String(Math.floor(ma / 10))]: n } });
  return {
    v: 1, at: now - 60_000, mode: "active", preset: params.get("preset") ?? "balanced", motion: "still", motionAt: now - 60_000,
    charge: null, unit: "mA",
    days: {
      [day]: {
        [params.get("preset") ?? "balanced"]: {
          activeS: 3 * 3600 + 1200, standbyS: 6 * 3600, offS: 0, fixes: 1480, movingS: 2 * 3600, stillS: 7 * 3600,
          cur: { active: agg(124, 40), standby: agg(38, 60), screen: agg(410, 12) },
          dropMah: 290, dropS: 8 * 3600,
        },
      },
    },
  };
}
const kv = new Map<string, string>(
  Object.entries({
    tracking_enabled: flag("tracking") ? "1" : "0",
    preset: params.get("preset") ?? "balanced",
    smart_tracking: params.get("smart") === "0" ? "0" : "1",
    applied_mode: flag("standby") ? "standby" : "active",
    activity_status: "on",
    server_status: JSON.stringify({ device: "Pixel 8", points: 113871, last: new Date(now - 4 * 60_000).toISOString() }),
    server_status_at: String(now - 60_000),
    last_fix_at: String(now - 90_000),
    last_attempt_at: String(now - 5 * 60_000),
    last_success_at: String(now - (flag("failing") ? 6 * 3600_000 : 5 * 60_000)),
    heartbeat_sent_at: String(now - 20 * 60_000),
    usage: JSON.stringify(usageToday()),
    ...(flag("recovered") || flag("failing")
      ? {
          watchdog_recoveries: JSON.stringify([
            { at: now - 3 * 3600_000, reason: "stale_moving", action: "restart", lastFixAt: now - 3.3 * 3600_000, ok: true },
            { at: now - 26 * 3600_000, reason: "not_running", action: "start", lastFixAt: null, ok: !flag("failing") },
          ]),
        }
      : {}),
    ...(flag("authLost") ? { auth_lost: "1" } : {}),
    ...(flag("failing")
      ? { last_error: "Can't reach the server: timed out.", last_error_at: String(now - 120_000), failures: "4", next_retry_at: String(now + 8 * 60_000) }
      : {}),
    ...(params.get("preset") === "custom" ? { custom_preset: JSON.stringify({ accuracy: "highest", distance: 10, time: 10_000 }) } : {}),
  }),
);

let nextId = 1;
const queue: QueuedPoint[] = Array.from({ length: Number(params.get("queued") ?? 0) }, (_, i) => ({
  id: nextId++,
  ts: now - 3600_000 + i * 30_000, // epoch ms, like the real queue
  lat: 60.18 + i * 1e-4,
  lon: 24.83 + i * 1e-4,
  accuracy: 8,
  altitude: 12,
  speed: 1.2,
  battery: 81,
  activity: null,
}));

export async function enqueue(points: QueuedPoint[]): Promise<number> {
  for (const p of points) queue.push({ ...p, id: nextId++ });
  return 0;
}
export async function peek(limit: number) { return queue.slice(0, limit); }
export async function remove(ids: number[]) {
  const s = new Set(ids);
  for (let i = queue.length - 1; i >= 0; i--) if (s.has(queue[i].id as number)) queue.splice(i, 1);
}
export async function count() { return queue.length; }
export async function oldestTs() { return queue[0]?.ts ?? null; }
export async function clearQueue() { queue.length = 0; }
export async function getKv(k: string) { return kv.get(k) ?? null; }
export async function setKv(k: string, v: string | null) {
  if (v == null) kv.delete(k);
  else kv.set(k, v);
}
export async function getAllKv() { return Object.fromEntries(kv); }
export const getNum = async (k: string) => {
  const v = kv.get(k);
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};
export const setNum = (k: string, n: number | null) => setKv(k, n == null ? null : String(n));
