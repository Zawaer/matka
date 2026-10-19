import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { getCovers } from "@/lib/covers";
import { tripCoverSpec } from "@/lib/insights/coverSpecs";
import { getAwayTrips, tripJson } from "@/lib/insights/load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/insights/trips
 * Trips away from home (runs of nights spent > 30 km from home), newest first,
 * each with its Immich cover photo id (`cover`, null without one).
 */
export async function GET(req: Request) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  try {
    const { home, trips } = await getAwayTrips(user);
    const covers = await getCovers(
      user.id,
      trips.map((t) => tripCoverSpec(t, user.timezone)),
    );
    return NextResponse.json(
      { home, trips: trips.map((t) => ({ ...tripJson(t), cover: covers.get(`trip:${t.id}`)?.assetId ?? null })) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[/api/insights/trips] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
