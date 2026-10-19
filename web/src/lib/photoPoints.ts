import { q } from "./db";
import { immichFor, type ImmichConfig } from "./immich";

// Photo locations from Immich as extra history. A geotagged camera photo says
// "I was here at this moment", which is exactly a location point, and many
// photos predate the phone recorder or fall in its gaps (app off, phone dead).
//
// Only gaps are filled: a photo within GAP_S of an existing point adds nothing
// a tracker didn't already record, and could only add jitter. Photos without a
// camera make (screenshots, saved images) or without GPS and capture time are
// skipped. Runs from the worker every SYNC_EVERY_H hours per user; existing
// rows are left alone (ON CONFLICT on user_id, ts), so a rerun is cheap.

const GAP_S = 15 * 60;
const SYNC_EVERY_H = 6;
const PAGE_SIZE = 1000;
const MAX_PAGES = 200;
/** Assumed accuracy of a photo's GPS tag (m): phone cameras use the same fix. */
const PHOTO_ACCURACY_M = 25;

export type PhotoFix = { ts: number; lat: number; lon: number };

type Asset = {
  id?: string;
  type?: string;
  exifInfo?: {
    latitude?: number | null;
    longitude?: number | null;
    dateTimeOriginal?: string | null;
    make?: string | null;
  } | null;
};

/** The location fix a photo stands for, or null if it can't be trusted as one. */
export function photoFix(a: Asset): PhotoFix | null {
  const e = a.exifInfo;
  if (!e || a.type !== "IMAGE" || !e.make) return null;
  const lat = Number(e.latitude);
  const lon = Number(e.longitude);
  if (e.latitude == null || e.longitude == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
  const ms = e.dateTimeOriginal ? Date.parse(e.dateTimeOriginal) : NaN;
  if (!Number.isFinite(ms) || ms < Date.UTC(2000, 0, 1) || ms > Date.now() + 86_400_000) return null;
  return { ts: Math.floor(ms / 1000), lat, lon };
}

async function* allAssets(cfg: ImmichConfig): AsyncGenerator<Asset[]> {
  let cursor: string | null = null;
  let page = 1;
  for (let i = 0; i < MAX_PAGES; i++) {
    const body: Record<string, unknown> = { type: "IMAGE", withExif: true, size: PAGE_SIZE };
    if (cursor) body.cursor = cursor;
    else body.page = page;
    const res = await fetch(`${cfg.base}/api/search/metadata`, {
      method: "POST",
      headers: { "x-api-key": cfg.key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
      redirect: "manual",
    });
    if (!res.ok) throw new Error(`Immich search answered HTTP ${res.status}`);
    const data = (await res.json()) as {
      assets?: { items?: Asset[]; nextCursor?: string | null; nextPage?: string | null };
    };
    const items = data.assets?.items ?? [];
    yield items;
    if (data.assets?.nextCursor) cursor = data.assets.nextCursor;
    else if (data.assets?.nextPage) page = Number(data.assets.nextPage) || page + 1;
    else return;
    if (items.length === 0) return;
  }
}

/** Inserts photo fixes that fall in gaps. Returns how many were added. */
export async function insertPhotoFixes(userId: string, fixes: PhotoFix[]): Promise<number> {
  if (fixes.length === 0) return 0;
  const rows = await q<{ ts: Date }>(
    `WITH f AS (
       SELECT DISTINCT ON (ts) * FROM unnest($2::int8[], $3::float8[], $4::float8[]) AS f(ts, lat, lon)
       ORDER BY ts
     )
     INSERT INTO points (user_id, ts, geom, accuracy, source)
     SELECT $1, to_timestamp(f.ts), ST_SetSRID(ST_MakePoint(f.lon, f.lat), 4326)::geography, $5, 'photo'
     FROM f
     WHERE NOT EXISTS (
       SELECT 1 FROM points p
       WHERE p.user_id = $1
         AND p.ts BETWEEN to_timestamp(f.ts - $6) AND to_timestamp(f.ts + $6))
     ON CONFLICT (user_id, ts) DO NOTHING
     RETURNING ts`,
    [userId, fixes.map((f) => f.ts), fixes.map((f) => f.lat), fixes.map((f) => f.lon), PHOTO_ACCURACY_M, GAP_S],
  );
  if (rows.length) {
    const min = rows.reduce((m, r) => (r.ts < m ? r.ts : m), rows[0].ts);
    await q(
      `INSERT INTO processing_state (user_id, dirty_from) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
         SET dirty_from = LEAST(COALESCE(processing_state.dirty_from, EXCLUDED.dirty_from), EXCLUDED.dirty_from)`,
      [userId, min],
    );
  }
  return rows.length;
}

/** Syncs every user whose sync is due. Quiet when nothing is configured. */
export async function syncPhotoPoints(): Promise<void> {
  const due = await q<{ id: string }>(
    `SELECT u.id FROM users u
     LEFT JOIN import_state s ON s.source = 'immich-photos:' || u.id
     WHERE u.photo_points AND u.immich_url IS NOT NULL AND u.immich_api_key IS NOT NULL
       AND (s.updated_at IS NULL OR s.updated_at < now() - make_interval(hours => $1))`,
    [SYNC_EVERY_H],
  );
  for (const { id } of due) {
    const source = `immich-photos:${id}`;
    // Claim it first so a failing Immich isn't retried every tick.
    await q(
      `INSERT INTO import_state (source, user_id) VALUES ($1, $2)
       ON CONFLICT (source) DO UPDATE SET updated_at = now()`,
      [source, id],
    );
    const cfg = await immichFor(id);
    if (!cfg) continue;
    let seen = 0;
    let usable = 0;
    let added = 0;
    try {
      for await (const page of allAssets(cfg)) {
        seen += page.length;
        const fixes = page.map(photoFix).filter((f): f is PhotoFix => f != null);
        usable += fixes.length;
        added += await insertPhotoFixes(id, fixes);
      }
      await q(
        `UPDATE import_state SET seen = $2, inserted = inserted + $3, total = $4, updated_at = now(),
                finished_at = now(), note = NULL WHERE source = $1`,
        [source, seen, added, usable],
      );
      if (added) console.log(`[photos] user ${id}: ${added} photo locations filled gaps (${usable} geotagged of ${seen} photos)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await q(`UPDATE import_state SET note = $2, updated_at = now() WHERE source = $1`, [source, msg.slice(0, 300)]);
      console.error(`[photos] user ${id}: sync failed, will retry in ${SYNC_EVERY_H} h:`, msg);
    }
  }
}
