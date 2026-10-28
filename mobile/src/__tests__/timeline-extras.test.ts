import { PLACE_ICONS, PLACE_ICON_GROUPS, placeIconGroup } from "../design/placeIcons";
import { addedMove, missingTravel } from "../timeline-logic";
import { correctionBody } from "../trip-fix-logic";
import { parseDayPhotos, parseTimeline } from "../viewer";
import type { TimelineItem } from "../viewer";

const visit = (id: number, lat: number, lon: number, startedAt: string, endedAt: string): TimelineItem => ({
  kind: "visit",
  visit: { id, startedAt, endedAt, duration: null, placeId: id, placeName: "A", category: null, lat, lon },
});
const home = visit(1, 60.17, 24.94, "2026-10-27T06:00:00Z", "2026-10-27T07:00:00Z");
const espoo = visit(2, 60.205, 24.79, "2026-10-27T07:17:00Z", "2026-10-27T09:00:00Z");

describe("missingTravel", () => {
  it("finds two rows far apart with nothing between", () => {
    const m = missingTravel(home, espoo)!;
    expect(m.distance).toBeGreaterThan(8500);
    expect(m.distance).toBeLessThan(9500);
    expect(m.secs).toBe(17 * 60);
  });
  it("ignores small moves and unknown ends", () => {
    expect(missingTravel(home, visit(3, 60.1735, 24.94, "2026-10-27T07:30:00Z", "2026-10-27T08:00:00Z"))).toBeNull();
    const move: TimelineItem = {
      kind: "move",
      track: { id: 9, startedAt: "2026-10-27T07:00:00Z", endedAt: "2026-10-27T07:10:00Z", distance: 900, duration: 600, mode: "walking", legs: [], waits: [] },
    };
    expect(missingTravel(move, espoo)).toBeNull();
    expect(missingTravel({ ...move, track: { ...move.track, to: { lat: 60.17, lon: 24.94 } } } as TimelineItem, espoo)).not.toBeNull();
  });
  it("opens the editor with an added trip that says where it went", () => {
    const m = addedMove(missingTravel(home, espoo)!);
    expect(m).toMatchObject({ added: true, mode: "driving", startedAt: "2026-10-27T07:00:00Z", endedAt: "2026-10-27T07:17:00Z" });
    expect(correctionBody(m, { mode: "bus", legs: [] })).toMatchObject({ added: true, from: { lat: 60.17, lon: 24.94 }, to: { lat: 60.205, lon: 24.79 } });
    expect(correctionBody({ ...m, added: false }, { mode: "bus", legs: [] })).not.toHaveProperty("added");
  });
});

describe("placeIconGroup (copy of the web's)", () => {
  it("puts the saved kind first, then the OSM value and key", () => {
    expect(placeIconGroup("family", "cafe")).toBe("home");
    expect(placeIconGroup("other", "museum")).toBe("culture");
    expect(placeIconGroup(null, "supermarket")).toBe("shopping");
    expect(placeIconGroup(null, "cafe")).toBe("food");
    expect(placeIconGroup(null, "aerodrome")).toBe("airport");
    expect(placeIconGroup(null, "bicycle", "shop")).toBe("shopping");
    expect(placeIconGroup(null, "constructor")).toBe("other");
    for (const g of PLACE_ICON_GROUPS) expect(PLACE_ICONS[g].mci).toBeTruthy();
  });
});

describe("parsing", () => {
  it("reads candidates, kinds and added trips from the timeline", () => {
    const t = parseTimeline({
      day: {
        date: "2026-10-27",
        items: [
          {
            kind: "visit",
            visit: {
              id: 1, startedAt: "a", endedAt: "b", placeId: 3, placeName: "Otaniemen lukio", category: "school", placeKind: "work", osmKey: "amenity",
              candidates: [{ name: "Otaniemen kirjasto", category: "library", address: false }, { name: 7 }, { name: "Otakaari 1", category: null, address: true }],
            },
          },
          { kind: "move", track: { id: -4, startedAt: "a", endedAt: "b", mode: "bus", added: true, from: { lat: 60, lon: 24 }, to: { lat: "x" } } },
        ],
      },
      dates: [],
    })!;
    const v = t.day.items[0];
    expect(v.kind === "visit" && v.visit).toMatchObject({ placeKind: "work", osmKey: "amenity" });
    expect(v.kind === "visit" && v.visit.candidates).toEqual([
      { name: "Otaniemen kirjasto", category: "library", address: false },
      { name: "Otakaari 1", category: null, address: true },
    ]);
    const m = t.day.items[1];
    expect(m.kind === "move" && m.track).toMatchObject({ added: true, from: { lat: 60, lon: 24 }, to: null });
  });
  it("reads a day's photos", () => {
    expect(
      parseDayPhotos({
        configured: true,
        pending: false,
        linkBase: "https://immich.lan/",
        items: [{ key: "v-1", ids: ["a", "b", 3], total: 9 }, { key: "m-2", ids: [] }],
      }),
    ).toEqual({ configured: true, pending: false, linkBase: "https://immich.lan", items: [{ key: "v-1", ids: ["a", "b"], total: 9 }] });
    expect(parseDayPhotos({ configured: true, linkBase: "javascript:alert(1)" })!.linkBase).toBeNull();
  });
});
