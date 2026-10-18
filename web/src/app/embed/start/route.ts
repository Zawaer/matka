import { NextResponse } from "next/server";
import { appUrl } from "@/lib/appUrl";
import { EMBED_COOKIE, EMBED_MAX_AGE, signEmbed, verifyTicket } from "@/lib/embed";
import { cookieOptions } from "@/lib/session";

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
  // The app may append &theme=light|dark to match its own appearance.
  const theme = params.get("theme");
  const query = theme === "light" || theme === "dark" ? `?theme=${theme}` : "";
  const res = NextResponse.redirect(`${appUrl()}/embed/map${query}`, 303);
  res.cookies.set(EMBED_COOKIE, await signEmbed(claims), cookieOptions(EMBED_MAX_AGE));
  res.headers.set("referrer-policy", "no-referrer");
  return res;
}
