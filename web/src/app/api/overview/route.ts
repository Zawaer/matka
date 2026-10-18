import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { getOverview } from "@/lib/overview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// JSON overview for the phone app (same data as the web Overview page).
export async function GET(req: Request) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  try {
    return NextResponse.json(await getOverview(user.id, user.timezone), {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[/api/overview] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
