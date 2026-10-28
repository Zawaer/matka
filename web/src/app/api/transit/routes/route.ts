import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/transit/routes?q=159 — public transport lines for the trip editor:
 * {routes: [{line, kind, name}]}, exact matches first, at most 20.
 */
export async function GET(req: Request) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  const term = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 40);
  if (!term) return NextResponse.json({ routes: [] });
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const routes = await q<{ line: string; kind: string; name: string | null }>(
    `SELECT short_name AS line, kind, min(long_name) AS name
     FROM transit_routes
     WHERE short_name ILIKE $1 OR long_name ILIKE $1
     GROUP BY short_name, kind
     ORDER BY lower(short_name) = lower($2) DESC, short_name ILIKE $2 || '%' DESC, length(short_name), short_name
     LIMIT 20`,
    [like, term],
  );
  return NextResponse.json({ routes }, { headers: { "cache-control": "private, max-age=300" } });
}
