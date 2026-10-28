import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { getQualityInsight } from "@/lib/insights/load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/insights/quality[?days=30]
 * Recording quality of the phone app's fixes per local day, grouped by
 * recording-preset period (lib/insights/quality.ts), the days before vs after
 * the latest preset change, and Matka's estimated battery use per day and
 * preset with the phone's own battery measurements (lib/insights/matkaPower.ts).
 */
export async function GET(req: Request) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  const raw = new URL(req.url).searchParams.get("days");
  const days = raw == null ? 30 : Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 120) {
    return NextResponse.json({ error: "days must be 1–120" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getQualityInsight(user, days), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[/api/insights/quality] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
