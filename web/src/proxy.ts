import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/appUrl";
import { SESSION_COOKIE, authDisabled, isLiveSession } from "@/lib/session";

// Outer gate: everything requires a live browser session except the device
// endpoints (which check their own bearer token), the health probe, and the
// login flow. Pages and route handlers still resolve the user themselves.
const PUBLIC = [/^\/api\/ingest$/, /^\/api\/health$/, /^\/auth\//];

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (authDisabled() || PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  if (await isLiveSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(
    `${appUrl()}/auth/login?next=${encodeURIComponent(pathname + search)}`,
  );
}

export const config = {
  // Static assets carry nothing private.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
