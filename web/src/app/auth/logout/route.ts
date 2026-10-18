import { NextResponse } from "next/server";
import { appUrl } from "@/lib/appUrl";
import { endSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST only, so a cross-site link or <img> can't sign the user out.
export async function POST() {
  await endSession();
  return NextResponse.redirect(`${appUrl()}/`, 303);
}
