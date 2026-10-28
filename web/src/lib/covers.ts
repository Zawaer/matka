// Cover photos from the user's Immich library for trips and cities.
//
// A cover is picked from the photos taken inside a set of time windows
// (optionally each tied to a location): Immich's metadata search is queried per
// window, then rankCovers() orders the candidates. The pick is cached in the
// `covers` table (migration 010) per user and key, together with a hash of the
// inputs: a changed window recomputes at once, an unchanged one after a day.
// "Nothing found" is cached too.
//
// Never throws: with Immich unconfigured, slow or down, callers simply get no
// cover and render their plain design.

import { createHash } from "node:crypto";
import { q } from "./db";
import { type ImmichConfig, immichFor } from "./immich";

export type CoverWindow = {
  /** Epoch ms. */
  start: number;
  end: number;
  /** Where you were: photos with GPS farther than radiusM from here are dropped. */
  lat?: number | null;
  lon?: number | null;
};

export type CoverSpec = {
  /** Cache key, e.g. `trip:2026-05-01` or `city:Finland/Turku`. */
  key: string;
  windows: CoverWindow[];
  /** Metres, for windows with a location. */
  radiusM?: number;
  /** Also keep up to this many more photos (spread over time) for a strip. */
  more?: number;
};

export type Cover = { assetId: string; more: string[] };

/** The subset of Immich's AssetResponseDto used here. */
export type ImmichAsset = {
  id: string;
  type?: string;
  isFavorite?: boolean;
  fileCreatedAt?: string;
  width?: number | null;
  height?: number | null;
  exifInfo?: {
    make?: string | null;
    exifImageWidth?: number | null;
    exifImageHeight?: number | null;
    orientation?: string | number | null;
    dateTimeOriginal?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
};

const DEFAULT_RADIUS_M = 500;
const TTL_MS = 24 * 3_600_000;
/** Immich requests in flight per server process, across all pages. */
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 6000;
/** After a failed computation, leave Immich alone for this long (per user). */
const BACKOFF_MS = 5 * 60_000;
const PAGE_SIZE = 50;
/** Search requests per cover at most. */
const MAX_QUERIES = 6;

// ---------------------------------------------------------------------------
// Ranking (pure)

function metres(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Displayed width/height: EXIF orientations 5–8 are rotated a quarter turn. */
export function displaySize(a: ImmichAsset): { w: number; h: number } | null {
  const e = a.exifInfo;
  let w = Number(e?.exifImageWidth);
  let h = Number(e?.exifImageHeight);
  if (w > 0 && h > 0) {
    const o = Number(e?.orientation);
    if (o >= 5 && o <= 8) [w, h] = [h, w];
    return { w, h };
  }
  w = Number(a.width);
  h = Number(a.height);
  return w > 0 && h > 0 ? { w, h } : null;
}

export type Ranked = {
  id: string;
  time: number | null;
  favourite: boolean;
  /** GPS confirms the photo was taken at the window's location. */
  located: boolean;
  landscape: boolean;
  /** 0 at the middle of its window, 1 at either end. */
  offCentre: number;
};

/** When the photo was taken (epoch ms), or null when it doesn't say. */
export function takenAt(a: ImmichAsset): number | null {
  for (const s of [a.fileCreatedAt, a.exifInfo?.dateTimeOriginal]) {
    const t = s ? Date.parse(s) : NaN;
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/** A photo from a camera: an image with a camera make (not a screenshot, download or edited export). */
export const isCameraPhoto = (a: ImmichAsset): boolean =>
  !!a?.id && (!a.type || a.type === "IMAGE") && !!a.exifInfo?.make?.trim();

/** The photo's GPS position, or null (0,0 is a missing fix). */
export function photoPosition(a: ImmichAsset): { lat: number; lon: number } | null {
  const lat = a.exifInfo?.latitude;
  const lon = a.exifInfo?.longitude;
  return finite(lat) && finite(lon) && !(lat === 0 && lon === 0) ? { lat, lon } : null;
}

export { metres as metresApart };

function evaluate(a: ImmichAsset, windows: CoverWindow[], radiusM: number): Ranked | null {
  if (!a?.id || !isCameraPhoto(a) || !a.exifInfo) return null;
  const time = takenAt(a);
  const lat = a.exifInfo.latitude;
  const lon = a.exifInfo.longitude;
  const hasGps = finite(lat) && finite(lon) && !(lat === 0 && lon === 0);
  const inside = time == null ? windows : windows.filter((w) => time >= w.start && time <= w.end);
  if (inside.length === 0) return null;
  // The photo must fit at least one window it falls in: windows with a
  // location reject photos whose GPS is too far from it.
  let best: { located: boolean; offCentre: number } | null = null;
  for (const w of inside) {
    const hasLoc = finite(w.lat) && finite(w.lon);
    if (hasLoc && hasGps && metres(w.lat as number, w.lon as number, lat, lon) > radiusM) continue;
    const half = (w.end - w.start) / 2;
    const offCentre = time == null || half <= 0 ? 1 : Math.min(1, Math.abs(time - (w.start + half)) / half);
    const cand = { located: hasLoc && hasGps, offCentre };
    if (
      !best ||
      (cand.located && !best.located) ||
      (cand.located === best.located && cand.offCentre < best.offCentre)
    ) {
      best = cand;
    }
  }
  if (!best) return null;
  const size = displaySize(a);
  return {
    id: a.id,
    time,
    favourite: a.isFavorite === true,
    located: best.located,
    landscape: size != null && size.w > size.h * 1.05,
    offCentre: best.offCentre,
  };
}

function compare(a: Ranked, b: Ranked): number {
  return (
    Number(b.favourite) - Number(a.favourite) ||
    Number(b.located) - Number(a.located) ||
    Number(b.landscape) - Number(a.landscape) ||
    a.offCentre - b.offCentre ||
    (a.time ?? Infinity) - (b.time ?? Infinity) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * Candidate photos best first, deterministically. Dropped: non-images, photos
 * without a camera make, photos outside every window, and photos whose GPS is
 * farther than radiusM from the location of the window they were taken in.
 * Order: favourites, then (for windows with a location) GPS-confirmed, then
 * landscape, then nearest the middle of their window, then oldest, then id.
 */
export function rankCovers(assets: ImmichAsset[], windows: CoverWindow[], radiusM = DEFAULT_RADIUS_M): Ranked[] {
  const seen = new Set<string>();
  const out: Ranked[] = [];
  for (const a of assets) {
    if (!a?.id || seen.has(a.id)) continue;
    seen.add(a.id);
    const r = evaluate(a, windows, radiusM);
    if (r) out.push(r);
  }
  return out.sort(compare);
}

/**
 * The cover (best ranked) and up to n more, chosen in rank order but spread
 * out in time (no two within minGapMs, unless that leaves the strip short),
 * returned oldest first.
 */
export function pickCover(ranked: Ranked[], n = 0, minGapMs = 0): { assetId: string; more: string[] } | null {
  if (ranked.length === 0) return null;
  const [cover, ...rest] = ranked;
  const chosen: Ranked[] = [];
  const skipped: Ranked[] = [];
  for (const r of rest) {
    if (chosen.length >= n) break;
    const near = r.time != null && [cover, ...chosen].some((c) => c.time != null && Math.abs(c.time - (r.time as number)) < minGapMs);
    (near ? skipped : chosen).push(r);
  }
  for (const r of skipped) {
    if (chosen.length >= n) break;
    chosen.push(r);
  }
  chosen.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || (a.id < b.id ? -1 : 1));
  return { assetId: cover.id, more: chosen.map((c) => c.id) };
}

// ---------------------------------------------------------------------------
// Immich

let active = 0;
const queue: (() => void)[] = [];

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= CONCURRENCY) await new Promise<void>((r) => queue.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

/** One metadata search; null when the request failed. Shared with lib/dayPhotos.ts. */
export async function search(cfg: ImmichConfig, body: Record<string, unknown>): Promise<ImmichAsset[] | null> {
  return limited(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${cfg.base}/api/search/metadata`, {
        method: "POST",
        headers: { "x-api-key": cfg.key, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ type: "IMAGE", withExif: true, size: PAGE_SIZE, order: "desc", ...body }),
        signal: controller.signal,
        cache: "no-store",
        redirect: "manual",
      });
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        return null;
      }
      const data = (await res.json()) as { assets?: { items?: ImmichAsset[] } };
      return Array.isArray(data.assets?.items) ? data.assets.items : [];
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  });
}

/** Time ranges to search: each window split so a long trip is sampled throughout. */
export function searchRanges(windows: CoverWindow[], max = MAX_QUERIES): { start: number; end: number }[] {
  const ws = windows.filter((w) => w.end > w.start).slice(0, max);
  if (ws.length === 0) return [];
  // A single window also gets a favourites-only search; keep a slot for it.
  const per = ws.length === 1 ? Math.max(1, max - 1) : Math.max(1, Math.floor(max / ws.length));
  const out: { start: number; end: number }[] = [];
  for (const w of ws) {
    const parts = Math.min(per, Math.max(1, Math.ceil((w.end - w.start) / 86_400_000)));
    const step = (w.end - w.start) / parts;
    for (let i = 0; i < parts; i++) out.push({ start: w.start + i * step, end: i === parts - 1 ? w.end : w.start + (i + 1) * step });
  }
  return out;
}

async function compute(cfg: ImmichConfig, spec: CoverSpec): Promise<{ cover: Cover | null } | null> {
  const iso = (t: number) => new Date(t).toISOString();
  const ranges = searchRanges(spec.windows);
  if (ranges.length === 0) return { cover: null };
  const requests = ranges.map((r) => search(cfg, { takenAfter: iso(r.start), takenBefore: iso(r.end) }));
  if (spec.windows.length === 1) {
    const w = spec.windows[0];
    requests.push(search(cfg, { takenAfter: iso(w.start), takenBefore: iso(w.end), isFavorite: true }));
  }
  const results = await Promise.all(requests);
  if (results.every((r) => r == null)) return null; // Immich unreachable: don't cache
  const ranked = rankCovers(
    results.flatMap((r) => r ?? []),
    spec.windows,
    spec.radiusM ?? DEFAULT_RADIUS_M,
  );
  const n = spec.more ?? 0;
  const span = spec.windows.reduce((s, w) => s + Math.max(0, w.end - w.start), 0);
  const picked = pickCover(ranked, n, n > 0 ? span / (n * 3) : 0);
  return { cover: picked };
}

// ---------------------------------------------------------------------------
// Cache

/** Hash of everything the pick depends on. */
export function inputHash(base: string, spec: CoverSpec): string {
  const r = (n: number | null | undefined, d: number) => (finite(n) ? Number(n.toFixed(d)) : null);
  const payload = JSON.stringify([
    base,
    spec.radiusM ?? DEFAULT_RADIUS_M,
    spec.more ?? 0,
    spec.windows.map((w) => [Math.round(w.start / 60_000), Math.round(w.end / 60_000), r(w.lat, 4), r(w.lon, 4)]),
  ]);
  return createHash("sha256").update(payload).digest("base64url").slice(0, 22);
}

type Row = { key: string; input_hash: string; asset_id: string | null; more: string[] | null; computed_at: Date };

const inflight = new Map<string, Promise<Cover | null | undefined>>();
const backoff = new Map<string, number>();

/** Recompute and store one cover; undefined when Immich didn't answer. */
function refresh(userId: string, cfg: ImmichConfig, spec: CoverSpec, hash: string): Promise<Cover | null | undefined> {
  const id = `${userId}\u0000${spec.key}`;
  const running = inflight.get(id);
  if (running) return running;
  const p = (async () => {
    if ((backoff.get(userId) ?? 0) > Date.now()) return undefined;
    const out = await compute(cfg, spec);
    if (!out) {
      backoff.set(userId, Date.now() + BACKOFF_MS);
      return undefined;
    }
    await q(
      `INSERT INTO covers (user_id, key, input_hash, asset_id, more, computed_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id, key) DO UPDATE
         SET input_hash = EXCLUDED.input_hash, asset_id = EXCLUDED.asset_id,
             more = EXCLUDED.more, computed_at = EXCLUDED.computed_at`,
      [userId, spec.key, hash, out.cover?.assetId ?? null, out.cover?.more ?? []],
    );
    return out.cover;
  })()
    .catch((err) => {
      console.error("[covers] refresh failed:", err);
      return undefined;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

const asCover = (r: Row): Cover | null => (r.asset_id ? { assetId: r.asset_id, more: r.more ?? [] } : null);

/**
 * Covers for the given specs, by key (keys without a cover are absent).
 * Fresh cached picks are returned as they are; stale ones are returned too and
 * refreshed in the background; missing or changed ones are computed, waiting
 * at most budgetMs for them (the rest finish in the background and show on
 * the next load).
 */
export async function getCovers(
  userId: string,
  specs: CoverSpec[],
  { budgetMs = 2500 }: { budgetMs?: number } = {},
): Promise<Map<string, Cover>> {
  const out = new Map<string, Cover>();
  if (specs.length === 0) return out;
  try {
    const cfg = await immichFor(userId);
    if (!cfg) return out;
    const rows = await q<Row>(
      `SELECT key, input_hash, asset_id, more, computed_at FROM covers WHERE user_id = $1 AND key = ANY($2)`,
      [userId, specs.map((s) => s.key)],
    );
    const cached = new Map(rows.map((r) => [r.key, r]));
    const waits: Promise<void>[] = [];
    for (const spec of specs) {
      const hash = inputHash(cfg.base, spec);
      const row = cached.get(spec.key);
      if (row && row.input_hash === hash) {
        const c = asCover(row);
        if (c) out.set(spec.key, c);
        if (Date.now() - row.computed_at.getTime() > TTL_MS) void refresh(userId, cfg, spec, hash);
        continue;
      }
      waits.push(
        refresh(userId, cfg, spec, hash).then((c) => {
          if (c) out.set(spec.key, c);
        }),
      );
    }
    if (waits.length) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.all(waits),
        new Promise<void>((r) => {
          timer = setTimeout(r, budgetMs);
        }),
      ]);
      clearTimeout(timer);
    }
    // Copy, so late background results don't change what the page rendered.
    return new Map(out);
  } catch (err) {
    console.error("[covers] failed:", err);
    return new Map(out);
  }
}

/** The authenticated proxy URL of an Immich asset. */
export const assetUrl = (id: string, size: "thumbnail" | "preview" = "preview") =>
  `/api/immich/asset/${encodeURIComponent(id)}?size=${size}`;
