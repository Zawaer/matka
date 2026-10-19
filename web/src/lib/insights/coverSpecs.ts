// What to look for when picking Immich covers (lib/covers.ts) for trips and
// cities.

import type { CoverSpec, CoverWindow } from "../covers";
import { q } from "../db";
import type { AwayTrip } from "./awayTrips";
import { dayBounds } from "./time";

/** Photos for the trip page strip, besides the cover. */
export const TRIP_STRIP = 8;

/**
 * A trip: everything from leaving home to getting back. An ongoing trip runs
 * to the end of its last day, so the inputs (and the cache) stay put all day.
 */
export function tripCoverSpec(t: Pick<AwayTrip, "id" | "departure" | "arrival" | "endDate">, tz: string): CoverSpec {
  const end = t.arrival ?? dayBounds(t.endDate, tz)[1];
  return { key: `trip:${t.id}`, windows: [{ start: t.departure, end }], more: TRIP_STRIP };
}

export const cityKey = (name: string, country: string | null) => `city:${country ?? ""}/${name}`;

/** Visits used for a city: the longest ones, at most this many, at most two per place. */
const CITY_WINDOWS = 6;

/**
 * Each city's cover windows: its longest visits between 20 minutes and 12 hours
 * (long enough to take photos, short of whole nights at home), two per place at
 * most so one hotel doesn't fill them, each tied to the place's location.
 */
export async function cityCoverSpecs(
  userId: string,
  only?: { name: string; country: string | null }[],
): Promise<Map<string, CoverSpec>> {
  const rows = await q<{ city: string; country: string | null; lat: number; lon: number; s: number; e: number }>(
    `WITH v AS (
       SELECT p.city, p.country, ST_Y(p.geom::geometry) AS lat, ST_X(p.geom::geometry) AS lon,
              v.started_at, v.ended_at,
              row_number() OVER (PARTITION BY v.place_id ORDER BY v.ended_at - v.started_at DESC, v.id) AS rp
       FROM visits v JOIN places p ON p.id = v.place_id
       WHERE v.user_id = $1 AND p.city IS NOT NULL
         AND v.ended_at - v.started_at BETWEEN interval '20 minutes' AND interval '12 hours'
     ), w AS (
       SELECT *, row_number() OVER (PARTITION BY city, country ORDER BY ended_at - started_at DESC, started_at) AS rc
       FROM v WHERE rp <= 2
     )
     SELECT city, country, lat, lon,
            extract(epoch FROM started_at)::float8 * 1000 AS s,
            extract(epoch FROM ended_at)::float8 * 1000 AS e
     FROM w WHERE rc <= $2
     ORDER BY city, country, started_at`,
    [userId, CITY_WINDOWS],
  );
  const wanted = only ? new Set(only.map((c) => cityKey(c.name, c.country))) : null;
  const out = new Map<string, CoverSpec>();
  for (const r of rows) {
    const key = cityKey(r.city, r.country);
    if (wanted && !wanted.has(key)) continue;
    const spec = out.get(key) ?? { key, windows: [] as CoverWindow[], radiusM: 400 };
    spec.windows.push({ start: r.s, end: r.e, lat: r.lat, lon: r.lon });
    out.set(key, spec);
  }
  return out;
}
