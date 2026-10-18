import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { immichFor } from "@/lib/immich";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface PlacePhoto {
  id: string;
  thumbUrl: string;
  /** ISO timestamp the photo was taken, when known. */
  takenAt: string | null;
}

type VisitWindow = { started_at: Date; ended_at: Date };
type PlaceRow = { lat: number | null; lon: number | null };

// Keep the fan-out bounded: query Immich for at most this many visit windows.
const MAX_WINDOWS = 40;
const MAX_PHOTOS = 180;
const CONCURRENCY = 6;
const PER_REQUEST_TIMEOUT_MS = 10000;
// Drop GPS-tagged photos further than this from the place (metres).
const GPS_RADIUS_M = 350;

function haversine(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type ImmichAsset = {
  id: string;
  type?: string;
  fileCreatedAt?: string;
  localDateTime?: string;
  exifInfo?: { latitude?: number | null; longitude?: number | null } | null;
};

async function searchWindow(
  base: string,
  key: string,
  w: VisitWindow,
): Promise<ImmichAsset[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/search/metadata`, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        takenAfter: new Date(w.started_at).toISOString(),
        takenBefore: new Date(w.ended_at).toISOString(),
        type: "IMAGE",
        withExif: true,
        size: 100,
        order: "desc",
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      assets?: { items?: ImmichAsset[] };
    };
    return data.assets?.items ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })(),
  );
  await Promise.all(workers);
  return out;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const immich = await immichFor(user.id);
  if (!immich) return NextResponse.json({ configured: false, photos: [] });
  const { base, key } = immich;

  const { id } = await ctx.params;
  const placeId = Number(id);
  if (!Number.isFinite(placeId)) {
    return NextResponse.json(
      { configured: true, photos: [], error: "Bad place id" },
      { status: 400 },
    );
  }

  try {
    const [place] = await q<PlaceRow>(
      `SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon
       FROM places WHERE id = $1 AND user_id = $2`,
      [placeId, user.id],
    );
    if (!place) {
      return NextResponse.json(
        { configured: true, photos: [], error: "Place not found" },
        { status: 404 },
      );
    }

    const windows = await q<VisitWindow>(
      `SELECT started_at, ended_at FROM visits
       WHERE place_id = $1 AND user_id = $2
       ORDER BY started_at DESC LIMIT $3`,
      [placeId, user.id, MAX_WINDOWS],
    );

    if (windows.length === 0) {
      return NextResponse.json({ configured: true, photos: [] });
    }

    const perWindow = await mapLimit(windows, CONCURRENCY, (w) =>
      searchWindow(base, key, w),
    );

    const lat = place.lat != null ? Number(place.lat) : null;
    const lon = place.lon != null ? Number(place.lon) : null;
    const hasPlaceGps = lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon);

    const seen = new Set<string>();
    const photos: PlacePhoto[] = [];
    for (const items of perWindow) {
      for (const a of items) {
        if (!a?.id || seen.has(a.id)) continue;

        // GPS filter: if both the place and the photo have coordinates and
        // they're far apart, skip it. Photos without GPS pass on time alone.
        if (hasPlaceGps && a.exifInfo?.latitude != null && a.exifInfo?.longitude != null) {
          const d = haversine(
            lat as number,
            lon as number,
            Number(a.exifInfo.latitude),
            Number(a.exifInfo.longitude),
          );
          if (d > GPS_RADIUS_M) continue;
        }

        seen.add(a.id);
        photos.push({
          id: a.id,
          thumbUrl: `/api/immich/asset/${a.id}?size=thumbnail`,
          takenAt: a.localDateTime ?? a.fileCreatedAt ?? null,
        });
      }
    }

    photos.sort((x, y) => {
      const tx = x.takenAt ? Date.parse(x.takenAt) : 0;
      const ty = y.takenAt ? Date.parse(y.takenAt) : 0;
      return ty - tx;
    });

    return NextResponse.json({ configured: true, photos: photos.slice(0, MAX_PHOTOS) });
  } catch (err) {
    console.error("[places/photos] failed:", err);
    return NextResponse.json(
      { configured: true, photos: [], error: "Failed to load photos" },
      { status: 500 },
    );
  }
}
