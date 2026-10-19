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
