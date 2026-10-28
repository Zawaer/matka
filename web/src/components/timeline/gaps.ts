// "No location recorded" rows on the timeline. Pure, so it is unit-tested
// (gaps.test.ts).

import type { TimelineItem } from "@/lib/types";

/** Shorter silences are the phone lying still or a short tunnel, not worth a row. */
export const MIN_GAP_S = 30 * 60;

export type Gap = { from: string; to: string };

const startOf = (it: TimelineItem) => (it.kind === "visit" ? it.visit.startedAt : it.track.startedAt);
const endOf = (it: TimelineItem) => (it.kind === "visit" ? it.visit.endedAt : it.track.endedAt);
const ms = (s: string) => new Date(s).getTime();

/**
 * Time between two items with nothing recorded (location recording off). The
 * server doesn't stretch a visit or invent a trip across such a hole, so say
 * so instead of leaving the jump unexplained.
 */
export function gapBetween(a: TimelineItem, b: TimelineItem): Gap | null {
  const from = endOf(a);
  const to = startOf(b);
  if (!from || !to) return null;
  return (ms(to) - ms(from)) / 1000 >= MIN_GAP_S ? { from, to } : null;
}

/**
 * The same at the edges of a day: a day that starts after a hole (the phone
 * was off overnight) or ends in one (switched off in the afternoon, next
 * fix tomorrow evening). Only where history exists on that side: before the
 * first recorded day there is nothing to miss, and the end of the latest day
 * may simply not have been uploaded yet.
 */
export function edgeGaps(
  items: TimelineItem[],
  day: { date: string; start?: string; end?: string },
  dates: { minDate: string | null; maxDate: string | null },
  now = Date.now(),
): { before: Gap | null; after: Gap | null } {
  if (!items.length || !day.start || !day.end) return { before: null, after: null };
  const first = startOf(items[0]);
  const last = items.reduce((m, it) => (ms(endOf(it)) > ms(m) ? endOf(it) : m), endOf(items[0]));
  const before =
    dates.minDate != null && day.date > dates.minDate && (ms(first) - ms(day.start)) / 1000 >= MIN_GAP_S
      ? { from: day.start, to: first }
      : null;
  const after =
    dates.maxDate != null &&
    day.date < dates.maxDate &&
    ms(day.end) <= now &&
    (ms(day.end) - ms(last)) / 1000 >= MIN_GAP_S
      ? { from: last, to: day.end }
      : null;
  return { before, after };
}

/** A change of place farther than this with no trip between is "Missing travel". */
export const MISSING_TRAVEL_M = 500;

export type MissingTravel = {
  /** When the earlier item ended and the later one started (ISO). */
  from: string;
  to: string;
  /** Straight-line metres from where the earlier item ended to where the later one started. */
  distance: number;
  secs: number;
  fromPos: { lat: number; lon: number };
  toPos: { lat: number; lon: number };
};

type Pos = { lat: number; lon: number } | null;
const ok = (p: { lat?: number | null; lon?: number | null } | undefined): Pos =>
  p && typeof p.lat === "number" && typeof p.lon === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lon)
    ? { lat: p.lat, lon: p.lon }
    : null;
const endPos = (it: TimelineItem): Pos => (it.kind === "visit" ? ok(it.visit) : ok(it.track.to));
const startPos = (it: TimelineItem): Pos => (it.kind === "visit" ? ok(it.visit) : ok(it.track.from));

function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Travel the timeline can't account for: two consecutive items (no trip
 * between them) where the later one starts more than MISSING_TRAVEL_M from
 * where the earlier one ended, e.g. a "No location recorded" hole that ends
 * somewhere else, or two visits far apart. The timeline offers "Add travel".
 */
export function missingTravel(a: TimelineItem, b: TimelineItem): MissingTravel | null {
  const fromPos = endPos(a);
  const toPos = startPos(b);
  if (!fromPos || !toPos) return null;
  const distance = metres(fromPos, toPos);
  if (distance <= MISSING_TRAVEL_M) return null;
  const from = endOf(a);
  // Overlapping items (rare): an instant, not a negative span.
  const to = ms(startOf(b)) < ms(from) ? from : startOf(b);
  const secs = (ms(to) - ms(from)) / 1000;
  if (!Number.isFinite(secs)) return null;
  return { from, to, distance: Math.round(distance), secs, fromPos, toPos };
}
