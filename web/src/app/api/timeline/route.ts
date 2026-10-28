import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { isDate, loadTimeline } from "@/lib/timeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/timeline?date=YYYY-MM-DD
 * Visits and trips overlapping that day in the user's timezone (default: the
 * latest day with data), plus every day that has data for navigation.
 */
export async function GET(req: Request) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  const dateParam = new URL(req.url).searchParams.get("date");
  if (dateParam && !isDate(dateParam)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  return NextResponse.json(await loadTimeline(user, dateParam));
}
