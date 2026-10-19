import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { getDaySummary } from "@/lib/insights/load";
import { isDate } from "@/lib/insights/time";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/day-summary?date=YYYY-MM-DD
 * Distance and time per travel mode on one local day (trips crossing midnight
 * are split by time).
 */
export async function GET(req: Request) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  const date = new URL(req.url).searchParams.get("date");
  if (!date || !isDate(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getDaySummary(user, date), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[/api/day-summary] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
