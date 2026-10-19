// Database loaders for the Insights pages and their API routes. The logic lives
// in the pure modules next to this file.

import type { User } from "../auth";
import { q } from "../db";
import { getPlaces } from "../places";
import { type AwayTrip, type Home, type NightPoint, type StayVisit, DEFAULT_AWAY, detectAwayTrips } from "./awayTrips";
import { type Move, daySummary, monthModes } from "./summary";
import { addMonths, dayBounds, localMonth, monthBounds } from "./time";
import { type WorldSort, cityPlaces, groupWorld } from "./world";

/**
 * Trips with their displayed mode: with line matching on, a trip whose matched
 * transit legs cover at least half of it counts as the kind covering most of it
 * (the rule of lib/transit/run.ts displayMode).
 */
export async function loadMoves(user: Pick<User, "id" | "transitLines">, from?: number, to?: number): Promise<Move[]> {
  const params: unknown[] = [user.id, user.transitLines];
  const where = ["t.user_id = $1"];
  if (from != null) {
    params.push(new Date(from));
    where.push(`t.ended_at >= $${params.length}`);
  }
  if (to != null) {
    params.push(new Date(to));
    where.push(`t.started_at < $${params.length}`);
  }
  const rows = await q<{ s: number; e: number; distance: number; mode: string }>(
    `SELECT extract(epoch FROM t.started_at)::float8 * 1000 AS s,
            extract(epoch FROM t.ended_at)::float8 * 1000 AS e,
            t.distance_m::float8 AS distance,
            CASE WHEN $2 AND l.covered >= 0.5 * t.distance_m THEN l.kind ELSE t.mode END AS mode
     FROM trips t
     LEFT JOIN LATERAL (
       SELECT sum(d) AS covered, (array_agg(kind ORDER BY d DESC))[1] AS kind
       FROM (SELECT kind, sum(distance_m) AS d FROM trip_legs WHERE trip_id = t.id GROUP BY kind) k
     ) l ON $2
     WHERE ${where.join(" AND ")}
     ORDER BY t.started_at`,
    params,
  );
  return rows.map((r) => ({ start: r.s, end: r.e, distance: r.distance, mode: r.mode }));
}

/** Distance and time per mode for a month, with 6 months of history per mode. */
export async function getMonthModes(user: User, month?: string) {
  const tz = user.timezone;
  const [{ last }] = await q<{ last: Date | null }>(`SELECT max(started_at) AS last FROM trips WHERE user_id = $1`, [
    user.id,
  ]);
  const m = month ?? localMonth((last ?? new Date()).getTime(), tz);
  const [from] = monthBounds(addMonths(m, -5), tz);
  const [, to] = monthBounds(m, tz);
  const [moves, [range]] = await Promise.all([
    loadMoves(user, from, to),
    q<{ first: Date | null; last: Date | null }>(
      `SELECT min(started_at) AS first, max(started_at) AS last FROM trips WHERE user_id = $1 AND mode <> 'stationary'`,
      [user.id],
    ),
  ]);
  const out = monthModes(moves, m, tz);
  return {
    ...out,
    firstMonth: range.first ? localMonth(range.first.getTime(), tz) : null,
    lastMonth: range.last ? localMonth(range.last.getTime(), tz) : null,
  };
}

/** Distance and time per mode for one local day. */
export async function getDaySummary(user: User, date: string) {
  const [from, to] = dayBounds(date, user.timezone);
  return daySummary(await loadMoves(user, from, to), date, user.timezone);
}

async function loadStays(userId: string): Promise<StayVisit[]> {
  const rows = await q<{
    place_id: string;
    lat: number;
    lon: number;
    city: string | null;
    country: string | null;
    s: number;
    e: number;
  }>(
    `SELECT v.place_id, ST_Y(p.geom::geometry) AS lat, ST_X(p.geom::geometry) AS lon, p.city, p.country,
            extract(epoch FROM v.started_at)::float8 * 1000 AS s,
            extract(epoch FROM v.ended_at)::float8 * 1000 AS e
     FROM visits v JOIN places p ON p.id = v.place_id
     WHERE v.user_id = $1 ORDER BY v.started_at`,
    [userId],
  );
  return rows.map((r) => ({
    placeId: Number(r.place_id),
    lat: r.lat,
    lon: r.lon,
    city: r.city,
    country: r.country,
    start: r.s,
    end: r.e,
  }));
}

/** Median point of each local night window (00:00–06:00), for nights without a visit. */
async function loadNightPoints(userId: string, tz: string): Promise<NightPoint[]> {
  return q<NightPoint>(
    `SELECT to_char((ts AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS date,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY ST_Y(geom::geometry)) AS lat,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY ST_X(geom::geometry)) AS lon
     FROM points
     WHERE user_id = $1 AND extract(hour FROM ts AT TIME ZONE $2) >= $3
       AND extract(hour FROM ts AT TIME ZONE $2) < $4
     GROUP BY 1 ORDER BY 1`,
    [userId, tz, DEFAULT_AWAY.nightFrom, DEFAULT_AWAY.nightTo],
  );
}

// Recomputed on read (a few hundred ms over years of data); cached per user
// until a new trip or visit lands.
const tripCache = new Map<string, { key: string; value: { home: Home | null; trips: AwayTrip[] } }>();

/** Trips away from home, newest first. */
export async function getAwayTrips(user: User): Promise<{ home: Home | null; trips: AwayTrip[] }> {
  const [{ key }] = await q<{ key: string }>(
    `SELECT concat_ws('/', (SELECT max(id) FROM trips WHERE user_id = $1), (SELECT count(*) FROM trips WHERE user_id = $1),
              (SELECT max(id) FROM visits WHERE user_id = $1), (SELECT count(*) FROM visits WHERE user_id = $1),
              (SELECT count(*) FROM trips WHERE user_id = $1 AND transit_checked IS NOT NULL),
              (SELECT max(geocoded_at) FROM places WHERE user_id = $1), $2::text, $3::text) AS key`,
    [user.id, user.timezone, user.transitLines],
  );
  const hit = tripCache.get(user.id);
  if (hit?.key === key) return hit.value;
  const [visits, moves, nightPoints] = await Promise.all([
    loadStays(user.id),
    loadMoves(user),
    loadNightPoints(user.id, user.timezone),
  ]);
  const value = detectAwayTrips({ visits, moves, nightPoints, tz: user.timezone });
  tripCache.set(user.id, { key, value });
  return value;
}

/** Cities and countries, sorted. */
export async function getWorld(user: User, sort: WorldSort = "visits") {
  return groupWorld(await getPlaces(user.id), sort);
}

/** One city's places. */
export async function getCity(user: User, city: string, country: string | null) {
  return cityPlaces(await getPlaces(user.id), city, country);
}

/** A trip with ISO timestamps, as the API returns it. */
export function tripJson(t: AwayTrip, withDays = false) {
  const { dayList, departure, arrival, cities, ...rest } = t;
  return {
    ...rest,
    departure: new Date(departure).toISOString(),
    arrival: arrival == null ? null : new Date(arrival).toISOString(),
    cities: cities.map((c) => ({ ...c, firstSeen: new Date(c.firstSeen).toISOString() })),
    ...(withDays ? { dayList } : {}),
  };
}
