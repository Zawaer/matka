import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { getSavedPlacesMonth } from "@/lib/insights/load";
import { isMonth, localMonth } from "@/lib/insights/time";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/insights/saved[?month=YYYY-MM]
 * Time and nights per saved place in a month in the account's time zone
 * (default: the current month), for the Insights "Saved places" card.
 */
export async function GET(req: Request) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  const raw = new URL(req.url).searchParams.get("month");
  if (raw && !isMonth(raw)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }
  const month = raw ?? localMonth(Date.now(), user.timezone);
  try {
    return NextResponse.json(
      { month, ...(await getSavedPlacesMonth(user, month)) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[/api/insights/saved] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
