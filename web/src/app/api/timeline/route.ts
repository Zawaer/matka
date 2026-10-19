import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { isModeKey } from "@/lib/modes";
import { PLACE_NAME_SQL } from "@/lib/places";
import { displayMode, legsByTrip } from "@/lib/transit/run";
import type { TimelineDay, TimelineItem, Visit } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A real calendar date in YYYY-MM-DD form. */
function isDate(s: string): boolean {
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
};

type TripRow = {
  id: string;
  started_at: Date;
  ended_at: Date;
  distance_m: number;
  mode: string;
  waits: { startedAt: string; endedAt: string; stop: string | null }[] | null;
};

const secs = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 1000);

/**
 * GET /api/timeline?date=YYYY-MM-DD
 * Visits and trips overlapping that day in the user's timezone (default: the
 * latest day with data), plus every day that has data for navigation.
 */
export async function GET(req: Request) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  const tz = user.timezone;
  const dateParam = new URL(req.url).searchParams.get("date");

  const dates = (
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

  if (dateParam && !isDate(dateParam)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  const date = dateParam ?? maxDate;
  if (!date) {
    const empty: TimelineDay = { date: dateParam ?? "", items: [] };
    return NextResponse.json({ day: empty, dates, minDate, maxDate });
  }

  // [start, end) of the local day, as instants.
  const bounds = `($2::date::timestamp AT TIME ZONE $3), (($2::date + 1)::timestamp AT TIME ZONE $3)`;
  const [visits, trips, [b]] = await Promise.all([
    q<VisitRow>(
      `WITH d(s, e) AS (VALUES (${bounds}))
       SELECT v.id, v.started_at, v.ended_at, v.place_id, ${PLACE_NAME_SQL} AS place_name,
              p.category, p.kind, ST_Y(p.geom::geometry) AS lat, ST_X(p.geom::geometry) AS lon
       FROM visits v JOIN places p ON p.id = v.place_id, d
       WHERE v.user_id = $1 AND v.started_at < d.e AND v.ended_at >= d.s
       ORDER BY v.started_at`,
      [user.id, date, tz],
    ),
    q<TripRow>(
      `WITH d(s, e) AS (VALUES (${bounds}))
       SELECT t.id, t.started_at, t.ended_at, t.distance_m, t.mode, t.waits
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

  const legs = user.transitLines ? await legsByTrip(trips.map((t) => t.id)) : new Map();

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
          lat: r.lat,
          lon: r.lon,
        },
      },
    })),
    ...trips.map((r) => {
      const tl = legs.get(String(r.id)) ?? [];
      const mode = displayMode(r.mode, r.distance_m, tl);
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
            ...(tl.length
              ? {
                  legs: tl.map((l: (typeof tl)[number]) => ({
                    kind: l.kind,
                    lines: l.lines,
                    fromStop: l.from_stop,
                    toStop: l.to_stop,
                    startedAt: l.started_at.toISOString(),
                    endedAt: l.ended_at.toISOString(),
                    distance: Math.round(l.distance_m),
                  })),
                }
              : {}),
            // Transfers folded into the trip ("Waited at Kamppi"); the
            // client reads them as TrackSummary & { waits }.
            ...(r.waits?.length ? { waits: r.waits } : {}),
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
  return NextResponse.json({ day, dates, minDate, maxDate });
}
