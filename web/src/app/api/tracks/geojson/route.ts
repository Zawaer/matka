import { NextResponse } from "next/server";
import { q, USER_ID } from "@/lib/db";
import { modeFromInt } from "@/lib/modes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = {
  id: string;
  geom: string; // ST_AsGeoJSON output
  dominant_mode: number | null;
  distance: string | null; // int8 → string
  duration: number | null; // int4 (seconds)
};

/**
 * GET /api/tracks/geojson
 * GeoJSON FeatureCollection of track lines (tracks.original_path), each feature
 * carrying { id, mode, distance, duration }.
 *
 * Optional from/to (epoch seconds) filter on the track's start/end timestamps.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = numParam(url.searchParams.get("from"));
  const to = numParam(url.searchParams.get("to"));

  const where: string[] = ["user_id = $1", "original_path IS NOT NULL"];
  const params: unknown[] = [USER_ID];

  if (from != null) {
    params.push(from);
    where.push(`end_at >= to_timestamp($${params.length})`);
  }
  if (to != null) {
    params.push(to);
    where.push(`start_at <= to_timestamp($${params.length})`);
  }

  const rows = await q<Row>(
    `SELECT
        id,
        ST_AsGeoJSON(original_path) AS geom,
        dominant_mode,
        distance,
        duration
     FROM tracks
     WHERE ${where.join(" AND ")}
     ORDER BY start_at`,
    params,
  );

  const features = rows
    .map((r) => {
      let geometry: unknown;
      try {
        geometry = JSON.parse(r.geom);
      } catch {
        return null;
      }
      return {
        type: "Feature" as const,
        geometry,
        properties: {
          id: Number(r.id),
          mode: modeFromInt(r.dominant_mode),
          distance: r.distance == null ? null : Number(r.distance),
          duration: r.duration,
        },
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

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
