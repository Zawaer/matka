// Conversion from expo-location fixes to the API.md point shape (pure).

/** A queued fix. `ts` is epoch milliseconds as reported by the OS. */
export type QueuedPoint = {
  id?: number;
  ts: number;
  lat: number;
  lon: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  battery: number | null;
  /** The phone's motion classification near the fix (modules/matka-activity), if any. */
  activity: string | null;
};

/** The wire shape sent in `POST /api/ingest` (`ts` in epoch seconds). */
export type WirePoint = {
  lat: number;
  lon: number;
  ts: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  battery?: number;
  activity?: string;
};

/** Minimal subset of expo-location's LocationObject that we use. */
export type FixLike = {
  timestamp: number;
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    altitude?: number | null;
    speed?: number | null;
  };
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Normalises an OS timestamp to epoch milliseconds. expo-location reports ms,
 * but tolerate a seconds value (anything before ~2001 in ms is really seconds).
 */
export function toEpochMs(ts: number): number | null {
  if (!finite(ts) || ts <= 0) return null;
  return Math.round(ts < 1e12 ? ts * 1000 : ts);
}

/** Epoch ms → integer epoch seconds, as the server stores them. */
export function toEpochSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

/** Battery level 0..1 from expo-battery (−1 = unknown) → integer percent or null. */
export function batteryPercent(level: number | null | undefined): number | null {
  if (!finite(level) || level < 0 || level > 1) return null;
  return Math.round(level * 100);
}

/** Converts a fix to a queue row, or null if it can never be valid. */
export function fixToPoint(fix: FixLike, battery: number | null = null, activity: string | null = null): QueuedPoint | null {
  const { latitude: lat, longitude: lon, accuracy, altitude, speed } = fix.coords ?? ({} as FixLike["coords"]);
  if (!finite(lat) || lat < -90 || lat > 90) return null;
  if (!finite(lon) || lon < -180 || lon > 180) return null;
  const ts = toEpochMs(fix.timestamp);
  if (ts == null) return null;
  return {
    ts,
    lat,
    lon,
    accuracy: finite(accuracy) && accuracy >= 0 ? accuracy : null,
    altitude: finite(altitude) ? altitude : null,
    speed: finite(speed) && speed >= 0 ? speed : null,
    battery: finite(battery) && battery >= 0 && battery <= 100 ? Math.round(battery) : null,
    activity: activity || null,
  };
}

/** Queue row → wire point. Unknown optional fields are omitted, not null. */
export function toWire(p: QueuedPoint): WirePoint {
  const w: WirePoint = { lat: p.lat, lon: p.lon, ts: toEpochSeconds(p.ts) };
  if (p.accuracy != null) w.accuracy = round1(p.accuracy);
  if (p.altitude != null) w.altitude = round1(p.altitude);
  if (p.speed != null) w.speed = round1(p.speed);
  if (p.battery != null) w.battery = p.battery;
  if (p.activity) w.activity = p.activity;
  return w;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
