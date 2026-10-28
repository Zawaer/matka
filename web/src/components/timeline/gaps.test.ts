import { describe, expect, it } from "vitest";
import type { TimelineItem } from "@/lib/types";
import { edgeGaps, gapBetween, missingTravel } from "./gaps";

const visit = (startedAt: string, endedAt: string): TimelineItem => ({
  kind: "visit",
  visit: {
    id: 1,
    startedAt,
    endedAt,
    duration: 0,
    placeId: 1,
    placeName: null,
    category: null,
    placeKind: null,
    lat: 0,
    lon: 0,
  },
});

// 10 September in Helsinki (UTC+3).
const day = { date: "2026-09-10", start: "2026-09-09T21:00:00.000Z", end: "2026-09-10T21:00:00.000Z" };
const range = { minDate: "2026-07-20", maxDate: "2026-10-19" };
const later = Date.parse("2026-10-19T12:00:00Z");

describe("gapBetween", () => {
  it("reports silences of half an hour or more", () => {
    const a = visit("2026-09-10T05:00:00Z", "2026-09-10T08:00:00Z");
    expect(gapBetween(a, visit("2026-09-10T08:20:00Z", "2026-09-10T09:00:00Z"))).toBeNull();
    expect(gapBetween(a, visit("2026-09-10T09:00:00Z", "2026-09-10T10:00:00Z"))).toEqual({
      from: "2026-09-10T08:00:00Z",
      to: "2026-09-10T09:00:00Z",
    });
  });
});

describe("edgeGaps", () => {
  it("shows a day that ends with the phone switched off", () => {
    const items = [visit("2026-09-09T14:00:00Z", "2026-09-10T05:00:00Z"), visit("2026-09-10T05:20:00Z", "2026-09-10T09:10:00Z")];
    expect(edgeGaps(items, day, range, later)).toEqual({
      before: null,
      after: { from: "2026-09-10T09:10:00Z", to: day.end },
    });
  });
  it("shows a day that starts after a hole", () => {
    const items = [visit("2026-09-10T16:30:00Z", "2026-09-11T07:00:00Z")];
    expect(edgeGaps(items, day, range, later)).toEqual({
      before: { from: day.start, to: "2026-09-10T16:30:00Z" },
      after: null,
    });
  });
  it("says nothing before the history starts, after it ends, or about today", () => {
    const items = [visit("2026-09-10T16:30:00Z", "2026-09-10T17:00:00Z")];
    expect(edgeGaps(items, day, { minDate: "2026-09-10", maxDate: "2026-09-10" }, later)).toEqual({ before: null, after: null });
    expect(edgeGaps(items, day, range, Date.parse("2026-09-10T18:00:00Z")).after).toBeNull();
    expect(edgeGaps([], day, range, later)).toEqual({ before: null, after: null });
    expect(edgeGaps(items, { date: day.date }, range, later)).toEqual({ before: null, after: null });
  });
});

describe("missingTravel", () => {
  const at = (id: number, lat: number, lon: number, startedAt: string, endedAt: string): TimelineItem => ({
    kind: "visit",
    visit: { id, startedAt, endedAt, duration: 0, placeId: id, placeName: null, category: null, placeKind: null, lat, lon },
  });
  const trip = (from: [number, number] | null, to: [number, number] | null, startedAt: string, endedAt: string): TimelineItem => ({
    kind: "move",
    track: {
      id: 9,
      startedAt,
      endedAt,
      distance: 1000,
      duration: 600,
      mode: "walking",
      ...(from ? { from: { lat: from[0], lon: from[1] } } : {}),
      ...(to ? { to: { lat: to[0], lon: to[1] } } : {}),
    },
  });
  const home = at(1, 60.17, 24.94, "2026-10-27T06:00:00Z", "2026-10-27T07:00:00Z");
  const espoo = at(2, 60.205, 24.79, "2026-10-27T07:17:00Z", "2026-10-27T09:00:00Z");

  it("finds two visits far apart with nothing between", () => {
    const m = missingTravel(home, espoo)!;
    expect(m.distance).toBeGreaterThan(8500);
    expect(m.distance).toBeLessThan(9500);
    expect(m.secs).toBe(17 * 60);
    expect(m.from).toBe("2026-10-27T07:00:00Z");
    expect(m.to).toBe("2026-10-27T07:17:00Z");
    expect(m.fromPos).toEqual({ lat: 60.17, lon: 24.94 });
  });
  it("ignores a change of place within 500 m", () => {
    const near = at(3, 60.1735, 24.94, "2026-10-27T07:30:00Z", "2026-10-27T08:00:00Z");
    expect(missingTravel(home, near)).toBeNull();
  });
  it("uses a trip's ends, and says nothing when they are unknown", () => {
    const toKamppi = trip([60.17, 24.94], [60.169, 24.93], "2026-10-27T07:00:00Z", "2026-10-27T07:10:00Z");
    expect(missingTravel(toKamppi, espoo)).not.toBeNull();
    expect(missingTravel(home, trip([60.1701, 24.9401], null, "2026-10-27T07:00:00Z", "2026-10-27T07:10:00Z"))).toBeNull();
    expect(missingTravel(trip(null, null, "2026-10-27T05:00:00Z", "2026-10-27T06:00:00Z"), home)).toBeNull();
  });
  it("never gives a negative span for overlapping items", () => {
    const early = at(4, 60.205, 24.79, "2026-10-27T06:50:00Z", "2026-10-27T09:00:00Z");
    const m = missingTravel(home, early)!;
    expect(m.secs).toBe(0);
    expect(m.to).toBe(m.from);
  });
});
