import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { immichFor } from "@/lib/immich";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Proxies an Immich asset thumbnail/preview so the API key stays server-side.
// Client requests /api/immich/asset/<id>?size=thumbnail|preview.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await readUser(req);
  if (user instanceof NextResponse) return user;
  const immich = await immichFor(user.id);
  if (!immich) {
    return NextResponse.json({ error: "Immich not configured" }, { status: 404 });
  }
  const { base, key } = immich;

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Bad asset id" }, { status: 400 });
  }

  const sizeParam = new URL(req.url).searchParams.get("size");
  const size = sizeParam === "preview" ? "preview" : "thumbnail";
  const target = `${base}/api/assets/${id}/thumbnail?size=${size}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const upstream = await fetch(target, {
      headers: { "x-api-key": key, accept: "application/octet-stream" },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: "Upstream error" },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    const contentType =
      upstream.headers.get("content-type") ?? "image/jpeg";
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "content-type": contentType,
        // These thumbnails are immutable per asset id/size.
        "cache-control": "private, max-age=86400",
      },
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    console.error("[immich/asset] proxy failed:", err);
    return NextResponse.json(
      { error: aborted ? "Upstream timeout" : "Proxy failed" },
      { status: 504 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
