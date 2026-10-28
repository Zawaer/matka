import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/transit/stops?q=mat — stop names for the editor's transfer stop: {stops: string[]}, at most 10. */
export async function GET(req: Request) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  const term = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 40);
  if (term.length < 2) return NextResponse.json({ stops: [] });
  const like = `${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await q<{ name: string }>(
    `SELECT name FROM transit_stops WHERE name ILIKE $1 GROUP BY name
     ORDER BY count(*) DESC, length(name), name LIMIT 10`,
    [like],
  );
  return NextResponse.json({ stops: rows.map((r) => r.name) }, { headers: { "cache-control": "private, max-age=300" } });
}
