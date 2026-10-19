import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { getAwayTrips, tripJson } from "@/lib/insights/load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/insights/trips
 * Trips away from home (runs of nights spent > 30 km from home), newest first.
 */
export async function GET(req: Request) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  try {
    const { home, trips } = await getAwayTrips(user);
    return NextResponse.json(
      { home, trips: trips.map((t) => tripJson(t)) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[/api/insights/trips] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
