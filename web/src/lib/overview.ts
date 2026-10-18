import { q } from "./db";
import { PLACE_NAME_SQL } from "./places";

export type Overview = {
  totals: {
    points: number;
    visits: number;
    trips: number;
    days: number;
    /** Metres travelled, all time. */
    distance: number;
    first: Date | null;
    last: Date | null;
  };
  /** Last 12 months, oldest first; distance in metres. */
  months: { year: number; month: number; distance: number }[];
  topPlaces: { id: number; name: string | null; hours: number }[];
  recent: { id: number; placeId: number; name: string | null; startedAt: Date; duration: number }[];
};

/** Everything the Overview page (and the phone app's overview) shows. */
export async function getOverview(userId: string, tz: string): Promise<Overview> {
  const [[totals], months, topPlaces, recent] = await Promise.all([
    q<{
      points: string;
      visits: string;
      trips: string;
      days: string;
      distance: number | null;
      first: Date | null;
      last: Date | null;
    }>(
      `SELECT
         (SELECT count(*) FROM points WHERE user_id = $1) AS points,
         (SELECT count(*) FROM visits WHERE user_id = $1) AS visits,
         (SELECT count(*) FROM trips WHERE user_id = $1) AS trips,
         (SELECT count(DISTINCT (ts AT TIME ZONE $2)::date) FROM points WHERE user_id = $1) AS days,
         (SELECT sum(distance_m)::float8 FROM trips WHERE user_id = $1) AS distance,
         (SELECT min(ts) FROM points WHERE user_id = $1) AS first,
         (SELECT max(ts) FROM points WHERE user_id = $1) AS last`,
      [userId, tz],
    ),
    q<{ year: number; month: number; distance: number }>(
      `SELECT extract(year FROM m)::int AS year, extract(month FROM m)::int AS month,
              COALESCE(sum(t.distance_m), 0)::float8 AS distance
       FROM generate_series(date_trunc('month', now() AT TIME ZONE $2) - interval '11 months',
                            date_trunc('month', now() AT TIME ZONE $2), interval '1 month') AS m
       LEFT JOIN trips t ON t.user_id = $1
             AND date_trunc('month', t.started_at AT TIME ZONE $2) = m
       GROUP BY m ORDER BY m`,
      [userId, tz],
    ),
    q<{ id: string; name: string | null; hours: number }>(
      `SELECT p.id, ${PLACE_NAME_SQL} AS name,
              sum(extract(epoch FROM v.ended_at - v.started_at))::float8 / 3600 AS hours
       FROM visits v JOIN places p ON p.id = v.place_id
       WHERE v.user_id = $1
       GROUP BY p.id ORDER BY hours DESC LIMIT 8`,
      [userId],
    ),
    q<{ id: string; place_id: string; name: string | null; started_at: Date; duration: number }>(
      `SELECT v.id, v.place_id, ${PLACE_NAME_SQL} AS name, v.started_at,
              extract(epoch FROM v.ended_at - v.started_at)::int AS duration
       FROM visits v JOIN places p ON p.id = v.place_id
       WHERE v.user_id = $1
       ORDER BY v.started_at DESC LIMIT 8`,
      [userId],
    ),
  ]);

  return {
    totals: {
      points: Number(totals.points),
      visits: Number(totals.visits),
      trips: Number(totals.trips),
      days: Number(totals.days),
      distance: Math.round(totals.distance ?? 0),
      first: totals.first,
      last: totals.last,
    },
    months,
    topPlaces: topPlaces.map((p) => ({ id: Number(p.id), name: p.name, hours: p.hours })),
    recent: recent.map((r) => ({
      id: Number(r.id),
      placeId: Number(r.place_id),
      name: r.name,
      startedAt: r.started_at,
      duration: r.duration,
    })),
  };
}
