import { describe, expect, it } from "vitest";
import { badgeColors } from "./colors";
import { parseCsv } from "./feed";
import { TransitIndex, kindOfRouteType, matchLegs, type Shape, type TrackPoint } from "./match";
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
