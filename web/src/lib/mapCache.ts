import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { q } from "./db";

// The map's heatmap and route layers are a few MB of GeoJSON computed over
// every point and trip, which takes seconds on a small server. They only
// change when new points are processed or trips get their transit lines, so
// both endpoints are keyed on that: the browser revalidates with an ETag
// (304, nothing sent) and the server keeps the last few bodies in memory.

const MAX_ENTRIES = 8;
const cache = new Map<string, { etag: string; body: string }>();

/** A tag that changes whenever the user's map data could have changed. */
async function dataTag(userId: string, req: Request, extra: string): Promise<string> {
  const [r] = await q<{ v: string }>(
    `SELECT concat_ws('|', ps.dirty_from, ps.processed_at,
              (SELECT count(*) FROM trips WHERE user_id = $1 AND transit_checked IS NOT NULL)) AS v
     FROM (SELECT 1) one LEFT JOIN processing_state ps ON ps.user_id = $1`,
    [userId],
  );
  const url = new URL(req.url);
  return `"${createHash("sha256")
    .update([userId, url.pathname, url.search, extra, r?.v ?? ""].join("\n"))
    .digest("base64url")
    .slice(0, 22)}"`;
}

/** Serves `build()`'s JSON, or a 304 / cached copy while the data is unchanged. */
export async function cachedJson(
  req: Request,
  userId: string,
  extra: string,
  build: () => Promise<unknown>,
): Promise<NextResponse> {
  const etag = await dataTag(userId, req, extra);
  const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });

  const key = `${userId} ${new URL(req.url).pathname}`;
  let hit = cache.get(key);
  if (hit?.etag !== etag) {
    hit = { etag, body: JSON.stringify(await build()) };
    cache.delete(key);
    cache.set(key, hit);
    while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  }
  return new NextResponse(hit.body, { headers: { ...headers, "Content-Type": "application/json" } });
}
