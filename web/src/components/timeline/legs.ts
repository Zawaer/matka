// The rides of a public-transport trip and the transfers between them, in
// order, for the timeline's travel rows. Pure, so it is tested.

import type { TrackSummary, TransitLeg } from "@/lib/types";

/** A gap between two rides shorter than this is just getting off and on. */
export const MIN_CHANGE_S = 3 * 60;

/** A transfer the server folded into the trip (lib/processing/detect.ts). */
export type Wait = { startedAt: string; endedAt: string; stop: string | null };
export type SubRow = { kind: "leg"; leg: TransitLeg } | { kind: "wait"; stop: string | null; secs: number };

const ms = (iso: string) => new Date(iso).getTime();

/**
 * Ride, wait, ride…: a wait only ever sits *between* two rides. Between
 * consecutive rides it is "Waited at Kamppi" when the server saw a wait at a
 * stop there, else "Change" when the next ride starts a while after the last
 * one ended. Waits before the first ride or after the last are left out.
 */
export function subRows(track: TrackSummary & { waits?: Wait[] }): SubRow[] {
  const legs = [...(track.legs ?? [])].sort((a, b) => ms(a.startedAt) - ms(b.startedAt));
  const waits = [...(track.waits ?? [])].sort((a, b) => ms(a.startedAt) - ms(b.startedAt));
  const rows: SubRow[] = [];
  legs.forEach((leg, i) => {
    if (i > 0) {
      const from = ms(legs[i - 1].endedAt);
      const to = ms(leg.startedAt);
      const inside = waits.filter((w) => ms(w.endedAt) > from && ms(w.startedAt) < to);
      if (inside.length) {
        for (const w of inside) rows.push({ kind: "wait", stop: w.stop, secs: (ms(w.endedAt) - ms(w.startedAt)) / 1000 });
      } else if ((to - from) / 1000 >= MIN_CHANGE_S) {
        rows.push({ kind: "wait", stop: null, secs: (to - from) / 1000 });
      }
    }
    rows.push({ kind: "leg", leg });
  });
  return rows;
}
