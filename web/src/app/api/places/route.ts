import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { getPlaces } from "@/lib/places";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  try {
    return NextResponse.json({ places: await getPlaces(user.id) });
  } catch (err) {
    console.error("[/api/places] query failed:", err);
    return NextResponse.json({ places: [], error: "Failed to load places" }, { status: 500 });
  }
}
