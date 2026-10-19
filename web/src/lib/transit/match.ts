// Match a trip's GPS track against public-transport route shapes (GTFS).
//
// The track is walked point by point; a leg grows while at least one route
// shape stays within NEAR_M of every point (a couple of misses allowed, for GPS
// noise and metro tunnels) and the position along that shape keeps moving
// forward. A leg counts when it covers MIN_LEG_M along the shape at vehicle
// speed, so walking along a bus route isn't "riding the bus". Shared corridors
// keep every line that fits, best first. Legs not separated by a transfer
// dwell must be one line (resolveRides). Pure: no I/O.

export type TransitKind = "bus" | "tram" | "metro" | "train" | "boat";

export type Shape = { key: string; kind: TransitKind; line: string; coords: [number, number][] };
export type Stop = { name: string; lat: number; lon: number };
export type TrackPoint = { lat: number; lon: number; ts: number }; // ts: epoch seconds

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

export function matchLegs(index: TransitIndex, pts: TrackPoint[]): Leg[] {
  const legs: Leg[] = [];
  let i = 0;
  while (i < pts.length - 1) {
    const startNear = index.near(pts[i].lat, pts[i].lon);
    if (startNear.size === 0) {
      i++;
      continue;
    }
    let state = new Map(startNear);
    let j = i;
    let lastGood = i;
    let misses = 0;
    while (j + 1 < pts.length && state.size > 0) {
      j++;
      const nb = index.near(pts[j].lat, pts[j].lon);
      const next = new Map<number, number>();
      for (const [s, along] of state) {
        const a = nb.get(s);
        if (a !== undefined && a >= along - 40) next.set(s, a);
      }
      if (next.size > 0) {
        state = next;
        lastGood = j;
        misses = 0;
      } else if (++misses > MAX_MISSES) {
        break;
      }
    }
    const spans = [...state]
      .map(([s, along]) => ({ s, span: along - (startNear.get(s) ?? along) }))
      .filter((x) => x.span >= MIN_LEG_M)
      .sort((a, b) => b.span - a.span);
    const seconds = pts[lastGood].ts - pts[i].ts;
    if (lastGood > i && spans.length > 0 && seconds > 0 && (spans[0].span / seconds) * 3.6 >= MIN_LEG_KMH) {
      const best = index.shapes[spans[0].s];
      const lines: string[] = [];
      for (const { s } of spans) {
        const sh = index.shapes[s];
        if (sh.kind === best.kind && !lines.includes(sh.line)) lines.push(sh.line);
      }
      legs.push({
        kind: best.kind,
        lines,
        fromStop: index.nearestStop(pts[i].lat, pts[i].lon),
        toStop: index.nearestStop(pts[lastGood].lat, pts[lastGood].lon),
        start: pts[i].ts,
        end: pts[lastGood].ts,
        distanceM: spans[0].span,
      });
      i = lastGood;
    } else {
      i++;
    }
  }
  return resolveRides(index, pts, mergeLegs(legs));
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
export function resolveRides(index: TransitIndex, pts: TrackPoint[], legs: Leg[]): Leg[] {
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
    const merged = oneLine(index, pts, g);
    if (merged) {
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
      while (i > 0 && follows(items[i - 1])) {
        const [l] = items.splice(--i, 1);
        Object.assign(r, { start: l.start, fromStop: l.fromStop, distanceM: r.distanceM + l.distanceM });
      }
      while (i + 1 < items.length && follows(items[i + 1])) {
        const [l] = items.splice(i + 1, 1);
        Object.assign(r, { end: l.end, toStop: l.toStop, distanceM: r.distanceM + l.distanceM });
      }
    }
    let run: Leg[] = [];
    const flush = () => {
      if (run.length === 1) out.push(run[0]);
      else if (run.length > 1) {
        const m = oneLine(index, pts, run);
        if (m) out.push(m);
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

/** The single line this transfer-less run of legs was ridden on, as one leg, if any. */
function oneLine(index: TransitIndex, pts: TrackPoint[], g: Leg[]): Leg | null {
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
      return alongLine(index, inLeg(pts, l), kind, line) !== null;
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
  if (w.length === 0) return null;
  const per = new Map<number, { n: number; first: number; last: number }>();
  for (const p of w)
    for (const [s, a] of index.near(p.lat, p.lon, LOOSE_M)) {
      const sh = index.shapes[s];
      if (sh.kind !== kind || sh.line !== line) continue;
      const v = per.get(s);
      if (v) {
        v.n++;
        v.last = a;
      } else per.set(s, { n: 1, first: a, last: a });
    }
  let best: number | null = null;
  for (const v of per.values())
    if (v.n >= share * w.length && v.last >= v.first) best = Math.max(best ?? 0, v.last - v.first);
  return best;
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
