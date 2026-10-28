import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { cachedJson } from "@/lib/mapCache";
import { tracksGeoJson } from "@/lib/tracks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  return cachedJson(req, user.id, String(user.transitLines), () => tracksGeoJson(user, from, to));
}
function numParam(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  // Epoch seconds between 1970 and 2100; anything else is ignored.
  return Number.isFinite(n) && n >= 0 && n < 4_102_444_800 ? n : null;
}
