import { describe, expect, it } from "vitest";
import type { ModeKey } from "@/lib/modes";
import type { TimelineItem } from "@/lib/types";
import { bboxOf, dayHasMap, dayStops, dayTracks, dayWindow, nextStopKey, stopLabel } from "./dayMap";

const visit = (id: number, placeId: number, lat = 60, lon = 25, placeName: string | null = "Home"): TimelineItem => ({
  kind: "visit",
  visit: {
    id,
    startedAt: "2026-05-01T06:00:00Z",
    endedAt: "2026-05-01T07:00:00Z",
    duration: 3600,
    placeId,
    placeName,
    category: null,
    placeKind: null,
    lat,
    lon,
  },
});
const move = (id: number, mode: ModeKey = "walking"): TimelineItem => ({
  kind: "move",
  track: { id, startedAt: "2026-05-01T07:00:00Z", endedAt: "2026-05-01T07:30:00Z", distance: 900, duration: 1800, mode },
});
const line = (id: number, mode = "unknown", coords: [number, number][] = [[24, 60], [25, 61]]) => ({
  type: "Feature" as const,
  properties: { id, mode },
  geometry: { type: "LineString" as const, coordinates: coords },
});

describe("dayStops", () => {
  it("numbers visits in order and folds repeat visits to one place", () => {
    const stops = dayStops([visit(1, 10), move(5), visit(2, 20, 61, 24, "Work"), move(6), visit(3, 10)]);
    expect(stops).toHaveLength(2);
    expect(stops[0]).toMatchObject({ placeId: 10, numbers: [1, 3], keys: ["v-1", "v-3"], name: "Home" });
    expect(stops[1]).toMatchObject({ placeId: 20, numbers: [2], keys: ["v-2"], name: "Work" });
  });

  it("names unknown places", () => {
    expect(dayStops([visit(1, 10, 60, 25, null)])[0].name).toBe("Unknown place");
  });
});

describe("stopLabel", () => {
  it("shows up to two numbers", () => {
    expect(stopLabel([4])).toBe("4");
    expect(stopLabel([1, 7])).toBe("1·7");
    expect(stopLabel([1, 4, 9])).toBe("1·4…");
  });
});

describe("nextStopKey", () => {
  it("steps through a place's visits", () => {
    const [home] = dayStops([visit(1, 10), visit(2, 20), visit(3, 10)]);
    expect(nextStopKey(home, null)).toBe("v-1");
    expect(nextStopKey(home, "v-2")).toBe("v-1");
    expect(nextStopKey(home, "v-1")).toBe("v-3");
    expect(nextStopKey(home, "v-3")).toBe("v-1");
  });
});

describe("dayHasMap", () => {
  it("needs a stop or a real move", () => {
    expect(dayHasMap([])).toBe(false);
    expect(dayHasMap([move(1, "stationary")])).toBe(false);
    expect(dayHasMap([move(1, "bus")])).toBe(true);
    expect(dayHasMap([visit(1, 1)])).toBe(true);
  });
});

describe("dayWindow", () => {
  it("is the local day in epoch seconds", () => {
    expect(dayWindow({ start: "2026-04-30T21:00:00.000Z", end: "2026-05-01T21:00:00.000Z" })).toEqual({
      from: 1777582800,
      to: 1777669200,
    });
    expect(dayWindow({})).toBeNull();
  });
});

describe("dayTracks", () => {
  it("keeps the timeline's trips, in the timeline's mode, without stationary ones", () => {
    const fc = { type: "FeatureCollection" as const, features: [line(5), line(6), line(7), line(99)] };
    const out = dayTracks(fc, [move(5, "bus"), move(6, "stationary"), move(7, "cycling")]);
    expect(out.features.map((f) => f.properties)).toEqual([
      { id: 5, mode: "bus", key: "m-5" },
      { id: 7, mode: "cycling", key: "m-7" },
    ]);
  });

  it("copes with no data", () => {
    expect(dayTracks(null, [move(1)]).features).toEqual([]);
  });
});

describe("bboxOf", () => {
  it("covers lines and points", () => {
    const fc = { type: "FeatureCollection" as const, features: [line(1, "bus", [[24, 60], [24.5, 60.2]])] };
    expect(bboxOf(fc, [{ lat: 61, lon: 23 }])).toEqual([23, 60, 24.5, 61]);
    expect(bboxOf({ type: "FeatureCollection", features: [] })).toBeNull();
  });
});
