// Synthetic reproductions of sparse Smart Tracking rides on real HSL geometry
// (test/fixtures/transit/espoo-159-m1.json: shapes of 111, 124, 159, 164,
// 171, 510, M1 and M2 clipped to south Espoo, with their trip counts, and the
// stops along them). A synthetic commute: bus 159 from Järvisilta to
// Matinkylä, then M1 underground to Aalto-yliopisto, and back.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { diagnoseTrip, diagnosticsLine, splitByLines, type DiagPoint } from "./diagnose";
import { TransitIndex, matchLegs, type Shape, type Stop, type TrackPoint } from "./match";

const fixture = JSON.parse(
  readFileSync(path.join(__dirname, "../../../test/fixtures/transit/espoo-159-m1.json"), "utf8"),
) as { shapes: Shape[]; stops: Stop[] };
const index = new TransitIndex(fixture.shapes, fixture.stops);
const shape = (key: string) => fixture.shapes.find((s) => s.key === key)!.coords;
const stop = (name: string) => fixture.stops.find((s) => s.name === name)!;

function dist(aLat: number, aLon: number, bLat: number, bLon: number) {
  const x = ((bLon - aLon) * Math.PI) / 180 * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180);
  return 6_371_000 * Math.hypot(x, ((bLat - aLat) * Math.PI) / 180);
}
const nearestIdx = (coords: [number, number][], lat: number, lon: number) => {
  let best = 0;
  coords.forEach(([x, y], i) => {
    if (dist(lat, lon, y, x) < dist(lat, lon, coords[best][1], coords[best][0])) best = i;
  });
  return best;
};

/** Positions every `step` m along coords[a..b]. */
function along(coords: [number, number][], a: number, b: number) {
  const seg = coords.slice(a, b + 1);
  const cum = [0];
  for (let i = 1; i < seg.length; i++) cum.push(cum[i - 1] + dist(seg[i - 1][1], seg[i - 1][0], seg[i][1], seg[i][0]));
  const total = cum[cum.length - 1];
  const at = (m: number) => {
    let i = 1;
    while (i < seg.length - 1 && cum[i] < m) i++;
    const f = (m - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    const t = Math.min(1, Math.max(0, f));
    return { lon: seg[i - 1][0] + (seg[i][0] - seg[i - 1][0]) * t, lat: seg[i - 1][1] + (seg[i][1] - seg[i - 1][1]) * t };
  };
  return { total, at };
}

/** Fixes riding coords[a..b] at `kmh`, at these intervals (cycled), with a little GPS scatter. */
function rideFixes(coords: [number, number][], a: number, b: number, kmh: number, t0: number, intervals: number[], acc = 15): DiagPoint[] {
  const { total, at } = along(coords, a, b);
  const out: DiagPoint[] = [];
  let t = t0;
  let k = 0;
  for (;;) {
    const m = ((t - t0) * kmh) / 3.6;
    const p = at(Math.min(m, total));
    const j = (k % 3) - 1; // -1, 0, 1: ~10 m scatter
    out.push({ lat: p.lat + j * 0.00009, lon: p.lon - j * 0.00012, ts: t, accuracy: acc, source: "device", activity: "in_vehicle" });
    if (m >= total) break;
    t += intervals[k++ % intervals.length];
  }
  return out;
}

const fix = (lat: number, lon: number, ts: number, accuracy = 20, activity = "walking"): DiagPoint => ({ lat, lon, ts, accuracy, source: "device", activity });

// 27 Oct 2026 10:36 Europe/Helsinki.
const T0 = Date.UTC(2026, 9, 27, 7, 36) / 1000;
const BUS_TO_MATINKYLA = shape("2159_20260810_2#1");
const BUS_FROM_MATINKYLA = shape("2159_20260810_1#1");
const START = stop("Järvisilta");
const MATINKYLA_M = stop("Matinkylä"); // the metro station
const AALTO_M = stop("Aalto-yliopisto");
const HOME = { lat: START.lat + 0.0018, lon: START.lon - 0.0006 }; // ~200 m away
const OTANIEMI = { lat: 60.1866, lon: 24.829 };
const AALTO_EXIT = { lat: 60.1843, lon: 24.8262 }; // ~110 m from the platforms

/**
 * Home -> bus 159 (fixes 30-120 s apart, 2-3 min standby gaps with a coarse
 * Wi-Fi/cell fix) -> walk into Matinkylä station -> `gapMin` underground with
 * one cell fix -> out at Aalto-yliopisto -> Otaniemi.
 */
function morning(gapMin = 6): DiagPoint[] {
  const pts: DiagPoint[] = [];
  let t = T0;
  for (let k = 0; k < 4; k++, t += 60)
    pts.push(fix(HOME.lat + ((START.lat - HOME.lat) * k) / 3, HOME.lon + ((START.lon - HOME.lon) * k) / 3, t));
  pts.push(fix(START.lat, START.lon, t + 60, 25, "still"));
  t += 150;
  const a = nearestIdx(BUS_TO_MATINKYLA, START.lat, START.lon);
  const bus = rideFixes(BUS_TO_MATINKYLA, a, BUS_TO_MATINKYLA.length - 1, 24, t, [30, 45, 150, 60, 120, 90, 180, 40]);
  // Standby: a coarse fix in the two longest pauses, far from the road.
  bus.splice(4, 0, { ...bus[3], lat: bus[3].lat + 0.006, ts: bus[3].ts + 70, accuracy: 900, activity: "still" });
  bus.splice(9, 0, { ...bus[8], lon: bus[8].lon + 0.01, ts: bus[8].ts + 90, accuracy: 1400, activity: "still" });
  pts.push(...bus);
  t = bus[bus.length - 1].ts;
  pts.push(fix(MATINKYLA_M.lat + 0.0004, MATINKYLA_M.lon + 0.0005, t + 70));
  pts.push(fix(MATINKYLA_M.lat, MATINKYLA_M.lon + 0.0003, t + 130));
  t += 130;
  pts.push(fix(60.163, 24.77, t + gapMin * 30, 1500, "still")); // a cell fix in the tunnel
  t += gapMin * 60;
  pts.push(fix(AALTO_EXIT.lat, AALTO_EXIT.lon, t, 30));
  for (let k = 1; k <= 3; k++)
    pts.push(fix(AALTO_EXIT.lat + ((OTANIEMI.lat - AALTO_EXIT.lat) * k) / 3, AALTO_EXIT.lon + ((OTANIEMI.lon - AALTO_EXIT.lon) * k) / 3, t + k * 70));
  return pts.sort((x, y) => x.ts - y.ts);
}

/** The way back: Otaniemi -> Aalto-yliopisto -> M1 (`gapMin` without fixes) -> Matinkylä -> bus 159 -> home. */
function evening(gapMin = 8): DiagPoint[] {
  const pts: DiagPoint[] = [];
  let t = T0 + 4 * 3600;
  pts.push(fix(OTANIEMI.lat, OTANIEMI.lon, t));
  pts.push(fix((OTANIEMI.lat + AALTO_EXIT.lat) / 2, (OTANIEMI.lon + AALTO_EXIT.lon) / 2, (t += 80)));
  pts.push(fix(AALTO_EXIT.lat, AALTO_EXIT.lon, (t += 80)));
  t += gapMin * 60;
  pts.push(fix(MATINKYLA_M.lat + 0.0003, MATINKYLA_M.lon - 0.0002, t, 40));
  const start = nearestIdx(BUS_FROM_MATINKYLA, MATINKYLA_M.lat, MATINKYLA_M.lon);
  const end = nearestIdx(BUS_FROM_MATINKYLA, START.lat, START.lon);
  pts.push(fix(BUS_FROM_MATINKYLA[start][1], BUS_FROM_MATINKYLA[start][0], (t += 90), 20, "still"));
  pts.push(fix(BUS_FROM_MATINKYLA[start][1] + 0.0001, BUS_FROM_MATINKYLA[start][0], (t += 100), 20, "still"));
  const bus = rideFixes(BUS_FROM_MATINKYLA, start, end, 23, t + 60, [40, 120, 60, 150, 35, 90]);
  pts.push(...bus);
  t = bus[bus.length - 1].ts;
  pts.push(fix(HOME.lat, HOME.lon, t + 150));
  return pts;
}

const legsOf = (pts: TrackPoint[]) => matchLegs(index, pts).map((l) => `${l.kind} ${l.lines.join("/")}`);

describe("sparse Smart Tracking commute (27 Oct)", () => {
  it("matches bus 159 then M1 across a 6-minute underground gap", () => {
    const legs = matchLegs(index, morning(6));
    expect(legs.map((l) => `${l.kind} ${l.lines[0]}`)).toEqual(["bus 159", "metro M1"]);
    expect(legs[1].lines).toEqual(["M1"]); // M2 doesn't reach Matinkylä on a regular trip
    expect(legs[1].fromStop).toBe("Matinkylä");
    expect(legs[1].toStop).toBe("Aalto-yliopisto");
    expect(legs[1].distanceM).toBeGreaterThan(6000);
    expect(legs[0].distanceM).toBeGreaterThan(2500);
  });

  it("also with a more typical 10-minute gap", () => {
    expect(legsOf(morning(10)).map((s) => s.split("/")[0])).toEqual(["bus 159", "metro M1"]);
  });

  it("matches the way back: M1 then bus 159", () => {
    expect(legsOf(evening(8)).map((s) => s.split("/")[0])).toEqual(["metro M1", "bus 159"]);
  });

  it("doesn't bridge a gap at an impossible speed or without a station at each end", () => {
    // 2 minutes from Matinkylä to Aalto-yliopisto: 220 km/h.
    const fast = morning(2);
    expect(legsOf(fast).some((l) => l.startsWith("metro"))).toBe(false);
    // The same gap ending 2 km north of the line: no station of it there.
    const pts = morning(6);
    const cell = pts.find((p) => p.accuracy === 1500)!.ts;
    const off = pts.map((p) => (p.ts > cell ? { ...p, lat: p.lat + 0.02 } : p));
    expect(legsOf(off).some((l) => l.startsWith("metro"))).toBe(false);
  });

  it("explains the old miss in its diagnostics, without coordinates", () => {
    const pts = morning(6);
    const { diagnostics: d, legs } = diagnoseTrip(
      index,
      pts,
      { start: pts[0].ts, end: pts[pts.length - 1].ts, distanceM: 13_000, detectorMode: "driving", shownMode: "driving" },
      [
        { kind: "bus", line: "159", transferStop: "Matinkylä" },
        { kind: "metro", line: "M1" },
      ],
    );
    expect(d.points).toBe(pts.length);
    expect(d.usable).toBe(pts.length - 3);
    expect(d.coarseShare).toBeGreaterThan(0.05);
    expect(d.longestGap!.s).toBeGreaterThanOrEqual(180);
    expect(d.matched.map((m) => m.split(" ").slice(0, 2).join(" ").split("/")[0])).toEqual(["bus 159", "metro M1"]);
    expect(d.claimed.map((c) => c.verdict)).toEqual(["matched", "matched"]);
    expect(d.claimed[0].near60).toBeGreaterThan(0.6);
    expect(legs.map((l) => [l.kind, l.lines[0], l.toStop])).toEqual([
      ["bus", "159", "Matinkylä"],
      ["metro", "M1", "Aalto-yliopisto"],
    ]);
    const line = diagnosticsLine(d, { correctionId: 1, mode: "metro", claimed: [{ kind: "bus", line: "159" }, { kind: "metro", line: "M1" }] });
    expect(line).toMatch(/^\[correction\] #1 driving→metro/);
    expect(line).toContain("metro M1: 60m");
    expect(line).not.toMatch(/60\.\d{3}|24\.\d{3}/); // no coordinates
  });

  it("says why a claimed line wasn't matched", () => {
    const pts = morning(6);
    const { diagnostics: d } = diagnoseTrip(
      index,
      pts,
      { start: pts[0].ts, end: pts[pts.length - 1].ts, distanceM: 13_000, detectorMode: "driving", shownMode: "metro" },
      [{ kind: "bus", line: "124" }, { kind: "metro", line: "M2" }],
    );
    expect(d.claimed[0].verdict).not.toBe("matched");
    expect(d.claimed[1].verdict).toMatch(/rare variant|doesn't run through both ends/);
  });
});

describe("lines on shared track", () => {
  it("Matinkylä -> Aalto-yliopisto is M1 only, even with dense fixes on the track", () => {
    const m1 = shape("31M1_20221203_1#1");
    const a = nearestIdx(m1, MATINKYLA_M.lat, MATINKYLA_M.lon);
    const b = nearestIdx(m1, AALTO_M.lat, AALTO_M.lon);
    const legs = matchLegs(index, rideFixes(m1, a, b, 45, T0, [20]));
    expect(legs.map((l) => l.lines)).toEqual([["M1"]]);
  });

  it("Tapiola -> Aalto-yliopisto (and on east) may be M1 or M2", () => {
    const m1 = shape("31M1_20221203_1#1");
    const a = nearestIdx(m1, 60.1752, 24.8048); // Tapiola
    const legs = matchLegs(index, rideFixes(m1, a, m1.length - 1, 45, T0, [20]));
    expect(legs).toHaveLength(1);
    expect([...legs[0].lines].sort()).toEqual(["M1", "M2"]);
    expect(legs[0].lines[0]).toBe("M1"); // the busier, then fixture order
  });
});

describe("splitByLines", () => {
  it("puts each fix with the ride it is near, in order", () => {
    const near = [
      [true, true, false, false, false, false],
      [false, false, true, true, true, true],
    ];
    expect(splitByLines(near, 6)).toEqual([0, 2]);
    expect(splitByLines([[true, false, true], [false, true, false], [false, false, true]], 3)).toEqual([0, 1, 2]);
  });
});
