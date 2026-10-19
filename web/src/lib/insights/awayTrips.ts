// Automatic trips: runs of nights spent away from home, Google-Timeline style.
// Pure: ./load.ts fetches visits, moves and night points; nothing here touches
// the database, so the rules are unit-tested in awayTrips.test.ts.
//
// The rules:
// - Each local night is sampled at 00:00–06:00: the visit overlapping that
//   window most (at least an hour), else the median of the points recorded in
//   it, else unknown.
// - Home is where most nights are spent (the largest 1 km cluster of samples).
// - A night is "away" when its sample is more than `awayKm` from home. A trip is
//   a run of away nights; up to `maxGapNights` unknown nights inside a run are
//   bridged (phone off).
// - The trip starts when you last left the home area before the first away
//   night, and ends when you are back at home (or, failing that within a day,
//   back in the home area).

import { type Move, type ModeTotal, summarize } from "./summary";
import { addDays, dayBounds, daysBetween, localDate, startOfDay } from "./time";

export type StayVisit = {
  placeId: number;
  lat: number;
  lon: number;
  city: string | null;
  country: string | null;
  /** Epoch ms. */
  start: number;
  end: number;
};

/** Median location of the points recorded in one night's window. */
export type NightPoint = { date: string; lat: number; lon: number };

export type AwayOptions = {
  /** A night farther than this from home is away. */
  awayKm: number;
  /** Radius of "at home". */
  homeKm: number;
  /** Unknown nights bridged inside a trip. */
  maxGapNights: number;
  /** Night window, local hours [start, end). */
  nightFrom: number;
  nightTo: number;
  /** Minimum visit overlap with the night window to place the night, ms. */
  minNightOverlap: number;
};

export const DEFAULT_AWAY: AwayOptions = {
  awayKm: 30,
  homeKm: 1,
  maxGapNights: 2,
  nightFrom: 0,
  nightTo: 6,
  minNightOverlap: 60 * 60_000,
};

export type Home = { lat: number; lon: number; nights: number; city: string | null; country: string | null };

export type TripCity = {
  city: string;
  country: string | null;
  /** Seconds spent at visits in this city during the trip. */
  duration: number;
  /** Epoch ms of the first visit. */
  firstSeen: number;
  /** More than awayKm from home. */
  away: boolean;
};

export type TripDay = {
  date: string;
  distance: number;
  duration: number;
  modes: ModeTotal[];
  /** Cities with visits that day, in order of first visit. */
  cities: string[];
};

export type AwayTrip = {
  /** Stable while the trip's start date doesn't change: its first day. */
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  days: number;
  nights: number;
  /** Epoch ms you left the home area. */
  departure: number;
  /** Epoch ms you were back home; null while still away. */
  arrival: number | null;
  cities: TripCity[];
  countries: string[];
  /** Metres travelled during the trip. */
  distance: number;
  duration: number;
  modes: ModeTotal[];
  dayList: TripDay[];
};

type Sample = { date: string; lat: number; lon: number; visit: StayVisit | null };

/** Great-circle distance in km. */
export function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nightWindow(date: string, tz: string, o: AwayOptions): [number, number] {
  const s = startOfDay(date, tz);
  return [s + o.nightFrom * 3_600_000, s + o.nightTo * 3_600_000];
}

/** Where each night (keyed by the morning's date) was spent, oldest first. */
export function sampleNights(
  visits: StayVisit[],
  nightPoints: NightPoint[],
  tz: string,
  o: AwayOptions = DEFAULT_AWAY,
): Sample[] {
  if (visits.length === 0 && nightPoints.length === 0) return [];
  const byDate = new Map(nightPoints.map((p) => [p.date, p]));
  const dates = [
    ...visits.flatMap((v) => [localDate(v.start, tz), localDate(v.end, tz)]),
    ...nightPoints.map((p) => p.date),
  ].sort();
  const sorted = [...visits].sort((a, b) => a.start - b.start);
  const out: Sample[] = [];
  let i = 0;
  for (let d = dates[0]; d <= dates[dates.length - 1]; d = addDays(d, 1)) {
    const [s, e] = nightWindow(d, tz, o);
    // Visits are sorted by start; skip those that ended long before.
    while (i < sorted.length && sorted[i].end < s - 7 * 86_400_000) i++;
    let best: StayVisit | null = null;
    let bestOverlap = 0;
    for (let j = i; j < sorted.length && sorted[j].start < e; j++) {
      const ov = Math.min(e, sorted[j].end) - Math.max(s, sorted[j].start);
      if (ov > bestOverlap) {
        best = sorted[j];
        bestOverlap = ov;
      }
    }
    if (best && bestOverlap >= o.minNightOverlap) {
      out.push({ date: d, lat: best.lat, lon: best.lon, visit: best });
      continue;
    }
    const p = byDate.get(d);
    if (p) out.push({ date: d, lat: p.lat, lon: p.lon, visit: null });
  }
  return out;
}

/** The largest cluster of night locations (homeKm radius). */
export function detectHome(samples: Sample[], o: AwayOptions = DEFAULT_AWAY): Home | null {
  let best: Sample[] = [];
  for (const a of samples) {
    const near = samples.filter((b) => km(a.lat, a.lon, b.lat, b.lon) <= o.homeKm);
    if (near.length > best.length) best = near;
  }
  if (best.length === 0) return null;
  const lat = best.reduce((s, x) => s + x.lat, 0) / best.length;
  const lon = best.reduce((s, x) => s + x.lon, 0) / best.length;
  // Name it after the city most of those nights were spent in.
  const cities = new Map<string, { n: number; country: string | null }>();
  for (const s of best) {
    const c = s.visit?.city;
    if (c) cities.set(c, { n: (cities.get(c)?.n ?? 0) + 1, country: s.visit?.country ?? null });
  }
  const top = [...cities].sort((a, b) => b[1].n - a[1].n)[0];
  return { lat, lon, nights: best.length, city: top?.[0] ?? null, country: top?.[1].country ?? null };
}

/** "Stockholm", "Kitee and Helsinki", "Tolosenmäki, Kitee and Helsinki". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Up to three cities that carried the trip, in the order you reached them. */
export function tripName(cities: TripCity[], countries: string[]): string {
  const pool = cities.some((c) => c.away) ? cities.filter((c) => c.away) : cities;
  if (pool.length === 0) return countries.length ? joinNames(countries) : "Trip";
  const max = Math.max(...pool.map((c) => c.duration));
  const main = [...pool]
    .sort((a, b) => b.duration - a.duration)
    .filter((c, i) => i === 0 || c.duration >= 0.15 * max)
    .slice(0, 3)
    .sort((a, b) => a.firstSeen - b.firstSeen);
  return joinNames(main.map((c) => c.city));
}

type Run = { first: Sample; last: Sample; nights: number };

export function detectAwayTrips(
  input: { visits: StayVisit[]; moves: Move[]; nightPoints: NightPoint[]; tz: string },
  opts: Partial<AwayOptions> = {},
): { home: Home | null; trips: AwayTrip[] } {
  const o = { ...DEFAULT_AWAY, ...opts };
  const { tz } = input;
  const visits = [...input.visits].sort((a, b) => a.start - b.start);
  const samples = sampleNights(visits, input.nightPoints, tz, o);
  const home = detectHome(samples, o);
  if (!home) return { home: null, trips: [] };

  const fromHome = (x: { lat: number; lon: number }) => km(home.lat, home.lon, x.lat, x.lon);
  const isAway = (x: { lat: number; lon: number }) => fromHome(x) > o.awayKm;

  // Runs of away nights, bridging short unknown gaps.
  const byDate = new Map(samples.map((s) => [s.date, s]));
  const runs: Run[] = [];
  let cur: Run | null = null;
  for (const s of samples) {
    if (!isAway(s)) {
      cur = null;
      continue;
    }
    const gap = cur ? daysBetween(cur.last.date, s.date) - 1 : Infinity;
    const bridged =
      cur != null &&
      gap <= o.maxGapNights &&
      Array.from({ length: gap }, (_, k) => addDays(cur!.last.date, k + 1)).every((d) => !byDate.has(d));
    if (cur && bridged) {
      cur.last = s;
      cur.nights += gap + 1;
    } else {
      cur = { first: s, last: s, nights: 1 };
      runs.push(cur);
    }
  }

  const lastData = Math.max(
    ...visits.map((v) => v.end),
    ...input.moves.map((m) => m.end),
    ...input.nightPoints.map((p) => nightWindow(p.date, tz, o)[1]),
  );

  type Span = { run: Run; departure: number; arrival: number | null };
  const spans: Span[] = [];
  for (const run of runs) {
    const [n1s] = nightWindow(run.first.date, tz, o);
    const [, nks] = nightWindow(run.last.date, tz, o);
    const awayFrom = run.first.visit ? Math.min(run.first.visit.start, n1s) : n1s;
    const awayTo = run.last.visit ? Math.max(run.last.visit.end, nks) : nks;

    // "Home" for this trip: the home cluster, or wherever you slept before leaving.
    const before = [...samples].reverse().find((s) => s.date < run.first.date && !isAway(s));
    const atHome = (v: StayVisit) =>
      fromHome(v) <= o.homeKm || (before != null && km(before.lat, before.lon, v.lat, v.lon) <= o.homeKm);

    // Departure: when you last left home (else the home area) before the first
    // away night, at most two days earlier.
    const earliest = startOfDay(addDays(run.first.date, -2), tz);
    let leftHome: number | null = null;
    let leftArea: number | null = null;
    for (const v of visits) {
      if (v.end > awayFrom) break;
      if (v.end < earliest || isAway(v)) continue;
      leftArea = v.end;
      if (atHome(v)) leftHome = v.end;
    }
    let departure = leftHome ?? leftArea ?? n1s;
    if (leftArea == null) {
      // No stay at home found (data starts mid-trip): the first away visit of the evening before.
      const first = visits.find((v) => v.end > startOfDay(addDays(run.first.date, -1), tz) && isAway(v));
      if (first && first.start < n1s) departure = first.start;
    }

    // Arrival: back at home within a day of the last away night; else the
    // first stay back in the home area.
    const latest = dayBounds(addDays(run.last.date, 1), tz)[1];
    const after = visits.filter((v) => v.start >= awayTo || (v.end > awayTo && !isAway(v)));
    const arrival =
      after.find((v) => atHome(v) && v.start < latest)?.start ??
      after.find((v) => !isAway(v))?.start ??
      null;
    spans.push({ run, departure, arrival: arrival != null ? Math.max(arrival, awayFrom) : null });
  }

  // Two runs with no homecoming in between are one trip.
  const merged: Span[] = [];
  for (const s of spans) {
    const prev = merged[merged.length - 1];
    if (prev && (prev.arrival == null || s.departure < prev.arrival)) {
      prev.run = { first: prev.run.first, last: s.run.last, nights: prev.run.nights + s.run.nights };
      prev.arrival = s.arrival == null || prev.arrival == null ? s.arrival : Math.max(prev.arrival, s.arrival);
      continue;
    }
    merged.push({ ...s });
  }

  const trips = merged.map(({ run, departure, arrival }) => {
    const end = arrival ?? lastData;
    const startDate = localDate(departure, tz);
    const endDate = localDate(Math.max(departure, end - 1), tz);

    const cityMap = new Map<string, TripCity>();
    const dayCities = new Map<string, string[]>();
    for (const v of visits) {
      const s = Math.max(v.start, departure);
      const e = Math.min(v.end, end);
      if (e <= s || !v.city) continue;
      const c = cityMap.get(v.city) ?? {
        city: v.city,
        country: v.country,
        duration: 0,
        firstSeen: s,
        away: false,
      };
      c.duration += (e - s) / 1000;
      c.away ||= isAway(v);
      cityMap.set(v.city, c);
      for (let d = localDate(s, tz); d <= localDate(e - 1, tz); d = addDays(d, 1)) {
        const list = dayCities.get(d) ?? [];
        if (!list.includes(v.city)) list.push(v.city);
        dayCities.set(d, list);
      }
    }
    const cities = [...cityMap.values()]
      .map((c) => ({ ...c, duration: Math.round(c.duration) }))
      .sort((a, b) => a.firstSeen - b.firstSeen);
    const countries = [
      ...new Set(cities.filter((c) => c.away && c.country).map((c) => c.country as string)),
    ];

    const total = summarize(input.moves, departure, end);
    const dayList: TripDay[] = [];
    for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
      const [ds, de] = dayBounds(d, tz);
      const s = summarize(input.moves, Math.max(ds, departure), Math.min(de, end));
      dayList.push({ date: d, ...s, cities: dayCities.get(d) ?? [] });
    }

    return {
      id: startDate,
      name: tripName(cities, countries),
      startDate,
      endDate,
      days: daysBetween(startDate, endDate) + 1,
      nights: run.nights,
      departure,
      arrival,
      cities,
      countries,
      distance: total.distance,
      duration: total.duration,
      modes: total.modes,
      dayList,
    } satisfies AwayTrip;
  });

  return { home, trips: trips.reverse() };
}
