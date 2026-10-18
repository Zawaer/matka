import type { ModeKey } from "../modes";
import { haversine } from "./geo";

// Turns an ordered stream of fixes into stays (visits) and the moves between
// them (trips). Pure and streaming: push points in time order, then finish().
//
// A stay is a run of fixes that keep within STAY_RADIUS of their running
// centroid for at least MIN_STAY. The collector stops reporting while the
// phone is still (distance filter), so a long silence that ends near the
// centroid is still the same stay. A single fix that jumps away and is
// followed by one back inside the radius is treated as GPS noise.
//
// Because of that silence a stay's end isn't its last fix: when the next fix
// is outside, the stay is assumed to last until just before it, minus the
// time needed to cover the distance at LEAVE_SPEED.

export const STAY_RADIUS_M = 100;
export const MIN_STAY_S = 5 * 60;
/** Fixes less accurate than this are ignored. */
export const MAX_ACCURACY_M = 150;
/** Faster than this between two fixes is a glitch, not travel (~1080 km/h). */
const MAX_SPEED_MS = 300;
/** Merge consecutive stays this close together, separated by less than MERGE_GAP_S. */
const MERGE_GAP_S = 20 * 60;
/** A move shorter than this between two stays isn't worth a trip. */
const MIN_TRIP_M = 2 * STAY_RADIUS_M;
/** Assumed speed when estimating how long ago a silent phone left a stay (m/s). */
const LEAVE_SPEED_MS = 5;

export type DPoint = {
  /** Epoch seconds. */
  ts: number;
  lat: number;
  lon: number;
  accuracy: number | null;
  /** m/s as reported by the device, if any. */
  speed: number | null;
  /** The phone's motion classification at this fix, if it sent one. */
  activity?: string | null;
};

export type Stay = {
  start: number;
  end: number;
  lat: number;
  lon: number;
  count: number;
};

export type Trip = {
  start: number;
  end: number;
  distance: number;
  mode: ModeKey;
  path: [number, number][]; // [lon, lat]
  count: number;
};

export type Output = { kind: "stay"; stay: Stay } | { kind: "trip"; trip: Trip };

type Cluster = { pts: DPoint[]; lat: number; lon: number; end: number };

const newCluster = (p: DPoint): Cluster => ({ pts: [p], lat: p.lat, lon: p.lon, end: p.ts });

function addTo(c: Cluster, p: DPoint) {
  c.pts.push(p);
  c.end = p.ts;
  const n = c.pts.length;
  c.lat += (p.lat - c.lat) / n;
  c.lon += (p.lon - c.lon) / n;
}

const duration = (c: Cluster) => c.end - c.pts[0].ts;

const quantile = (sorted: number[], q: number) =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];

/**
 * Travel mode from a move's speeds (m/s), distance (m) and duration (s).
 *
 * Decides mostly on the average speed and uses the 85th-percentile speed only
 * with enough samples: with sparse fixes a single GPS jump would otherwise be
 * "the 85th percentile" (tuned on real history, docs/DECISIONS.md). Trains
 * are told apart from cars by a sustained average no car keeps on roads limited
 * to 120 km/h; buses still read as driving.
 */
export function classifyMode(speeds: number[], distance: number, seconds: number): ModeKey {
  if (seconds <= 0 || distance <= 0) {
    if (speeds.length === 0) return "unknown";
    seconds = 1;
  }
  const avg = (distance / seconds) * 3.6;
  const kmh = speeds.map((v) => v * 3.6).sort((a, b) => a - b);
  const enough = kmh.length >= 5;
  const p85 = kmh.length ? quantile(kmh, 0.85) : avg;
  if ((distance > 100_000 && avg > 180) || (enough && p85 > 320)) return "flying";
  if (distance > 50_000 && avg > 115) return "train";
  if (avg >= 28 || (enough && p85 > 55)) return "driving";
  if (avg < 7.5 && (!enough || p85 < 12)) return "walking";
  if (avg < 14 && (!enough || p85 < 20)) return "running";
  if (avg < 28 && (!enough || p85 < 50)) return "cycling";
  return "driving";
}

/**
 * The phone's own motion sensing outranks speed where speed can't decide: a
 * bike and a city bus both average 15-25 km/h. Needs a clear majority among
 * the fixes that carry an activity, and at least 3 of them; rail and flights
 * (told apart by speed and distance) stay as they are.
 */
export function withActivity(mode: ModeKey, pts: Pick<DPoint, "activity">[]): ModeKey {
  if (mode === "train" || mode === "flying" || mode === "boat") return mode;
  const counts = new Map<string, number>();
  let n = 0;
  for (const p of pts) {
    if (!p.activity || p.activity === "still") continue;
    counts.set(p.activity, (counts.get(p.activity) ?? 0) + 1);
    n++;
  }
  if (n < 3) return mode;
  const [top, k] = [...counts].sort((a, b) => b[1] - a[1])[0];
  if (k < 0.6 * n) return mode;
  if (top === "on_bicycle") return "cycling";
  if (top === "running") return "running";
  if (top === "walking") return mode === "driving" ? mode : "walking";
  // In a vehicle: speed alone may have said bike or run; HSL matching later
  // tells bus, tram or metro apart.
  if (top === "in_vehicle") return mode === "cycling" || mode === "running" || mode === "walking" ? "driving" : mode;
  return mode;
}

/**
 * Speeds to classify a move by. The phone's own speed readings (Doppler, not
 * position differences) when most fixes carry one; otherwise straight-line
 * speeds over chords of at least a minute, because fix-to-fix speeds are
 * dominated by jitter (a 30 m wobble in 2 s reads as 54 km/h).
 */
export function moveSpeeds(pts: DPoint[]): number[] {
  const reported = pts.filter((p) => p.speed != null && p.speed >= 0).map((p) => p.speed as number);
  if (pts.length > 1 && reported.length >= 0.8 * pts.length) return reported;
  const out: number[] = [];
  let a = 0;
  for (let k = 1; k < pts.length; k++) {
    const dt = pts[k].ts - pts[a].ts;
    if (dt >= 60) {
      // A silent gap isn't a speed sample.
      if (dt < 600) out.push(haversine(pts[a].lat, pts[a].lon, pts[k].lat, pts[k].lon) / dt);
      a = k;
    }
  }
  return out;
}

export class Detector {
  private cluster: Cluster | null = null;
  /** Fixes since the last stay ended (the move in progress), starting with that stay's last fix. */
  private move: DPoint[] = [];
  private lastStay: Stay | null = null;
  /** A candidate outlier held back until the next fix shows whether it was noise. */
  private suspect: DPoint | null = null;
  private last: DPoint | null = null;
  readonly out: Output[] = [];

  push(p: DPoint) {
    if (p.accuracy != null && p.accuracy > MAX_ACCURACY_M) return;
    if (this.last) {
      const dt = p.ts - this.last.ts;
      if (dt <= 0) return;
      const d = haversine(this.last.lat, this.last.lon, p.lat, p.lon);
      if (d / dt > MAX_SPEED_MS && d > 1000) return;
    }
    this.last = p;

    const c = this.cluster;
    if (!c) {
      this.cluster = newCluster(p);
      return;
    }
    const d = haversine(c.lat, c.lon, p.lat, p.lon);
    if (d <= STAY_RADIUS_M) {
      // The held-back fix was a blip: drop it.
      this.suspect = null;
      addTo(c, p);
      return;
    }
    // Silent while still: the stay lasted until shortly before this fix.
    c.end = Math.max(c.end, Math.round(p.ts - d / LEAVE_SPEED_MS));
    if (duration(c) >= MIN_STAY_S && !this.suspect) {
      // Leaving a real stay: wait one fix before believing it.
      this.suspect = p;
      return;
    }
    const pending = this.suspect;
    this.suspect = null;
    this.closeCluster();
    // Everything after the stay starts the move / next candidate cluster.
    if (pending) this.feedLoose(pending);
    this.feedLoose(p);
  }

  /** Feed a fix that is outside the current cluster, after it was closed. */
  private feedLoose(p: DPoint) {
    const c = this.cluster;
    if (c && haversine(c.lat, c.lon, p.lat, p.lon) <= STAY_RADIUS_M) addTo(c, p);
    else {
      if (c) this.closeCluster();
      this.cluster = newCluster(p);
    }
  }

  /** Decide whether the current cluster was a stay, and emit accordingly. */
  private closeCluster() {
    const c = this.cluster;
    this.cluster = null;
    if (!c) return;
    if (duration(c) < MIN_STAY_S) {
      // Passing through: these fixes are part of the move.
      this.move.push(...c.pts);
      return;
    }
    const stay: Stay = {
      start: c.pts[0].ts,
      end: c.end,
      lat: c.lat,
      lon: c.lon,
      count: c.pts.length,
    };
    const prev = this.lastStay;
    if (
      prev &&
      stay.start - prev.end < MERGE_GAP_S &&
      haversine(prev.lat, prev.lon, stay.lat, stay.lon) <= STAY_RADIUS_M
    ) {
      // Same place, brief excursion (or noise): extend the previous stay.
      const n = prev.count + stay.count;
      prev.lat = (prev.lat * prev.count + stay.lat * stay.count) / n;
      prev.lon = (prev.lon * prev.count + stay.lon * stay.count) / n;
      prev.count = n;
      prev.end = stay.end;
      this.move = [c.pts[c.pts.length - 1]];
      return;
    }
    if (prev) this.emitPrevStay(c.pts[0]);
    else {
      // Movement before the first stay in this window.
      const trip = this.makeTrip([...this.move, c.pts[0]], null);
      if (trip) this.out.push({ kind: "trip", trip });
    }
    this.lastStay = stay;
    this.move = [c.pts[c.pts.length - 1]];
  }

  /** Emit the previous stay and the trip from it to `arrival`. */
  private emitPrevStay(arrival: DPoint) {
    const prev = this.lastStay!;
    this.out.push({ kind: "stay", stay: prev });
    const trip = this.makeTrip([...this.move, arrival], prev.end);
    if (trip) this.out.push({ kind: "trip", trip });
  }

  /** A move through pts, departing at `from` (the previous stay's end) if known. */
  private makeTrip(pts: DPoint[], from: number | null): Trip | null {
    if (pts.length < 2) return null;
    let distance = 0;
    for (let i = 1; i < pts.length; i++) distance += haversine(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
    const speeds = moveSpeeds(pts);
    if (distance < MIN_TRIP_M) return null;
    const end = pts[pts.length - 1].ts;
    const start = Math.min(end, Math.max(pts[0].ts, from ?? pts[0].ts));
    return {
      start,
      end,
      distance,
      mode: withActivity(classifyMode(speeds, distance, end - start), pts),
      path: pts.map((p) => [p.lon, p.lat]),
      count: pts.length,
    };
  }

  /**
   * Flush at the end of available data. The last stay (and a trailing move)
   * are emitted as-is; they get recomputed when more data arrives.
   */
  finish(): Output[] {
    if (this.suspect) {
      const s = this.suspect;
      this.suspect = null;
      this.closeCluster();
      this.feedLoose(s);
    }
    const c = this.cluster;
    if (c && duration(c) >= MIN_STAY_S) {
      this.closeCluster();
    } else if (c) {
      this.move.push(...c.pts);
      this.cluster = null;
    }
    if (this.lastStay) this.out.push({ kind: "stay", stay: this.lastStay });
    const trip = this.makeTrip(this.move, this.lastStay?.end ?? null);
    if (trip) this.out.push({ kind: "trip", trip });
    this.lastStay = null;
    this.move = [];
    return this.out;
  }

  /** Take what has been emitted so far (for streaming writes). */
  drain(): Output[] {
    return this.out.splice(0, this.out.length);
  }
}

/** Convenience for tests and small inputs. */
export function detect(points: DPoint[]): Output[] {
  const d = new Detector();
  for (const p of points) d.push(p);
  return d.finish();
}
