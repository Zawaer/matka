import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/appUrl";
import { EMBED_COOKIE } from "@/lib/embed";
import { SESSION_COOKIE, authDisabled, isLiveSession } from "@/lib/session";

// Outer gate: everything requires a live browser session except the device
// endpoints (which check their own bearer token), the health probe, and the
// login flow. Pages and route handlers still resolve the user themselves.
const PUBLIC = [
  /^\/api\/ingest$/,
  /^\/api\/health$/,
  /^\/api\/device\//,
  /^\/auth\//,
  /^\/embed\/start$/,
];
// Read-only data the phone app's viewer may fetch with its device token or
// the map embed cookie; those routes authenticate with readUser().
const DEVICE_READABLE = [
  /^\/api\/(overview|timeline|places|points|tracks\/geojson|day-summary)$/,
  /^\/api\/insights\/(modes|world|trips)$/,
  /^\/api\/insights\/trips\/\d{4}-\d{2}-\d{2}$/,
  /^\/api\/places\/\d+\/photos$/,
  /^\/api\/immich\/asset\/[0-9a-fA-F-]+$/,
  /^\/embed\/map$/,
];

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (authDisabled() || PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  if (await isLiveSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (
    req.method === "GET" &&
    DEVICE_READABLE.some((re) => re.test(pathname)) &&
    (req.headers.get("authorization")?.startsWith("Bearer mtk_") || req.cookies.has(EMBED_COOKIE))
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(
    `${appUrl()}/auth/login?next=${encodeURIComponent(pathname + search)}`,
  );
}

export const config = {
  // Static assets carry nothing private (incl. MapLibre's worker, which the
  // app's map WebView loads with only its embed cookie).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|maplibre-gl-worker\\.mjs$|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
