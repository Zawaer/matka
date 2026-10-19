import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { getCity, getWorld } from "@/lib/insights/load";
import { isWorldSort } from "@/lib/insights/world";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/insights/world[?sort=visits|places|time|recent|name]
 *   → { countries, cities, unplaced }
 * GET /api/insights/world?city=Stockholm&country=Sweden
 *   → { city, country, places: [...] } (the Places list shape)
 */
export async function GET(req: Request) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  const sp = new URL(req.url).searchParams;
  const sort = sp.get("sort");
  if (sort && !isWorldSort(sort)) {
    return NextResponse.json({ error: "sort must be visits, places, time, recent or name" }, { status: 400 });
  }
  try {
    const city = sp.get("city");
    if (city) {
      const country = sp.get("country");
      return NextResponse.json(
        { city, country, places: await getCity(user, city, country) },
        { headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(await getWorld(user, isWorldSort(sort) ? sort : "visits"), {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[/api/insights/world] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
