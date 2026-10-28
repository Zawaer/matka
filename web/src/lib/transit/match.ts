// Match a trip's GPS track against public-transport route shapes (GTFS).
//
// The track is walked point by point; a leg grows while at least one route
// shape stays within NEAR_M of every point (a couple of misses allowed, for GPS
// noise and metro tunnels) and the position along that shape keeps moving
// forward. A leg counts when it covers MIN_LEG_M along the shape at vehicle
// speed, so walking along a bus route isn't "riding the bus". Shared corridors
// keep every line that fits, best first. Legs not separated by a transfer
// dwell must be one line (resolveRides). Pure: no I/O.
//
// Sparse tracks (Smart Tracking: Wi-Fi/cell standby, a 100 m distance filter)
// are handled in three ways: coarse fixes are left out, a long hop between two
// fixes only continues a bus/tram leg when the straight line between them stays
// in a corridor around the route, and a GPS gap with a station of the same
// metro/train line at both ends, crossed at that line's speed, is bridged as a
// ride (bridgeRailGaps: the metro runs underground).

/** Bump when the matcher changes, so every trip is matched again (run.ts). */
export const MATCHER_VERSION = "3";

export type TransitKind = "bus" | "tram" | "metro" | "train" | "boat";

/** trips: how many timetabled trips use this shape (null/absent = unknown). */
export type Shape = { key: string; kind: TransitKind; line: string; coords: [number, number][]; trips?: number | null };
export type Stop = { name: string; lat: number; lon: number };
/** ts: epoch seconds; accuracy: metres (null/absent = unknown, trusted). */
export type TrackPoint = { lat: number; lon: number; ts: number; accuracy?: number | null };

export type Leg = {
  kind: TransitKind;
  lines: string[];
  fromStop: string | null;
  toStop: string | null;
  start: number;
  end: number;
  distanceM: number;
};

const NEAR_M = 60;
const MIN_LEG_M = 800;
const MAX_MISSES = 2;
/** Slower than this over a whole leg is walking next to the route. */
const MIN_LEG_KMH = 9;
const STOP_RADIUS_M = 250;
/** A transfer: this long without getting further than DWELL_KMH allows (MIN_LEG_KMH: slower than any ride). */
const TRANSFER_DWELL_S = 90;
const DWELL_KMH = 9;
const DWELL_RADIUS_M = 600; // just bounds the search
/** How far into the legs on either side of a junction a transfer dwell may sit. */
const DWELL_MARGIN_S = 300;
/** A line "explains" a leg when this share of its points lie within LOOSE_M of it. */
const LOOSE_M = 150;
const EXPLAINED_SHARE = 0.8;
const STEP_M = 25;
/** Fixes vaguer than this (cell towers, coarse Wi-Fi) are left out of matching. */
export const MAX_FIX_ACCURACY_M = 150;
/** Hops between two fixes longer than this are checked against the route's corridor. */
const LONG_HOP_M = 300;
const HOP_SAMPLE_M = 100;
/** Fastest a bus or tram plausibly averages between two fixes. */
const MAX_STREET_KMH = 100;
const maxKmh = (k: TransitKind) => (k === "metro" || k === "train" ? BRIDGE_MAX_KMH : k === "boat" ? 80 : MAX_STREET_KMH);
/** A GPS gap this long or longer may be bridged along a metro/train line. */
const BRIDGE_MIN_S = 120;
const BRIDGE_MAX_S = 45 * 60;
/** How far a gap's end fixes may be from the track (exits, escalators, Wi-Fi fixes)... */
const BRIDGE_NEAR_M = 300;
/** ...and from a station of that line. */
const BRIDGE_STATION_M = 400;
/** A station "is on" a line when the line's shape passes this close to the stop. */
const STATION_ON_LINE_M = 120;
/** Average speed across a bridged gap, walks to and from the platforms included. */
const BRIDGE_MIN_KMH = 15;
const BRIDGE_MAX_KMH = 130;
const CELL_LAT = 0.001;
const CELL_LON = 0.002;

function dist(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const x = ((bLon - aLon) * Math.PI) / 180 * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180);
  const y = ((bLat - aLat) * Math.PI) / 180;
  return 6_371_000 * Math.hypot(x, y);
}

const cellKey = (lat: number, lon: number) => `${Math.floor(lat / CELL_LAT)}:${Math.floor(lon / CELL_LON)}`;

type Sample = { s: number; along: number; lat: number; lon: number };

export class TransitIndex {
  private grid = new Map<string, Sample[]>();
  private stopGrid = new Map<string, Stop[]>();
  readonly shapes: Shape[];
  readonly bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];

  constructor(shapes: Shape[], stops: Stop[]) {
    this.shapes = shapes;
    shapes.forEach((sh, s) => {
      let along = 0;
      for (let k = 0; k < sh.coords.length; k++) {
        const [lon, lat] = sh.coords[k];
        this.bbox[0] = Math.min(this.bbox[0], lon);
        this.bbox[1] = Math.min(this.bbox[1], lat);
        this.bbox[2] = Math.max(this.bbox[2], lon);
        this.bbox[3] = Math.max(this.bbox[3], lat);
        if (k === 0) {
          this.add(this.grid, cellKey(lat, lon), { s, along: 0, lat, lon });
          continue;
        }
        const [plon, plat] = sh.coords[k - 1];
        const seg = dist(plat, plon, lat, lon);
        const n = Math.max(1, Math.floor(seg / STEP_M));
        for (let i = 1; i <= n; i++) {
          const f = i / n;
          const la = plat + (lat - plat) * f;
          const lo = plon + (lon - plon) * f;
          this.add(this.grid, cellKey(la, lo), { s, along: along + seg * f, lat: la, lon: lo });
        }
        along += seg;
      }
    });
    for (const st of stops) this.add(this.stopGrid, cellKey(st.lat, st.lon), st);
  }

  private add<T>(m: Map<string, T[]>, k: string, v: T) {
    const a = m.get(k);
    if (a) a.push(v);
    else m.set(k, [v]);
  }

  covers(lat: number, lon: number): boolean {
    const [w, s, e, n] = this.bbox;
    return lon >= w - 0.05 && lon <= e + 0.05 && lat >= s - 0.05 && lat <= n + 0.05;
  }

  /** Shapes within `radius` of the point: shape index -> position along it (m). */
  near(lat: number, lon: number, radius = NEAR_M): Map<number, number> {
    const best = new Map<number, { d: number; along: number }>();
    const ci = Math.floor(lat / CELL_LAT);
    const cj = Math.floor(lon / CELL_LON);
    const ri = Math.ceil(radius / (CELL_LAT * 111_320));
    const rj = Math.ceil(radius / (CELL_LON * 111_320 * Math.cos((lat * Math.PI) / 180)));
    for (let di = -ri; di <= ri; di++)
      for (let dj = -rj; dj <= rj; dj++)
        for (const p of this.grid.get(`${ci + di}:${cj + dj}`) ?? []) {
          const d = dist(lat, lon, p.lat, p.lon);
          if (d > radius) continue;
          const cur = best.get(p.s);
          if (!cur || d < cur.d) best.set(p.s, { d, along: p.along });
        }
    return new Map([...best].map(([s, v]) => [s, v.along]));
  }

  /** Stops within `radius` m of the point, nearest first. */
  stopsNear(lat: number, lon: number, radius: number): (Stop & { d: number })[] {
    const out: (Stop & { d: number })[] = [];
    const ci = Math.floor(lat / CELL_LAT);
    const cj = Math.floor(lon / CELL_LON);
    const ri = Math.ceil(radius / (CELL_LAT * 111_320));
    const rj = Math.ceil(radius / (CELL_LON * 111_320 * Math.cos((lat * Math.PI) / 180)));
    for (let di = -ri; di <= ri; di++)
      for (let dj = -rj; dj <= rj; dj++)
        for (const st of this.stopGrid.get(`${ci + di}:${cj + dj}`) ?? []) {
          const d = dist(lat, lon, st.lat, st.lon);
          if (d <= radius) out.push({ ...st, d });
        }
    return out.sort((a, b) => a.d - b.d);
  }

  /** The nearest stop within `radius` that lies on shape `s` (a station of that line), by name. */
  stationOn(lat: number, lon: number, s: number, radius = BRIDGE_STATION_M): string | null {
    // Platforms lie on the track; bus stops named after the station are beside
    // it, other bus stops may happen to be above it but further away.
    let best: { name: string; score: number } | null = null;
    for (const st of this.stopsNear(lat, lon, radius)) {
      const d = this.distanceTo(st.lat, st.lon, s, STATION_ON_LINE_M);
      if (d === null) continue;
      const score = st.d + 5 * d;
      if (!best || score < best.score) best = { name: st.name, score };
    }
    return best?.name ?? null;
  }

  /** Distance from the point to shape s, if within `radius`. */
  distanceTo(lat: number, lon: number, s: number, radius: number): number | null {
    let best: number | null = null;
    const ci = Math.floor(lat / CELL_LAT);
    const cj = Math.floor(lon / CELL_LON);
    const ri = Math.ceil(radius / (CELL_LAT * 111_320));
    const rj = Math.ceil(radius / (CELL_LON * 111_320 * Math.cos((lat * Math.PI) / 180)));
    for (let di = -ri; di <= ri; di++)
      for (let dj = -rj; dj <= rj; dj++)
        for (const p of this.grid.get(`${ci + di}:${cj + dj}`) ?? []) {
          if (p.s !== s) continue;
          const d = dist(lat, lon, p.lat, p.lon);
          if (d <= radius && (best === null || d < best)) best = d;
        }
    return best;
  }

  nearestStop(lat: number, lon: number): string | null {
    let bestName: string | null = null;
    let bestD = STOP_RADIUS_M;
    const ci = Math.floor(lat / CELL_LAT);
    const cj = Math.floor(lon / CELL_LON);
    for (let di = -3; di <= 3; di++)
      for (let dj = -2; dj <= 2; dj++)
        for (const st of this.stopGrid.get(`${ci + di}:${cj + dj}`) ?? []) {
          const d = dist(lat, lon, st.lat, st.lon);
          if (d < bestD) {
            bestD = d;
            bestName = st.name;
          }
        }
    return bestName;
  }
}

/**
 * Why each line ended up matched or not, for diagnostics (lib/transit/diagnose.ts):
 * key "kind:line" -> the most telling reason (later stages win, then the longest attempt).
 */
export type MatchTrace = Map<string, { reason: string; spanM: number; stage: number }>;

function note(trace: MatchTrace | undefined, kind: TransitKind, line: string, reason: string, spanM: number, stage: number) {
  if (!trace) return;
  const k = `${kind}:${line}`;
  const cur = trace.get(k);
  if (!cur || stage > cur.stage || (stage === cur.stage && spanM >= cur.spanM)) trace.set(k, { reason, spanM: Math.round(spanM), stage });
}

const usable = (p: TrackPoint) => p.accuracy == null || p.accuracy <= MAX_FIX_ACCURACY_M;

export function matchLegs(index: TransitIndex, track: TrackPoint[], trace?: MatchTrace): Leg[] {
  const pts = track.filter(usable);
  const legs: Leg[] = [];
  let i = 0;
  while (i < pts.length - 1) {
    const startNear = index.near(pts[i].lat, pts[i].lon);
    if (startNear.size === 0) {
      i++;
      continue;
    }
    let state = new Map(startNear);
    const dropped = new Map<number, { along: number; why: string }>();
    let j = i;
    let lastGood = i;
    let misses = 0;
    while (j + 1 < pts.length && state.size > 0) {
      j++;
      const nb = index.near(pts[j].lat, pts[j].lon);
      const next = new Map<number, number>();
      const why = new Map<number, string>();
      for (const [s, along] of state) {
        const a = nb.get(s);
        if (a === undefined) why.set(s, "left its route");
        else if (a < along - 40) why.set(s, "went the other way");
        else if (STREET.has(index.shapes[s].kind) && !plausibleHop(index, s, pts[lastGood], pts[j], along, a))
          why.set(s, "jumped off its route between fixes");
        else next.set(s, a);
      }
      if (next.size > 0) {
        for (const [s, along] of state) if (!next.has(s)) dropped.set(s, { along, why: why.get(s) ?? "left its route" });
        state = next;
        lastGood = j;
        misses = 0;
      } else if (++misses > MAX_MISSES) {
        break;
      }
    }
    let spans = [...state]
      .map(([s, along]) => ({ s, span: along - (startNear.get(s) ?? along) }))
      .filter((x) => x.span >= MIN_LEG_M)
      .sort((a, b) => b.span - a.span);
    const seconds = pts[lastGood].ts - pts[i].ts;
    // Faster than the vehicle goes: the fixes jumped (a tunnel, a gap), not a ride.
    const tooFast = (x: { s: number; span: number }) => seconds > 0 && (x.span / seconds) * 3.6 > maxKmh(index.shapes[x.s].kind);
    if (trace) for (const x of spans.filter(tooFast)) note(trace, index.shapes[x.s].kind, index.shapes[x.s].line, `faster than ${maxKmh(index.shapes[x.s].kind)} km/h along it`, x.span, 1);
    spans = spans.filter((x) => !tooFast(x));
    const fast = spans.length > 0 && seconds > 0 && (spans[0].span / seconds) * 3.6 >= MIN_LEG_KMH;
    if (trace) {
      const ended = [...dropped].map(([s, d]) => ({ s, span: d.along - (startNear.get(s) ?? d.along), why: d.why }));
      for (const [s, along] of state) {
        const span = along - (startNear.get(s) ?? along);
        if (span < MIN_LEG_M) ended.push({ s, span, why: misses > MAX_MISSES ? "fixes stopped matching any line" : "trip ended" });
      }
      for (const e of ended) {
        const sh = index.shapes[e.s];
        note(trace, sh.kind, sh.line, `leg shorter than ${MIN_LEG_M} m (${Math.round(Math.max(0, e.span))} m, then ${e.why})`, e.span, 1);
      }
      if (spans.length > 0 && !fast)
        for (const { s, span } of spans) note(trace, index.shapes[s].kind, index.shapes[s].line, `slower than ${MIN_LEG_KMH} km/h along it`, span, 1);
    }
    if (lastGood > i && fast) {
      const best = index.shapes[spans[0].s];
      const lines: string[] = [];
      for (const { s, span } of spans) {
        const sh = index.shapes[s];
        if (sh.kind === best.kind && !lines.includes(sh.line)) lines.push(sh.line);
        else if (sh.kind !== best.kind) note(trace, sh.kind, sh.line, `same stretch fits ${best.kind} ${best.line} better`, span, 1);
      }
      legs.push({
        kind: best.kind,
        lines,
        fromStop: stopFor(index, pts[i], spans[0].s),
        toStop: stopFor(index, pts[lastGood], spans[0].s),
        start: pts[i].ts,
        end: pts[lastGood].ts,
        distanceM: spans[0].span,
      });
      i = lastGood;
    } else {
      i++;
    }
  }
  // A bridged gap was underground: a bus "ride" across it was only the hop between its two fixes.
  const bridges = bridgeRailGaps(index, pts, legs, trace);
  const kept = legs.flatMap((l) => {
    const b = bridges.find((x) => STREET.has(l.kind) && l.start < x.end && l.end > x.start);
    if (!b) return [l];
    for (const line of l.lines) note(trace, l.kind, line, `cut at a GPS gap bridged as ${b.kind} ${b.lines[0]}`, l.distanceM, 2);
    return [piece(index, pts, l, l.start, b.start), piece(index, pts, l, b.end, l.end)].filter((x): x is Leg => x !== null);
  });
  const all = [...kept, ...bridges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out = resolveRides(index, pts, mergeLegs(all), trace).map((l) => pruneLines(index, pts, l, trace));
  for (const l of out) l.lines.forEach((line, k) => note(trace, l.kind, line, k === 0 ? "matched" : `matched, as an alternative to ${l.lines[0]}`, l.distanceM, 4));
  return out;
}

/** A shape run by fewer trips than this share of its line's busiest shape is a rare variant. */
const MINOR_VARIANT = 0.15;

/**
 * A leg on shared track lists every line that fitted some stretch of it. Keep
 * the lines one of whose shapes runs, forwards, through both ends of the whole
 * leg (M2 doesn't reach Matinkylä, so Matinkylä -> Aalto-yliopisto is M1
 * alone), dropping lines that only do so on a rare variant when another line
 * does on a regular one, and order them by how much of the leg they explain.
 */
function pruneLines(index: TransitIndex, pts: TrackPoint[], l: Leg, trace?: MatchTrace): Leg {
  if (l.lines.length < 2) return l;
  const a = pts.find((p) => p.ts === l.start);
  const b = pts.find((p) => p.ts === l.end);
  if (!a || !b) return l;
  const radius = l.kind === "metro" || l.kind === "train" ? BRIDGE_NEAR_M : LOOSE_M;
  const na = index.near(a.lat, a.lon, radius);
  const nb = index.near(b.lat, b.lon, radius);
  const w = inLeg(pts, l);
  const busiest = new Map<string, number>();
  for (const sh of index.shapes) if (sh.kind === l.kind) busiest.set(sh.line, Math.max(busiest.get(sh.line) ?? 0, sh.trips ?? 0));
  const scored = l.lines.map((line, order) => {
    let cover = false;
    let regular = false;
    let trips = 0;
    for (const [s, from] of na) {
      const sh = index.shapes[s];
      const to = nb.get(s);
      if (sh.kind !== l.kind || sh.line !== line || to === undefined || to < from) continue;
      cover = true;
      const max = busiest.get(line) ?? 0;
      if (sh.trips == null || max === 0 || sh.trips >= MINOR_VARIANT * max) regular = true;
      trips = Math.max(trips, sh.trips ?? 0);
    }
    return { line, order, cover, regular, trips, share: lineShare(index, w, l.kind, line) };
  });
  let keep = scored.filter((x) => x.cover);
  if (keep.length === 0) return l;
  if (keep.some((x) => x.regular)) keep = keep.filter((x) => x.regular);
  keep.sort((x, y) => y.share - x.share || y.trips - x.trips || x.order - y.order);
  for (const x of scored)
    if (!keep.includes(x))
      note(trace, l.kind, x.line, x.cover ? "only a rare variant of it runs through both ends of the leg" : "its route doesn't run through both ends of the leg", l.distanceM, 4);
  return { ...l, lines: keep.map((x) => x.line) };
}

/** The stop to name a leg's end by: for rail the station of that line, else the nearest stop. */
function stopFor(index: TransitIndex, p: TrackPoint, s: number): string | null {
  const k = index.shapes[s].kind;
  return ((k === "metro" || k === "train") && index.stationOn(p.lat, p.lon, s, STOP_RADIUS_M)) || index.nearestStop(p.lat, p.lon);
}

/** The part of leg l between two of its fixes, if still a ride (MIN_LEG_M along the fixes). */
function piece(index: TransitIndex, pts: TrackPoint[], l: Leg, from: number, to: number): Leg | null {
  const w = pts.filter((p) => p.ts >= from && p.ts <= to);
  if (w.length < 2) return null;
  let m = 0;
  for (let k = 1; k < w.length; k++) m += dist(w[k - 1].lat, w[k - 1].lon, w[k].lat, w[k].lon);
  if (m < MIN_LEG_M) return null;
  const a = w[0];
  const b = w[w.length - 1];
  return { ...l, start: a.ts, end: b.ts, fromStop: index.nearestStop(a.lat, a.lon), toStop: index.nearestStop(b.lat, b.lon), distanceM: m };
}

/**
 * Whether a bus/tram on shape `s` could have gone from fix p (at `from` along
 * it) to fix q (at `to`): short hops always; a long hop (sparse fixes) only
 * when the route doesn't loop away from the straight line between them, the
 * speed along it is a bus's, and that straight line stays within a corridor
 * around the route (wider for longer hops, where corners cut deeper).
 */
function plausibleHop(index: TransitIndex, s: number, p: TrackPoint, q: TrackPoint, from: number, to: number): boolean {
  const chord = dist(p.lat, p.lon, q.lat, q.lon);
  if (chord < LONG_HOP_M) return true;
  const along = to - from;
  if (along > 2.5 * chord + 400) return false;
  const dt = q.ts - p.ts;
  if (dt > 0 && (along / dt) * 3.6 > MAX_STREET_KMH) return false;
  const corridor = Math.min(500, Math.max(150, 0.3 * chord));
  const n = Math.floor(chord / HOP_SAMPLE_M);
  for (let k = 1; k < n; k++) {
    const f = k / n;
    if (!index.near(p.lat + (q.lat - p.lat) * f, p.lon + (q.lon - p.lon) * f, corridor).has(s)) return false;
  }
  return true;
}

/**
 * Metro and train tunnels: no fixes for minutes, and the fixes on either side
 * at the station exits, often further from the track than NEAR_M. A gap whose
 * two end fixes are each near a station of the same line, in that line's
 * direction and crossed at its speed, was a ride on it.
 */
function bridgeRailGaps(index: TransitIndex, pts: TrackPoint[], legs: Leg[], trace?: MatchTrace): Leg[] {
  const out: Leg[] = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const p = pts[k];
    const q = pts[k + 1];
    const dt = q.ts - p.ts;
    if (dt < BRIDGE_MIN_S || dt > BRIDGE_MAX_S) continue;
    if (legs.some((l) => l.start <= p.ts && l.end >= q.ts && l.kind !== "bus" && l.kind !== "tram")) continue;
    const nq = index.near(q.lat, q.lon, BRIDGE_NEAR_M);
    const found: { s: number; span: number; from: string; to: string }[] = [];
    for (const [s, ap] of index.near(p.lat, p.lon, BRIDGE_NEAR_M)) {
      const sh = index.shapes[s];
      if (sh.kind !== "metro" && sh.kind !== "train") continue;
      const aq = nq.get(s);
      if (aq === undefined) continue;
      const span = aq - ap;
      const kmh = (span / dt) * 3.6;
      if (span < MIN_LEG_M) {
        if (span > 0) note(trace, sh.kind, sh.line, `gap bridge: shorter than ${MIN_LEG_M} m`, span, 1);
        continue;
      }
      if (kmh < BRIDGE_MIN_KMH || kmh > BRIDGE_MAX_KMH) {
        note(trace, sh.kind, sh.line, `gap bridge: ${Math.round(kmh)} km/h outside ${BRIDGE_MIN_KMH}-${BRIDGE_MAX_KMH}`, span, 1);
        continue;
      }
      const from = index.stationOn(p.lat, p.lon, s);
      const to = index.stationOn(q.lat, q.lon, s);
      if (!from || !to || from === to) {
        note(trace, sh.kind, sh.line, `gap bridge: no station of the line at ${from ? "the far end" : "the near end"}`, span, 1);
        continue;
      }
      found.push({ s, span, from, to });
    }
    if (found.length === 0) continue;
    found.sort((a, b) => b.span - a.span);
    const best = found[0];
    const kind = index.shapes[best.s].kind;
    const lines = [...new Set(found.filter((f) => index.shapes[f.s].kind === kind).map((f) => index.shapes[f.s].line))];
    out.push({ kind, lines, fromStop: best.from, toStop: best.to, start: p.ts, end: q.ts, distanceM: best.span });
  }
  return out;
}

/**
 * Pieces of one ride become one leg: same line(s) split by a GPS gap, or rail
 * legs of the same kind back to back (metro lines share track, so M2 then M1
 * through a junction is one ride). Consecutive buses on different lines stay
 * apart: that is a real transfer.
 */
function mergeLegs(legs: Leg[]): Leg[] {
  const out: Leg[] = [];
  for (const l of legs) {
    const prev = out[out.length - 1];
    const shared = prev ? prev.lines.filter((x) => l.lines.includes(x)) : [];
    const rail = l.kind === "metro" || l.kind === "train";
    if (prev && prev.kind === l.kind && (shared.length > 0 || rail) && l.start - prev.end <= 180) {
      prev.lines = shared.length > 0 ? shared : [...new Set([...l.lines, ...prev.lines])];
      prev.toStop = l.toStop;
      prev.end = l.end;
      prev.distanceM += l.distanceM;
    } else out.push({ ...l });
  }
  return out;
}

/**
 * Changing vehicles takes a stop: getting off, walking, waiting. Legs with no
 * such dwell between them were one vehicle, so they must be one line. When a
 * line explains all of them (it is on every leg, the leg is sandwiched between
 * two of its legs, or the leg's points lie along it anyway) they become one
 * leg of that line; when none does, the "ride" changed line without ever
 * stopping, which is a car following bus streets, and the legs are dropped
 * (buses and trams only; see below).
 */
export function resolveRides(index: TransitIndex, pts: TrackPoint[], legs: Leg[], trace?: MatchTrace): Leg[] {
  const groups: Leg[][] = [];
  for (const l of legs) {
    const g = groups[groups.length - 1];
    const prev = g?.[g.length - 1];
    if (prev && !hasDwell(pts, prev.end - DWELL_MARGIN_S, l.start + DWELL_MARGIN_S)) g.push(l);
    else groups.push([l]);
  }
  const out: Leg[] = [];
  for (const g of groups) {
    if (g.length === 1) {
      out.push(g[0]);
      continue;
    }
    const why = new Map<string, string>();
    const merged = oneLine(index, pts, g, why);
    if (merged) {
      for (const l of g)
        for (const line of l.lines)
          if (!(l.kind === merged.kind && merged.lines.includes(line)))
            note(trace, l.kind, line, `no dwell between legs: one ride on ${merged.kind} ${merged.lines[0]}`, l.distanceM, 3);
      out.push(merged);
      continue;
    }
    // Rail stations are entered underground or off the street, where GPS
    // rarely shows the walk or the wait: no dwell proves nothing next to a
    // metro or train leg. A rail leg takes in the bus legs beside it that
    // follow its line (buses along the track while GPS is poor), and only the
    // remaining runs of buses and trams must be one line.
    const items = g.map((l) => ({ ...l }));
    for (let i = 0; i < items.length; i++) {
      const r = items[i];
      if (STREET.has(r.kind)) continue;
      const follows = (l: Leg) => STREET.has(l.kind) && r.lines.some((x) => alongLine(index, inLeg(pts, l), r.kind, x) !== null);
      const absorbed = (l: Leg) => {
        for (const line of l.lines) note(trace, l.kind, line, `no dwell before ${r.kind} ${r.lines[0]}, and runs along it: absorbed`, l.distanceM, 3);
      };
      while (i > 0 && follows(items[i - 1])) {
        const [l] = items.splice(--i, 1);
        absorbed(l);
        Object.assign(r, { start: l.start, fromStop: l.fromStop, distanceM: r.distanceM + l.distanceM });
      }
      while (i + 1 < items.length && follows(items[i + 1])) {
        const [l] = items.splice(i + 1, 1);
        absorbed(l);
        Object.assign(r, { end: l.end, toStop: l.toStop, distanceM: r.distanceM + l.distanceM });
      }
    }
    let run: Leg[] = [];
    const flush = () => {
      if (run.length === 1) out.push(run[0]);
      else if (run.length > 1) {
        const runWhy = new Map<string, string>();
        const m = oneLine(index, pts, run, runWhy);
        if (m) out.push(m);
        for (const l of run)
          for (const line of l.lines)
            if (!m || !(l.kind === m.kind && m.lines.includes(line)))
              note(
                trace,
                l.kind,
                line,
                m
                  ? `no dwell between legs: one ride on ${m.kind} ${m.lines[0]}`
                  : `no dwell between legs and no one line explains them (${runWhy.get(`${l.kind}:${line}`) ?? "not on the other legs"}): dropped as a car`,
                l.distanceM,
                3,
              );
      }
      run = [];
    };
    for (const l of items) {
      if (STREET.has(l.kind)) run.push(l);
      else {
        flush();
        out.push(l);
      }
    }
    flush();
  }
  return out;
}

const STREET = new Set<TransitKind>(["bus", "tram"]);

/**
 * Stood still for a while: a stretch of TRANSFER_DWELL_S or more that never
 * gets further from where it began than walking pace allows (so a loop that
 * comes back doesn't count).
 */
function hasDwell(pts: TrackPoint[], from: number, to: number): boolean {
  const w = pts.filter((p) => p.ts >= from && p.ts <= to);
  for (let k = 0; k < w.length; k++) {
    let far = 0;
    for (let m = k + 1; m < w.length; m++) {
      far = Math.max(far, dist(w[k].lat, w[k].lon, w[m].lat, w[m].lon));
      if (far > DWELL_RADIUS_M) break;
      const dt = w[m].ts - w[k].ts;
      if (dt >= TRANSFER_DWELL_S && far <= (dt * DWELL_KMH) / 3.6) return true;
    }
  }
  return false;
}

const inLeg = (pts: TrackPoint[], l: Leg) => pts.filter((p) => p.ts >= l.start && p.ts <= l.end);

/**
 * The single line this transfer-less run of legs was ridden on, as one leg, if
 * any. `why` collects, per "kind:line" tried, the leg it failed to explain.
 */
function oneLine(index: TransitIndex, pts: TrackPoint[], g: Leg[], why?: Map<string, string>): Leg | null {
  const direct = new Map<string, { kind: TransitKind; line: string; m: number }>();
  for (const l of g)
    for (const line of l.lines) {
      const k = `${l.kind}:${line}`;
      const c = direct.get(k) ?? { kind: l.kind, line, m: 0 };
      c.m += l.distanceM;
      direct.set(k, c);
    }
  const on = (l: Leg, kind: TransitKind, line: string) => l.kind === kind && l.lines.includes(line);
  for (const { kind, line } of [...direct.values()].sort((a, b) => b.m - a.m)) {
    const ok = g.every((l, i) => {
      if (on(l, kind, line)) return true;
      if (g.slice(0, i).some((x) => on(x, kind, line)) && g.slice(i + 1).some((x) => on(x, kind, line))) return true;
      if (alongLine(index, inLeg(pts, l), kind, line) !== null) return true;
      if (why && !why.has(`${kind}:${line}`)) {
        const pct = Math.round(100 * lineShare(index, inLeg(pts, l), kind, line));
        why.set(`${kind}:${line}`, `coverage ${pct}% < ${EXPLAINED_SHARE * 100}% on the ${l.kind} ${l.lines[0]} leg`);
      }
      return false;
    });
    if (!ok) continue;
    const own = g.filter((l) => on(l, kind, line));
    const lines = [line, ...own[0].lines.filter((x) => x !== line && own.every((l) => l.lines.includes(x)))];
    const first = g[0];
    const last = g[g.length - 1];
    const ends = pts.filter((p) => p.ts === first.start || p.ts === last.end);
    const span = ends.length >= 2 ? alongLine(index, [ends[0], ends[ends.length - 1]], kind, line, 1) : null;
    const sum = g.reduce((a, l) => a + l.distanceM, 0);
    return {
      kind,
      lines,
      fromStop: first.fromStop,
      toStop: last.toStop,
      start: first.start,
      end: last.end,
      distanceM: Math.max(sum, span ?? 0),
    };
  }
  return null;
}

/**
 * Whether these points follow one shape of the line forwards, within LOOSE_M
 * for at least `share` of them (GPS wanders further than NEAR_M on a fast
 * road). Returns the distance covered along that shape, or null.
 */
function alongLine(index: TransitIndex, w: TrackPoint[], kind: TransitKind, line: string, share = EXPLAINED_SHARE): number | null {
  let best: number | null = null;
  for (const v of perShape(index, w, kind, line, LOOSE_M).values())
    if (v.n >= share * w.length && v.last >= v.first) best = Math.max(best ?? 0, v.last - v.first);
  return best;
}

/** The best share of these points within `radius` of one forward shape of the line (0..1). */
export function lineShare(index: TransitIndex, w: TrackPoint[], kind: TransitKind, line: string, radius = LOOSE_M): number {
  if (w.length === 0) return 0;
  let best = 0;
  for (const v of perShape(index, w, kind, line, radius).values()) if (v.last >= v.first) best = Math.max(best, v.n / w.length);
  return best;
}

function perShape(index: TransitIndex, w: TrackPoint[], kind: TransitKind, line: string, radius: number) {
  const per = new Map<number, { n: number; first: number; last: number }>();
  for (const p of w)
    for (const [s, a] of index.near(p.lat, p.lon, radius)) {
      const sh = index.shapes[s];
      if (sh.kind !== kind || sh.line !== line) continue;
      const v = per.get(s);
      if (v) {
        v.n++;
        v.last = a;
      } else per.set(s, { n: 1, first: a, last: a });
    }
  return per;
}

/** GTFS route_type -> kind (basic and extended types, as HSL uses them). */
export function kindOfRouteType(t: number): TransitKind | null {
  if (t === 0 || t === 900 || (t >= 900 && t < 1000)) return "tram";
  if (t === 1 || t === 401 || t === 402) return "metro";
  if (t === 2 || (t >= 100 && t < 200)) return "train";
  if (t === 3 || (t >= 700 && t < 800) || t === 200) return "bus";
  if (t === 4 || t === 1000 || t === 1200) return "boat";
  return null;
}
