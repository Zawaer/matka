import { NextResponse } from "next/server";
import { appUrl } from "@/lib/appUrl";
import { EMBED_COOKIE, EMBED_MAX_AGE, signEmbed, verifyTicket } from "@/lib/embed";
import { embedCookieOptions } from "@/lib/frameAncestors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const claims = await verifyTicket(params.get("ticket") ?? undefined);
  if (!claims) {
    return new NextResponse("This map link has expired. Go back and open the map again.\n", {
      status: 401,
      headers: { "content-type": "text/plain" },
    });
  }
  // Redirect so the ticket doesn't stay in the WebView's URL/history.
  // The app may append &theme=light|dark to match its own appearance, and
  // &to=day[&date=YYYY-MM-DD] for the Timeline's day map instead of the map.
  const query = new URLSearchParams();
  const theme = params.get("theme");
  if (theme === "light" || theme === "dark") query.set("theme", theme);
  const to = params.get("to") === "day" ? "day" : "map";
  const date = params.get("date");
  if (to === "day" && date && /^\d{4}-\d{2}-\d{2}$/.test(date)) query.set("date", date);
  const qs = query.size ? `?${query}` : "";
  const res = NextResponse.redirect(`${appUrl()}/embed/${to}${qs}`, 303);
  res.cookies.set(EMBED_COOKIE, await signEmbed(claims), embedCookieOptions(EMBED_MAX_AGE));
  res.headers.set("referrer-policy", "no-referrer");
  return res;
}
