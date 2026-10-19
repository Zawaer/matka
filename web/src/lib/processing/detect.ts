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
// time needed to cover the distance at LEAVE_SPEED. Not when the silence was
// long and ends far away: then recording was off (the phone was moving, just
// not reporting), so the stay ends at its last fix and no trip is invented
// across the hole.
//
// A short stay at a public transport stop between two moves is a transfer
// (waiting for the next bus), not a visit: it is folded into one trip.

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
/**
 * A silence longer than this that ends FAR_AFTER_SILENCE_M or more away is a
 * recording gap, not a still phone. On the owner's data, leaving home after a
 * night's silence gives a first fix 300-500 m out; recording switched off for
 * an afternoon of moving around gave one 1 km or more away.
 */
export const LONG_SILENCE_S = 2 * 3600;
export const FAR_AFTER_SILENCE_M = 750;
/**
 * How long a stay is assumed to go on after its last fix before a recording
 * gap. MIN_STAY_S, so where the phone was last seen still shows as a (short)
 * visit: arriving home and switching recording off is still "home".
 */
const GAP_ALLOWANCE_S = MIN_STAY_S;
/** A stay at most this long, within TRANSFER_STOP_M of a stop, between two moves, is a transfer. */
export const TRANSFER_MAX_S = 20 * 60;
export const TRANSFER_STOP_M = 50;
/** Weight of a fix without a reported accuracy (see weight). */
const DEFAULT_ACCURACY_M = 20;
/**
 * A fix this close to an ongoing stay, while the phone has said "still" for it
 * and the fix before, is GPS jitter: a real departure comes with walking or
 * in_vehicle readings.
 */
export const STILL_JITTER_M = 400;

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

/** A transfer folded into a trip: waiting at a stop (where, from when to when). */
export type Wait = { start: number; end: number; lat: number; lon: number };

export type Trip = {
  start: number;
  end: number;
  distance: number;
  mode: ModeKey;
  path: [number, number][]; // [lon, lat]
  count: number;
  waits: Wait[];
};

export type Output = { kind: "stay"; stay: Stay } | { kind: "trip"; trip: Trip };

export type DetectorOptions = {
  /** Whether a public transport stop lies within `radiusM` (absent: no transfer detection). */
  nearStop?: (lat: number, lon: number, radiusM: number) => boolean;
  /**
   * The saved place (any stable key) whose radius a stay centred here lies in,
   * or null. Two stays inside the same saved place separated by less than
   * MERGE_GAP_S are one visit however far apart (buildings on a campus).
   */
  savedPlaceAt?: (lat: number, lon: number) => string | null;
};

/** A move not yet turned into a Trip. */
type Move = {
  pts: DPoint[];
  /** Departure time (the previous stay's end when known). */
  start: number;
  /** Seconds spent waiting at folded transfers. */
  paused: number;
  /** The moving stretches, for speeds (waits would drag them down). */
  parts: DPoint[][];
  waits: Wait[];
};

type Cluster = {
  pts: DPoint[];
  lat: number;
  lon: number;
  end: number;
  /** Sum of the fixes' weights (see weight). */
  w: number;
  /** Time of the last fix that belonged to this cluster (jitter included). */
  seen: number;
};

/**
 * A fix's weight in the stay's centre: inverse variance, so one 60 m
 * urban-canyon fix doesn't drag a centre built from 10 m ones. Fixes without
 * an accuracy count as DEFAULT_ACCURACY_M; equal accuracies give a plain mean.
 */
const weight = (p: DPoint) => 1 / Math.max(p.accuracy ?? DEFAULT_ACCURACY_M, 5) ** 2;

const newCluster = (p: DPoint): Cluster => ({ pts: [p], lat: p.lat, lon: p.lon, end: p.ts, w: weight(p), seen: p.ts });

function addTo(c: Cluster, p: DPoint) {
  c.pts.push(p);
  c.end = p.ts;
  c.seen = p.ts;
  const w = weight(p);
  c.w += w;
  c.lat += ((p.lat - c.lat) * w) / c.w;
  c.lon += ((p.lon - c.lon) * w) / c.w;
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
  /** All fixes of lastStay (path of a transfer when it is folded into a trip). */
  private lastStayPts: DPoint[] = [];
  /** The move that arrived at lastStay, held back until we know whether lastStay was a transfer. */
  private inMove: Move | null = null;
  /** A candidate outlier held back until the next fix shows whether it was noise. */
  private suspect: DPoint | null = null;
  private last: DPoint | null = null;
  readonly out: Output[] = [];

  constructor(private readonly opts: DetectorOptions = {}) {}

  push(p: DPoint) {
    if (p.accuracy != null && p.accuracy > MAX_ACCURACY_M) return;
    if (this.last) {
      const dt = p.ts - this.last.ts;
      if (dt <= 0) return;
      const d = haversine(this.last.lat, this.last.lon, p.lat, p.lon);
      if (d / dt > MAX_SPEED_MS && d > 1000) return;
    }
    const before = this.last;
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
    if (
      !this.suspect &&
      d <= STILL_JITTER_M &&
      p.activity === "still" &&
      before?.activity === "still" &&
      duration(c) >= MIN_STAY_S
    ) {
      // The phone says it hasn't moved: jitter. The stay goes on, centre untouched.
      c.end = Math.max(c.end, p.ts);
      c.seen = p.ts;
      return;
    }
    if (!this.suspect) {
      // Silent while still: the stay lasted until shortly before this fix.
      // Unless the silence was long and ended far away: recording was off.
      // With a suspect held back the end was already set from it, the first
      // fix away; extending it from this later one would run the stay past
      // the suspect, which starts what comes next (an overlap).
      let end = Math.round(p.ts - d / LEAVE_SPEED_MS);
      const recordingGap = p.ts - c.seen > LONG_SILENCE_S && d >= FAR_AFTER_SILENCE_M;
      if (recordingGap) end = Math.min(end, c.seen + GAP_ALLOWANCE_S);
      c.end = Math.max(c.end, end);
      if (duration(c) >= MIN_STAY_S) {
        // Leaving a real stay: wait one fix before believing it.
        this.suspect = p;
        return;
      }
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
    if (prev && stay.start - prev.end < MERGE_GAP_S && this.samePlace(prev, stay)) {
      // Same place, brief excursion (or noise): extend the previous stay.
      const n = prev.count + stay.count;
      prev.lat = (prev.lat * prev.count + stay.lat * stay.count) / n;
      prev.lon = (prev.lon * prev.count + stay.lon * stay.count) / n;
      prev.count = n;
      prev.end = Math.max(prev.end, stay.end);
      this.lastStayPts.push(...this.move.slice(1), ...c.pts);
      this.move = [c.pts[c.pts.length - 1]];
      return;
    }
    const arrival = c.pts[0];
    this.settle(this.splitMove([...this.move, arrival], prev ? prev.end : null), arrival);
    this.lastStay = stay;
    this.lastStayPts = [...c.pts];
    this.move = [c.pts[c.pts.length - 1]];
  }

  /**
   * Emit lastStay (or fold it into a trip when it was a transfer) and the moves
   * that followed it. The last move, if it ends at `arrival` (the next stay),
   * is held back as that stay's inbound move.
   */
  private settle(moves: Move[], arrival: DPoint | null) {
    const prev = this.lastStay;
    if (prev) {
      const first = moves[0];
      const departs = first && first.pts[0] === this.lastStayPts[this.lastStayPts.length - 1];
      if (this.inMove && departs && this.isTransfer(prev)) {
        moves[0] = joinMoves(this.inMove, prev, this.lastStayPts, first);
      } else {
        if (this.inMove) this.emitMove(this.inMove);
        this.out.push({ kind: "stay", stay: prev });
      }
    } else if (this.inMove) {
      this.emitMove(this.inMove);
    }
    this.inMove = null;
    const tail = moves[moves.length - 1];
    if (arrival && tail && tail.pts[tail.pts.length - 1] === arrival) this.inMove = moves.pop()!;
    for (const m of moves) this.emitMove(m);
  }

  /** Whether two stays are the same place: within STAY_RADIUS_M, or inside the same saved place. */
  private samePlace(a: Stay, b: Stay): boolean {
    if (haversine(a.lat, a.lon, b.lat, b.lon) <= STAY_RADIUS_M) return true;
    const at = this.opts.savedPlaceAt;
    if (!at) return false;
    const k = at(a.lat, a.lon);
    return k != null && k === at(b.lat, b.lon);
  }

  private isTransfer(s: Stay): boolean {
    return !!this.opts.nearStop && s.end - s.start <= TRANSFER_MAX_S && this.opts.nearStop(s.lat, s.lon, TRANSFER_STOP_M);
  }

  /**
   * The moves through pts, departing at `from` (the previous stay's end) if
   * known. Split where the phone said nothing for LONG_SILENCE_S: that is a
   * hole in the recording, and a "trip" across it would be invented. Pieces
   * too short to be a trip are dropped.
   */
  private splitMove(pts: DPoint[], from: number | null): Move[] {
    const out: Move[] = [];
    const add = (seg: DPoint[], from: number | null) => {
      if (seg.length < 2) return;
      let distance = 0;
      for (let i = 1; i < seg.length; i++) distance += haversine(seg[i - 1].lat, seg[i - 1].lon, seg[i].lat, seg[i].lon);
      if (distance < MIN_TRIP_M) return;
      const end = seg[seg.length - 1].ts;
      out.push({ pts: seg, start: Math.min(end, Math.max(seg[0].ts, from ?? seg[0].ts)), paused: 0, parts: [seg], waits: [] });
    };
    if (pts.length === 0) return out;
    let seg: DPoint[] = [pts[0]];
    let segFrom = from;
    for (let i = 1; i < pts.length; i++) {
      const prevT = i === 1 && from != null ? Math.max(pts[0].ts, from) : pts[i - 1].ts;
      if (pts[i].ts - prevT > LONG_SILENCE_S) {
        add(seg, segFrom);
        seg = [];
        segFrom = null;
      }
      seg.push(pts[i]);
    }
    add(seg, segFrom);
    return out;
  }

  private emitMove(m: Move) {
    this.out.push({ kind: "trip", trip: toTrip(m) });
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
    this.settle(this.splitMove(this.move, this.lastStay?.end ?? null), null);
    this.lastStay = null;
    this.lastStayPts = [];
    this.move = [];
    return this.out;
  }

  /** Take what has been emitted so far (for streaming writes). */
  drain(): Output[] {
    return this.out.splice(0, this.out.length);
  }
}

/** One move through a transfer: arrive by `a`, wait at the stop (`stay`, `stopPts`), leave by `b`. */
function joinMoves(a: Move, stay: Stay, stopPts: DPoint[], b: Move): Move {
  const arrived = a.pts[a.pts.length - 1].ts;
  return {
    pts: [...a.pts, ...stopPts.slice(1), ...b.pts.slice(1)],
    start: a.start,
    paused: a.paused + Math.max(0, b.start - arrived) + b.paused,
    parts: [...a.parts, ...b.parts],
    waits: [...a.waits, { start: stay.start, end: stay.end, lat: stay.lat, lon: stay.lon }, ...b.waits],
  };
}

function toTrip(m: Move): Trip {
  const pts = m.pts;
  let distance = 0;
  for (let i = 1; i < pts.length; i++) distance += haversine(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
  const end = pts[pts.length - 1].ts;
  const speeds = m.parts.flatMap(moveSpeeds);
  return {
    start: m.start,
    end,
    distance,
    mode: withActivity(classifyMode(speeds, distance, end - m.start - m.paused), pts),
    path: pts.map((p) => [p.lon, p.lat]),
    count: pts.length,
    waits: m.waits,
  };
}

/** Convenience for tests and small inputs. */
export function detect(points: DPoint[], opts?: DetectorOptions): Output[] {
  const d = new Detector(opts);
  for (const p of points) d.push(p);
  return d.finish();
}
