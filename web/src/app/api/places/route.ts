import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { getPlaces } from "@/lib/places";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  try {
    return NextResponse.json({ places: await getPlaces(user.id) });
  } catch (err) {
    console.error("[/api/places] query failed:", err);
    return NextResponse.json({ places: [], error: "Failed to load places" }, { status: 500 });
  }
}
