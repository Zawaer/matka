import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { searchPlaces } from "@/lib/placeSearch";
import { MAX_QUERY_LENGTH } from "@/lib/search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/search?q=… — places, cities and countries matching q (docs/API.md). */
export async function GET(req: Request) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  const query = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  try {
    return NextResponse.json(await searchPlaces(user.id, user.timezone, query), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    console.error("[/api/search] query failed:", err);
    return NextResponse.json({ query, places: [], areas: [], error: "Search failed" }, { status: 500 });
  }
}
