import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { getBatteryInsight } from "@/lib/insights/load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/insights/battery[?days=60]
 * Per local day: unplugged hours, % used, average drain %/h, the overnight
 * figure, and projected hours on a full charge; plus recorder annotations
 * (e.g. Smart Tracking) with the 7 days before vs after each.
 */
export async function GET(req: Request) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  const raw = new URL(req.url).searchParams.get("days");
  const days = raw == null ? 60 : Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 366) {
    return NextResponse.json({ error: "days must be 1–366" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getBatteryInsight(user, days), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[/api/insights/battery] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
