import { describe, expect, it } from "vitest";
import { parseBatch, parseFix, toEpochSeconds } from "./ingest";

const NOW = Date.UTC(2026, 9, 18, 12) ;
const S = NOW / 1000;

describe("toEpochSeconds", () => {
  it("accepts seconds, milliseconds and ISO", () => {
    expect(toEpochSeconds(S - 10, NOW)).toBe(S - 10);
    expect(toEpochSeconds((S - 10) * 1000 + 999, NOW)).toBe(S - 10);
    expect(toEpochSeconds("2026-10-18T11:00:00Z", NOW)).toBe(S - 3600);
  });
  it("rejects implausible times", () => {
    expect(toEpochSeconds(0, NOW)).toBeNull();
    expect(toEpochSeconds(S + 2 * 86400, NOW)).toBeNull();
    expect(toEpochSeconds("yesterday", NOW)).toBeNull();
    expect(toEpochSeconds(null, NOW)).toBeNull();
    expect(toEpochSeconds(Number.NaN, NOW)).toBeNull();
  });
});

describe("parseFix", () => {
  it("requires numeric in-range lat/lon", () => {
    expect(parseFix({ lat: 95, lon: 0, ts: S }, NOW)).toBeNull();
    expect(parseFix({ lat: 0, lon: -181, ts: S }, NOW)).toBeNull();
    expect(parseFix({ lat: "60", lon: 24, ts: S }, NOW)).toBeNull();
    expect(parseFix(null, NOW)).toBeNull();
    expect(parseFix([1, 2], NOW)).toBeNull();
  });
  it("nulls bad optional fields instead of rejecting", () => {
    expect(parseFix({ lat: 60, lon: 24, ts: S, speed: -1, battery: 140, accuracy: -3 }, NOW)).toEqual({
      lat: 60, lon: 24, ts: S, speed: null, battery: null, accuracy: null, altitude: null,
    });
    expect(parseFix({ lat: 60, lon: 24, ts: S, battery: 86.6, altitude: 12.5 }, NOW)).toMatchObject({
      battery: 87, altitude: 12.5,
    });
  });
});

describe("parseBatch", () => {
  it("counts rejects and keeps the first fix per second", () => {
    const r = parseBatch(
      [
        { lat: 60, lon: 24, ts: S },
        { lat: 61, lon: 24, ts: S * 1000 + 500 }, // same second
        { lat: 60, lon: 24, ts: S + 1 },
        { lat: 999, lon: 24, ts: S },
        "garbage",
      ],
      NOW,
    );
    expect(r.valid).toBe(3);
    expect(r.rejected).toBe(2);
    expect(r.fixes.map((f) => [f.lat, f.ts])).toEqual([[60, S], [60, S + 1]]);
  });
});
