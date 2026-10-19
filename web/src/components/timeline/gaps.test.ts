import { describe, expect, it } from "vitest";
import type { TimelineItem } from "@/lib/types";
import { edgeGaps, gapBetween } from "./gaps";

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
