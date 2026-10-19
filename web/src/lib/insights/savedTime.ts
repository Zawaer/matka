// Time per saved place in a month, for the Insights "Saved places" card. Pure;
// ./load.ts fetches the places and their visits.

import type { PlaceKind } from "../savedPlaces";
import { DEFAULT_AWAY, type StayVisit, sampleNights } from "./awayTrips";
import { monthBounds } from "./time";

export type SavedPlaceInfo = { placeId: number; name: string | null; kind: PlaceKind };

export type SavedPlaceMonth = SavedPlaceInfo & {
  /** Seconds of visits inside the month. */
  seconds: number;
  /** Nights (keyed by the morning, in the month) whose 00:00–06:00 was mostly spent here. */
  nights: number;
};

/** Half the night window: "mostly" there. */
const MOSTLY = ((DEFAULT_AWAY.nightTo - DEFAULT_AWAY.nightFrom) * 3_600_000) / 2;

export function savedPlaceMonth(
  places: SavedPlaceInfo[],
  visits: Pick<StayVisit, "placeId" | "start" | "end">[],
  month: string,
  tz: string,
): SavedPlaceMonth[] {
  const [from, to] = monthBounds(month, tz);
  const out = new Map(places.map((p) => [p.placeId, { ...p, seconds: 0, nights: 0 }]));
  for (const v of visits) {
    const row = out.get(v.placeId);
    const ov = Math.min(to, v.end) - Math.max(from, v.start);
    if (row && ov > 0) row.seconds += ov / 1000;
  }
  // The same night sampling as trips, but needing half the window.
  const stays = visits.map((v) => ({ ...v, lat: 0, lon: 0, city: null, country: null }));
  for (const s of sampleNights(stays, [], tz, { ...DEFAULT_AWAY, minNightOverlap: MOSTLY })) {
    if (!s.visit || s.date.slice(0, 7) !== month) continue;
    const row = out.get(s.visit.placeId);
    if (row) row.nights++;
  }
  return [...out.values()]
    .map((r) => ({ ...r, seconds: Math.round(r.seconds) }))
    .filter((r) => r.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
}
