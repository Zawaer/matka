// Domain types mirroring the Dawarich schema (read-only snapshot).

export interface GeoPoint {
  id: number;
  lon: number;
  lat: number;
  /** Unix epoch seconds. */
  timestamp: number;
  altitude: number | null;
  accuracy: number | null;
  velocity: number | null;
  battery: number | null;
  city: string | null;
  country: string | null;
}

export interface Visit {
  id: number;
  name: string | null;
  /** Visit lifecycle status (Dawarich enum int). */
  status: number;
  startedAt: string; // ISO
  endedAt: string; // ISO
  /** Seconds. */
  duration: number | null;
  placeId: number | null;
  placeName: string | null;
  lat: number | null;
  lon: number | null;
  confidence: number | null;
}

export interface Place {
  id: number;
  name: string | null;
  lat: number | null;
  lon: number | null;
  city: string | null;
  country: string | null;
  /** OSM category, e.g. "cafe", "school" — when available. */
  category: string | null;
}

import type { ModeKey } from "./modes";

export interface TrackSummary {
  id: number;
  startedAt: string;
  endedAt: string;
  /** Meters. */
  distance: number | null;
  /** Seconds. */
  duration: number | null;
  /** km/h average. */
  avgSpeed: number | null;
  mode: ModeKey;
}

/** One ordered day on the timeline: visits + the moves between them. */
export interface TimelineDay {
  date: string; // YYYY-MM-DD
  items: TimelineItem[];
}

export type TimelineItem =
  | { kind: "visit"; visit: Visit }
  | { kind: "move"; track: TrackSummary };
