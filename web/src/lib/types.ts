// Shapes the API hands the UI. Times are ISO strings, durations seconds,
// distances metres.

import type { ModeKey } from "./modes";

export interface Visit {
  id: number;
  startedAt: string;
  endedAt: string;
  duration: number;
  placeId: number;
  /** Rename or geocoded name; null when unknown. */
  placeName: string | null;
  category: string | null;
  lat: number;
  lon: number;
}

export interface TrackSummary {
  id: number;
  startedAt: string;
  endedAt: string;
  distance: number;
  duration: number;
  mode: ModeKey;
}

/** One ordered day on the timeline: visits + the moves between them. */
export interface TimelineDay {
  date: string; // YYYY-MM-DD in the user's timezone
  items: TimelineItem[];
}

export type TimelineItem =
  | { kind: "visit"; visit: Visit }
  | { kind: "move"; track: TrackSummary };
