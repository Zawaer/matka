import { NextResponse } from "next/server";
import { appUrl } from "@/lib/appUrl";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST only, so a cross-site link or <img> can't sign the user out.
export async function POST() {
  const res = NextResponse.redirect(`${appUrl()}/`, 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
