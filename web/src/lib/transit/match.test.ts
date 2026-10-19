import { describe, expect, it } from "vitest";
import { badgeColors } from "./colors";
import { parseCsv } from "./feed";
import { TransitIndex, kindOfRouteType, matchLegs, resolveRides, type Leg, type Shape, type TrackPoint } from "./match";
import { displayMode } from "./run";

// A straight east-west street in Helsinki, ~5.5 km long.
const LAT = 60.17;
const street: [number, number][] = Array.from({ length: 51 }, (_, i) => [24.85 + i * 0.002, LAT]);
const other: [number, number][] = Array.from({ length: 51 }, (_, i) => [24.85 + i * 0.002, LAT + 0.02]); // 2 km north

const shapes: Shape[] = [
  { key: "a", kind: "bus", line: "159", coords: street },
  { key: "b", kind: "bus", line: "543", coords: street.slice(0, 26) }, // shares the first half
  { key: "c", kind: "tram", line: "4", coords: other },
];
const stops = [
  { name: "Leppävaara", lat: LAT, lon: 24.85 },
  { name: "Matinkylä (M)", lat: LAT, lon: 24.95 },
];
const index = new TransitIndex(shapes, stops);

/** Points along `coords` from index a to b, every `every` coords, `secsPerStep` apart. */
function ride(coords: [number, number][], a: number, b: number, secsPerStep: number, t0 = 1_760_000_000, every = 2): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (let i = a, k = 0; i <= b; i += every, k++) out.push({ lon: coords[i][0], lat: coords[i][1] + 0.0001, ts: t0 + k * secsPerStep });
  return out;
}

describe("matchLegs", () => {
  it("finds the line, and the stops at both ends", () => {
    // ~5.5 km in ~11 min: bus speed.
    const legs = matchLegs(index, ride(street, 0, 50, 26));
    expect(legs).toHaveLength(1);
    expect(legs[0].kind).toBe("bus");
    expect(legs[0].lines[0]).toBe("159");
    expect(legs[0].fromStop).toBe("Leppävaara");
    expect(legs[0].toStop).toBe("Matinkylä (M)");
    expect(legs[0].distanceM).toBeGreaterThan(5000);
  });

  it("keeps every line of a shared corridor, best first", () => {
    const legs = matchLegs(index, ride(street, 0, 24, 26));
    expect(legs[0].lines).toEqual(["159", "543"]);
  });

  it("doesn't count walking along a route as riding it", () => {
    // Same 5.5 km at 5 km/h.
    expect(matchLegs(index, ride(street, 0, 50, 220))).toEqual([]);
  });

  it("ignores the wrong direction and tracks away from every route", () => {
    expect(matchLegs(index, ride(street, 0, 50, 26).reverse().map((p, i, a) => ({ ...p, ts: a[a.length - 1 - i].ts })))).toEqual([]);
    const elsewhere = ride(street, 0, 50, 26).map((p) => ({ ...p, lat: p.lat + 0.01 }));
    expect(matchLegs(index, elsewhere)).toEqual([]);
  });

  it("joins a ride split by a short GPS gap", () => {
    const first = ride(street, 0, 20, 26);
    const gap = { lon: 24.9, lat: LAT + 0.004, ts: first.at(-1)!.ts + 20 }; // 450 m off
    const rest = ride(street, 22, 50, 26, gap.ts + 20);
    const legs = matchLegs(index, [...first, gap, gap, gap, ...rest]);
    expect(legs).toHaveLength(1);
    expect(legs[0].lines[0]).toBe("159");
  });
});

describe("one vehicle, one line", () => {
  // A second area so these shapes don't touch the ones above.
  const Y = 60.2;
  const east = (lat: number, from: number, n: number): [number, number][] =>
    Array.from({ length: n }, (_, i) => [24.85 + (from + i) * 0.002, lat]);
  const north = (lon: number, lat: number, n: number): [number, number][] =>
    Array.from({ length: n }, (_, i) => [lon, lat + i * 0.001]);
  const main = east(Y, 0, 51); // ~5.5 km
  const detour = east(Y + 0.0008, 20, 15); // 90 m north of the middle
  const a = east(Y + 0.05, 0, 16); // three lines end to end, turning north in the middle
  const b = north(a[15][0], Y + 0.05, 16);
  const c = east(b[15][1], 15, 16);
  const idx = new TransitIndex(
    [
      { key: "main", kind: "bus", line: "90N", coords: main },
      { key: "detour", kind: "bus", line: "80", coords: detour },
      { key: "corr1", kind: "bus", line: "118N", coords: main.slice(0, 9) },
      { key: "corr2", kind: "bus", line: "164", coords: main.slice(0, 9) },
      { key: "mid", kind: "bus", line: "119", coords: main.slice(15, 35) },
      { key: "a", kind: "bus", line: "121A", coords: a },
      { key: "b", kind: "bus", line: "158", coords: b },
      { key: "c", kind: "bus", line: "124", coords: c },
    ],
    [],
  );
  /** Points along coords every `every` coords, `secs` apart, from t0. */
  const along = (coords: [number, number][], secs: number, t0: number, every = 1, dLat = 0.0001): TrackPoint[] =>
    coords.filter((_, i) => i % every === 0).map(([lon, lat], k) => ({ lon, lat: lat + dLat, ts: t0 + k * secs }));
  const T0 = 1_760_000_000;
  const cont = (p: TrackPoint[], secs: number) => p[p.length - 1].ts + secs;

  it("absorbs a short leg sandwiched between two legs of the same line", () => {
    // 11 s per 111 m is ~36 km/h; the middle stretch wanders 100 m off onto line 80.
    const p1 = along(main.slice(0, 19), 11, T0);
    const p2 = along(detour, 11, cont(p1, 11));
    const p3 = along(main.slice(36), 11, cont(p2, 11));
    const legs = matchLegs(idx, [...p1, ...p2, ...p3]);
    expect(legs).toHaveLength(1);
    expect(legs[0].lines).toEqual(["90N"]);
    expect(legs[0].distanceM).toBeGreaterThan(5000);
  });

  it("drops a chain of different lines that never stops: that is a car", () => {
    const p1 = along(a, 11, T0);
    const p2 = along(b.slice(1), 11, cont(p1, 11));
    const p3 = along(c.slice(1), 11, cont(p2, 11));
    expect(matchLegs(idx, [...p1, ...p2, ...p3])).toEqual([]);
  });

  it("keeps a real transfer: off one bus, three minutes at the stop, onto another", () => {
    const p1 = along(a, 11, T0);
    const wait = Array.from({ length: 12 }, (_, k) => ({ lon: a[15][0] + (k % 2) * 0.0002, lat: a[15][1] + 0.0002, ts: cont(p1, 15 * (k + 1)) }));
    const p2 = along(b.slice(1), 11, cont(wait, 11));
    const wait2 = wait.map((w) => ({ ...w, lon: b[15][0], lat: b[15][1], ts: w.ts - wait[0].ts + cont(p2, 15) }));
    const p3 = along(c.slice(1), 11, cont(wait2, 11));
    const legs = matchLegs(idx, [...p1, ...wait, ...p2, ...wait2, ...p3]);
    expect(legs.map((l) => l.lines[0])).toEqual(["121A", "158", "124"]);
  });

  it("keeps a bus to metro change even when GPS shows no wait (stations are underground)", () => {
    const p1 = along(a, 11, T0);
    const p2 = along(b.slice(1), 8, cont(p1, 30)); // 30 s after the bus, never slow in between
    const legs = matchLegs(
      new TransitIndex(
        [
          { key: "a", kind: "bus", line: "121A", coords: a },
          { key: "bm", kind: "metro", line: "M1", coords: b },
        ],
        [],
      ),
      [...p1, ...p2],
    );
    expect(legs.map((l) => `${l.kind} ${l.lines[0]}`)).toEqual(["bus 121A", "metro M1"]);
  });

  it("prefers the line that explains the whole ride over short or shared legs on it", () => {
    // The 125N pattern: a shared terminal corridor, a leg that only matched
    // another line, then the line itself, all one vehicle.
    const pts = along(main, 12, T0);
    const at = (i: number) => pts[i].ts;
    const leg = (lines: string[], i: number, j: number, distanceM: number): Leg => ({
      kind: "bus",
      lines,
      fromStop: null,
      toStop: null,
      start: at(i),
      end: at(j),
      distanceM,
    });
    const legs = resolveRides(idx, pts, [leg(["118N", "90N", "164"], 0, 8, 900), leg(["119"], 16, 34, 2000), leg(["90N"], 36, 50, 1550)]);
    expect(legs).toHaveLength(1);
    expect(legs[0].lines).toEqual(["90N"]);
    expect(legs[0].start).toBe(at(0));
    expect(legs[0].end).toBe(at(50));
    expect(legs[0].distanceM).toBeGreaterThan(5000); // the span along 90N, not the sum of the pieces
  });
});

describe("feed helpers", () => {
  it("parses quoted CSV with a BOM", () => {
    expect(parseCsv('﻿a,b\n1,"x, ""y"""\r\n2,z\n')).toEqual([
      { a: "1", b: 'x, "y"' },
      { a: "2", b: "z" },
    ]);
  });

  it("maps GTFS route types, including HSL's extended ones", () => {
    expect([0, 1, 3, 4, 109, 701, 900, 1100].map(kindOfRouteType)).toEqual(["tram", "metro", "bus", "boat", "train", "bus", "tram", null]);
  });

  it("shows the transit kind only when legs cover most of the trip", () => {
    expect(displayMode("cycling", 8000, [{ kind: "bus", distance_m: 7500 }])).toBe("bus");
    expect(displayMode("driving", 20000, [{ kind: "bus", distance_m: 3000 }])).toBe("driving");
    expect(displayMode("driving", 20000, [{ kind: "bus", distance_m: 3000 }, { kind: "metro", distance_m: 15000 }])).toBe("metro");
    expect(displayMode("walking", 1000, [])).toBe("walking");
  });

  it("gives every badge readable text", () => {
    const lum = (h: string) =>
      [1, 3, 5]
        .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((a, c, i) => a + [0.2126, 0.7152, 0.0722][i] * c, 0);
    for (const k of ["bus", "tram", "metro", "train", "boat"] as const) {
      const { bg, fg } = badgeColors(k);
      const [hi, lo] = [lum(bg), lum(fg)].sort((a, b) => b - a);
      expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("ferry detection", async () => {
  const { isWater } = await import("../water");
  const { isFerry } = await import("../processing/ferry");
  it("knows land from sea around Helsinki", () => {
    expect(isWater(60.1709, 24.9419)).toBe(false); // Rautatientori
    expect(isWater(59.8, 24.9)).toBe(true); // Gulf of Finland
    expect(isWater(52.52, 13.4)).toBeNull(); // outside the mask
  });
  it("calls a Helsinki-Tallinn crossing a ferry, not a flight or a coastal drive", () => {
    const sea: [number, number][] = Array.from({ length: 20 }, (_, i) => [24.95 - i * 0.01, 60.12 - i * 0.034]);
    const t0 = 1_760_000_000;
    expect(isFerry({ path: sea, distance: 80_000, start: t0, end: t0 + 2.5 * 3600 })).toBe(true);
    expect(isFerry({ path: sea, distance: 80_000, start: t0, end: t0 + 0.3 * 3600 })).toBe(false); // 267 km/h
    const city: [number, number][] = Array.from({ length: 20 }, (_, i) => [24.74 + i * 0.01, 60.165]);
    expect(isFerry({ path: city, distance: 11_000, start: t0, end: t0 + 1200 })).toBe(false);
  });
});
