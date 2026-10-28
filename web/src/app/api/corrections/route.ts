import { NextResponse } from "next/server";
import { deviceOrSessionUser } from "@/lib/auth";
import { parseCorrection } from "@/lib/corrections";
import { correctTrip } from "@/lib/transit/correct";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/corrections {startedAt, endedAt, mode, legs?: [{kind, line, transferStop?}]}
 * "Fix this trip": the trip in that time range is shown as `mode` with these
 * rides from now on (it replaces an earlier fix of the same trip). Answers the
 * stored correction {id, startedAt, endedAt, mode, legs}. Browser session or
 * device token.
 */
export async function POST(req: Request) {
  const user = await deviceOrSessionUser(req);
  if (user instanceof NextResponse) return user;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const input = parseCorrection(body);
  if ("error" in input) return NextResponse.json(input, { status: 400 });
  try {
    return NextResponse.json({ correction: await correctTrip(user, input) });
  } catch (err) {
    console.error("[/api/corrections] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
