// Trip lines as GeoJSON: GET /api/tracks/geojson, and /embed/day's first day.

import type { User } from "@/lib/auth";
import { q } from "@/lib/db";
import { displayModeJoin, displayModeSql } from "@/lib/transit/run";

type Row = {
  id: string;
  geom: string; // ST_AsGeoJSON output
  mode: string;
  distance: number;
  duration: number;
};

/**
 * A FeatureCollection of the user's trip lines overlapping [from, to] (epoch
 * seconds, either optional), each feature carrying { id, mode, distance (m),
 * duration (s) }.
 */
export async function tracksGeoJson(user: Pick<User, "id" | "transitLines">, from: number | null, to: number | null) {
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
    // the kind covering most of it (lib/transit/run.ts displayMode).
    `SELECT t.id, ST_AsGeoJSON(ST_Simplify(t.path::geometry, 0.00005), 5) AS geom,
          ${displayModeSql("$2")} AS mode,
          t.distance_m AS distance, extract(epoch FROM t.ended_at - t.started_at)::int AS duration
   FROM trips t
   ${displayModeJoin("$2")}
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

  return { type: "FeatureCollection" as const, features };
}
