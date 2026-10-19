// Saved places: kinds and sizes. Client-safe (no database), shared by the
// place page, the map's "Save a place" form, the timeline and the insights.

export const PLACE_KINDS = ["home", "family", "school", "work", "other"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export const KIND_META: Record<PlaceKind, { label: string; icon: string; hint: string }> = {
  home: { label: "Home", icon: "🏠", hint: "Where you live" },
  family: { label: "Family", icon: "👪", hint: "A relative's home you also sleep at" },
  school: { label: "School", icon: "🎓", hint: "School or campus" },
  work: { label: "Work", icon: "💼", hint: "Workplace" },
  other: { label: "Other", icon: "⭐", hint: "Anywhere else you care about" },
};

export const isPlaceKind = (s: unknown): s is PlaceKind =>
  typeof s === "string" && (PLACE_KINDS as readonly string[]).includes(s);

/** Kinds that count as a home for trips (nights there are never away). */
export const isHomeKind = (k: PlaceKind | null | undefined) => k === "home" || k === "family";

/** Size presets; a saved place's radius_m is one of these (50–1000 accepted). */
export const PLACE_SIZES = [
  { key: "S", label: "S", radius: 100, hint: "100 m · a house" },
  { key: "M", label: "M", radius: 250, hint: "250 m · a block" },
  { key: "L", label: "L", radius: 500, hint: "500 m · a campus" },
  { key: "XL", label: "XL", radius: 1000, hint: "1 km · a district" },
] as const;

export const MIN_RADIUS_M = 50;
export const MAX_RADIUS_M = 1000;
/** Radius of a saved place without its own size (= detect.ts STAY_RADIUS_M). */
export const DEFAULT_RADIUS_M = 100;

/** A radius from a form field, or null when it isn't a whole number in range. */
export function parseRadius(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= MIN_RADIUS_M && n <= MAX_RADIUS_M ? n : null;
}

/** "1 km", "250 m". */
export const formatRadius = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);
