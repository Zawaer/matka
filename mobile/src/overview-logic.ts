// Overview → Recent visits: the server's latest visits as rows under day
// headings. Pure, so it is unit-tested.

import { fmtDayHeading, isNamed, localDateOf } from "./format";
import type { Overview } from "./viewer";

type Recent = Overview["recent"][number];

export type RecentRow = {
  key: string;
  placeId: number;
  name: string | null;
  startedAt: string;
  /** Null while the visit is still going on. */
  endedAt: string | null;
  duration: number | null;
};

export type RecentDay = { day: string; date: string; rows: RecentRow[] };

/** Back-to-back visits to one place (≤ 15 min apart) read as one stay. */
const JOIN_GAP_S = 15 * 60;
/** A short stop at a place with no name is noise in a summary. */
const MIN_UNNAMED_S = 30 * 60;

const endOf = (v: Recent): string | null => (v.duration ? new Date(Date.parse(v.startedAt) + v.duration * 1000).toISOString() : null);

/**
 * Newest first, grouped by the local day the visit started (an overnight stay
 * sits under its evening). Consecutive visits to the same place on the same
 * day are joined; unnamed visits under 30 min are left out.
 */
export function recentDays(recent: Recent[], now = new Date()): RecentDay[] {
  const rows: RecentRow[] = [];
  const seen = new Set<number>();
  for (const v of recent) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    if (!isNamed(v.name) && (v.duration ?? 0) < MIN_UNNAMED_S && v.duration != null) continue;
    const row: RecentRow = { key: String(v.id), placeId: v.placeId, name: v.name, startedAt: v.startedAt, endedAt: endOf(v), duration: v.duration };
    const prev = rows[rows.length - 1];
    // `prev` is the later visit (newest first): join when this one ends right before it starts.
    if (
      prev &&
      prev.placeId === row.placeId &&
      localDateOf(prev.startedAt) === localDateOf(row.startedAt) &&
      row.endedAt &&
      (Date.parse(prev.startedAt) - Date.parse(row.endedAt)) / 1000 <= JOIN_GAP_S
    ) {
      prev.startedAt = row.startedAt;
      prev.duration = prev.endedAt ? (Date.parse(prev.endedAt) - Date.parse(row.startedAt)) / 1000 : null;
      continue;
    }
    rows.push(row);
  }
  const days: RecentDay[] = [];
  for (const r of rows) {
    const date = localDateOf(r.startedAt) ?? "";
    const last = days[days.length - 1];
    if (last && last.date === date) last.rows.push(r);
    else days.push({ day: fmtDayHeading(new Date(r.startedAt), now), date, rows: [r] });
  }
  return days;
}
