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

describe("recording gaps", () => {
  const trips = (o: ReturnType<typeof detect>) => o.flatMap((x) => (x.kind === "trip" ? [x.trip] : []));
  const stays = (o: ReturnType<typeof detect>) => o.flatMap((x) => (x.kind === "stay" ? [x.stay] : []));

  it("ends a stay at its last fix when hours of silence end far away", () => {
    // Recording off for 10 h, next fix 3.3 km away: the phone was not lying still.
    const home = dwell(T0, 1800, HOME);
    const work = dwell(T0 + 1800 + 10 * 3600, 1800, WORK);
    const out = detect([...home, ...work]);
    expect(kinds(out)).toEqual(["stay", "stay"]);
    const [h] = stays(out);
    expect(h.end).toBeLessThanOrEqual(T0 + 1800 + 5 * 60);
  });

  it("doesn't invent a trip across the hole, and keeps where it was last seen", () => {
    // Ride to work, one fix on arrival, then nothing until back home 10 h later.
    const home = dwell(T0, 1800, HOME);
    const move = travel(T0 + 1800, HOME, WORK, 10);
    const arrive = at(Math.ceil(move.end), WORK.lat, WORK.lon);
    const later = dwell(arrive.ts + 10 * 3600, 1800, HOME);
    const out = detect([...home, ...move.pts, arrive, ...later]);
    expect(kinds(out)).toEqual(["stay", "trip", "stay", "stay"]);
    const [t] = trips(out);
    expect(t.end).toBe(arrive.ts);
    const [, w, h] = stays(out);
    expect(w.start).toBe(arrive.ts);
    expect(w.end - w.start).toBe(5 * 60);
    expect(h.start).toBe(later[0].ts);
  });

  it("splits a move with a long hole", () => {
    const home = dwell(T0, 1800, HOME);
    const a = travel(T0 + 1800, HOME, WORK, 10).pts.slice(0, 6); // ~1.8 km, then silence
    const b = travel(a[5].ts + 5 * 3600, WORK, HOME, 10).pts; // 5 h later, elsewhere, moving
    const out = detect([...home, ...a, ...b]);
    // Last seen at a[5] (a short stay there), then a separate trip 5 h later.
    expect(kinds(out)).toEqual(["stay", "trip", "stay", "trip"]);
    for (const t of trips(out)) expect(t.end - t.start).toBeLessThan(3600);
    expect(stays(out)[1].end - stays(out)[1].start).toBe(5 * 60);
  });

  it("keeps the overnight stay when the morning's first fix is a few hundred metres out", () => {
    const evening = dwell(T0, 1800, HOME);
    // 9 h of silence, then already on the bus 400 m away.
    const first = at(T0 + 1800 + 9 * 3600, HOME.lat + 0.0036, HOME.lon);
    const rest = travel(first.ts, { lat: HOME.lat + 0.0036, lon: HOME.lon }, WORK, 10).pts;
    const out = detect([...evening, first, ...rest, ...dwell(rest[rest.length - 1].ts + 60, 1800, WORK)]);
    expect(kinds(out)).toEqual(["stay", "trip", "stay"]);
    const [h] = stays(out);
    expect(h.end - h.start).toBeGreaterThan(9 * 3600);
  });
});

describe("transfers at stops", () => {
  const STOP = WORK; // a bus stop on the way
  const FAR = { lat: 60.23, lon: 24.94 }; // ~3.3 km further north
  const nearStop = (lat: number, lon: number, r: number) =>
    Math.abs(lat - STOP.lat) * 111_000 < r && Math.abs(lon - STOP.lon) * 55_000 < r;
  const noStop = () => false;

  /** Home, bus to the stop, `wait` s there (still, fixes every 2 min), bus on, destination. */
  function ride(wait: number) {
    const home = dwell(T0, 1800, HOME);
    const m1 = travel(T0 + 1800, HOME, STOP, 10);
    const stop: DPoint[] = [];
    for (let t = 0; t <= wait; t += 120) stop.push(at(Math.ceil(m1.end) + t, STOP.lat + 0.00005, STOP.lon));
    const m2 = travel(stop[stop.length - 1].ts, STOP, FAR, 10);
    const dest = dwell(Math.ceil(m2.end), 3600, FAR);
    return [...home, ...m1.pts, ...stop, ...m2.pts, ...dest];
  }

  it("folds a 10-minute wait at a stop into one trip", () => {
    const out = detect(ride(600), { nearStop });
    expect(kinds(out)).toEqual(["stay", "trip", "stay"]);
    const t = out[1];
    if (t.kind !== "trip") throw 0;
    expect(t.trip.distance).toBeGreaterThan(6000);
    // The wait doesn't drag the speed down to a bike's.
    expect(t.trip.mode).toBe("driving");
    // ...and is kept on the trip ("Waited at <stop>").
    expect(t.trip.waits).toHaveLength(1);
    expect(t.trip.waits[0].end - t.trip.waits[0].start).toBeGreaterThanOrEqual(600);
    expect(t.trip.waits[0].lat).toBeCloseTo(STOP.lat, 3);
  });

  it("keeps the wait as a visit without stop data", () => {
    expect(kinds(detect(ride(600)))).toEqual(["stay", "trip", "stay", "trip", "stay"]);
    expect(kinds(detect(ride(600), { nearStop: noStop }))).toEqual(["stay", "trip", "stay", "trip", "stay"]);
  });

  it("keeps a long stay at a stop as a visit", () => {
    expect(kinds(detect(ride(40 * 60), { nearStop }))).toEqual(["stay", "trip", "stay", "trip", "stay"]);
  });

  it("folds two transfers in a row", () => {
    const pts = ride(600);
    // Second stop = FAR: wait there too, then ride back south to HOME.
    const dest = pts.splice(pts.length - 61); // drop the final dwell at FAR
    const wait: DPoint[] = [];
    for (let t = 0; t <= 480; t += 120) wait.push(at(dest[0].ts + t, FAR.lat, FAR.lon));
    const back = travel(wait[wait.length - 1].ts, FAR, STOP, 10);
    const end = dwell(Math.ceil(back.end), 3600, { lat: STOP.lat + 0.002, lon: STOP.lon + 0.004 });
    const near = (lat: number, lon: number, r: number) =>
      nearStop(lat, lon, r) || (Math.abs(lat - FAR.lat) * 111_000 < r && Math.abs(lon - FAR.lon) * 55_000 < r);
    const out = detect([...pts, ...wait, ...back.pts, ...end], { nearStop: near });
    expect(kinds(out)).toEqual(["stay", "trip", "stay"]);
    if (out[1].kind !== "trip") throw 0;
    expect(out[1].trip.waits).toHaveLength(2);
  });
});

describe("jitter, accuracy and motion activity", () => {
  it("weights the stay's centre by accuracy", () => {
    const pts: DPoint[] = dwell(T0, 1800, HOME).map((p) => ({ ...p, lat: HOME.lat, lon: HOME.lon, accuracy: 8 }));
    // An urban-canyon fix 90 m off, 60 m accuracy, in the middle of the stay.
    pts.splice(15, 0, at(pts[14].ts + 10, HOME.lat + 0.0008, HOME.lon, { accuracy: 60 }));
    const out = detect(pts);
    expect(kinds(out)).toEqual(["stay"]);
    const s = out[0];
    if (s.kind !== "stay") throw 0;
    // Plain mean: ~3 m north. Weighted: well under a metre.
    expect(Math.abs(s.stay.lat - HOME.lat) * 111_000).toBeLessThan(0.5);
  });

  /** 30 min at home, 25 min of fixes jumping 250-350 m around, 30 min at home; all with `activity`. */
  function jittery(activity: string | null) {
    const tag = (p: DPoint) => ({ ...p, activity });
    const a = dwell(T0, 1800, HOME).map(tag);
    const jump: DPoint[] = [];
    for (let t = 60; t <= 1500; t += 60) {
      jump.push(at(T0 + 1800 + t, HOME.lat + 0.0023 + ((t / 60) % 2) * 0.0009, HOME.lon, { activity, accuracy: 50 }));
    }
    const b = dwell(T0 + 1800 + 1560, 1800, HOME).map(tag);
    return [...a, ...jump, ...b];
  }

  it("keeps a still phone's jumps inside the stay", () => {
    const out = detect(jittery("still"));
    expect(kinds(out)).toEqual(["stay"]);
    const s = out[0];
    if (s.kind !== "stay") throw 0;
    expect(s.stay.end - s.stay.start).toBe(1800 + 1560 + 1800);
    expect(Math.abs(s.stay.lat - HOME.lat) * 111_000).toBeLessThan(25);
  });

  it("leaves fixes without activity (older data) as before", () => {
    // Same as before activity existed: the jumps read as a move away and back.
    expect(kinds(detect(jittery(null)))).toEqual(["stay", "trip", "stay"]);
  });

  it("still lets a walking departure leave", () => {
    const home = dwell(T0, 1800, HOME).map((p) => ({ ...p, activity: "still" }));
    const leave = travel(T0 + 1800, HOME, WORK, 1.4).pts.map((p) => ({ ...p, activity: "walking" }));
    const out = detect([...home, ...leave, ...dwell(leave[leave.length - 1].ts + 60, 1800, WORK)]);
    expect(kinds(out)).toEqual(["stay", "trip", "stay"]);
  });

  it("needs two still readings in a row before calling a jump jitter", () => {
    const home = dwell(T0, 1800, HOME).map((p) => ({ ...p, activity: "walking" }));
    // Last home fix walking, then "still" 300 m away: a departure that just stopped.
    const there = dwell(T0 + 1860, 1800, { lat: HOME.lat + 0.0027, lon: HOME.lon }).map((p) => ({ ...p, activity: "still" }));
    expect(kinds(detect([...home, ...there]))).toEqual(["stay", "trip", "stay"]);
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

  // Cases from real data (docs/DECISIONS.md, "Travel modes").
  it("tells trains and runs apart, and isn't fooled by one GPS jump", () => {
    // Helsinki-Tampere by train: 264 km in 116 min.
    expect(classifyMode([], 264_000, 116 * 60)).toBe("train");
    // A 12.4 km run in 62 min.
    expect(classifyMode([3.4, 3.2, 3.5, 3.3, 3.6, 3.1], 12_400, 62 * 60)).toBe("running");
    // A 5 km ride with sparse fixes and one 94 km/h jump: still not a car.
    expect(classifyMode([1.4, 1.4, 0.3, 1.1, 26], 5000, 30 * 60)).not.toBe("driving");
    // Phone silent through a flight: 398 km in 63 min.
    expect(classifyMode([], 398_000, 63 * 60)).toBe("flying");
  });
});

describe("withActivity", async () => {
  const { withActivity } = await import("./detect");
  const pts = (...a: (string | null)[]) => a.map((activity) => ({ activity }));
  it("lets the phone's motion sensing decide what speed can't", () => {
    expect(withActivity("cycling", pts("in_vehicle", "in_vehicle", "in_vehicle", "on_bicycle"))).toBe("driving");
    expect(withActivity("driving", pts("on_bicycle", "on_bicycle", "on_bicycle", null, "still"))).toBe("cycling");
    expect(withActivity("cycling", pts("running", "running", "running"))).toBe("running");
  });
  it("needs a clear majority of at least 3 readings, and leaves rail and flights alone", () => {
    expect(withActivity("cycling", pts("in_vehicle", "in_vehicle"))).toBe("cycling");
    expect(withActivity("cycling", pts("in_vehicle", "on_bicycle", "in_vehicle", "on_bicycle"))).toBe("cycling");
    expect(withActivity("train", pts("in_vehicle", "in_vehicle", "in_vehicle"))).toBe("train");
    expect(withActivity("flying", pts("still", "still", "still"))).toBe("flying");
  });
});
