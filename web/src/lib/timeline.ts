// One day of the timeline: the visits and trips overlapping a local day in the
// user's timezone, with transit legs, the user's fixes and added trips folded
// in. Served by GET /api/timeline and rendered straight into /embed/day.

import type { User } from "@/lib/auth";
import { q } from "@/lib/db";
import { isModeKey } from "@/lib/modes";
import { PLACE_CATEGORY_SQL, PLACE_NAME_SQL } from "@/lib/places";
import { applyCorrection, correctionFor, freeAddedTrips, loadCorrections } from "@/lib/corrections";
import { needsConfirm, placeCandidates } from "@/lib/placeConfirm";
import { type LegRow, displayMode, legsByTrip } from "@/lib/transit/run";
import type { TimelineDay, TimelineItem, Visit } from "@/lib/types";

/** A real calendar date in YYYY-MM-DD form. */
export function isDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

type VisitRow = {
  id: string;
  started_at: Date;
  ended_at: Date;
  place_id: string;
  place_name: string | null;
  category: string | null;
  kind: Visit["placeKind"];
  lat: number;
  lon: number;
  osm_key: string | null;
  renamed: boolean;
  confirmed: boolean;
  geo_candidates: unknown;
  place_visits: string;
};

type TripRow = {
  id: string;
  started_at: Date;
  ended_at: Date;
  distance_m: number;
  mode: string;
  waits: { startedAt: string; endedAt: string; stop: string | null }[] | null;
  from_lat: number | null;
  from_lon: number | null;
  to_lat: number | null;
  to_lon: number | null;
  line: string | null; // ST_AsGeoJSON of the simplified path
};

const secs = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 1000);

/** The names to pick from when this visit's place name is a guess ("Visited X?"), else nothing. */
function askAbout(r: VisitRow): Pick<Visit, "candidates"> {
  const candidates = placeCandidates(r.geo_candidates);
  const ask = needsConfirm({
    renamed: r.renamed,
    kind: r.kind,
    confirmed: r.confirmed,
    placeVisits: Number(r.place_visits),
    duration: secs(r.started_at, r.ended_at),
    candidates,
  });
  return ask ? { candidates } : {};
}

/** The simplified line as [lon, lat] pairs, when it has two or more. */
export function pathOf(line: string | null): { path?: [number, number][] } {
  if (!line) return {};
  try {
    const g = JSON.parse(line) as { type?: string; coordinates?: unknown };
    if (g.type !== "LineString" || !Array.isArray(g.coordinates)) return {};
    const path = g.coordinates.filter(
      (c): c is [number, number] => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]),
    ).map((c) => [c[0], c[1]] as [number, number]);
    return path.length >= 2 ? { path } : {};
  } catch {
    return {};
  }
}

export type TimelineAnswer = { day: TimelineDay; dates: string[]; minDate: string | null; maxDate: string | null };

/**
 * The day `dateParam` (a valid YYYY-MM-DD, see isDate), or the latest day
 * with data, plus every day that has data for navigation. With
 * `withDates: false` and a date, the list of days is skipped (empty).
 */
export async function loadTimeline(user: User, dateParam: string | null, { withDates = true } = {}): Promise<TimelineAnswer> {
  const tz = user.timezone;
  const dates = !withDates && dateParam ? [] : (
    await q<{ date: string }>(
      // Every local day a visit or trip overlaps, not only the days they
      // start on: a day spent at home from the evening before has data too.
      `SELECT DISTINCT to_char(d, 'YYYY-MM-DD') AS date
       FROM (SELECT started_at, ended_at FROM visits WHERE user_id = $1
             UNION ALL SELECT started_at, ended_at FROM trips WHERE user_id = $1) s,
            generate_series((started_at AT TIME ZONE $2)::date, (ended_at AT TIME ZONE $2)::date, interval '1 day') d
       ORDER BY 1`,
      [user.id, tz],
    )
  ).map((r) => r.date);
  const minDate = dates[0] ?? null;
  const maxDate = dates.at(-1) ?? null;

  const date = dateParam ?? maxDate;
  if (!date) {
    const empty: TimelineDay = { date: dateParam ?? "", items: [] };
    return { day: empty, dates, minDate, maxDate };
  }

  // [start, end) of the local day, as instants.
  const bounds = `($2::date::timestamp AT TIME ZONE $3), (($2::date + 1)::timestamp AT TIME ZONE $3)`;
  const [visits, trips, [b]] = await Promise.all([
    q<VisitRow>(
      `WITH d(s, e) AS (VALUES (${bounds}))
       SELECT v.id, v.started_at, v.ended_at, v.place_id, ${PLACE_NAME_SQL} AS place_name,
              ${PLACE_CATEGORY_SQL} AS category, p.kind, ST_Y(p.geom::geometry) AS lat, ST_X(p.geom::geometry) AS lon,
              p.geodata->>'osm_key' AS osm_key, p.custom_name IS NOT NULL AS renamed,
              p.confirmed_at IS NOT NULL AS confirmed, p.geo_candidates,
              (SELECT count(*) FROM visits pv WHERE pv.place_id = p.id) AS place_visits
       FROM visits v JOIN places p ON p.id = v.place_id, d
       WHERE v.user_id = $1 AND v.started_at < d.e AND v.ended_at >= d.s
       ORDER BY v.started_at`,
      [user.id, date, tz],
    ),
    q<TripRow>(
      `WITH d(s, e) AS (VALUES (${bounds}))
       SELECT t.id, t.started_at, t.ended_at, t.distance_m, t.mode, t.waits,
              ST_Y(ST_StartPoint(t.path::geometry)) AS from_lat, ST_X(ST_StartPoint(t.path::geometry)) AS from_lon,
              ST_Y(ST_EndPoint(t.path::geometry)) AS to_lat, ST_X(ST_EndPoint(t.path::geometry)) AS to_lon,
              -- A rough line for a sketch of the day (the app's map placeholder):
              -- simplified to 1/100 of the trip's extent, so a few dozen points.
              ST_AsGeoJSON(ST_Simplify(t.path::geometry, GREATEST(0.00005,
                GREATEST(ST_XMax(t.path::geometry) - ST_XMin(t.path::geometry), ST_YMax(t.path::geometry) - ST_YMin(t.path::geometry)) / 100)), 4) AS line
       FROM trips t, d
       WHERE t.user_id = $1 AND t.started_at < d.e AND t.ended_at >= d.s
       ORDER BY t.started_at`,
      [user.id, date, tz],
    ),
    q<{ s: Date; e: Date }>(
      `SELECT ($1::date::timestamp AT TIME ZONE $2) AS s, (($1::date + 1)::timestamp AT TIME ZONE $2) AS e`,
      [date, tz],
    ),
  ]);

  const legs: Map<string, LegRow[]> = user.transitLines ? await legsByTrip(trips.map((t) => t.id)) : new Map();
  // Corrections touching the day or any of its trips (fixes, and trips the user added).
  const corrections = await loadCorrections(
    user.id,
    new Date(Math.min(b.s.getTime(), ...trips.map((t) => t.started_at.getTime()))),
    new Date(Math.max(b.e.getTime(), ...trips.map((t) => t.ended_at.getTime() + 1))),
  );
  const tripSpans = trips.map((t) => ({ start: t.started_at.getTime(), end: t.ended_at.getTime() }));
  const added = freeAddedTrips(corrections, tripSpans).filter(
    (c) => new Date(c.startedAt) < b.e && new Date(c.endedAt) >= b.s,
  );
  const fromPoint = (lat: number | null, lon: number | null) => (lat != null && lon != null ? { from: { lat, lon } } : {});

  const items: { at: number; item: TimelineItem }[] = [
    ...visits.map((r) => ({
      at: r.started_at.getTime(),
      item: {
        kind: "visit" as const,
        visit: {
          id: Number(r.id),
          startedAt: r.started_at.toISOString(),
          endedAt: r.ended_at.toISOString(),
          duration: secs(r.started_at, r.ended_at),
          placeId: Number(r.place_id),
          placeName: r.place_name,
          category: r.category,
          placeKind: r.kind,
          osmKey: r.osm_key,
          lat: r.lat,
          lon: r.lon,
          ...askAbout(r),
        },
      },
    })),
    ...trips.map((r) => {
      const matched = legs.get(String(r.id)) ?? [];
      // The user's fix of this trip, if any, overrides what was detected.
      const fixed = applyCorrection(
        displayMode(r.mode, r.distance_m, matched),
        matched.map((l) => ({
          kind: l.kind,
          lines: l.lines,
          fromStop: l.from_stop,
          toStop: l.to_stop,
          startedAt: l.started_at.toISOString(),
          endedAt: l.ended_at.toISOString(),
          distance: Math.round(l.distance_m),
        })),
        correctionFor({ start: r.started_at.getTime(), end: r.ended_at.getTime() }, corrections),
      );
      const mode = fixed.mode;
      return {
        at: r.started_at.getTime(),
        item: {
          kind: "move" as const,
          track: {
            id: Number(r.id),
            startedAt: r.started_at.toISOString(),
            endedAt: r.ended_at.toISOString(),
            distance: Math.round(r.distance_m),
            duration: secs(r.started_at, r.ended_at),
            mode: isModeKey(mode) ? mode : ("unknown" as const),
            ...(fixed.legs.length ? { legs: fixed.legs } : {}),
            ...(fixed.correctionId != null ? { correctionId: fixed.correctionId } : {}),
            ...fromPoint(r.from_lat, r.from_lon),
            ...(r.to_lat != null && r.to_lon != null ? { to: { lat: r.to_lat, lon: r.to_lon } } : {}),
            ...pathOf(r.line),
            // Transfers folded into the trip ("Waited at Kamppi"); the
            // client reads them as TrackSummary & { waits }.
            ...(r.waits?.length ? { waits: r.waits } : {}),
          },
        },
      };
    }),
    // Trips the user added where nothing was recorded ("Add travel").
    ...added.map((c) => {
      const s = new Date(c.startedAt);
      const e = new Date(c.endedAt);
      return {
        at: s.getTime(),
        item: {
          kind: "move" as const,
          track: {
            id: -c.id,
            startedAt: c.startedAt,
            endedAt: c.endedAt,
            distance: c.added.distance,
            duration: secs(s, e),
            mode: isModeKey(c.mode) ? c.mode : ("unknown" as const),
            ...(c.legs.length ? { legs: c.legs } : {}),
            correctionId: c.id,
            added: true,
            from: c.added.from,
            to: c.added.to,
          },
        },
      };
    }),
  ];
  items.sort((a, b) => a.at - b.at);

  const day: TimelineDay = {
    date,
    start: b.s.toISOString(),
    end: b.e.toISOString(),
    items: items.map((x) => x.item),
  };
  return { day, dates, minDate, maxDate };
}
