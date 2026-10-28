// Shapes the API hands the UI. Times are ISO strings, durations seconds,
// distances metres.

import type { ModeKey } from "./modes";
import type { PlaceCandidate } from "./placeConfirm";
import type { PlaceKind } from "./savedPlaces";

export type LatLon = { lat: number; lon: number };

export interface Visit {
  id: number;
  startedAt: string;
  endedAt: string;
  duration: number;
  placeId: number;
  /** Rename or geocoded name; null when unknown. */
  placeName: string | null;
  category: string | null;
  /** Saved place kind (home, family, school, work, other), or null when not saved. */
  placeKind: PlaceKind | null;
  /** OSM key of the place's geocoded feature (shop, amenity…), for its icon; null when unknown. */
  osmKey?: string | null;
  lat: number;
  lon: number;
  /**
   * Set when the name is a guess among several ("Visited X?"): the names the
   * user may pick instead (lib/placeConfirm.ts). Absent otherwise.
   */
  candidates?: PlaceCandidate[];
}

/** One ride on a public transport line within a trip (lib/transit). */
export interface TransitLeg {
  kind: "bus" | "tram" | "metro" | "train" | "boat";
  /** Line names, best match first; several on a shared corridor. */
  lines: string[];
  fromStop: string | null;
  toStop: string | null;
  startedAt: string;
  endedAt: string;
  /** Meters. */
  distance: number;
}

export interface TrackSummary {
  id: number;
  startedAt: string;
  endedAt: string;
  distance: number;
  duration: number;
  mode: ModeKey;
  /** Matched public transport legs, when the user has line matching on (or the user's own). */
  legs?: TransitLeg[];
  /** Set when the user fixed this trip ("edited"): the correction to undo. */
  correctionId?: number;
  /** A trip the user added where none was recorded (its id is -correctionId). */
  added?: boolean;
  /** Where the trip started and ended, when known. */
  from?: LatLon;
  to?: LatLon;
}

/** One ordered day on the timeline: visits + the moves between them. */
export interface TimelineDay {
  date: string; // YYYY-MM-DD in the user's timezone
  /** The local day's [start, end) as instants (absent when there's no history). */
  start?: string;
  end?: string;
  items: TimelineItem[];
}

export type TimelineItem =
  | { kind: "visit"; visit: Visit }
  | { kind: "move"; track: TrackSummary };
