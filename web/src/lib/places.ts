import { q } from "@/lib/db";
import type { PlaceKind } from "@/lib/savedPlaces";

type Row = {
  id: string;
  name: string | null;
  city: string | null;
  country: string | null;
  category: string | null;
  kind: PlaceKind | null;
  radius_m: number | null;
  visit_count: string;
  total_time: string | null;
  last_visit: Date | null;
};

export interface PlaceListItem {
  id: number;
  name: string | null;
  city: string | null;
  country: string | null;
  /** OSM category (osm_value) or null. */
  category: string | null;
  visitCount: number;
  /** Seconds. */
  totalTime: number;
  /** ISO timestamp of the most recent visit, or null. */
  lastVisit: string | null;
  /** Saved kind, or null when the place isn't saved. */
  kind: PlaceKind | null;
  /** A saved place's own radius in metres, or null. */
  radius: number | null;
}

/** Display name: the user's rename wins over the geocoder's. */
export const PLACE_NAME_SQL = `COALESCE(p.custom_name, p.geo_name)`;

/** Shared loader so the list page can render server-side without a self-fetch. */
export async function getPlaces(userId: string): Promise<PlaceListItem[]> {
  const rows = await q<Row>(
    `SELECT p.id, ${PLACE_NAME_SQL} AS name, p.city, p.country, p.category, p.kind, p.radius_m,
            count(v.id) AS visit_count,
            COALESCE(sum(extract(epoch FROM v.ended_at - v.started_at)), 0) AS total_time,
            max(v.ended_at) AS last_visit
     FROM places p
     LEFT JOIN visits v ON v.place_id = p.id
     WHERE p.user_id = $1
       -- Roads, cycleways and transit platforms are where you pass through,
       -- not places you spend time; Photon often snaps short stops to them.
       -- A place the user saved always shows.
       AND (p.kind IS NOT NULL OR (
         COALESCE(p.geodata->>'osm_key', '') <> 'highway'
         AND COALESCE(p.category, '') NOT IN
           ('platform', 'stop_position', 'stop', 'halt', 'tram_stop', 'bus_stop')))
     GROUP BY p.id
     ORDER BY (p.kind IS NOT NULL) DESC, visit_count DESC, last_visit DESC NULLS LAST, name ASC`,
    [userId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    city: r.city,
    country: r.country,
    category: r.category,
    visitCount: Number(r.visit_count),
    totalTime: Math.round(Number(r.total_time ?? 0)),
    lastVisit: r.last_visit ? new Date(r.last_visit).toISOString() : null,
    kind: r.kind,
    radius: r.radius_m,
  }));
}

/**
 * Marks the user's whole history for reprocessing, so visits re-snap after a
 * place was saved, unsaved or resized (lib/processing/run.ts).
 */
export async function markAllDirty(userId: string): Promise<void> {
  await q(
    `INSERT INTO processing_state (user_id, dirty_from) VALUES ($1, '-infinity')
     ON CONFLICT (user_id) DO UPDATE SET dirty_from = '-infinity'`,
    [userId],
  );
}
