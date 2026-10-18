import { q, USER_ID } from "@/lib/db";

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

// Visits link to a place either directly (visits.place_id) or via the
// place_visits join table. Union both, de-duping per (place, visit) pair,
// so a visit counted through both paths is only counted once.
const SQL = `
  WITH links AS (
    SELECT place_id, id AS visit_id
    FROM visits
    WHERE deleted_at IS NULL AND place_id IS NOT NULL
    UNION
    SELECT pv.place_id, pv.visit_id
    FROM place_visits pv
    JOIN visits v ON v.id = pv.visit_id AND v.deleted_at IS NULL
  )
  SELECT
    p.id,
    p.name,
    p.city,
    p.country,
    p.geodata->'properties'->>'osm_value' AS category,
    count(DISTINCT l.visit_id) AS visit_count,
    COALESCE(sum(EXTRACT(EPOCH FROM (v.ended_at - v.started_at))::int), 0) AS total_time,
    max(v.ended_at) AS last_visit
  FROM places p
  LEFT JOIN links l ON l.place_id = p.id
  LEFT JOIN visits v ON v.id = l.visit_id
  WHERE p.user_id = $1
    -- Roads, cycleways and transit platforms are where you pass through, not
    -- places you spend time; Photon often snaps short stops to them.
    AND COALESCE(p.geodata->'properties'->>'osm_key', '') <> 'highway'
    AND COALESCE(p.geodata->'properties'->>'osm_value', '') NOT IN
      ('platform', 'stop_position', 'stop', 'halt', 'tram_stop', 'bus_stop')
  GROUP BY p.id
  ORDER BY visit_count DESC, last_visit DESC NULLS LAST, p.name ASC
`;

/**
 * Dawarich names places "Name (Category)", e.g. "Neulanen (Restaurant)".
 * The category is shown separately, so drop the trailing parenthetical.
 */
export function cleanName(name: string | null): string | null {
  if (!name) return name;
  const stripped = name.replace(/\s*\([^()]*\)\s*$/, "").trim();
  return stripped || name;
}

/** Shared loader so the list page can render server-side without a self-fetch. */
export async function getPlaces(): Promise<PlaceListItem[]> {
  const rows = await q<Row>(SQL, [USER_ID]);
  return rows.map((r) => ({
    id: Number(r.id),
    name: cleanName(r.name),
    city: r.city,
    country: r.country,
    category: r.category,
    visitCount: Number(r.visit_count),
    totalTime: Number(r.total_time ?? 0),
    lastVisit: r.last_visit ? new Date(r.last_visit).toISOString() : null,
  }));
}
