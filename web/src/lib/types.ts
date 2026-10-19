// Shapes the API hands the UI. Times are ISO strings, durations seconds,
// distances metres.

import type { ModeKey } from "./modes";
import type { PlaceKind } from "./savedPlaces";

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
  lat: number;
  lon: number;
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
  /** Matched public transport legs, when the user has line matching on. */
  legs?: TransitLeg[];
}

/** One ordered day on the timeline: visits + the moves between them. */
export interface TimelineDay {
  date: string; // YYYY-MM-DD in the user's timezone
  items: TimelineItem[];
}

export type TimelineItem =
  | { kind: "visit"; visit: Visit }
  | { kind: "move"; track: TrackSummary };
