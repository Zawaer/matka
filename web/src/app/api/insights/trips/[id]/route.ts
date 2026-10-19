import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { getAwayTrips, tripJson } from "@/lib/insights/load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/insights/trips/:id
 * One trip (id = its first day, YYYY-MM-DD) with a summary per day.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  try {
    const trip = (await getAwayTrips(user)).trips.find((t) => t.id === id);
    if (!trip) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ trip: tripJson(trip, true) }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[/api/insights/trips/:id] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
