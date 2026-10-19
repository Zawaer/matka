import { haversine } from "./geo";

// The user's saved places as the processor sees them: a centre and a radius.
// A stay whose centre falls inside a saved place's radius belongs to it, ahead
// of the plain nearest-place rule; where saved places overlap, the one the
// stay is deepest inside wins (smallest distance minus radius).

export type SavedPlace = { id: string; lat: number; lon: number; radius: number };

export class SavedIndex {
  constructor(private readonly places: SavedPlace[]) {}

  get size() {
    return this.places.length;
  }

  /** The saved place a stay centred here belongs to, or null. */
  at(lat: number, lon: number): SavedPlace | null {
    let best: SavedPlace | null = null;
    let bestScore = Infinity;
    for (const p of this.places) {
      // Cheap reject before the trig: 0.01° lat ≈ 1.1 km, the largest radius.
      if (Math.abs(p.lat - lat) > 0.011) continue;
      const d = haversine(lat, lon, p.lat, p.lon);
      if (d > p.radius) continue;
      const score = d - p.radius;
      if (score < bestScore) {
        best = p;
        bestScore = score;
      }
    }
    return best;
  }
}
