import { adjacentDays, gapBetween, subRows, visitTypeLabel } from "../timeline-logic";
import type { Leg, TimelineItem, Wait } from "../viewer";

const T = (hm: string) => `2026-10-18T${hm}:00.000Z`;
const visit = (from: string, to: string): TimelineItem => ({
  kind: "visit",
  visit: { id: 1, startedAt: T(from), endedAt: T(to), duration: null, placeId: 1, placeName: "A", category: null, lat: null, lon: null },
});
const move = (from: string, to: string): TimelineItem => ({
  kind: "move",
  track: { id: 2, startedAt: T(from), endedAt: T(to), distance: 100, duration: 60, mode: "walking", legs: [], waits: [] },
});
const leg = (from: string | null, to: string | null, line = "550"): Leg => ({
  kind: "bus",
  lines: [line],
  fromStop: null,
  toStop: null,
  startedAt: from && T(from),
  endedAt: to && T(to),
});
const wait = (from: string, to: string, stop: string | null = "Kamppi"): Wait => ({ startedAt: T(from), endedAt: T(to), stop });

describe("gapBetween", () => {
  it("reports 30 min or more with nothing recorded", () => {
    expect(gapBetween(visit("08:00", "09:00"), move("09:30", "09:40"))).toEqual({ from: T("09:00"), to: T("09:30"), secs: 1800 });
    expect(gapBetween(move("09:00", "09:10"), visit("11:40", "12:00"))).toMatchObject({ secs: 9000 });
  });
  it("ignores short silences and overlaps", () => {
    expect(gapBetween(visit("08:00", "09:00"), move("09:29", "09:40"))).toBeNull();
    expect(gapBetween(visit("08:00", "09:00"), visit("08:50", "10:00"))).toBeNull();
  });
});

describe("subRows", () => {
  const base = { startedAt: T("05:30") };
  it("puts the server's waits between the rides, before a ride starting at the same moment", () => {
    const rows = subRows({ ...base, legs: [leg("05:33", "05:47"), leg("05:54", "05:58", "M1")], waits: [wait("05:48", "05:54")] });
    expect(rows.map((r) => (r.kind === "leg" ? r.leg.lines[0] : `wait ${r.stop} ${r.secs}`))).toEqual(["550", "wait Kamppi 360", "M1"]);
  });
  it("adds a Change for a long enough break between rides without a wait", () => {
    const rows = subRows({ ...base, legs: [leg("05:33", "05:47"), leg("05:52", "05:58", "M1")], waits: [] });
    expect(rows).toEqual([
      { kind: "leg", leg: expect.objectContaining({ lines: ["550"] }) },
      { kind: "wait", stop: null, secs: 300 },
      { kind: "leg", leg: expect.objectContaining({ lines: ["M1"] }) },
    ]);
    // under three minutes is just getting off and on
    expect(subRows({ ...base, legs: [leg("05:33", "05:47"), leg("05:49", "05:58")], waits: [] }).map((r) => r.kind)).toEqual(["leg", "leg"]);
  });
  it("shows waits on a move without transit legs", () => {
    expect(subRows({ ...base, legs: [], waits: [wait("05:40", "05:45", null)] })).toEqual([{ kind: "wait", stop: null, secs: 300 }]);
  });
  it("keeps legs in order when the server sent no times", () => {
    const legs = [leg(null, null, "a"), leg(null, null, "b")];
    expect(subRows({ ...base, legs, waits: [wait("05:40", "05:45")] })).toEqual(legs.map((l) => ({ kind: "leg", leg: l })));
  });
});

describe("adjacentDays", () => {
  const dates = ["2026-10-14", "2026-10-15", "2026-10-17", "2026-10-18"];
  it("steps between days with data", () => {
    expect(adjacentDays(dates, "2026-10-15")).toEqual({ prev: "2026-10-14", next: "2026-10-17" });
    expect(adjacentDays(dates, "2026-10-14")).toEqual({ prev: null, next: "2026-10-15" });
    expect(adjacentDays(dates, "2026-10-18")).toEqual({ prev: "2026-10-17", next: null });
  });
  it("works from a day without data (opened from a trip) and before/after all data", () => {
    expect(adjacentDays(dates, "2026-10-16")).toEqual({ prev: "2026-10-15", next: "2026-10-17" });
    expect(adjacentDays(dates, "2026-01-01")).toEqual({ prev: null, next: "2026-10-14" });
    expect(adjacentDays(dates, "2026-12-01")).toEqual({ prev: "2026-10-18", next: null });
  });
  it("has nowhere to go without a day", () => {
    expect(adjacentDays([], null)).toEqual({ prev: null, next: null });
    expect(adjacentDays(dates, null)).toEqual({ prev: null, next: null });
  });
});

describe("visitTypeLabel", () => {
  it("names the saved kind, not the OSM category", () => {
    expect(visitTypeLabel("school", "library", "Otaniemen lukio")).toBe("School");
    expect(visitTypeLabel("other", "library", "Mökki")).toBeNull();
  });
  it("falls back to the category, and says nothing that repeats the title", () => {
    expect(visitTypeLabel(null, "fast_food", "Hesburger")).toBe("Fast food");
    expect(visitTypeLabel(undefined, null, "Hesburger")).toBeNull();
    expect(visitTypeLabel("home", null, "Home")).toBeNull();
  });
});
