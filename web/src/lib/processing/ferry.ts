import { waterFraction } from "../water";

/** Minimum share of a trip's path over open water to call it a ferry. */
const MIN_WATER = 0.6;
const MIN_DISTANCE_M = 3000;
// Car ferries cruise at ~20-55 km/h; a plane over the sea is far faster.
const MIN_KMH = 7;
const MAX_KMH = 75;

/**
 * Ferries and other boats: most of the path over water at boat speed. Bridges,
 * coastal roads and the metro over Kulosaari are a small share of their trips.
 */
export function isFerry(t: { path: [number, number][]; distance: number; start: number; end: number }): boolean {
  if (t.distance < MIN_DISTANCE_M || t.end <= t.start) return false;
  const kmh = t.distance / 1000 / ((t.end - t.start) / 3600);
  if (kmh < MIN_KMH || kmh > MAX_KMH) return false;
  const w = waterFraction(t.path);
  return w !== null && w >= MIN_WATER;
}
