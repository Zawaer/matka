// Match a trip's GPS track against public-transport route shapes (GTFS).
//
// The track is walked point by point; a leg grows while at least one route
// shape stays within NEAR_M of every point (a couple of misses allowed, for GPS
// noise and metro tunnels) and the position along that shape keeps moving
// forward. A leg counts when it covers MIN_LEG_M along the shape at vehicle
// speed, so walking along a bus route isn't "riding the bus". Shared corridors
// keep every line that fits, best first. Pure: no I/O.

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

  /** Shapes within NEAR_M of the point: shape index -> position along it (m). */
  near(lat: number, lon: number): Map<number, number> {
    const best = new Map<number, { d: number; along: number }>();
    const ci = Math.floor(lat / CELL_LAT);
    const cj = Math.floor(lon / CELL_LON);
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++)
        for (const p of this.grid.get(`${ci + di}:${cj + dj}`) ?? []) {
          const d = dist(lat, lon, p.lat, p.lon);
          if (d > NEAR_M) continue;
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
  return mergeLegs(legs);
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

/** GTFS route_type -> kind (basic and extended types, as HSL uses them). */
export function kindOfRouteType(t: number): TransitKind | null {
  if (t === 0 || t === 900 || (t >= 900 && t < 1000)) return "tram";
  if (t === 1 || t === 401 || t === 402) return "metro";
  if (t === 2 || (t >= 100 && t < 200)) return "train";
  if (t === 3 || (t >= 700 && t < 800) || t === 200) return "bus";
  if (t === 4 || t === 1000 || t === 1200) return "boat";
  return null;
}
