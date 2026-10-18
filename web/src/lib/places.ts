import { q } from "@/lib/db";

type Row = {
  id: string;
  name: string | null;
  city: string | null;
  country: string | null;
  category: string | null;
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
}

/** Display name: the user's rename wins over the geocoder's. */
export const PLACE_NAME_SQL = `COALESCE(p.custom_name, p.geo_name)`;

/** Shared loader so the list page can render server-side without a self-fetch. */
export async function getPlaces(userId: string): Promise<PlaceListItem[]> {
  const rows = await q<Row>(
    `SELECT p.id, ${PLACE_NAME_SQL} AS name, p.city, p.country, p.category,
            count(v.id) AS visit_count,
            COALESCE(sum(extract(epoch FROM v.ended_at - v.started_at)), 0) AS total_time,
            max(v.ended_at) AS last_visit
     FROM places p
     LEFT JOIN visits v ON v.place_id = p.id
     WHERE p.user_id = $1
     GROUP BY p.id
     ORDER BY visit_count DESC, last_visit DESC NULLS LAST, name ASC`,
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
  }));
}
