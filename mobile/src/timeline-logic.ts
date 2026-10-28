// What the timeline shows between and inside its rows (pure, unit-tested in
// __tests__/timeline-logic.test.ts). Same rules as the web timeline
// (web/src/components/timeline/Timeline.tsx).

import { categoryLabel } from "./design/categories";
import { KIND_META } from "./insights-logic";
import type { LatLon, Leg, Move, SavedKind, TimelineItem } from "./viewer";

/** Shorter silences are the phone lying still or a short tunnel, not worth a row. */
export const MIN_GAP_S = 30 * 60;
/** A gap between two rides shorter than this is just getting off and on. */
export const MIN_CHANGE_S = 3 * 60;

const ms = (iso: string) => Date.parse(iso);
const startOf = (it: TimelineItem) => (it.kind === "visit" ? it.visit.startedAt : it.track.startedAt);
const endOf = (it: TimelineItem) => (it.kind === "visit" ? it.visit.endedAt : it.track.endedAt);

export type Gap = { from: string; to: string; secs: number };

/**
 * Time between two items with nothing recorded (location recording off). The
 * server doesn't stretch a visit or invent a move across such a hole, so the
 * timeline says so instead of leaving the jump unexplained.
 */
export function gapBetween(a: TimelineItem, b: TimelineItem): Gap | null {
  const from = endOf(a);
  const to = startOf(b);
  const secs = (ms(to) - ms(from)) / 1000;
  return Number.isFinite(secs) && secs >= MIN_GAP_S ? { from, to, secs } : null;
}

export type SubRow = { kind: "leg"; leg: Leg } | { kind: "wait"; stop: string | null; secs: number };

/**
 * The rides of a move and the transfers between them, in order: "Waited at
 * Kamppi" where the server saw a wait at a stop, else "Change" when the next
 * ride starts a while after the last one ended. Legs without times (older
 * server) keep their order and get no transfers.
 */
export function subRows(track: Pick<Move, "legs" | "waits" | "startedAt">): SubRow[] {
  const legs = track.legs;
  const waits = [...track.waits].sort((a, b) => ms(a.startedAt) - ms(b.startedAt));
  if (legs.some((l) => !l.startedAt || !l.endedAt)) return legs.map((leg) => ({ kind: "leg", leg }));
  const rows: { at: number; i: number; row: SubRow }[] = waits.map((w, i) => ({
    at: ms(w.startedAt),
    i,
    row: { kind: "wait", stop: w.stop, secs: Math.max(0, (ms(w.endedAt) - ms(w.startedAt)) / 1000) },
  }));
  legs.forEach((leg, i) => {
    const start = ms(leg.startedAt!);
    rows.push({ at: start, i: 100 + i, row: { kind: "leg", leg } });
    if (i === 0) return;
    const from = ms(legs[i - 1].endedAt!);
    const waited = waits.some((w) => ms(w.endedAt) > from && ms(w.startedAt) < start);
    if (!waited && (start - from) / 1000 >= MIN_CHANGE_S) {
      rows.push({ at: from, i: 50 + i, row: { kind: "wait", stop: null, secs: (start - from) / 1000 } });
    }
  });
  // A wait sorts before a ride starting at the same moment.
  return rows
    .sort((a, b) => a.at - b.at || (a.row.kind === "wait" ? -1 : 0) - (b.row.kind === "wait" ? -1 : 0) || a.i - b.i)
    .map((r) => r.row);
}

/**
 * The days with data before and after `date` (YYYY-MM-DD; `dates` ascending).
 * `date` itself needn't have data: a day opened from a trip may be a quiet one.
 */
export function adjacentDays(dates: readonly string[], date: string | null): { prev: string | null; next: string | null } {
  if (!date) return { prev: null, next: null };
  let prev: string | null = null;
  let next: string | null = null;
  for (const d of dates) {
    if (d < date) prev = d;
    else if (d > date && next == null) next = d;
  }
  return { prev, next };
}

/** The id a row shares with its stop or line on the day map: "v-<visit id>" or "m-<trip id>". */
export function selectionKey(it: TimelineItem): string {
  return it.kind === "visit" ? `v-${it.visit.id}` : `m-${it.track.id}`;
}

/** Whether the day map has anything to draw (same rule as the web's dayHasMap). */
export function dayHasMap(items: TimelineItem[]): boolean {
  return items.some((it) => (it.kind === "visit" ? it.visit.lat != null && it.visit.lon != null : it.track.mode !== "stationary"));
}

/** A change of place farther than this with no move between is "Missing travel". */
export const MISSING_TRAVEL_M = 500;

export type MissingTravel = { from: string; to: string; distance: number; secs: number; fromPos: LatLon; toPos: LatLon };

const pos = (lat: number | null | undefined, lon: number | null | undefined): LatLon | null =>
  typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
const endPos = (it: TimelineItem) => (it.kind === "visit" ? pos(it.visit.lat, it.visit.lon) : (it.track.to ?? null));
const startPos = (it: TimelineItem) => (it.kind === "visit" ? pos(it.visit.lat, it.visit.lon) : (it.track.from ?? null));

/** Straight-line metres. */
export function metres(a: LatLon, b: LatLon): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Travel the timeline can't account for (same rule as the web's gaps.ts
 * missingTravel): two consecutive rows where the later one starts more than
 * MISSING_TRAVEL_M from where the earlier one ended. The timeline offers
 * "Add travel".
 */
export function missingTravel(a: TimelineItem, b: TimelineItem): MissingTravel | null {
  const fromPos = endPos(a);
  const toPos = startPos(b);
  if (!fromPos || !toPos) return null;
  const distance = metres(fromPos, toPos);
  if (distance <= MISSING_TRAVEL_M) return null;
  const from = endOf(a);
  const to = ms(startOf(b)) < ms(from) ? from : startOf(b);
  const secs = (ms(to) - ms(from)) / 1000;
  if (!Number.isFinite(secs)) return null;
  return { from, to, distance: Math.round(distance), secs, fromPos, toPos };
}

/** The move "Add travel" opens the editor with: the missing stretch, as a first guess walking or driving. */
export function addedMove(m: MissingTravel): Move {
  return {
    id: 0,
    startedAt: m.from,
    endedAt: m.to,
    distance: m.distance,
    duration: m.secs,
    mode: m.distance < 2500 ? "walking" : "driving",
    legs: [],
    waits: [],
    correctionId: null,
    added: true,
    from: m.fromPos,
    to: m.toPos,
  };
}

/**
 * What kind of place a visit's meta line names: a saved kind wins over the
 * place's category ("School", never the geocoder's "Library"); a place saved
 * as "Other" names nothing. Null as well when it would only repeat `title`.
 * Same precedence as the web (Timeline.tsx shows the kind, places/category.ts).
 */
export function visitTypeLabel(kind: SavedKind | null | undefined, category: string | null | undefined, title: string): string | null {
  const label = kind ? (kind === "other" ? null : KIND_META[kind].label) : category ? categoryLabel(category) : null;
  return label && label !== title ? label : null;
}
