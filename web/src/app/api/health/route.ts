import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Unauthenticated liveness/readiness probe. Must not leak anything but ok/not ok.
export async function GET() {
  try {
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
