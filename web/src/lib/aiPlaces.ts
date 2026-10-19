// AI place picker, the pure half: what a batch of ambiguous places looks like
// to the model, and what of its answer we accept. The worker step that
// gathers the data and applies the picks is lib/processing/aiPlaces.ts.
//
// Privacy: the model sees, per place, only the candidate POI names around it
// (public OpenStreetMap names with their type and distance in metres), whether
// a street address is an option (never the address itself), and the visit
// pattern in local time: how many visits, typical start hour and duration,
// weekday/weekend share. Never coordinates, addresses, dates or tracks, and
// places are numbered per request, not by their ids.

import { assertable, type GeoCandidate, type GeoCandidates } from "./processing/geocode";

/** Bump to ask again about every place with the current prompt. */
export const AI_PLACES_VERSION = 1;
/** Picks below this confidence are dropped (the place keeps its geocoded name). */
export const MIN_CONFIDENCE = 0.7;
/** Places per request. */
export const AI_BATCH = 20;

export type VisitStats = {
  visits: number;
  /** Median local start hour, 0–23. */
  startHour: number;
  /** Median visit length in minutes. */
  minutes: number;
  /** Share of visits starting on a Saturday or Sunday, 0–1. */
  weekendShare: number;
  /** Share of visits starting 22:00–05:59 local time, 0–1. */
  nightShare: number;
};

export type AiPlaceInput = { candidates: GeoCandidates; stats: VisitStats };

/** What the model may answer for a place: one candidate's exact name, "address", or "unsure". */
export type AiChoice = { kind: "poi"; name: string; poi: GeoCandidate } | { kind: "address" };
export type AiPick = { index: number; choice: AiChoice; confidence: number };

export const SYSTEM_PROMPT = `You name places in a personal location history.
For each place you get the named points of interest that OpenStreetMap lists near where the person stayed (name, type, distance in metres) and how they spend time there (number of visits, typical local start hour, typical length, share of visits on weekends and at night).
Decide which candidate the person was most likely at, using common sense about opening hours and visit patterns: a short weekday lunchtime visit fits a restaurant, a weekly evening hour fits a gym, a long stay every working day fits an office or school, long or overnight stays usually mean a home or someone's home, which is "address".
Answer "address" when the stays look like a home or a private address rather than any candidate. Answer "unsure" when the pattern does not single one candidate out.
Only use a candidate's name exactly as given. Do not invent names.
Reply with JSON only, no prose and no code fences: {"picks":[{"place":1,"choice":"<exact candidate name>|address|unsure","confidence":0.0}]} with one entry per place.`;

const round = (x: number, step = 1) => Number((Math.round(x / step) * step).toFixed(2));

/** The user message for one batch. Places are numbered from 1 in the order given. */
export function buildPrompt(places: AiPlaceInput[]): string {
  const rows = places.map((p, i) => ({
    place: i + 1,
    candidates: p.candidates.pois.map((c) => ({
      name: c.name,
      type: (c.kind ?? c.key ?? "place").replace(/_/g, " "),
      metres: round(c.d, 5),
    })),
    address_option: p.candidates.address != null,
    visits: p.stats.visits,
    typical_start: `${String(p.stats.startHour).padStart(2, "0")}:00`,
    typical_minutes: p.stats.minutes < 60 ? round(p.stats.minutes, 5) : round(p.stats.minutes, 15),
    weekend_share: round(p.stats.weekendShare, 0.1),
    night_share: round(p.stats.nightShare, 0.1),
  }));
  return `Places:\n${JSON.stringify(rows)}`;
}

/** The first top-level JSON object in a reply, tolerating code fences and stray prose. */
function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

const norm = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The picks we accept from a reply to buildPrompt(places): confident ones
 * naming exactly one of that place's candidates (case and spacing aside), or
 * "address" where an address exists. Anything else (unknown places, invented
 * names, "unsure", low confidence, a type pickPhotonName would never assert)
 * is dropped. Returns null when the reply isn't the JSON asked for.
 */
export function parsePicks(reply: unknown, places: AiPlaceInput[]): AiPick[] | null {
  const body = typeof reply === "string" ? extractJson(reply) : reply;
  const picks = (body as { picks?: unknown } | null)?.picks;
  if (!Array.isArray(picks)) return null;
  const out: AiPick[] = [];
  const done = new Set<number>();
  for (const raw of picks) {
    const r = raw as { place?: unknown; choice?: unknown; confidence?: unknown } | null;
    const n = typeof r?.place === "number" ? r.place : typeof r?.place === "string" ? Number(r.place) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > places.length || done.has(n)) continue;
    done.add(n);
    const conf = typeof r?.confidence === "number" ? r.confidence : Number(r?.confidence);
    if (!Number.isFinite(conf) || conf < MIN_CONFIDENCE || conf > 1) continue;
    if (typeof r?.choice !== "string") continue;
    const place = places[n - 1];
    const choice = norm(r.choice);
    if (choice === "unsure") continue;
    if (choice === "address") {
      if (place.candidates.address) out.push({ index: n - 1, choice: { kind: "address" }, confidence: conf });
      continue;
    }
    const poi = place.candidates.pois.find((c) => norm(c.name) === choice);
    // Candidates were already filtered at geocoding; check again in case the rules changed since.
    if (!poi || !assertable({ name: poi.name, osm_key: poi.key ?? undefined, osm_value: poi.kind ?? undefined })) continue;
    out.push({ index: n - 1, choice: { kind: "poi", name: poi.name, poi }, confidence: conf });
  }
  return out;
}

/** The name a pick gives the place. */
export function pickedName(pick: AiPick, candidates: GeoCandidates): string | null {
  return pick.choice.kind === "poi" ? pick.choice.name : candidates.address;
}

/** Whether stored geo_candidates look like what aiCandidates() writes. */
export function isCandidates(x: unknown): x is GeoCandidates {
  const c = x as GeoCandidates | null;
  return (
    !!c &&
    Array.isArray(c.pois) &&
    c.pois.every((p) => typeof p?.name === "string" && typeof p?.d === "number") &&
    (c.address === null || typeof c.address === "string")
  );
}
