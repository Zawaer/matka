import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { freeAddedTrips, loadCorrections } from "@/lib/corrections";
import { type PhotoItem, getDayPhotos } from "@/lib/dayPhotos";
import { q } from "@/lib/db";
import { isDate } from "@/lib/insights/time";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/timeline/photos?date=YYYY-MM-DD
 * The user's Immich photos taken during each visit and trip of that local day:
 * {configured, pending, linkBase, items: [{key, ids, total}], points: [{id, key, lat, lon}]},
 * keys as on the timeline ("v-<visit id>", "m-<trip id>"). Loaded after the
 * timeline itself; `pending` means Immich is still being asked (try again).
 */
export async function GET(req: Request) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  const date = new URL(req.url).searchParams.get("date");
  if (!date || !isDate(date)) return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });

  const bounds = `($2::date::timestamp AT TIME ZONE $3), (($2::date + 1)::timestamp AT TIME ZONE $3)`;
  const [visits, trips, [b]] = await Promise.all([
    q<{ id: string; s: Date; e: Date; lat: number; lon: number }>(
      `WITH d(s, e) AS (VALUES (${bounds}))
       SELECT v.id, v.started_at AS s, v.ended_at AS e, ST_Y(p.geom::geometry) AS lat, ST_X(p.geom::geometry) AS lon
       FROM visits v JOIN places p ON p.id = v.place_id, d
       WHERE v.user_id = $1 AND v.started_at < d.e AND v.ended_at >= d.s`,
      [user.id, date, user.timezone],
    ),
    q<{ id: string; s: Date; e: Date; mode: string }>(
      `WITH d(s, e) AS (VALUES (${bounds}))
       SELECT t.id, t.started_at AS s, t.ended_at AS e, t.mode FROM trips t, d
       WHERE t.user_id = $1 AND t.started_at < d.e AND t.ended_at >= d.s`,
      [user.id, date, user.timezone],
    ),
    q<{ s: Date; e: Date; today: boolean }>(
      `SELECT ($1::date::timestamp AT TIME ZONE $2) AS s, (($1::date + 1)::timestamp AT TIME ZONE $2) AS e,
              (now() AT TIME ZONE $2)::date = $1::date AS today`,
      [date, user.timezone],
    ),
  ]);
  const corrections = await loadCorrections(user.id, b.s, b.e);
  const added = freeAddedTrips(
    corrections,
    trips.map((t) => ({ start: t.s.getTime(), end: t.e.getTime() })),
  );
  // Photos are looked for within the day only.
  const clip = (s: number, e: number) => ({ start: Math.max(s, b.s.getTime()), end: Math.min(e, b.e.getTime()) });
  const items: PhotoItem[] = [
    ...visits.map((v) => ({ key: `v-${v.id}`, ...clip(v.s.getTime(), v.e.getTime()), lat: v.lat, lon: v.lon })),
    // Not GPS jitter around a stop: those photos belong to the visit.
    ...trips.filter((t) => t.mode !== "stationary").map((t) => ({ key: `m-${t.id}`, ...clip(t.s.getTime(), t.e.getTime()) })),
    ...added.map((c) => ({ key: `m--${c.id}`, ...clip(Date.parse(c.startedAt), Date.parse(c.endedAt)) })),
  ].filter((i) => i.end > i.start);

  const out = await getDayPhotos(user.id, date, items, { today: b.today });
  return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
}
