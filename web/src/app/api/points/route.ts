import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Keep the heatmap payload light: never ship more than ~25k points.
const MAX_POINTS = 25000;

type Row = { lon: number; lat: number; id: string; t: number };

/**
 * GET /api/points
 * GeoJSON FeatureCollection of (filtered, downsampled) points for the heatmap.
 *
 * Query params:
 *  - from, to       epoch seconds (optional)
 *  - minAccuracy    accuracy upper bound in metres (default 100)
 * Downsamples via modulo-on-id so the payload stays under MAX_POINTS.
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

  const [{ n }] = await q<{ n: string }>(
    `SELECT count(*)::int8 AS n FROM points WHERE ${whereSql}`,
    params,
  );
  const total = Number(n);
  const step = Math.max(1, Math.ceil(total / MAX_POINTS));

  const rows = await q<Row>(
    `SELECT ST_X(geom::geometry) AS lon, ST_Y(geom::geometry) AS lat, id,
            extract(epoch FROM ts)::int8 AS t
     FROM points
     WHERE ${whereSql} AND (id % $${params.length + 1}) = 0`,
    [...params, step],
  );

  const features = rows.map((r) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [r.lon, r.lat] },
    properties: { id: Number(r.id), t: Number(r.t) },
  }));

  return NextResponse.json(
    { type: "FeatureCollection", features, meta: { total, returned: features.length, step } },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function numParam(raw: string | null, fallback: number | null): number | null {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  // Epoch seconds between 1970 and 2100; anything else is ignored.
  return Number.isFinite(n) && n >= 0 && n < 4_102_444_800 ? n : fallback;
}
