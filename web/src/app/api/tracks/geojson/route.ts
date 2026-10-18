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

  const where: string[] = ["t.user_id = $1", "t.path IS NOT NULL"];
  const params: unknown[] = [user.id, user.transitLines];
  if (from != null) {
    params.push(from);
    where.push(`t.ended_at >= to_timestamp($${params.length})`);
  }
  if (to != null) {
    params.push(to);
    where.push(`t.started_at <= to_timestamp($${params.length})`);
  }

  // Simplify to ~5 m so years of trips stay a reasonable payload.
  const rows = await q<Row>(
    // With line matching on, a trip mostly covered by transit legs is drawn as
    // that kind (same rule as lib/transit/run.ts displayMode).
    `SELECT t.id, ST_AsGeoJSON(ST_Simplify(t.path::geometry, 0.00005), 6) AS geom,
            CASE WHEN $2 AND l.covered >= 0.5 * t.distance_m THEN l.kind ELSE t.mode END AS mode,
            t.distance_m AS distance, extract(epoch FROM t.ended_at - t.started_at)::int AS duration
     FROM trips t
     LEFT JOIN LATERAL (
       SELECT sum(distance_m) AS covered, (array_agg(kind ORDER BY distance_m DESC))[1] AS kind
       FROM trip_legs WHERE trip_id = t.id
     ) l ON true
     WHERE ${where.join(" AND ")}
     ORDER BY t.started_at`,
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
  // Epoch seconds between 1970 and 2100; anything else is ignored.
  return Number.isFinite(n) && n >= 0 && n < 4_102_444_800 ? n : null;
}
