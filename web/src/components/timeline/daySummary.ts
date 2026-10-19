// The timeline's per-day summary strip: which modes to show, in what order.
// Pure, so it is unit-tested (daySummary.test.ts).

import type { ModeKey } from "@/lib/modes";

/** GET /api/day-summary (lib/insights/summary.ts daySummary). */
export type DaySummary = {
  date: string;
  /** Metres, all modes. */
  distance: number;
  /** Seconds, all modes. */
  duration: number;
  modes: { mode: ModeKey; distance: number; duration: number; count: number }[];
};

export type StripMode = DaySummary["modes"][number];

/** Chips shown before the rest fold into "+N". */
export const STRIP_MAX = 4;

/**
 * Modes worth a chip (any distance or time), largest distance first, then
 * longest time; split into what fits and what folds into "+N".
 */
export function stripModes(
  summary: Pick<DaySummary, "modes"> | null | undefined,
  max = STRIP_MAX,
): { visible: StripMode[]; hidden: StripMode[] } {
  const modes = (summary?.modes ?? [])
    .filter((m) => m.mode !== "stationary" && (m.distance > 0 || m.duration > 0))
    .sort((a, b) => b.distance - a.distance || b.duration - a.duration);
  // "+1" would take the same room as the chip it hides.
  const cut = modes.length === max + 1 ? modes.length : max;
  return { visible: modes.slice(0, cut), hidden: modes.slice(cut) };
}
