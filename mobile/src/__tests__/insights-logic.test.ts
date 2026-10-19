import type { ModeTotal, SavedRow, Trip } from "../insights";
import {
  addMonths,
  mostVisitedId,
  fmtCompactDate,
  fmtDateRange,
  fmtDay,
  fmtHours,
  fmtKm,
  fmtLongDuration,
  fmtMonth,
  modeShares,
  monthRange,
  orderModeCards,
  roundShares,
  savedRowText,
  scaled,
  tripDates,
  tripLength,
  tripsByYear,
  worldCounts,
} from "../insights-logic";

const mt = (mode: ModeTotal["mode"], distance: number, duration = distance, count = 1): ModeTotal => ({ mode, distance, duration, count });

describe("formatting", () => {
  test("fmtKm", () => {
    expect(fmtKm(340)).toBe("340 m");
    expect(fmtKm(8_400)).toBe("8.4 km");
    expect(fmtKm(1_234_567)).toBe("1 235 km");
    expect(fmtKm(null)).toBe("—");
  });

  test("fmtLongDuration switches to days from 48 h", () => {
    expect(fmtLongDuration(0)).toBe("—");
    expect(fmtLongDuration(45)).toBe("45 s");
    expect(fmtLongDuration(3 * 3600 + 20 * 60)).toBe("3 h 20 min");
    expect(fmtLongDuration(47 * 3600)).toBe("47 h");
    expect(fmtLongDuration(4 * 86_400 + 6 * 3600)).toBe("4 d 6 h");
    expect(fmtLongDuration(3 * 86_400)).toBe("3 d");
  });

  test("fmtHours", () => {
    expect(fmtHours(3.5 * 3600)).toBe("3.5 h");
    expect(fmtHours(62.4 * 3600)).toBe("62 h");
  });

  test("months", () => {
    expect(fmtMonth("2026-10")).toBe("October 2026");
    expect(fmtMonth("2026-01", true)).toBe("Jan");
    expect(addMonths("2026-10", 3)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-03", -14)).toBe("2025-01");
  });

  test("monthRange spans first..last and includes the shown month", () => {
    expect(monthRange("2026-08", "2026-10", "2026-09")).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(monthRange("2026-08", "2026-09", "2026-11")).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(monthRange(null, null, "2026-10")).toEqual(["2026-10"]);
  });

  test("fmtDateRange like the web", () => {
    expect(fmtDateRange("2026-10-03", "2026-10-03")).toBe("3 Oct 2026");
    expect(fmtDateRange("2026-10-03", "2026-10-05")).toBe("3–5 Oct 2026");
    expect(fmtDateRange("2026-09-28", "2026-10-02")).toBe("28 Sep – 2 Oct 2026");
    expect(fmtDateRange("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 – 2 Jan 2027");
  });

  test("fmtDay names the weekday of the calendar date", () => {
    expect(fmtDay("2026-10-03")).toBe("Saturday 3 October");
    expect(fmtDay("2026-10-19")).toBe("Monday 19 October");
    expect(fmtDay("2026-08-12", true)).toBe("Wed 12 Aug");
  });
});

describe("trips", () => {
  const trip = (startDate: string, extra: Partial<Trip> = {}) =>
    ({ startDate, endDate: startDate, days: 1, nights: 1, arrival: "x", ...extra }) as Trip;

  test("tripsByYear keeps order inside a year, newest year first", () => {
    const g = tripsByYear([trip("2026-09-01"), trip("2026-03-01"), trip("2025-12-30")]);
    expect(g.map((x) => x.year)).toEqual(["2026", "2025"]);
    expect(g[0].trips.map((t) => t.startDate)).toEqual(["2026-09-01", "2026-03-01"]);
  });

  test("length and dates", () => {
    expect(tripLength({ days: 3, nights: 2 })).toBe("3 days · 2 nights");
    expect(tripLength({ days: 1, nights: 1 })).toBe("1 day · 1 night");
    expect(tripDates(trip("2026-10-03", { endDate: "2026-10-05", arrival: null }))).toBe("3–5 Oct 2026 · ongoing");
  });
});

describe("modes", () => {
  test("modeShares drops unused modes and sorts by distance", () => {
    const s = modeShares([mt("walking", 1000), mt("bus", 0, 0, 0), mt("driving", 3000)]);
    expect(s.map((m) => m.mode)).toEqual(["driving", "walking"]);
    expect(s[0].share).toBeCloseTo(0.75);
  });

  test("roundShares sums to 100", () => {
    expect(roundShares([1 / 3, 1 / 3, 1 / 3])).toEqual([34, 33, 33]);
    expect(roundShares([0.755, 0.245])).toEqual([76, 24]);
    expect(roundShares([])).toEqual([]);
  });

  test("orderModeCards: used first, quiet after, no quiet 'unknown'", () => {
    const out = orderModeCards([mt("walking", 0, 0, 0), mt("cycling", 500), mt("unknown", 0, 0, 0)]);
    expect(out.map((x) => [x.mode.mode, x.quiet])).toEqual([
      ["cycling", false],
      ["walking", true],
    ]);
  });

  test("scaled", () => {
    expect(scaled([0, 5, 10])).toEqual([0, 0.5, 1]);
    expect(scaled([0, 0])).toEqual([0, 0]);
  });
});

describe("saved places and world", () => {
  const row = (r: Partial<SavedRow>): SavedRow => ({ placeId: 1, name: null, kind: "other", seconds: 0, nights: 0, ...r });

  test("homes lead with nights, others with hours", () => {
    expect(savedRowText(row({ kind: "family", name: "Mom's", seconds: 210 * 3600, nights: 9 }))).toEqual({
      title: "Mom's",
      subtitle: "Family",
      primary: "9 nights",
      secondary: "210 h",
    });
    expect(savedRowText(row({ kind: "school", seconds: 62 * 3600 }))).toEqual({ title: "School", subtitle: null, primary: "62 h", secondary: null });
    expect(savedRowText(row({ kind: "home", name: "Home", seconds: 3600 }))).toMatchObject({ subtitle: null, primary: "1 h" });
  });

  test("worldCounts", () => {
    const e = { name: "Finland", country: null, places: 12, visits: 1, duration: 0, lastVisit: null, cities: 3 };
    expect(worldCounts(e)).toBe("3 cities · 12 places · 1 visit");
    expect(worldCounts({ ...e, cities: null })).toBe("12 places · 1 visit");
  });
});

describe("fmtCompactDate", () => {
  const now = new Date(2026, 9, 19, 12);
  test("drops the year in the current one", () => {
    expect(fmtCompactDate(new Date(2026, 9, 18, 9).toISOString(), now)).toBe("18 Oct");
    expect(fmtCompactDate(new Date(2025, 11, 27, 9).toISOString(), now)).toBe("27 Dec 2025");
  });
  test("dash for missing or bad values", () => {
    expect(fmtCompactDate(null, now)).toBe("—");
    expect(fmtCompactDate("soon", now)).toBe("—");
  });
});

test("mostVisitedId finds the top place even when saved places are listed first", () => {
  expect(mostVisitedId([{ id: 1, visitCount: 3 }, { id: 2, visitCount: 40 }, { id: 3, visitCount: 40 }])).toBe(2);
  expect(mostVisitedId([{ id: 1, visitCount: 0 }])).toBeNull();
  expect(mostVisitedId([])).toBeNull();
});
