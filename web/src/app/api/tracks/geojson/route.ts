import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = {
  id: string;
  geom: string; // ST_AsGeoJSON output
  mode: string;
  distance: number;
  duration: number;
};

/**
 * GET /api/tracks/geojson
 * GeoJSON FeatureCollection of trip lines, each feature carrying
 * { id, mode, distance (m), duration (s) }. Optional from/to (epoch seconds).
 */
export async function GET(req: Request) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  const url = new URL(req.url);
  const from = numParam(url.searchParams.get("from"));
  const to = numParam(url.searchParams.get("to"));

  const where: string[] = ["user_id = $1", "path IS NOT NULL"];
  const params: unknown[] = [user.id];
  if (from != null) {
    params.push(from);
    where.push(`ended_at >= to_timestamp($${params.length})`);
  }
  if (to != null) {
    params.push(to);
    where.push(`started_at <= to_timestamp($${params.length})`);
  }

  // Simplify to ~5 m so years of trips stay a reasonable payload.
  const rows = await q<Row>(
    `SELECT id, ST_AsGeoJSON(ST_Simplify(path::geometry, 0.00005), 6) AS geom, mode,
            distance_m AS distance, extract(epoch FROM ended_at - started_at)::int AS duration
     FROM trips
     WHERE ${where.join(" AND ")}
     ORDER BY started_at`,
    params,
  );

  const features = rows.map((r) => ({
    type: "Feature" as const,
    geometry: JSON.parse(r.geom),
    properties: {
      id: Number(r.id),
      mode: r.mode,
      distance: Math.round(r.distance),
      duration: r.duration,
    },
  }));

  return NextResponse.json(
    { type: "FeatureCollection", features },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function numParam(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
