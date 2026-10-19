/**
 * Google location history → Matka fixes. Handles every export format Google
 * has shipped, record by record (see jsonStream.ts for how records are read):
 *
 * - On-device Timeline (2024+), Android "Timeline.json":
 *   {"semanticSegments": [...], "rawSignals": [...], "userLocationProfile": {...}}
 *   Coordinates are strings like "48.1371°, 11.5754°".
 * - On-device Timeline, iOS "location-history.json": a root array of segments
 *   with "geo:48.1371,11.5754" strings and string numbers.
 * - Takeout "Records.json": {"locations": [{latitudeE7, longitudeE7, timestamp | timestampMs, accuracy, ...}]}.
 * - Takeout "Semantic Location History" monthly files: {"timelineObjects": [{placeVisit} | {activitySegment}]}.
 *
 * Where a fix comes from:
 * - raw GPS/wifi positions (rawSignals, Records) with their own accuracy;
 * - path points (timelinePath, simplifiedRawPath);
 * - the centre of each visit at its start and its end, so a stay is anchored
 *   even where nothing else was recorded, and the start/end of each activity.
 * Waypoints without times (waypointPath) are skipped rather than guessed.
 *
 * Activities are known per time span (segments), so fixes get theirs from an
 * interval index built in a first pass over the file (Spans).
 */

export type Activity = "still" | "walking" | "running" | "on_bicycle" | "in_vehicle";

export type GoogleFix = {
  /** Epoch seconds. */
  ts: number;
  lat: number;
  lon: number;
  accuracy: number;
  altitude: number | null;
  speed: number | null;
  activity: Activity | null;
};

/** Assumed accuracy (m) of a visit's centre: Google's place location for the stay. */
export const VISIT_ACCURACY_M = 30;
/** Assumed accuracy (m) of path points and activity ends (map-matched, no own accuracy). */
export const PATH_ACCURACY_M = 50;
/** Raw fixes worse than this are useless for visits and trips (detector ignores > 150 m). */
const MAX_RAW_ACCURACY_M = 1000;
const MIN_TS = Date.UTC(2005, 0, 1) / 1000;

/** Array keys that hold records, by format. */
export const COLLECTION_KEYS = new Set(["semanticSegments", "rawSignals", "locations", "timelineObjects"]);

/** Google's activity type names (any case, spaces or underscores) → Matka's activity set. */
export function mapActivity(type: unknown): Activity | null {
  if (typeof type !== "string") return null;
  const t = type.trim().toUpperCase().replace(/[\s-]+/g, "_");
  switch (t) {
    case "STILL":
      return "still";
    case "WALKING":
    case "ON_FOOT":
    case "HIKING":
    case "WALKING_NORDIC":
      return "walking";
    case "RUNNING":
      return "running";
    case "CYCLING":
    case "ON_BICYCLE":
    case "IN_BICYCLE":
    case "MOUNTAIN_BIKING":
    case "ROAD_BIKING":
      return "on_bicycle";
    case "IN_VEHICLE":
    case "IN_ROAD_VEHICLE":
    case "IN_RAIL_VEHICLE":
    case "IN_PASSENGER_VEHICLE":
    case "IN_CAR":
    case "DRIVING":
    case "IN_TAXI":
    case "IN_BUS":
    case "IN_TRAIN":
    case "IN_SUBWAY":
    case "IN_TRAM":
    case "IN_FERRY":
    case "IN_CABLECAR":
    case "IN_FUNICULAR":
    case "IN_GONDOLA_LIFT":
    case "IN_WHEELCHAIR":
    case "MOTORCYCLING":
    case "FLYING":
    case "BOATING":
    case "SAILING":
      return "in_vehicle";
    default:
      return null;
  }
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** E7 integers; very old Records have negative values wrapped around as unsigned 32-bit. */
function fromE7(v: unknown, max: number): number | null {
  let n = num(v);
  if (n == null) return null;
  if (n > max * 1e7) n -= 4294967296;
  return n / 1e7;
}

/**
 * "48.1371°, 11.5754°", "48.1371, 11.5754", "geo:48.1371,11.5754", or an
 * object with latitudeE7/longitudeE7, latE7/lngE7, latLng or LatLng.
 */
export function parseLatLng(v: unknown): { lat: number; lon: number } | null {
  if (v == null) return null;
  let lat: number | null = null;
  let lon: number | null = null;
  if (typeof v === "string") {
    const m = v.match(/(-?\d+(?:\.\d+)?)\s*°?\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    if (!m) return null;
    lat = Number(m[1]);
    lon = Number(m[2]);
  } else if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.latLng != null || o.LatLng != null) return parseLatLng(o.latLng ?? o.LatLng);
    if (o.point != null) return parseLatLng(o.point);
    lat = fromE7(o.latitudeE7 ?? o.latE7, 90) ?? num(o.latitude ?? o.lat);
    lon = fromE7(o.longitudeE7 ?? o.lngE7 ?? o.lonE7, 180) ?? num(o.longitude ?? o.lng ?? o.lon);
  }
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
  return { lat, lon };
}

/** ISO string (with or without offset), epoch ms string/number → epoch seconds, or null. */
export function parseTime(v: unknown, nowS = Date.now() / 1000): number | null {
  let ms: number;
  if (typeof v === "number") ms = v;
  else if (typeof v === "string" && /^\d{11,14}$/.test(v)) ms = Number(v);
  else if (typeof v === "string") ms = Date.parse(v);
  else return null;
  if (!Number.isFinite(ms)) return null;
  const s = Math.floor(ms / 1000);
  return s >= MIN_TS && s <= nowS + 86_400 ? s : null;
}

const timeOf = (o: Record<string, unknown> | undefined, key: string) =>
  o ? parseTime(o[key] ?? o[`${key}Ms`]) : null;

/** Time spans with a known activity, from a first pass over the file. */
export class Spans {
  private starts: number[] = [];
  private ends: number[] = [];
  private acts: Activity[] = [];
  private sorted = true;

  add(start: number, end: number, activity: Activity) {
    if (end < start) return;
    const n = this.starts.length;
    if (n && start < this.starts[n - 1]) this.sorted = false;
    this.starts.push(start);
    this.ends.push(end);
    this.acts.push(activity);
  }

  get size() {
    return this.starts.length;
  }

  private sort() {
    const idx = this.starts.map((_, i) => i).sort((a, b) => this.starts[a] - this.starts[b]);
    this.starts = idx.map((i) => this.starts[i]);
    this.ends = idx.map((i) => this.ends[i]);
    this.acts = idx.map((i) => this.acts[i]);
    this.sorted = true;
  }

  /**
   * The activity at ts: of the latest-starting span that contains it, which
   * is the innermost one where spans nest (a short stop inside a long visit).
   * Moves win over visits at the shared boundary second.
   */
  at(ts: number): Activity | null {
    if (!this.sorted) this.sort();
    let lo = 0;
    let hi = this.starts.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.starts[mid] <= ts) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    // Spans are few per day; look back a little for one still open.
    let best: Activity | null = null;
    for (let i = found; i >= 0 && i > found - 8; i--) {
      if (this.ends[i] >= ts) {
        if (best == null || best === "still") best = this.acts[i];
        if (best !== "still") break;
      }
    }
    return best;
  }
}

type Rec = Record<string, unknown>;
const obj = (v: unknown): Rec | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function fix(
  ts: number | null,
  ll: { lat: number; lon: number } | null,
  accuracy: number,
  activity: Activity | null,
  extra: { altitude?: number | null; speed?: number | null } = {},
): GoogleFix | null {
  if (ts == null || !ll) return null;
  return { ts, lat: ll.lat, lon: ll.lon, accuracy, altitude: extra.altitude ?? null, speed: extra.speed ?? null, activity };
}

/** First pass: the activity spans a record declares (visits count as still). */
export function spansOf(key: string, value: unknown, spans: Spans): void {
  const r = obj(value);
  if (!r) return;
  if (key === "semanticSegments" || key === "") {
    const start = parseTime(r.startTime);
    const end = parseTime(r.endTime);
    if (start == null || end == null) return;
    if (r.visit) spans.add(start, end, "still");
    const a = obj(r.activity);
    if (a) {
      const act = mapActivity(obj(a.topCandidate)?.type);
      if (act) spans.add(start, end, act);
    }
  } else if (key === "timelineObjects") {
    const pv = obj(r.placeVisit);
    const as = obj(r.activitySegment);
    const seg = pv ?? as;
    const d = obj(seg?.duration);
    const start = timeOf(d, "startTimestamp");
    const end = timeOf(d, "endTimestamp");
    if (start == null || end == null) return;
    if (pv) spans.add(start, end, "still");
    else if (as) {
      const act = mapActivity(as.activityType ?? obj(arr(as.activities)[0])?.activityType);
      if (act) spans.add(start, end, act);
    }
  }
}

/** Second pass: the fixes a record stands for. */
export function fixesOf(key: string, value: unknown, spans: Spans): GoogleFix[] {
  const r = obj(value);
  if (!r) return [];
  const out: (GoogleFix | null)[] = [];
  switch (key) {
    case "semanticSegments":
    case "": {
      const start = parseTime(r.startTime);
      const end = parseTime(r.endTime);
      const visit = obj(r.visit);
      if (visit) {
        const top = obj(visit.topCandidate);
        const ll = parseLatLng(top?.placeLocation);
        out.push(fix(start, ll, VISIT_ACCURACY_M, "still"), fix(end, ll, VISIT_ACCURACY_M, "still"));
      }
      const act = obj(r.activity);
      if (act) {
        const a = mapActivity(obj(act.topCandidate)?.type);
        out.push(fix(start, parseLatLng(act.start), PATH_ACCURACY_M, a), fix(end, parseLatLng(act.end), PATH_ACCURACY_M, a));
      }
      for (const p of arr(r.timelinePath)) {
        const po = obj(p);
        if (!po) continue;
        // Android: "time"; iOS: minutes after the segment's start.
        let ts = parseTime(po.time);
        const off = num(po.durationMinutesOffsetFromStartTime);
        if (ts == null && start != null && off != null) ts = start + Math.round(off * 60);
        if (ts == null) continue;
        out.push(fix(ts, parseLatLng(po.point), PATH_ACCURACY_M, spans.at(ts)));
      }
      break;
    }
    case "rawSignals": {
      const pos = obj(r.position);
      if (!pos) break;
      const ts = parseTime(pos.timestamp);
      const acc = num(pos.accuracyMeters) ?? PATH_ACCURACY_M;
      if (ts == null || acc > MAX_RAW_ACCURACY_M) break;
      out.push(
        fix(ts, parseLatLng(pos.LatLng ?? pos.latLng), acc, spans.at(ts), {
          altitude: num(pos.altitudeMeters),
          speed: num(pos.speedMetersPerSecond),
        }),
      );
      break;
    }
    case "locations": {
      const ts = parseTime(r.timestamp ?? r.timestampMs);
      const acc = num(r.accuracy) ?? PATH_ACCURACY_M;
      if (ts == null || acc > MAX_RAW_ACCURACY_M) break;
      // [{timestamp, activity: [{type, confidence}, ...]}], most likely first.
      const guess = obj(arr(obj(arr(r.activity)[0])?.activity)[0]);
      out.push(fix(ts, parseLatLng(r), acc, mapActivity(guess?.type), { altitude: num(r.altitude) }));
      break;
    }
    case "timelineObjects": {
      const pv = obj(r.placeVisit);
      const as = obj(r.activitySegment);
      const seg = pv ?? as;
      if (!seg) break;
      const d = obj(seg.duration);
      const start = timeOf(d, "startTimestamp");
      const end = timeOf(d, "endTimestamp");
      if (pv) {
        const loc = obj(pv.location);
        const centre =
          pv.centerLatE7 != null ? parseLatLng({ latitudeE7: pv.centerLatE7, longitudeE7: pv.centerLngE7 }) : null;
        const ll = parseLatLng(loc) ?? centre;
        out.push(fix(start, ll, VISIT_ACCURACY_M, "still"), fix(end, ll, VISIT_ACCURACY_M, "still"));
      } else if (as) {
        const a = mapActivity(as.activityType ?? obj(arr(as.activities)[0])?.activityType);
        out.push(
          fix(start, parseLatLng(as.startLocation), PATH_ACCURACY_M, a),
          fix(end, parseLatLng(as.endLocation), PATH_ACCURACY_M, a),
        );
      }
      for (const p of arr(obj(seg.simplifiedRawPath)?.points)) {
        const po = obj(p);
        const ts = po ? parseTime(po.timestamp ?? po.timestampMs) : null;
        if (!po || ts == null) continue;
        out.push(fix(ts, parseLatLng(po), num(po.accuracyMeters) ?? PATH_ACCURACY_M, pv ? "still" : spans.at(ts)));
      }
      break;
    }
  }
  return out.filter((f): f is GoogleFix => f != null);
}
