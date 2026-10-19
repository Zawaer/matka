import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Keep the heatmap payload light: at most this many cells (hottest first).
const MAX_POINTS = 25000;

/**
 * GET /api/points
 * GeoJSON FeatureCollection for the heatmap: one feature per ~55 m cell with
 * `h`, the hours spent there.
 *
 * Query params:
 *  - from, to       epoch seconds (optional)
 *  - minAccuracy    accuracy upper bound in metres (default 100)
 */
export async function GET(req: Request) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  const url = new URL(req.url);

  const minAccuracy = numParam(url.searchParams.get("minAccuracy"), 100);
  const from = numParam(url.searchParams.get("from"), null);
  const to = numParam(url.searchParams.get("to"), null);

  const where: string[] = ["user_id = $1", "(accuracy IS NULL OR accuracy < $2)"];
  const params: unknown[] = [user.id, minAccuracy];
  if (from != null) {
    params.push(from);
    where.push(`ts >= to_timestamp($${params.length})`);
  }
  if (to != null) {
    params.push(to);
    where.push(`ts <= to_timestamp($${params.length})`);
  }
  const whereSql = where.join(" AND ");

  // Time spent, not fixes: each point counts the seconds until the next fix
  // (up to 2 h while the phone stays within 200 m, as a distance-filtered phone
  // is silent when still; at most 2 min when it moved or went quiet elsewhere),
  // summed per ~55 m cell. Homes and workplaces glow; roads only trace.
  const rows = await q<{ lat: number; lon: number; secs: number; n: string }>(
    `WITH p AS (
       SELECT ts, geom, LEAD(ts) OVER w AS next_ts, LEAD(geom) OVER w AS next_geom
       FROM points WHERE ${whereSql}
       WINDOW w AS (ORDER BY ts)
     ), d AS (
       SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon,
              CASE WHEN next_ts IS NULL THEN 0
                   WHEN ST_DWithin(geom, next_geom, 200) THEN LEAST(extract(epoch FROM next_ts - ts), 7200)
                   ELSE LEAST(extract(epoch FROM next_ts - ts), 120) END AS secs
       FROM p
     )
     SELECT round(lat / 0.0005) * 0.0005 AS lat, round(lon / 0.001) * 0.001 AS lon,
            sum(secs)::float8 AS secs, count(*) AS n
     FROM d GROUP BY 1, 2
     ORDER BY secs DESC
     LIMIT ${MAX_POINTS}`,
    params,
  );
  const total = rows.reduce((a, r) => a + Number(r.n), 0);

  const features = rows.map((r) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [Number(r.lon), Number(r.lat)] },
    // h: hours spent in this cell.
    properties: { h: Math.round((Number(r.secs) / 3600) * 1000) / 1000 },
  }));

  return NextResponse.json(
    { type: "FeatureCollection", features, meta: { points: total, cells: features.length } },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function numParam(raw: string | null, fallback: number | null): number | null {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  // Epoch seconds between 1970 and 2100; anything else is ignored.
  return Number.isFinite(n) && n >= 0 && n < 4_102_444_800 ? n : fallback;
}
