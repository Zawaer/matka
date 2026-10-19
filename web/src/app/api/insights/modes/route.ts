import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { getMonthModes } from "@/lib/insights/load";
import { isMonth } from "@/lib/insights/time";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/insights/modes[?month=YYYY-MM]
 * Distance and time per travel mode for a month in the account's time zone
 * (default: the latest month with trips), with six months of history per mode.
 */
export async function GET(req: Request) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  const month = new URL(req.url).searchParams.get("month");
  if (month && !isMonth(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getMonthModes(user, month ?? undefined), {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[/api/insights/modes] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
