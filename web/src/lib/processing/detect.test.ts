import { describe, expect, it } from "vitest";
import { classifyMode, detect, type DPoint } from "./detect";

// Helsinki-ish. 0.001° lat ≈ 111 m.
const HOME = { lat: 60.17, lon: 24.94 };
const WORK = { lat: 60.2, lon: 24.94 }; // ~3.3 km north
const T0 = 1_760_000_000;

const at = (ts: number, lat: number, lon: number, extra: Partial<DPoint> = {}): DPoint => ({
  ts,
  lat,
  lon,
  accuracy: 10,
  speed: null,
  ...extra,
});

/** Fixes every `step` s for `secs` around a spot, with ±20 m jitter. */
function dwell(start: number, secs: number, spot: { lat: number; lon: number }, step = 60) {
  const out: DPoint[] = [];
  for (let t = 0; t <= secs; t += step) {
    const j = ((t / step) % 3) - 1; // -1, 0, 1
    out.push(at(start + t, spot.lat + j * 0.00018, spot.lon + j * 0.0002));
  }
  return out;
}

/** Straight-line travel from a to b at `speed` m/s, one fix every `step` s. */
function travel(start: number, a: typeof HOME, b: typeof HOME, speed: number, step = 30) {
  const dist = 3300; // HOME↔WORK
  const secs = dist / speed;
  const out: DPoint[] = [];
  for (let t = step; t < secs; t += step) {
    const f = t / secs;
    out.push(at(start + t, a.lat + (b.lat - a.lat) * f, a.lon + (b.lon - a.lon) * f));
  }
  return { pts: out, end: start + secs };
}

const kinds = (o: ReturnType<typeof detect>) => o.map((x) => x.kind);

describe("detect", () => {
  it("finds home → trip → work", () => {
    const home = dwell(T0, 3600, HOME);
    const move = travel(T0 + 3600, HOME, WORK, 12); // 43 km/h
    const work = dwell(Math.ceil(move.end), 3600, WORK);
    const out = detect([...home, ...move.pts, ...work]);

    expect(kinds(out)).toEqual(["stay", "trip", "stay"]);
    const [h, t, w] = out;
    if (h.kind !== "stay" || t.kind !== "trip" || w.kind !== "stay") throw 0;
    expect(h.stay.start).toBe(T0);
    expect(h.stay.lat).toBeCloseTo(HOME.lat, 3);
    expect(t.trip.mode).toBe("driving");
    expect(t.trip.distance).toBeGreaterThan(3000);
    expect(t.trip.distance).toBeLessThan(3800);
    expect(t.trip.start).toBeGreaterThanOrEqual(h.stay.end);
    expect(t.trip.end).toBe(w.stay.start);
    expect(w.stay.lat).toBeCloseTo(WORK.lat, 3);
  });

  it("keeps a stay through hours of silence (distance-filtered collector)", () => {
    // One fix on arrival, nothing for 8 h, then leaving.
    const arrive = at(T0, HOME.lat, HOME.lon);
    const leave = travel(T0 + 8 * 3600, HOME, WORK, 1.4); // walking
    const work = dwell(Math.ceil(leave.end), 1800, WORK);
    const out = detect([arrive, ...leave.pts, ...work]);

    expect(kinds(out)).toEqual(["stay", "trip", "stay"]);
    const s = out[0];
    if (s.kind !== "stay") throw 0;
    expect(s.stay.end - s.stay.start).toBeGreaterThan(7.9 * 3600);
    const t = out[1];
    if (t.kind !== "trip") throw 0;
    expect(t.trip.mode).toBe("walking");
  });

  it("ignores a single GPS jump during a stay", () => {
    const pts = dwell(T0, 3600, HOME);
    pts.splice(30, 0, at(pts[29].ts + 1, HOME.lat + 0.01, HOME.lon)); // 1.1 km blip
    const out = detect(pts);
    expect(kinds(out)).toEqual(["stay"]);
  });

  it("merges a stay interrupted by a short nearby excursion", () => {
    const a = dwell(T0, 1800, HOME);
    const away = [at(T0 + 1900, HOME.lat + 0.0015, HOME.lon), at(T0 + 2000, HOME.lat + 0.0016, HOME.lon)];
    const b = dwell(T0 + 2100, 1800, HOME);
    const out = detect([...a, ...away, ...b]);
    expect(kinds(out)).toEqual(["stay"]);
    const s = out[0];
    if (s.kind !== "stay") throw 0;
    expect(s.stay.end).toBe(T0 + 2100 + 1800);
  });

  it("drops inaccurate fixes and teleports", () => {
    const pts = dwell(T0, 1800, HOME);
    pts.push(at(T0 + 1801, 10, 10)); // other continent, 1 s later
    pts.push(at(T0 + 1802, HOME.lat, HOME.lon, { accuracy: 2000 }));
    expect(kinds(detect(pts))).toEqual(["stay"]);
  });

  it("treats a short pause as part of the move", () => {
    const m1 = travel(T0, HOME, WORK, 12);
    const pts = m1.pts.slice(0, 5);
    // two minutes at a red light
    pts.push(...dwell(pts[4].ts + 30, 120, { lat: pts[4].lat, lon: pts[4].lon }, 30));
    expect(kinds(detect(pts))).toEqual(["trip"]);
  });
});

describe("classifyMode", () => {
  it("buckets by 80th percentile speed", () => {
    expect(classifyMode([1.2, 1.4, 1.3], 1000, 800)).toBe("walking");
    expect(classifyMode([5, 6, 4], 5000, 1000)).toBe("cycling");
    expect(classifyMode([15, 25, 3], 20000, 1200)).toBe("driving");
    expect(classifyMode([230, 240], 400_000, 1800)).toBe("flying");
    expect(classifyMode([], 1000, 0)).toBe("unknown");
  });
});
