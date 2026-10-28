// "Visited X?" on the timeline, like Google Timeline: a visit whose place name
// is a guess among several plausible ones shows "X?" with "Yes · Pick
// another". The candidates come from geocoding (places.geo_candidates, kept for
// every place: lib/processing/geocode.ts nearbyCandidates); the answer is
// stored on the place (places.confirmed_at, custom_name, custom_category), so
// it sticks for every visit there. Pure apart from savePlaceChoice.

import { q } from "./db";

/** A POI farther than this from the stay isn't a real alternative. */
export const CANDIDATE_RADIUS_M = 40;
/** Short stops aren't worth a question. */
export const MIN_ASK_VISIT_S = 10 * 60;
/** A place visited this often without the user renaming it has been accepted as it is. */
export const SETTLED_VISITS = 5;
/** At most this many names to pick from. */
const MAX_CANDIDATES = 6;

/** One name the user may pick. category: OSM value (school, library…); null for the address. */
export type PlaceCandidate = { name: string; category: string | null; address: boolean };

type StoredCandidates = { pois?: { name?: unknown; kind?: unknown; d?: unknown }[]; address?: unknown };

/**
 * The names to offer for a place: the assertable POIs within
 * CANDIDATE_RADIUS_M, nearest first, then the street address; no duplicates.
 */
export function placeCandidates(stored: unknown): PlaceCandidate[] {
  const c = (stored && typeof stored === "object" ? stored : {}) as StoredCandidates;
  const out: PlaceCandidate[] = [];
  const seen = new Set<string>();
  const add = (x: PlaceCandidate) => {
    const k = x.name.trim().toLowerCase();
    if (!k || seen.has(k) || out.length >= MAX_CANDIDATES) return;
    seen.add(k);
    out.push({ ...x, name: x.name.trim() });
  };
  const pois = Array.isArray(c.pois) ? [...c.pois] : [];
  pois.sort((a, b) => Number(a?.d ?? Infinity) - Number(b?.d ?? Infinity));
  for (const p of pois) {
    if (typeof p?.name !== "string") continue;
    const d = typeof p.d === "number" ? p.d : Infinity;
    if (d > CANDIDATE_RADIUS_M) continue;
    add({ name: p.name, category: typeof p.kind === "string" ? p.kind : null, address: false });
  }
  if (typeof c.address === "string") add({ name: c.address, category: null, address: true });
  return out;
}

export type ConfirmFacts = {
  /** The user renamed the place, or picked a name. */
  renamed: boolean;
  /** Saved kind (home, work…), or null. */
  kind: string | null;
  confirmed: boolean;
  /** All visits to the place. */
  placeVisits: number;
  /** This visit, seconds. */
  duration: number;
  candidates: PlaceCandidate[];
};

/**
 * Whether to ask "Visited X?" for this visit: the place has no name or kind
 * from the user and isn't confirmed, there are at least two plausible names
 * (the address counts), and it isn't a short stop or a place that has long
 * been accepted as it is (SETTLED_VISITS visits).
 */
export function needsConfirm(f: ConfirmFacts): boolean {
  return (
    !f.renamed &&
    f.kind == null &&
    !f.confirmed &&
    f.duration >= MIN_ASK_VISIT_S &&
    f.placeVisits < SETTLED_VISITS &&
    f.candidates.length >= 2
  );
}

// ---- input ------------------------------------------------------------------

/** What the client sends: yes to the shown name, or a name (picked or typed). */
export type PlaceChoice = { confirm: true } | { name: string; category: string | null };

const MAX_NAME = 120;

/** Validates POST /api/places/:id/confirm: {confirm: true} or {name, category?}. */
export function parsePlaceChoice(body: unknown): PlaceChoice | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "body must be a JSON object" };
  const b = body as Record<string, unknown>;
  if (b.confirm === true) return { confirm: true };
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: "give confirm: true or a name" };
  if (name.length > MAX_NAME) return { error: `a name can't be longer than ${MAX_NAME} characters` };
  const cat = b.category;
  if (cat != null && (typeof cat !== "string" || !/^[a-z0-9_]{1,40}$/.test(cat))) return { error: "category must be an OSM value like cafe" };
  return { name, category: (cat as string | null | undefined) ?? null };
}

/**
 * Stores the answer for one of the user's places. A picked candidate keeps its
 * type ('' for an address: no type); a typed name keeps the place's own
 * category. False when the place isn't the user's.
 */
export async function savePlaceChoice(userId: string, placeId: number, choice: PlaceChoice): Promise<boolean> {
  if ("confirm" in choice) {
    const rows = await q(`UPDATE places SET confirmed_at = now() WHERE id = $1 AND user_id = $2 RETURNING id`, [placeId, userId]);
    return rows.length > 0;
  }
  // A candidate's type when the name is one of the place's candidates.
  const [p] = await q<{ geo_candidates: unknown }>(`SELECT geo_candidates FROM places WHERE id = $1 AND user_id = $2`, [placeId, userId]);
  if (!p) return false;
  const hit = placeCandidates(p.geo_candidates).find((c) => c.name.toLowerCase() === choice.name.toLowerCase());
  const category = hit ? (hit.address ? "" : hit.category) : choice.category;
  await q(
    `UPDATE places SET custom_name = $3, custom_category = $4, confirmed_at = now() WHERE id = $1 AND user_id = $2`,
    [placeId, userId, choice.name, category],
  );
  return true;
}
