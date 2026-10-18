import { NextResponse } from "next/server";
import { q, USER_ID } from "@/lib/db";

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
 *  - from, to       epoch seconds (optional) — bound points.timestamp
 *  - minAccuracy    accuracy upper bound (default 100) → keeps accuracy < value
 * Always excludes anomaly = true. Downsamples via modulo-on-id so the payload
 * stays under MAX_POINTS.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  const minAccuracy = numParam(url.searchParams.get("minAccuracy"), 100);
  const from = numParam(url.searchParams.get("from"), null);
  const to = numParam(url.searchParams.get("to"), null);

  // Build a shared WHERE clause + params for both the count and the fetch.
  const where: string[] = [
    "user_id = $1",
    // Exclude only points flagged as anomalies; anomaly is NULL for most rows.
    "anomaly IS NOT TRUE",
    "lonlat IS NOT NULL",
    `accuracy < $2`,
  ];
  const params: unknown[] = [USER_ID, minAccuracy];

  if (from != null) {
    params.push(from);
    where.push(`timestamp >= $${params.length}`);
  }
  if (to != null) {
    params.push(to);
    where.push(`timestamp <= $${params.length}`);
  }
  const whereSql = where.join(" AND ");

  // How many rows match? Decide the modulo sampling step from that.
  const [{ n }] = await q<{ n: string }>(
    `SELECT count(*)::int8 AS n FROM points WHERE ${whereSql}`,
    params,
  );
  const total = Number(n);
  const step = Math.max(1, Math.ceil(total / MAX_POINTS));

  const rows = await q<Row>(
    `SELECT
        ST_X(lonlat::geometry) AS lon,
        ST_Y(lonlat::geometry) AS lat,
        id,
        timestamp AS t
     FROM points
     WHERE ${whereSql} AND (id % $${params.length + 1}) = 0`,
    [...params, step],
  );

  const features = rows.map((r) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [r.lon, r.lat] },
    properties: { id: Number(r.id), t: r.t },
  }));

  return NextResponse.json(
    {
      type: "FeatureCollection",
      features,
      // Handy for the client (and for debugging the sampling).
      meta: { total, returned: features.length, step },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function numParam(raw: string | null, fallback: number | null): number | null {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
