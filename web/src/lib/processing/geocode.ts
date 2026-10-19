import { q } from "../db";
import { haversine } from "./geo";

// Reverse geocoding of places via a self-hosted Photon (PHOTON_URL, e.g.
// http://photon:2322). Optional: without it places show their category or
// "Unknown place" and can be renamed by hand.
//
// Photon's nearest feature is often the wrong name for where you were: the
// street or bridge you stood next to, or the pub on the corner of the bus
// stop. So we ask for several candidates and pick (pickPhotonName): a nearby
// POI of a kind that is safe to assert, else the building's address
// ("Pohjantie 2 B"), else the district. Never a road, and never a bar.

/** Bump to re-geocode every place with the current rules on the next ticks. */
export const GEOCODER_VERSION = 2;

const BATCH = 20;
const TIMEOUT_MS = 8000;
const CANDIDATES = 10;

export type PhotonProps = {
  name?: string;
  street?: string;
  housenumber?: string;
  district?: string;
  locality?: string;
  city?: string;
  town?: string;
  village?: string;
  country?: string;
  osm_key?: string;
  osm_value?: string;
  type?: string;
};

export type PhotonFeature = {
  geometry?: { type?: string; coordinates?: [number, number] };
  properties?: PhotonProps;
};

/** Things you pass along or over, not places you are at. */
const SKIP_KEYS = new Set([
  "highway",
  "railway",
  "public_transport",
  "route",
  "waterway",
  "natural",
  "landuse",
  "boundary",
  "barrier",
  "power",
  "man_made", // bridges, piers, masts
  "bridge",
  "place", // suburbs, neighbourhoods; addresses (place=house) still give their address
]);

/**
 * Never name a place after these: being near one is no evidence of having
 * been in it, and the wrong guess is embarrassing or sensitive (a night bus
 * stop next to a pub; a parked car outside a clinic). Neither duration nor
 * time of day makes it safe: a long night stay next to a bar is usually a
 * home or a friend's place above it.
 */
const NEVER_VALUES = new Set([
  // nightlife, adult, gambling
  "bar",
  "pub",
  "nightclub",
  "biergarten",
  "stripclub",
  "brothel",
  "swingerclub",
  "love_hotel",
  "hookah_lounge",
  "casino",
  "gambling",
  "adult_gaming_centre",
  "erotic",
  "sex",
  "adult",
  "cannabis",
  "alcohol",
  "tobacco",
  "e-cigarette",
  "pawnbroker",
  "bookmaker",
  "lottery",
  // health, care, faith
  "clinic",
  "doctors",
  "dentist",
  "hospice",
  "social_facility",
  "place_of_worship",
  "funeral_hall",
  "crematorium",
  "prison",
  // you park or walk there, it isn't the place
  "parking",
  "parking_space",
  "parking_entrance",
  "bicycle_parking",
  "motorcycle_parking",
  "bench",
  "waste_basket",
  "recycling",
  "toilets",
  "atm",
  "vending_machine",
  "post_box",
  "telephone",
  "shelter",
  "bus_station",
  "taxi",
]);
const NEVER_KEYS = new Set(["healthcare"]);

/**
 * Big venues where a stay within VENUE_M of the POI's point most likely was
 * that venue (you are inside the mall, on the campus).
 */
const VENUE_VALUES = new Set([
  "mall",
  "department_store",
  "supermarket",
  "university",
  "college",
  "school",
  "kindergarten",
  "library",
  "hospital",
  "townhall",
  "theatre",
  "cinema",
  "arts_centre",
  "community_centre",
  "conference_centre",
  "exhibition_centre",
  "events_venue",
  "concert_hall",
  "marketplace",
  "ferry_terminal",
  "fuel",
  "museum",
  "gallery",
  "hotel",
  "hostel",
  "attraction",
  "zoo",
  "aquarium",
  "theme_park",
  "camp_site",
  "stadium",
  "sports_centre",
  "sports_hall",
  "ice_rink",
  "swimming_pool",
  "water_park",
  "fitness_centre",
  "golf_course",
  "park",
  "marina",
  "beach_resort",
  "aerodrome",
  "terminal",
  "castle",
  "fort",
]);
const VENUE_KEYS = new Set(["office"]);
const VENUE_M = 60;
/** Any other named POI (a cafe, a shop, a named building) only when the stay sits right on it. */
const POI_M = 15;
/** Use an address up to this far away. */
const ADDRESS_M = 100;
/** How much farther than the nearest address a POI may be and still win. */
const ADDRESS_SLACK_M = 15;

export type Pick = {
  name: string | null;
  /** osm_value of a POI we named the place after; null for an address. */
  category: string | null;
  city: string | null;
  country: string | null;
  /** The properties of the feature the name came from. */
  props: PhotonProps | null;
};

/** Whether a feature may name a place at all: named, not a road or the like, not a bar, clinic, church… */
export const assertable = (p: PhotonProps): boolean =>
  !!p.name &&
  !SKIP_KEYS.has(p.osm_key ?? "") &&
  !NEVER_KEYS.has(p.osm_key ?? "") &&
  !NEVER_VALUES.has(p.osm_value ?? "");

const cityOf = (p: PhotonProps) => p.city ?? p.town ?? p.village ?? null;
const addressOf = (p: PhotonProps) => (p.street && p.housenumber ? `${p.street} ${p.housenumber}` : null);

/** Choose a place's name from Photon reverse candidates around (lat, lon). */
export function pickPhotonName(features: PhotonFeature[], lat: number, lon: number): Pick {
  const cands = features
    .filter((f) => f.properties)
    .map((f) => {
      const c = f.geometry?.coordinates;
      const d = c ? haversine(lat, lon, c[1], c[0]) : Infinity;
      return { p: f.properties!, d };
    })
    .sort((a, b) => a.d - b.d);

  const meta = (p: PhotonProps) => ({ city: cityOf(p), country: p.country ?? null });
  const isVenue = (p: PhotonProps) => VENUE_VALUES.has(p.osm_value ?? "") || VENUE_KEYS.has(p.osm_key ?? "");

  // The nearest address is the building you were most likely in. A POI only
  // wins when it is about as near (or is that building): a home above a
  // supermarket stays "Street 5", not the supermarket.
  const addr = cands.find((c) => c.d <= ADDRESS_M && addressOf(c.p));
  const notBehind = (c: (typeof cands)[number]) =>
    !addr || c.d <= addr.d + ADDRESS_SLACK_M || addressOf(c.p) === addressOf(addr.p);
  const poi = cands.find((c) => c.d <= POI_M && assertable(c.p) && notBehind(c));
  const venue = cands.find((c) => c.d <= VENUE_M && assertable(c.p) && isVenue(c.p) && notBehind(c));
  const hit = poi ?? venue;
  if (hit) return { name: hit.p.name!, category: hit.p.osm_value ?? null, props: hit.p, ...meta(hit.p) };

  const area = (p: PhotonProps): PhotonProps => ({
    district: p.district,
    locality: p.locality,
    city: p.city,
    town: p.town,
    village: p.village,
    country: p.country,
  });
  if (addr) {
    // Just the address: not the properties of the pub that carried it.
    const p = addr.p;
    return { name: addressOf(p), category: null, props: { street: p.street, housenumber: p.housenumber, ...area(p) }, ...meta(p) };
  }

  const any = cands[0]?.p;
  if (!any) return { name: null, category: null, city: null, country: null, props: null };
  // Only the area: keeping a road's properties would also hide the place from
  // the places list (it skips osm_key=highway).
  return { name: any.district ?? any.locality ?? cityOf(any), category: null, props: area(any), ...meta(any) };
}

/** Places with this many assertable POIs nearby are ambiguous enough to ask the AI picker (lib/aiPlaces.ts). */
export const AI_MIN_CANDIDATES = 2;
/** How far from the stay a POI may be to be a candidate for the AI picker. */
export const AI_CANDIDATE_M = VENUE_M;
const AI_MAX_CANDIDATES = 8;

/** One POI the AI picker may choose: only the kind of feature pickPhotonName could assert. */
export type GeoCandidate = { name: string; key: string | null; kind: string | null; d: number };
/**
 * What geocoding kept for the AI picker (places.geo_candidates): the nearby
 * POIs, and the nearest address, which is never sent to the model (it only
 * hears that an address exists and may answer "address").
 */
export type GeoCandidates = { pois: GeoCandidate[]; address: string | null };

/**
 * The plausible POIs around (lat, lon) when there are at least
 * AI_MIN_CANDIDATES of them within AI_CANDIDATE_M, else null. Uses the same
 * assertable() rule as pickPhotonName, so the AI can never pick a bar, a
 * clinic or a church either.
 */
export function aiCandidates(features: PhotonFeature[], lat: number, lon: number): GeoCandidates | null {
  const near = features
    .filter((f) => f.properties && f.geometry?.coordinates)
    .map((f) => {
      const c = f.geometry!.coordinates!;
      return { p: f.properties!, d: haversine(lat, lon, c[1], c[0]) };
    })
    .sort((a, b) => a.d - b.d);
  const pois: GeoCandidate[] = [];
  const seen = new Set<string>();
  for (const { p, d } of near) {
    if (d > AI_CANDIDATE_M || !assertable(p)) continue;
    const name = p.name!.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    pois.push({ name, key: p.osm_key ?? null, kind: p.osm_value ?? null, d: Math.round(d) });
    if (pois.length === AI_MAX_CANDIDATES) break;
  }
  if (pois.length < AI_MIN_CANDIDATES) return null;
  const addr = near.find((c) => c.d <= ADDRESS_M && addressOf(c.p));
  return { pois, address: addr ? addressOf(addr.p) : null };
}

/**
 * Geocodes up to BATCH places that haven't been geocoded with the current
 * rules yet (new places first). Returns how many were done.
 */
export async function geocodePending(): Promise<number> {
  const base = process.env.PHOTON_URL?.trim().replace(/\/+$/, "");
  if (!base) return 0;
  const places = await q<{ id: string; lat: number; lon: number; ai: boolean }>(
    `SELECT p.id, ST_Y(p.geom::geometry) lat, ST_X(p.geom::geometry) lon, u.ai_places AND p.kind IS NULL AS ai
     FROM places p JOIN users u ON u.id = p.user_id
     WHERE p.geocoded_at IS NULL OR p.geocoder_version IS DISTINCT FROM $2
     ORDER BY p.geocoded_at NULLS FIRST, p.id LIMIT $1`,
    [BATCH, GEOCODER_VERSION],
  );
  let done = 0;
  for (const p of places) {
    let res: Response;
    try {
      res = await fetch(`${base}/reverse?lat=${p.lat}&lon=${p.lon}&limit=${CANDIDATES}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (err) {
      console.warn("[geocode] photon unreachable:", (err as Error).message);
      return done; // try again next tick
    }
    if (!res.ok) {
      console.warn(`[geocode] photon HTTP ${res.status}`);
      return done;
    }
    const body = (await res.json().catch(() => null)) as { features?: PhotonFeature[] } | null;
    const pick = pickPhotonName(body?.features ?? [], p.lat, p.lon);
    // Candidates for the AI picker only for users who turned it on (Settings).
    const cands = p.ai ? aiCandidates(body?.features ?? [], p.lat, p.lon) : null;
    // Only the geocoder's columns: a user's custom_name is left alone. When the
    // candidates changed, an earlier AI pick no longer stands.
    await q(
      `UPDATE places SET geocoded_at = now(), geocoder_version = $7, geodata = $2,
              geo_name = $3, category = $4, city = $5, country = $6,
              ai_name = CASE WHEN geo_candidates IS DISTINCT FROM $8::jsonb THEN NULL ELSE ai_name END,
              ai_category = CASE WHEN geo_candidates IS DISTINCT FROM $8::jsonb THEN NULL ELSE ai_category END,
              ai_version = CASE WHEN geo_candidates IS DISTINCT FROM $8::jsonb THEN NULL ELSE ai_version END,
              geo_candidates = $8::jsonb
       WHERE id = $1`,
      [p.id, pick.props, pick.name, pick.category, pick.city, pick.country, GEOCODER_VERSION, cands ? JSON.stringify(cands) : null],
    );
    done++;
  }
  return done;
}
