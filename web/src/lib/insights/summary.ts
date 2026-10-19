// Distance and time per travel mode, for a day or a month. Pure: the loaders in
// ./load.ts fetch the moves; everything here is plain arithmetic.

import type { ModeKey } from "../modes";
import { addMonths, dayBounds, localMonth, monthBounds } from "./time";

/** One trip (a move between visits), with the mode as displayed. */
export type Move = {
  /** Epoch ms. */
  start: number;
  end: number;
  /** Metres. */
  distance: number;
  /** Display mode (transit legs already applied, see lib/transit/run.ts displayMode). */
  mode: string;
};

/** Modes in the order summaries list them (same family order as Google's). */
export const SUMMARY_MODES: ModeKey[] = [
  "walking",
  "running",
  "cycling",
  "driving",
  "motorcycle",
  "bus",
  "tram",
  "metro",
  "train",
  "boat",
  "flying",
  "unknown",
];

/** Modes that aren't travel: never summed. */
const IGNORED = new Set(["stationary"]);

export type ModeTotal = {
  mode: ModeKey;
  /** Metres. */
  distance: number;
  /** Seconds. */
  duration: number;
  /** Moves touching the window. */
  count: number;
};

export type Summary = {
  /** Metres, all modes. */
  distance: number;
  /** Seconds, all modes. */
  duration: number;
  /** Modes with any travel, largest distance first. */
  modes: ModeTotal[];
};

function normalMode(mode: string): ModeKey {
  return (SUMMARY_MODES as string[]).includes(mode) ? (mode as ModeKey) : "unknown";
}

/**
 * The part of a move inside [from, to): its share of the time, applied to the
 * distance too (a night train crossing midnight counts on both days).
 */
export function clip(m: Move, from: number, to: number): { distance: number; duration: number } | null {
  const s = Math.max(m.start, from);
  const e = Math.min(m.end, to);
  if (e <= s) {
    // A zero-length move at the window's start still belongs to it.
    if (m.end === m.start && m.start >= from && m.start < to) return { distance: m.distance, duration: 0 };
    return null;
  }
  const total = m.end - m.start;
  const f = total > 0 ? (e - s) / total : 1;
  return { distance: m.distance * f, duration: (e - s) / 1000 };
}

/** Distance and time per mode of `moves` within [from, to). */
export function summarize(moves: Move[], from: number, to: number): Summary {
  const by = new Map<ModeKey, ModeTotal>();
  for (const m of moves) {
    if (IGNORED.has(m.mode)) continue;
    const c = clip(m, from, to);
    if (!c) continue;
    const mode = normalMode(m.mode);
    const t = by.get(mode) ?? { mode, distance: 0, duration: 0, count: 0 };
    t.distance += c.distance;
    t.duration += c.duration;
    t.count++;
    by.set(mode, t);
  }
  const modes = [...by.values()]
    .map((t) => ({ ...t, distance: Math.round(t.distance), duration: Math.round(t.duration) }))
    .sort((a, b) => b.distance - a.distance || b.duration - a.duration);
  return {
    distance: modes.reduce((a, t) => a + t.distance, 0),
    duration: modes.reduce((a, t) => a + t.duration, 0),
    modes,
  };
}

/** One local day's summary (for the timeline's strip). */
export function daySummary(moves: Move[], date: string, tz: string): Summary & { date: string } {
  const [from, to] = dayBounds(date, tz);
  return { date, ...summarize(moves, from, to) };
}

export type MonthPoint = { month: string; distance: number; duration: number };

export type MonthModes = {
  month: string;
  distance: number;
  duration: number;
  /** Every mode used in the month or in the history window, in SUMMARY_MODES order. */
  modes: (ModeTotal & { history: MonthPoint[] })[];
  /** Months covered by `history`, oldest first, ending with `month`. */
  historyMonths: string[];
  /** Earliest and latest month that have travel, for the picker. */
  firstMonth: string | null;
  lastMonth: string | null;
};

/**
 * Per-mode totals for `month`, with the last `historyLen` months (ending at
 * `month`) for each mode's small bar history.
 */
export function monthModes(moves: Move[], month: string, tz: string, historyLen = 6): MonthModes {
  const historyMonths = Array.from({ length: historyLen }, (_, i) => addMonths(month, i - historyLen + 1));
  const sums = historyMonths.map((m) => {
    const [from, to] = monthBounds(m, tz);
    return summarize(moves, from, to);
  });
  const current = sums[sums.length - 1];
  const used = new Set(sums.flatMap((s) => s.modes.map((t) => t.mode)));
  const modes = SUMMARY_MODES.filter((m) => used.has(m)).map((mode) => {
    const t = current.modes.find((x) => x.mode === mode) ?? { mode, distance: 0, duration: 0, count: 0 };
    return {
      ...t,
      history: historyMonths.map((m, i) => {
        const h = sums[i].modes.find((x) => x.mode === mode);
        return { month: m, distance: h?.distance ?? 0, duration: h?.duration ?? 0 };
      }),
    };
  });
  let first: number | null = null;
  let last: number | null = null;
  for (const m of moves) {
    if (IGNORED.has(m.mode)) continue;
    if (first == null || m.start < first) first = m.start;
    if (last == null || m.start > last) last = m.start;
  }
  return {
    month,
    distance: current.distance,
    duration: current.duration,
    modes,
    historyMonths,
    firstMonth: first == null ? null : localMonth(first, tz),
    lastMonth: last == null ? null : localMonth(last, tz),
  };
}
