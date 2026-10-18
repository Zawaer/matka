// Validation for /api/ingest (docs/API.md). Pure, so it is unit-tested.

export const MAX_POINTS = 1000;
export const MAX_BYTES = 1024 * 1024;
// Fixes from before smartphones existed, or from the future, are bogus.
const MIN_TS = Date.UTC(2000, 0, 1) / 1000;
const MAX_FUTURE_S = 24 * 60 * 60;

export type Fix = {
  lon: number;
  lat: number;
  /** Epoch seconds. */
  ts: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  battery: number | null;
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Epoch seconds, epoch ms or ISO-8601 → whole epoch seconds, or null if implausible. */
export function toEpochSeconds(ts: unknown, now = Date.now()): number | null {
  let s: number;
  if (finite(ts)) s = ts > 1e12 ? ts / 1000 : ts;
  else if (typeof ts === "string") s = Date.parse(ts) / 1000;
  else return null;
  s = Math.floor(s);
  return Number.isFinite(s) && s >= MIN_TS && s <= now / 1000 + MAX_FUTURE_S ? s : null;
}

/** One fix: required fields must be valid; bad optional fields become null. */
export function parseFix(p: unknown, now = Date.now()): Fix | null {
  if (typeof p !== "object" || p === null) return null;
  const { lat, lon, ts, accuracy, altitude, speed, battery } = p as Record<string, unknown>;
  if (!finite(lat) || lat < -90 || lat > 90) return null;
  if (!finite(lon) || lon < -180 || lon > 180) return null;
  const t = toEpochSeconds(ts, now);
  if (t == null) return null;
  return {
    lat,
    lon,
    ts: t,
    accuracy: finite(accuracy) && accuracy >= 0 ? accuracy : null,
    altitude: finite(altitude) ? altitude : null,
    speed: finite(speed) && speed >= 0 ? speed : null,
    battery: finite(battery) && battery >= 0 && battery <= 100 ? Math.round(battery) : null,
  };
}

/**
 * Validates a batch. Keeps the first fix per second (the rest count as
 * duplicates, as they would against the DB).
 */
export function parseBatch(points: unknown[], now = Date.now()) {
  const fixes = new Map<number, Fix>();
  let valid = 0;
  for (const p of points) {
    const f = parseFix(p, now);
    if (!f) continue;
    valid++;
    if (!fixes.has(f.ts)) fixes.set(f.ts, f);
  }
  return { fixes: [...fixes.values()], valid, rejected: points.length - valid };
}
