import { describe, expect, it } from "vitest";
import { type StayVisit, detectAwayTrips, joinNames, tripName } from "./awayTrips";
import type { Move } from "./summary";
import { addDays, startOfDay } from "./time";

const TZ = "Europe/Helsinki";
const H = 3_600_000;

type Loc = { lat: number; lon: number; city: string; country: string };
const HOME: Loc = { lat: 60.23, lon: 24.78, city: "Espoo", country: "Finland" };
const WORK: Loc = { lat: 60.17, lon: 24.94, city: "Helsinki", country: "Finland" };
const AIRPORT: Loc = { lat: 60.317, lon: 24.963, city: "Vantaa", country: "Finland" };
const STHLM: Loc = { lat: 59.33, lon: 18.07, city: "Stockholm", country: "Sweden" };
const UPPSALA: Loc = { lat: 59.86, lon: 17.64, city: "Uppsala", country: "Sweden" };

let pid = 0;
const ids = new Map<Loc, number>();
/** A visit from local hour `from` on `date` lasting `hours`. */
function stay(loc: Loc, date: string, from: number, hours: number): StayVisit {
  if (!ids.has(loc)) ids.set(loc, ++pid);
  const s = startOfDay(date, TZ) + from * H;
  return { placeId: ids.get(loc)!, lat: loc.lat, lon: loc.lon, city: loc.city, country: loc.country, start: s, end: s + hours * H };
}
function move(date: string, from: number, hours: number, km: number, mode: string): Move {
  const s = startOfDay(date, TZ) + from * H;
  return { start: s, end: s + hours * H, distance: km * 1000, mode };
}

/** Ordinary days: home 22:00–08:00, work 09:00–17:00. */
function homeDays(first: string, n: number): StayVisit[] {
  const out: StayVisit[] = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(first, i);
    out.push(stay(HOME, d, -2, 10), stay(WORK, d, 9, 8));
  }
  return out;
}

describe("detectAwayTrips", () => {
  it("finds a weekend in Stockholm, home after midnight", () => {
    const visits = [
      ...homeDays("2026-09-20", 13), // nights up to the morning of 3 Oct
      stay(HOME, "2026-10-02", 18, 11),
      stay(AIRPORT, "2026-10-03", 7, 0.5),
      stay(STHLM, "2026-10-03", 10, 14),
      stay(STHLM, "2026-10-04", 0.5, 20),
      stay(AIRPORT, "2026-10-04", 23.9, 0.3),
      stay(HOME, "2026-10-05", 2, 8),
      ...homeDays("2026-10-06", 5),
    ];
    const moves = [
      move("2026-10-03", 6, 0.6, 25, "driving"),
      move("2026-10-03", 8, 1, 400, "flying"),
      move("2026-10-04", 22, 1, 400, "flying"),
      move("2026-10-05", 0.5, 1, 25, "train"),
      move("2026-10-07", 8, 0.5, 15, "bus"),
    ];
    const { home, trips } = detectAwayTrips({ visits, moves, nightPoints: [], tz: TZ });
    expect(home?.city).toBe("Espoo");
    expect(trips).toHaveLength(1);
    const t = trips[0];
    expect([t.name, t.startDate, t.endDate, t.days, t.nights]).toEqual(["Stockholm", "2026-10-03", "2026-10-05", 3, 1]);
    expect(t.countries).toEqual(["Sweden"]);
    expect(t.distance).toBe(850_000);
    expect(t.modes.map((m) => m.mode)).toEqual(["flying", "train", "driving"]);
    expect(t.dayList.map((d) => [d.date, d.cities])).toEqual([
      ["2026-10-03", ["Vantaa", "Stockholm"]],
      ["2026-10-04", ["Stockholm", "Vantaa"]],
      ["2026-10-05", ["Vantaa"]],
    ]);
    expect(t.dayList[0].distance).toBe(425_000);
  });

  it("ignores far-away days without a night away", () => {
    const visits = [...homeDays("2026-09-01", 5), stay(STHLM, "2026-09-03", 18, 3)];
    expect(detectAwayTrips({ visits, moves: [], nightPoints: [], tz: TZ }).trips).toEqual([]);
  });

  it("bridges a night with no data and uses night points", () => {
    const visits = [
      ...homeDays("2026-08-01", 11),
      stay(STHLM, "2026-08-11", 20, 15), // night of the 12th
      // night of the 13th: phone off; night of the 14th: only points
      stay(UPPSALA, "2026-08-14", 10, 4),
      stay(HOME, "2026-08-14", 23, 9),
      ...homeDays("2026-08-16", 5),
    ];
    const nightPoints = [{ date: "2026-08-14", lat: UPPSALA.lat, lon: UPPSALA.lon }];
    const { trips } = detectAwayTrips({ visits, moves: [], nightPoints, tz: TZ });
    expect(trips).toHaveLength(1);
    expect([trips[0].startDate, trips[0].endDate, trips[0].nights]).toEqual(["2026-08-11", "2026-08-14", 3]);
    expect(trips[0].name).toBe("Stockholm and Uppsala");
  });

  it("sleeping nearby on the way back still ends at home the next day", () => {
    const visits = [
      ...homeDays("2026-09-20", 5),
      stay(HOME, "2026-09-24", 18, 14),
      stay(WORK, "2026-09-25", 9, 8),
      stay(STHLM, "2026-09-25", 22, 20),
      stay(AIRPORT, "2026-09-26", 22, 16), // a night in the home area, not at home
      stay(HOME, "2026-09-27", 16, 16),
      ...homeDays("2026-09-29", 5),
    ];
    const { trips } = detectAwayTrips({ visits, moves: [], nightPoints: [], tz: TZ });
    expect([trips[0].startDate, trips[0].endDate, trips[0].nights]).toEqual(["2026-09-25", "2026-09-27", 1]);
  });

  it("lists trips newest first", () => {
    const visits = [
      ...homeDays("2026-05-01", 5),
      stay(STHLM, "2026-05-05", 20, 14),
      ...homeDays("2026-05-07", 20),
      stay(UPPSALA, "2026-05-27", 20, 14),
      ...homeDays("2026-05-29", 5),
    ];
    const { trips } = detectAwayTrips({ visits, moves: [], nightPoints: [], tz: TZ });
    expect(trips.map((t) => t.name)).toEqual(["Uppsala", "Stockholm"]);
  });
});

describe("tripName", () => {
  const c = (city: string, hours: number, order: number, away = true) => ({
    city,
    country: "Finland",
    duration: hours * 3600,
    firstSeen: order,
    away,
  });
  it("names after the main away cities, in visiting order", () => {
    expect(tripName([c("Helsinki", 1, 0, false), c("Tolosenmäki", 10, 1), c("Kitee", 30, 2), c("Parikkala", 0.2, 3)], [])).toBe(
      "Tolosenmäki and Kitee",
    );
    expect(tripName([c("A", 10, 0), c("B", 10, 1), c("C", 10, 2), c("D", 1, 3), c("E", 9, 4)], [])).toBe("A, B and C");
    expect(tripName([], ["Sweden"])).toBe("Sweden");
    expect(tripName([], [])).toBe("Trip");
  });
  it("joins names", () => {
    expect(joinNames(["Stockholm"])).toBe("Stockholm");
    expect(joinNames(["A", "B"])).toBe("A and B");
  });
});
