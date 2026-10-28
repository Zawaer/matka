// Photos on the timeline: for one local day, the user's Immich photos taken
// during each visit and trip, and the GPS-tagged ones as points for the day
// map. Same rules as covers (lib/covers.ts): camera photos only; a photo with
// GPS farther than VISIT_RADIUS_M from a visit's place isn't that visit's.
//
// One cached answer per user and day (day_photos, migration 020), keyed by a
// hash of the day's items: a changed day recomputes at once, an unchanged one
// after a while (sooner for today). Callers wait at most budgetMs; a slower
// computation finishes in the background and is there on the next request.
// Never throws: without Immich, or when it is slow or down, a day just has
// no photos.

import { createHash } from "node:crypto";
import { type ImmichAsset, isCameraPhoto, metresApart, photoPosition, search, takenAt } from "./covers";
import { q } from "./db";
import { type ImmichConfig, immichFor, normalizeImmichUrl } from "./immich";

/** A visit or trip of the day, by its timeline key ("v-<id>", "m-<id>"); times epoch ms. */
export type PhotoItem = { key: string; start: number; end: number; lat?: number | null; lon?: number | null };

export type ItemPhotos = {
  key: string;
  /** Asset ids, oldest first (at most MAX_IDS). */
  ids: string[];
  /** All of the item's photos. */
  total: number;
};
export type PhotoPoint = { id: string; key: string; lat: number; lon: number };
export type DayPhotos = { items: ItemPhotos[]; points: PhotoPoint[] };

export const VISIT_RADIUS_M = 300;
/** Per item, enough for the viewer; the row shows the first few and "+N". */
export const MAX_IDS = 60;
const MAX_POINTS = 200;
const MAX_QUERIES = 8;
const PAGE_SIZE = 250;
/** Windows closer than this are searched as one. */
const MERGE_GAP_MS = 15 * 60_000;
const TTL_PAST_MS = 24 * 3_600_000;
const TTL_TODAY_MS = 10 * 60_000;
const BACKOFF_MS = 5 * 60_000;

// ---------------------------------------------------------------------------
// Grouping (pure)

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * Sorts photos into the day's items. A photo belongs to the first item (in
 * time order) whose window holds its time and, for an item with a location,
 * whose place is within radiusM of its GPS (photos without GPS go by time).
 * Screenshots, downloads and photos without a time are left out.
 */
export function groupDayPhotos(assets: ImmichAsset[], items: PhotoItem[], radiusM = VISIT_RADIUS_M): DayPhotos {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const found = new Map<string, { id: string; t: number }[]>();
  const points: PhotoPoint[] = [];
  const seen = new Set<string>();
  for (const a of assets) {
    if (!a?.id || seen.has(a.id) || !isCameraPhoto(a)) continue;
    seen.add(a.id);
    const t = takenAt(a);
    if (t == null) continue;
    const pos = photoPosition(a);
    const item = sorted.find(
      (it) =>
        t >= it.start &&
        t <= it.end &&
        !(pos && finite(it.lat) && finite(it.lon) && metresApart(it.lat, it.lon, pos.lat, pos.lon) > radiusM),
    );
    if (!item) continue;
    const list = found.get(item.key) ?? [];
    list.push({ id: a.id, t });
    found.set(item.key, list);
    if (pos) points.push({ id: a.id, key: item.key, ...pos });
  }
  const out: ItemPhotos[] = [];
  for (const it of sorted) {
    const list = found.get(it.key);
    if (!list) continue;
    list.sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
    out.push({ key: it.key, ids: list.slice(0, MAX_IDS).map((x) => x.id), total: list.length });
  }
  return { items: out, points: points.slice(0, MAX_POINTS) };
}

/**
 * The time ranges to search: the items' windows, merged when close, and when
 * that is still more than `max`, the whole span cut into `max` pieces.
 */
export function photoRanges(items: PhotoItem[], max = MAX_QUERIES): { start: number; end: number }[] {
  const ws = items.filter((i) => i.end >= i.start).sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const w of ws) {
    const last = merged.at(-1);
    if (last && w.start - last.end <= MERGE_GAP_MS) last.end = Math.max(last.end, w.end);
    else merged.push({ start: w.start, end: w.end });
  }
  if (merged.length <= max) return merged;
  const start = merged[0].start;
  const end = Math.max(...merged.map((m) => m.end));
  const step = (end - start) / max;
  return Array.from({ length: max }, (_, i) => ({ start: start + i * step, end: i === max - 1 ? end : start + (i + 1) * step }));
}

/** Hash of everything the answer depends on. */
export function dayPhotosHash(base: string, items: PhotoItem[]): string {
  const r = (n: number | null | undefined) => (finite(n) ? Number(n.toFixed(4)) : null);
  const payload = JSON.stringify([
    base,
    VISIT_RADIUS_M,
    items.map((i) => [i.key, Math.round(i.start / 60_000), Math.round(i.end / 60_000), r(i.lat), r(i.lon)]),
  ]);
  return createHash("sha256").update(payload).digest("base64url").slice(0, 22);
}

// ---------------------------------------------------------------------------
// Immich + cache

async function compute(cfg: ImmichConfig, items: PhotoItem[]): Promise<DayPhotos | null> {
  const iso = (t: number) => new Date(t).toISOString();
  const ranges = photoRanges(items);
  if (ranges.length === 0) return { items: [], points: [] };
  const results = await Promise.all(
    ranges.map((r) => search(cfg, { takenAfter: iso(r.start), takenBefore: iso(r.end), size: PAGE_SIZE })),
  );
  if (results.every((r) => r == null)) return null; // Immich unreachable: don't cache
  return groupDayPhotos(results.flatMap((r) => r ?? []), items);
}

const inflight = new Map<string, Promise<DayPhotos | undefined>>();
const backoff = new Map<string, number>();

function refresh(userId: string, date: string, cfg: ImmichConfig, items: PhotoItem[], hash: string): Promise<DayPhotos | undefined> {
  const id = `${userId}\u0000${date}`;
  const running = inflight.get(id);
  if (running) return running;
  const p = (async () => {
    if ((backoff.get(userId) ?? 0) > Date.now()) return undefined;
    const out = await compute(cfg, items);
    if (!out) {
      backoff.set(userId, Date.now() + BACKOFF_MS);
      return undefined;
    }
    await q(
      `INSERT INTO day_photos (user_id, date, input_hash, data, computed_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id, date) DO UPDATE
         SET input_hash = EXCLUDED.input_hash, data = EXCLUDED.data, computed_at = EXCLUDED.computed_at`,
      [userId, date, hash, JSON.stringify(out)],
    );
    return out;
  })()
    .catch((err) => {
      console.error("[dayPhotos] refresh failed:", err);
      return undefined;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

export type DayPhotosAnswer = DayPhotos & {
  /** Immich is set up for this user. */
  configured: boolean;
  /** Still being looked up: ask again in a few seconds. */
  pending: boolean;
  /** Where the user opens photos in Immich's web UI (Settings), or null: use Matka's viewer only. */
  linkBase: string | null;
};

const EMPTY: DayPhotos = { items: [], points: [] };

/** The day's photos by item; see the top of the file. */
export async function getDayPhotos(
  userId: string,
  date: string,
  items: PhotoItem[],
  { budgetMs = 2500, today = false }: { budgetMs?: number; today?: boolean } = {},
): Promise<DayPhotosAnswer> {
  const none = { ...EMPTY, configured: false, pending: false, linkBase: null };
  try {
    const cfg = await immichFor(userId);
    if (!cfg) return none;
    const [u] = await q<{ immich_link_url: string | null }>(`SELECT immich_link_url FROM users WHERE id = $1`, [userId]);
    const linkBase = u?.immich_link_url ? normalizeImmichUrl(u.immich_link_url) : null;
    const base = { configured: true, linkBase };
    if (items.length === 0) return { ...EMPTY, ...base, pending: false };
    const hash = dayPhotosHash(cfg.base, items);
    const [row] = await q<{ input_hash: string; data: DayPhotos; computed_at: Date }>(
      `SELECT input_hash, data, computed_at FROM day_photos WHERE user_id = $1 AND date = $2`,
      [userId, date],
    );
    if (row && row.input_hash === hash) {
      if (Date.now() - row.computed_at.getTime() > (today ? TTL_TODAY_MS : TTL_PAST_MS)) void refresh(userId, date, cfg, items, hash);
      return { ...row.data, ...base, pending: false };
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const out = await Promise.race([
      refresh(userId, date, cfg, items, hash),
      new Promise<"late">((r) => {
        timer = setTimeout(() => r("late"), budgetMs);
      }),
    ]);
    clearTimeout(timer);
    if (out === "late") return { ...EMPTY, ...base, pending: true };
    return { ...(out ?? EMPTY), ...base, pending: false };
  } catch (err) {
    console.error("[dayPhotos] failed:", err);
    return none;
  }
}

/** A photo in Immich's web UI, when the user gave its address. */
export const immichPhotoLink = (linkBase: string, id: string) => `${linkBase}/photos/${encodeURIComponent(id)}`;
