// "Fix this trip" (Timeline): the editor's draft and what it sends to
// POST /api/corrections. Pure, so it is unit-tested.

import { LEG_KINDS, type CorrectionBody, type LegKind, type Mode, type Move } from "./viewer";

/** Modes the editor offers, in its order (same as the web editor). */
export const FIX_MODES = ["walking", "running", "cycling", "driving", "bus", "tram", "metro", "train", "boat", "flying"] as const satisfies readonly Mode[];
export type FixMode = (typeof FIX_MODES)[number];

export type DraftLeg = { kind: LegKind; line: string; transferStop: string };
export type Draft = { mode: FixMode; legs: DraftLeg[] };

export const isTransit = (m: string): m is LegKind => (LEG_KINDS as readonly string[]).includes(m);

/** Starts from what the timeline shows: its mode and the rides on it. */
export function draftFromMove(m: Move): Draft {
  const mode = (FIX_MODES as readonly string[]).includes(m.mode) ? (m.mode as FixMode) : "bus";
  return {
    mode,
    legs: m.legs.map((l, i) => ({ kind: l.kind, line: l.lines[0], transferStop: i < m.legs.length - 1 ? (l.toStop ?? "") : "" })),
  };
}

/** Adds a ride at the end; picking a line for a non-transit trip switches the mode to it. */
export function addLeg(d: Draft, kind: LegKind, line: string): Draft {
  return { mode: isTransit(d.mode) ? d.mode : kind, legs: [...d.legs, { kind, line, transferStop: "" }] };
}

export function removeLeg(d: Draft, i: number): Draft {
  return { ...d, legs: d.legs.filter((_, k) => k !== i) };
}

/** Swaps ride i with the one before it. */
export function moveUp(d: Draft, i: number): Draft {
  if (i <= 0 || i >= d.legs.length) return d;
  const legs = [...d.legs];
  [legs[i - 1], legs[i]] = [legs[i], legs[i - 1]];
  return { ...d, legs };
}

export function setTransfer(d: Draft, i: number, stop: string): Draft {
  return { ...d, legs: d.legs.map((l, k) => (k === i ? { ...l, transferStop: stop } : l)) };
}

/**
 * The request body: rides only for public transport, no transfer after the
 * last one; a trip the user adds ("Add travel") also says where it went.
 */
export function correctionBody(m: Pick<Move, "startedAt" | "endedAt" | "added" | "from" | "to">, d: Draft): CorrectionBody {
  const legs = isTransit(d.mode) ? d.legs : [];
  return {
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    mode: d.mode,
    legs: legs.map((l, i) => ({ kind: l.kind, line: l.line, transferStop: i < legs.length - 1 ? l.transferStop.trim() || null : null })),
    ...(m.added && m.from && m.to ? { added: true as const, from: m.from, to: m.to } : {}),
  };
}
