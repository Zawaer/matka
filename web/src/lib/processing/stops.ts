import { haversine } from "./geo";

// Public transport stops (from the GTFS feeds, transit_stops) in a coarse grid,
// for the Detector to tell a wait at a stop from a visit. Empty when no feed
// is loaded, and then nothing counts as a stop.

const CELL_DEG = 0.005; // ~550 m north-south, ~280 m east-west at 60°N

type Stop = { lat: number; lon: number; name?: string };

export class StopIndex {
  private grid = new Map<string, Stop[]>();
  readonly size: number;

  constructor(stops: Stop[]) {
    for (const s of stops) {
      const k = key(Math.floor(s.lat / CELL_DEG), Math.floor(s.lon / CELL_DEG));
      const cell = this.grid.get(k);
      if (cell) cell.push(s);
      else this.grid.set(k, [s]);
    }
    this.size = stops.length;
  }

  /** Whether any stop is within radiusM (at most a cell's width, ~280 m) of the point. */
  near(lat: number, lon: number, radiusM: number): boolean {
    return this.nearest(lat, lon, radiusM) !== null;
  }

  /** The nearest stop within radiusM (at most a cell's width, ~280 m), or null. */
  nearest(lat: number, lon: number, radiusM: number): Stop | null {
    const ci = Math.floor(lat / CELL_DEG);
    const cj = Math.floor(lon / CELL_DEG);
    let best: Stop | null = null;
    let bestD = radiusM;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const s of this.grid.get(key(ci + di, cj + dj)) ?? []) {
          const d = haversine(lat, lon, s.lat, s.lon);
          if (d <= bestD) [best, bestD] = [s, d];
        }
      }
    }
    return best;
  }
}

const key = (i: number, j: number) => `${i}:${j}`;
