// Web stand-in for src/db.ts: an in-memory queue and key/value table, seeded
// from the page URL (?queued=37&tracking=1&preset=custom&authLost=1&failing=1&standby=1).
import type { QueuedPoint } from "../../src/points";
import { flag, params } from "./params";

export const QUEUE_CAP = 200_000;

const now = Date.now();
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
  ts: Math.floor(now / 1000) - 3600 + i * 30,
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
