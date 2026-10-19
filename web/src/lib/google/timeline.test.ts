import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JsonCollectionStream } from "./jsonStream";
import { COLLECTION_KEYS, PATH_ACCURACY_M, Spans, VISIT_ACCURACY_M, fixesOf, mapActivity, parseLatLng, parseTime, spansOf, type GoogleFix } from "./timeline";

const FIXTURES = path.join(__dirname, "../../../test/fixtures/google");

/** The importer's two passes over a file, in odd-sized chunks. */
function importFixture(name: string): GoogleFix[] {
  const text = readFileSync(path.join(FIXTURES, name), "utf8");
  const pass = (fn: (key: string, value: unknown) => void) => {
    const p = new JsonCollectionStream(COLLECTION_KEYS);
    for (let i = 0; i < text.length; i += 37) for (const e of p.feed(text.slice(i, i + 37))) fn(e.key, e.value);
  };
  const spans = new Spans();
  pass((k, v) => spansOf(k, v, spans));
  const out: GoogleFix[] = [];
  pass((k, v) => out.push(...fixesOf(k, v, spans)));
  return out.sort((a, b) => a.ts - b.ts);
}

const s = (iso: string) => Date.parse(iso) / 1000;

describe("parsing helpers", () => {
  it("reads every coordinate notation", () => {
    expect(parseLatLng("48.1371079°, 11.5753822°")).toEqual({ lat: 48.1371079, lon: 11.5753822 });
    expect(parseLatLng("-33.86°,151.2°")).toEqual({ lat: -33.86, lon: 151.2 });
    expect(parseLatLng("geo:60.17,24.94")).toEqual({ lat: 60.17, lon: 24.94 });
    expect(parseLatLng({ latLng: "1.5°, 2.5°" })).toEqual({ lat: 1.5, lon: 2.5 });
    expect(parseLatLng({ latitudeE7: 601700000, longitudeE7: -249400000 })).toEqual({ lat: 60.17, lon: -24.94 });
    expect(parseLatLng({ latE7: 601700000, lngE7: 249400000 })).toEqual({ lat: 60.17, lon: 24.94 });
    expect(parseLatLng("0°, 0°")).toBeNull();
    expect(parseLatLng("91°, 0.5°")).toBeNull();
    expect(parseLatLng({ latitudeE7: 1 })).toBeNull();
    expect(parseLatLng("")).toBeNull();
  });
  it("reads ISO times with offsets and epoch milliseconds", () => {
    expect(parseTime("2024-03-12T08:00:00.000+01:00")).toBe(s("2024-03-12T07:00:00Z"));
    expect(parseTime("1552374060000")).toBe(1552374060);
    expect(parseTime("1990-01-01T00:00:00Z")).toBeNull();
    expect(parseTime("soon")).toBeNull();
  });
  it("maps Google activity types to Matka's", () => {
    expect(mapActivity("IN_PASSENGER_VEHICLE")).toBe("in_vehicle");
    expect(mapActivity("in passenger vehicle")).toBe("in_vehicle");
    expect(mapActivity("IN_SUBWAY")).toBe("in_vehicle");
    expect(mapActivity("cycling")).toBe("on_bicycle");
    expect(mapActivity("WALKING")).toBe("walking");
    expect(mapActivity("RUNNING")).toBe("running");
    expect(mapActivity("STILL")).toBe("still");
    expect(mapActivity("UNKNOWN_ACTIVITY_TYPE")).toBeNull();
    expect(mapActivity(undefined)).toBeNull();
  });
});

describe("formats", () => {
  it("Android Timeline.json: visit anchors, activity ends, path and raw positions", () => {
    const f = importFixture("Timeline.json");
    const home = { lat: 48.1371079, lon: 11.5753822 };
    expect(f).toEqual([
      { ts: s("2024-03-12T07:00:00Z"), ...home, accuracy: VISIT_ACCURACY_M, altitude: null, speed: null, activity: "still" },
      // Visit end and the activity's start share the second (deduplicated on insert).
      { ts: s("2024-03-12T08:00:00Z"), ...home, accuracy: VISIT_ACCURACY_M, altitude: null, speed: null, activity: "still" },
      { ts: s("2024-03-12T08:00:00Z"), ...home, accuracy: PATH_ACCURACY_M, altitude: null, speed: null, activity: "in_vehicle" },
      { ts: s("2024-03-12T08:05:00Z"), lat: 48.14, lon: 11.576, accuracy: PATH_ACCURACY_M, altitude: null, speed: null, activity: "in_vehicle" },
      { ts: s("2024-03-12T08:10:00Z"), lat: 48.145, lon: 11.578, accuracy: PATH_ACCURACY_M, altitude: null, speed: null, activity: "in_vehicle" },
      { ts: s("2024-03-12T08:12:30Z"), lat: 48.146, lon: 11.579, accuracy: 12, altitude: 520.3, speed: 9.5, activity: "in_vehicle" },
      { ts: s("2024-03-12T08:20:00Z"), lat: 48.15, lon: 11.58, accuracy: PATH_ACCURACY_M, altitude: null, speed: null, activity: "in_vehicle" },
    ]);
  });

  it("iOS location-history.json: geo: strings, string numbers, minute offsets", () => {
    const f = importFixture("location-history.json");
    expect(f.map((x) => [x.ts - s("2024-05-01T05:30:00Z"), x.lat, x.activity])).toEqual([
      [0, 60.17, "still"],
      [5400, 60.17, "still"],
      [5400, 60.17, "on_bicycle"],
      [6000, 60.18, "on_bicycle"],
      [6600, 60.19, "on_bicycle"],
      [7200, 60.2, "on_bicycle"],
    ]);
  });

  it("Takeout Records.json: E7, timestamp or timestampMs, wrapped negatives, bad rows dropped", () => {
    const f = importFixture("Records.json");
    expect(f).toEqual([
      { ts: s("2019-03-12T07:00:00Z"), lat: 60.17, lon: 24.94, accuracy: 20, altitude: 15, speed: null, activity: "walking" },
      { ts: 1552374060, lat: 60.171, lon: 24.941, accuracy: 15, altitude: null, speed: null, activity: null },
      { ts: s("2019-03-12T07:02:00Z"), lat: (4258096318 - 4294967296) / 1e7, lon: 100, accuracy: 10, altitude: null, speed: null, activity: null },
    ]);
  });

  it("Takeout Semantic Location History: placeVisit and activitySegment with raw path", () => {
    const f = importFixture("2019_MARCH.json");
    expect(f.map((x) => [x.ts - 1552374000, x.lat, x.accuracy, x.activity])).toEqual([
      [0, 60.17, PATH_ACCURACY_M, "in_vehicle"],
      [900, 60.185, 8, "in_vehicle"],
      // Waypoints have no time: skipped. Activity end and visit start share the second.
      [1800, 60.2, PATH_ACCURACY_M, "in_vehicle"],
      [1800, 60.2, VISIT_ACCURACY_M, "still"],
      [28800, 60.2, VISIT_ACCURACY_M, "still"],
    ]);
  });
});

describe("Spans", () => {
  it("prefers a move over the visit around it, and is order-independent", () => {
    const sp = new Spans();
    sp.add(1000, 2000, "walking");
    sp.add(0, 10_000, "still");
    expect(sp.at(500)).toBe("still");
    expect(sp.at(1500)).toBe("walking");
    expect(sp.at(20_000)).toBeNull();
  });
});
