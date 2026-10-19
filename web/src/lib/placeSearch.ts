// Place search for /api/search and the Places page: which places (and cities,
// countries) match a query, with when and how often you were there. Matching
// happens in the database on folded text (migrations/014_search.sql) so it is
// case- and accent-insensitive and can use the trigram index; ranking happens
// here (lib/search.ts).

import { q } from "@/lib/db";
import { PLACE_CATEGORY_SQL, PLACE_NAME_SQL } from "@/lib/places";
import type { PlaceKind } from "@/lib/savedPlaces";
import { type AreaResult, likeAnywhere, queryTokens, rankAreas, rankPlaces, type MatchField } from "@/lib/search";

/** At most this many places come back. */
export const PLACE_LIMIT = 30;
/** How many recent visit dates each place lists. */
export const RECENT_DATES = 5;
/** Matches fetched for ranking; far more than any one search shows. */
const CANDIDATES = 500;

export interface PlaceHit {
  id: number;
  /** Display name (renamed, else geocoded); null when unknown. */
  name: string | null;
  kind: PlaceKind | null;
  category: string | null;
  city: string | null;
  country: string | null;
  visitCount: number;
  /** Seconds. */
  totalTime: number;
  /** ISO start of the first and of the latest visit; null without visits. */
  firstVisit: string | null;
  lastVisit: string | null;
  /** The latest visit's local date (YYYY-MM-DD, the account's time zone). */
  lastVisitDate: string | null;
  /** Local dates with a visit, newest first, at most RECENT_DATES. */
  recentDates: string[];
  /** What the query matched: the name, the address, the saved kind, the type, or only the city/country. */
  match: MatchField;
}

export interface SearchResult {
  query: string;
  places: PlaceHit[];
  /** Cities and countries whose name matches. */
  areas: AreaResult[];
}

type PlaceRow = {
  id: string;
  name: string | null;
  geo_name: string | null;
  custom_name: string | null;
  street: string | null;
  kind: PlaceKind | null;
  category: string | null;
  city: string | null;
  country: string | null;
  visit_count: string;
  total_time: string | null;
  first_visit: Date | null;
  last_visit: Date | null;
};

type AreaSqlRow = {
  city: string | null;
  country: string | null;
  places: string;
  visits: string;
  duration: string | null;
  last_visit: Date | null;
};

// Same rule as the Places list (lib/places.ts): roads and transit platforms
// are passed through, not visited; saved places always count.
const LISTED_SQL = `(p.kind IS NOT NULL OR (
  COALESCE(p.geodata->>'osm_key', '') <> 'highway'
  AND COALESCE(p.category, '') NOT IN ('platform', 'stop_position', 'stop', 'halt', 'tram_stop', 'bus_stop')))`;

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

const globalForSearch = globalThis as unknown as { _matkaUtf8Db?: Promise<boolean> };

/**
 * Whether the database stores UTF-8. matka_fold() relies on it: under
 * SQL_ASCII, translate() sees bytes, not letters. Without it, every place is
 * fetched and matched here instead (fine for one person's places).
 */
function databaseIsUtf8(): Promise<boolean> {
  globalForSearch._matkaUtf8Db ??= q<{ enc: string }>(`SELECT current_setting('server_encoding') AS enc`)
    .then((r) => r[0]?.enc === "UTF8")
    .catch((err) => {
      globalForSearch._matkaUtf8Db = undefined;
      throw err;
    });
  return globalForSearch._matkaUtf8Db;
}

export async function searchPlaces(userId: string, timeZone: string, query: string): Promise<SearchResult> {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return { query, places: [], areas: [] };
  const inDb = await databaseIsUtf8();
  const patterns = inDb ? [...new Set(tokens)].map(likeAnywhere) : [];
  // $1 user, $2.. one LIKE per word: every word has to occur somewhere.
  const likes = (expr: string) =>
    patterns.length ? patterns.map((_, i) => `${expr} LIKE $${i + 2}`).join(" AND ") : "TRUE";

  const [rows, areaRows] = await Promise.all([
    q<PlaceRow>(
      `SELECT p.id, ${PLACE_NAME_SQL} AS name, p.custom_name, p.geo_name,
              p.geodata->>'street' AS street, p.kind, ${PLACE_CATEGORY_SQL} AS category, p.city, p.country,
              count(v.id) AS visit_count,
              COALESCE(sum(extract(epoch FROM v.ended_at - v.started_at)), 0) AS total_time,
              min(v.started_at) AS first_visit, max(v.started_at) AS last_visit
       FROM places p
       LEFT JOIN visits v ON v.place_id = p.id
       WHERE p.user_id = $1 AND ${LISTED_SQL} AND ${likes("matka_place_search_text(p)")}
       GROUP BY p.id
       ORDER BY visit_count DESC, last_visit DESC NULLS LAST
       ${inDb ? `LIMIT ${CANDIDATES}` : ""}`,
      [userId, ...patterns],
    ),
    q<AreaSqlRow>(
      `SELECT p.city, p.country, count(DISTINCT p.id) AS places, count(v.id) AS visits,
              COALESCE(sum(extract(epoch FROM v.ended_at - v.started_at)), 0) AS duration,
              max(v.started_at) AS last_visit
       FROM places p
       JOIN visits v ON v.place_id = p.id
       WHERE p.user_id = $1 AND (p.city IS NOT NULL OR p.country IS NOT NULL)
         AND ${likes(`matka_fold(COALESCE(p.city, '') || ' ' || COALESCE(p.country, ''))`)}
       GROUP BY p.city, p.country`,
      [userId, ...patterns],
    ),
  ]);

  const ranked = rankPlaces(
    rows.map((r) => ({
      row: r,
      name: r.name,
      altName: r.custom_name ? r.geo_name : null,
      street: r.street,
      kind: r.kind,
      category: r.category,
      city: r.city,
      country: r.country,
      visitCount: Number(r.visit_count),
      lastVisit: iso(r.last_visit),
    })),
    tokens,
  ).slice(0, PLACE_LIMIT);

  const dates = await recentDates(
    ranked.filter((p) => p.visitCount > 0).map((p) => p.row.id),
    timeZone,
  );

  const places: PlaceHit[] = ranked.map(({ row: r, field }) => {
    const recent = dates.get(String(r.id)) ?? [];
    return {
      id: Number(r.id),
      name: r.name,
      kind: r.kind,
      category: r.category,
      city: r.city,
      country: r.country,
      visitCount: Number(r.visit_count),
      totalTime: Math.round(Number(r.total_time ?? 0)),
      firstVisit: iso(r.first_visit),
      lastVisit: iso(r.last_visit),
      lastVisitDate: recent[0] ?? null,
      recentDates: recent,
      match: field,
    };
  });

  const areas = rankAreas(
    areaRows.map((r) => ({
      city: r.city,
      country: r.country,
      places: Number(r.places),
      visits: Number(r.visits),
      duration: Math.round(Number(r.duration ?? 0)),
      lastVisit: iso(r.last_visit),
    })),
    tokens,
  );

  return { query, places, areas };
}

/** The newest RECENT_DATES local dates with a visit, per place. */
async function recentDates(placeIds: string[], timeZone: string): Promise<Map<string, string[]>> {
  if (placeIds.length === 0) return new Map();
  const rows = await q<{ place_id: string; dates: string[] }>(
    `SELECT pid AS place_id, d.dates
     FROM unnest($1::bigint[]) AS pid
     CROSS JOIN LATERAL (
       SELECT array_agg(to_char(day, 'YYYY-MM-DD') ORDER BY day DESC) AS dates
       FROM (
         SELECT DISTINCT (v.started_at AT TIME ZONE $2)::date AS day
         FROM visits v WHERE v.place_id = pid
         ORDER BY day DESC LIMIT ${RECENT_DATES}
       ) days
     ) d`,
    [placeIds, timeZone],
  );
  return new Map(rows.map((r) => [String(r.place_id), r.dates ?? []]));
}
