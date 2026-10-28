// The user's fixes for a trip's mode and public transport lines ("Fix this
// trip"). Stored by time range in trip_corrections (migration 018), because
// trips are rebuilt on reprocessing, and applied when trips are read: a
// correction covers any trip it overlaps for at least CORRECTION_OVERLAP of
// that trip's duration (the newest one wins). Every place that shows a trip's
// mode goes through here: the timeline (applyCorrection), and the SQL used by
// the map and the insights (lib/transit/run.ts displayModeJoin/Sql).
//
// A row with `added` is a trip the user added where none was recorded
// ("Missing travel" → "Add travel" on the timeline): it carries its own ends
// and length, and is shown (and counted in the insights) as a trip of its own
// while no detected trip takes it over by the same overlap rule.

import { q, tx } from "./db";
import type { ModeKey } from "./modes";
import type { TransitLeg } from "./types";
import type { ClaimedLeg, EstimatedLeg } from "./transit/diagnose";
import type { TransitKind } from "./transit/match";

export const CORRECTION_OVERLAP = 0.7;

/** Modes the editor offers, in its order. */
export const CORRECTABLE_MODES = [
  "walking",
  "running",
  "cycling",
  "driving",
  "bus",
  "tram",
  "metro",
  "train",
  "boat",
  "flying",
] as const satisfies readonly ModeKey[];
export type CorrectableMode = (typeof CORRECTABLE_MODES)[number];

const LEG_KINDS = ["bus", "tram", "metro", "train", "boat"] as const satisfies readonly TransitKind[];
const MAX_LEGS = 6;
const MAX_TRIP_S = 48 * 3600;

export type LatLon = { lat: number; lon: number };

export type Correction = {
  id: number;
  startedAt: string;
  endedAt: string;
  mode: CorrectableMode;
  legs: TransitLeg[];
  /** A trip the user added (with its ends and straight-line metres), not a fix of a detected one. */
  added?: { from: LatLon; to: LatLon; distance: number };
};

/** How much of [s, e) the correction covers (0..1); a zero-length trip counts when inside it. */
export function overlapShare(trip: { start: number; end: number }, c: { start: number; end: number }): number {
  const dur = trip.end - trip.start;
  if (dur <= 0) return c.start <= trip.start && c.end >= trip.end ? 1 : 0;
  return Math.max(0, Math.min(trip.end, c.end) - Math.max(trip.start, c.start)) / dur;
}

const ms = (iso: string) => new Date(iso).getTime();

/** The correction for this trip (times in ms), if any: the newest one covering enough of it. */
export function correctionFor<C extends { id: number; startedAt: string; endedAt: string }>(
  trip: { start: number; end: number },
  corrections: C[],
): C | null {
  let best: C | null = null;
  for (const c of corrections)
    if (overlapShare(trip, { start: ms(c.startedAt), end: ms(c.endedAt) }) >= CORRECTION_OVERLAP && (!best || c.id > best.id)) best = c;
  return best;
}

/**
 * What the timeline shows for a trip with this correction: its mode, and its
 * legs (the corrected rides; none for walking, cycling...; when the user gave
 * no lines for a transit mode, the matched legs of that kind are kept).
 */
export function applyCorrection(
  matchedMode: string,
  matchedLegs: TransitLeg[],
  c: Pick<Correction, "id" | "mode" | "legs"> | null,
): { mode: string; legs: TransitLeg[]; correctionId: number | null } {
  if (!c) return { mode: matchedMode, legs: matchedLegs, correctionId: null };
  const legs = c.legs.length ? c.legs : matchedLegs.filter((l) => l.kind === c.mode);
  return { mode: c.mode, legs, correctionId: c.id };
}

/**
 * The SQL condition "correction c applies to trip t" (aliases as given), the
 * same rule as correctionFor.
 */
export const correctionMatchSql = (c: string, t: string) =>
  `${c}.user_id = ${t}.user_id AND ${c}.started_at <= ${t}.ended_at AND ${c}.ended_at >= ${t}.started_at
   AND (CASE WHEN ${t}.ended_at > ${t}.started_at
             THEN extract(epoch FROM LEAST(${c}.ended_at, ${t}.ended_at) - GREATEST(${c}.started_at, ${t}.started_at))
                  >= ${CORRECTION_OVERLAP} * extract(epoch FROM ${t}.ended_at - ${t}.started_at)
             ELSE ${c}.started_at <= ${t}.started_at AND ${c}.ended_at >= ${t}.ended_at END)`;

/** The corrected mode of trip `t` (or NULL), for a LEFT JOIN LATERAL ... AS alias ON true. */
export const correctionJoin = (alias: string, t = "t") => `LEFT JOIN LATERAL (
       SELECT c.mode FROM trip_corrections c WHERE ${correctionMatchSql("c", t)}
       ORDER BY c.id DESC LIMIT 1
     ) ${alias} ON true`;

/** Changes whenever the user's corrections do (for cache keys). */
export const correctionsStampSql = (userParam: string) =>
  `(SELECT count(*) || ':' || COALESCE(max(id), 0) FROM trip_corrections WHERE user_id = ${userParam})`;

/**
 * The user-added trips that stand on their own: those no detected trip takes
 * over (no trip they cover CORRECTION_OVERLAP of). Times in ms.
 */
export function freeAddedTrips<C extends Pick<Correction, "id" | "startedAt" | "endedAt" | "added">>(
  corrections: C[],
  trips: { start: number; end: number }[],
): (C & { added: NonNullable<Correction["added"]> })[] {
  return corrections.filter(
    (c): c is C & { added: NonNullable<Correction["added"]> } =>
      c.added != null &&
      !trips.some((t) => overlapShare(t, { start: ms(c.startedAt), end: ms(c.endedAt) }) >= CORRECTION_OVERLAP),
  );
}

/**
 * The user's added trips in [from, to) that stand on their own, as insight
 * moves (ms, metres, mode): the insights and day summaries add these to the
 * detected trips (lib/insights/load.ts loadMoves).
 */
export async function loadAddedMoves(
  userId: string,
  from?: number,
  to?: number,
): Promise<{ start: number; end: number; distance: number; mode: string }[]> {
  const rows = await q<{ s: number; e: number; distance: number | null; mode: string }>(
    `SELECT extract(epoch FROM c.started_at)::float8 * 1000 AS s, extract(epoch FROM c.ended_at)::float8 * 1000 AS e,
            c.distance_m::float8 AS distance, c.mode
     FROM trip_corrections c
     WHERE c.user_id = $1 AND c.added
       AND ($2::timestamptz IS NULL OR c.ended_at >= $2) AND ($3::timestamptz IS NULL OR c.started_at < $3)
       AND NOT EXISTS (SELECT 1 FROM trips t WHERE ${correctionMatchSql("c", "t")})
     ORDER BY c.started_at`,
    [userId, from != null ? new Date(from) : null, to != null ? new Date(to) : null],
  );
  return rows.map((r) => ({ start: r.s, end: r.e, distance: r.distance ?? 0, mode: r.mode }));
}

// ---- input ------------------------------------------------------------------

export type CorrectionInput = {
  startedAt: number;
  endedAt: number;
  mode: CorrectableMode;
  legs: ClaimedLeg[];
  /** "Add travel": where the trip went from and to (a straight line). */
  added?: { from: LatLon; to: LatLon };
};

const latLon = (v: unknown): LatLon | null => {
  if (!isObj(v)) return null;
  const { lat, lon } = v;
  return typeof lat === "number" && typeof lon === "number" && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
};

/** Straight-line metres between two points. */
export function metresBetween(a: LatLon, b: LatLon): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Validates POST /api/corrections. Times: ISO strings; legs only with a
 * transit mode; `added: true` with `from` and `to` ({lat, lon}) adds a trip.
 */
export function parseCorrection(body: unknown): CorrectionInput | { error: string } {
  if (!isObj(body)) return { error: "body must be a JSON object" };
  const s = typeof body.startedAt === "string" ? Date.parse(body.startedAt) : NaN;
  const e = typeof body.endedAt === "string" ? Date.parse(body.endedAt) : NaN;
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return { error: "startedAt and endedAt must be ISO times, in order" };
  if ((e - s) / 1000 > MAX_TRIP_S) return { error: "a trip can't be longer than 48 hours" };
  if (!(CORRECTABLE_MODES as readonly unknown[]).includes(body.mode)) {
    return { error: `mode must be one of ${CORRECTABLE_MODES.join(", ")}` };
  }
  const mode = body.mode as CorrectableMode;
  const raw = body.legs ?? [];
  if (!Array.isArray(raw) || raw.length > MAX_LEGS) return { error: `legs must be a list of at most ${MAX_LEGS}` };
  const legs: ClaimedLeg[] = [];
  for (const l of raw) {
    if (!isObj(l) || !(LEG_KINDS as readonly unknown[]).includes(l.kind)) return { error: "each leg needs a kind: bus, tram, metro, train or boat" };
    const line = typeof l.line === "string" ? l.line.trim() : "";
    if (!line || line.length > 16) return { error: "each leg needs a line name" };
    const stop = typeof l.transferStop === "string" ? l.transferStop.trim().slice(0, 80) : "";
    legs.push({ kind: l.kind as TransitKind, line, transferStop: stop || null });
  }
  if (legs.length && !(LEG_KINDS as readonly string[]).includes(mode)) return { error: "lines can only be given for public transport" };
  // No transfer after the last ride.
  if (legs.length) legs[legs.length - 1].transferStop = null;
  if (body.added === true) {
    const from = latLon(body.from);
    const to = latLon(body.to);
    if (!from || !to) return { error: "an added trip needs from and to as {lat, lon}" };
    return { startedAt: s / 1000, endedAt: e / 1000, mode, legs, added: { from, to } };
  }
  return { startedAt: s / 1000, endedAt: e / 1000, mode, legs };
}

// ---- database ---------------------------------------------------------------

type Row = {
  id: string;
  started_at: Date;
  ended_at: Date;
  mode: string;
  legs: EstimatedLeg[];
  added: boolean;
  from_lat: number | null;
  from_lon: number | null;
  to_lat: number | null;
  to_lon: number | null;
  distance_m: number | null;
};
const COLS = `id, started_at, ended_at, mode, legs, added, from_lat, from_lon, to_lat, to_lon, distance_m`;

const toCorrection = (r: Row): Correction => ({
  id: Number(r.id),
  startedAt: r.started_at.toISOString(),
  endedAt: r.ended_at.toISOString(),
  mode: r.mode as CorrectableMode,
  legs: (r.legs ?? []).map((l) => ({ ...l, kind: l.kind as TransitLeg["kind"] })),
  ...(r.added && r.from_lat != null && r.from_lon != null && r.to_lat != null && r.to_lon != null
    ? {
        added: {
          from: { lat: r.from_lat, lon: r.from_lon },
          to: { lat: r.to_lat, lon: r.to_lon },
          distance: Math.round(r.distance_m ?? 0),
        },
      }
    : {}),
});

/** The user's corrections touching [from, to). */
export async function loadCorrections(userId: string, from: Date, to: Date): Promise<Correction[]> {
  const rows = await q<Row>(
    `SELECT ${COLS} FROM trip_corrections
     WHERE user_id = $1 AND started_at < $3 AND ended_at > $2 ORDER BY id`,
    [userId, from, to],
  );
  return rows.map(toCorrection);
}

/**
 * Stores a correction, replacing the user's earlier ones for the same trip (any
 * that the new one or that cover each other by CORRECTION_OVERLAP).
 */
export async function saveCorrection(
  userId: string,
  input: CorrectionInput,
  legs: EstimatedLeg[],
  diagnostics: unknown,
): Promise<Correction> {
  return tx(async (c) => {
    const old = await c.query<{ id: string; started_at: Date; ended_at: Date }>(
      `SELECT id, started_at, ended_at FROM trip_corrections WHERE user_id = $1 AND started_at < to_timestamp($3) AND ended_at > to_timestamp($2)`,
      [userId, input.startedAt, input.endedAt],
    );
    const mine = { start: input.startedAt * 1000, end: input.endedAt * 1000 };
    const replaced = old.rows
      .filter((r) => {
        const o = { start: r.started_at.getTime(), end: r.ended_at.getTime() };
        return overlapShare(mine, o) >= CORRECTION_OVERLAP || overlapShare(o, mine) >= CORRECTION_OVERLAP;
      })
      .map((r) => r.id);
    if (replaced.length) await c.query(`DELETE FROM trip_corrections WHERE id = ANY($1::bigint[])`, [replaced]);
    const a = input.added;
    const { rows } = await c.query<Row>(
      `INSERT INTO trip_corrections (user_id, started_at, ended_at, mode, legs, diagnostics,
                                     added, from_lat, from_lon, to_lat, to_lon, distance_m)
       VALUES ($1, to_timestamp($2), to_timestamp($3), $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${COLS}`,
      [
        userId,
        input.startedAt,
        input.endedAt,
        input.mode,
        JSON.stringify(legs),
        diagnostics == null ? null : JSON.stringify(diagnostics),
        a != null,
        a?.from.lat ?? null,
        a?.from.lon ?? null,
        a?.to.lat ?? null,
        a?.to.lon ?? null,
        a ? metresBetween(a.from, a.to) : null,
      ],
    );
    return toCorrection(rows[0]);
  });
}

/** Undo: removes one of the user's corrections. False when there was none. */
export async function deleteCorrection(userId: string, id: number): Promise<boolean> {
  const rows = await q(`DELETE FROM trip_corrections WHERE user_id = $1 AND id = $2 RETURNING id`, [userId, id]);
  return rows.length > 0;
}
