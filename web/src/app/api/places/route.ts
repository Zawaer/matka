import { NextResponse } from "next/server";
import { getPlaces } from "@/lib/places";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const places = await getPlaces();
    return NextResponse.json({ places });
  } catch (err) {
    console.error("[/api/places] query failed:", err);
    return NextResponse.json(
      { places: [], error: "Failed to load places" },
      { status: 500 },
    );
  }
}
