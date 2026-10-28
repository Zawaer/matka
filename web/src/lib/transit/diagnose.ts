// What a trip's points and the matcher show, for a trip the user corrected
// ("Fix this trip"): how sparse and coarse the fixes were, what the matcher
// found, and per line the user says they rode how close the fixes stayed to
// it and why the matcher didn't take it. Logged as one line and stored with
// the correction, so wrong matches can be understood later. Also estimates
// when each claimed ride happened, for showing the corrected legs. Pure, and
// never outputs coordinates (stop and line names only).

import {
  MATCHER_VERSION,
  MAX_FIX_ACCURACY_M, TransitIndex, matchLegs, type Leg, type MatchTrace, type TrackPoint, type TransitKind } from "./match";

export type DiagPoint = TrackPoint & { source?: string | null; activity?: string | null };

/** One ride the user says they took, in order; transferStop: where they changed after it. */
export type ClaimedLeg = { kind: TransitKind; line: string; transferStop?: string | null };

export type LineDiagnostics = {
  kind: TransitKind;
  line: string;
  /** Share (0..1) of the fixes in the stretch attributed to this ride within 60 / 150 m of the line, going its way. */
  near60: number;
  near150: number;
  /** That stretch, minutes from the start of the trip. */
  fromMin: number | null;
  toMin: number | null;
  /** "matched", or why the matcher didn't take it. */
  verdict: string;
};

export type TripDiagnostics = {
  matcher: string;
  points: number;
  /** Fixes the matcher used (accuracy known and at most MAX_FIX_ACCURACY_M, or unknown). */
  usable: number;
  sources: Record<string, number>;
  activities: Record<string, number>;
  medianGapS: number | null;
  maxGapS: number | null;
  /** The longest time without a fix, and how far into the trip it started. */
  longestGap: { s: number; atMin: number } | null;
  /** Share of fixes with accuracy over 100 m. */
  coarseShare: number;
  avgKmh: number | null;
  detectorMode: string;
  shownMode: string;
  /** Legs the matcher finds now, e.g. "bus 159/171 Järvisilta→Matinkylä (M)". */
  matched: string[];
  claimed: LineDiagnostics[];
};

/** A corrected ride as stored and served (lib/types.ts TransitLeg). */
export type EstimatedLeg = {
  kind: TransitKind;
  lines: string[];
  fromStop: string | null;
  toStop: string | null;
  startedAt: string;
  endedAt: string;
  distance: number;
};

export type TripInfo = { start: number; end: number; distanceM: number; detectorMode: string; shownMode: string };

const COARSE_M = 100;
const RAIL_NEAR_M = 300;

function dist(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const x = ((((bLon - aLon) * Math.PI) / 180) * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180));
  const y = ((bLat - aLat) * Math.PI) / 180;
  return 6_371_000 * Math.hypot(x, y);
}

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const count = (xs: (string | null | undefined)[]) => {
  const out: Record<string, number> = {};
  for (const x of xs) out[x ?? "none"] = (out[x ?? "none"] ?? 0) + 1;
  return out;
};

const minutes = (ts: number, start: number) => Math.round((ts - start) / 60);
const iso = (ts: number) => new Date(ts * 1000).toISOString();

/** Longest non-decreasing run (not necessarily contiguous) of these positions along a shape. */
function forwardCount(along: number[]): number {
  const tails: number[] = [];
  for (const a of along) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] <= a + 40) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = a;
  }
  return tails.length;
}

/** Share of these fixes within `radius` of one shape of the line, in the shape's direction. */
function forwardShare(index: TransitIndex, w: TrackPoint[], kind: TransitKind, line: string, radius: number): number {
  if (w.length === 0) return 0;
  const per = new Map<number, number[]>();
  for (const p of w)
    for (const [s, a] of index.near(p.lat, p.lon, radius)) {
      const sh = index.shapes[s];
      if (sh.kind !== kind || sh.line !== line) continue;
      const arr = per.get(s);
      if (arr) arr.push(a);
      else per.set(s, [a]);
    }
  let best = 0;
  for (const along of per.values()) best = Math.max(best, forwardCount(along));
  return best / w.length;
}

const nearLine = (index: TransitIndex, p: TrackPoint, c: ClaimedLeg) => {
  const r = c.kind === "metro" || c.kind === "train" ? RAIL_NEAR_M : 150;
  for (const s of index.near(p.lat, p.lon, r).keys()) {
    const sh = index.shapes[s];
    if (sh.kind === c.kind && sh.line === c.line) return true;
  }
  return false;
};

/**
 * Splits the fixes into consecutive stretches, one per claimed ride, so that
 * as many fixes as possible lie near the line of their stretch. Returns the
 * index of the first fix of each stretch (stretches may be empty).
 */
export function splitByLines(near: boolean[][], n: number): number[] {
  const m = near.length;
  if (m === 0) return [];
  // best[k][i]: most near-fixes with rides 0..k covering fixes 0..i-1.
  const best = Array.from({ length: m }, () => new Array<number>(n + 1).fill(-Infinity));
  const from = Array.from({ length: m }, () => new Array<number>(n + 1).fill(0));
  const prefix = near.map((row) => {
    const p = [0];
    for (let i = 0; i < n; i++) p.push(p[i] + (row[i] ? 1 : 0));
    return p;
  });
  for (let i = 0; i <= n; i++) best[0][i] = prefix[0][i];
  for (let k = 1; k < m; k++)
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= i; j++) {
        const v = best[k - 1][j] + prefix[k][i] - prefix[k][j];
        if (v > best[k][i]) {
          best[k][i] = v;
          from[k][i] = j;
        }
      }
  const starts = new Array<number>(m).fill(0);
  let i = n;
  for (let k = m - 1; k > 0; k--) {
    starts[k] = from[k][i];
    i = starts[k];
  }
  return starts;
}

function pathM(w: TrackPoint[]): number {
  let m = 0;
  for (let k = 1; k < w.length; k++) m += dist(w[k - 1].lat, w[k - 1].lon, w[k].lat, w[k].lon);
  return m;
}

const legLabel = (l: Leg) =>
  `${l.kind} ${l.lines.join("/")}${l.fromStop || l.toStop ? ` ${l.fromStop ?? "?"}→${l.toStop ?? "?"}` : ""}`;

/**
 * Diagnostics for one trip and the rides the user claims, plus those rides as
 * legs with estimated times, stops and distances. `index` is null when no
 * transit feed is loaded (then the legs split the trip evenly by time).
 */
export function diagnoseTrip(
  index: TransitIndex | null,
  points: DiagPoint[],
  trip: TripInfo,
  claimed: ClaimedLeg[],
): { diagnostics: TripDiagnostics; legs: EstimatedLeg[] } {
  const pts = [...points].sort((a, b) => a.ts - b.ts);
  const usable = pts.filter((p) => p.accuracy == null || p.accuracy <= MAX_FIX_ACCURACY_M);
  const gaps = pts.slice(1).map((p, k) => p.ts - pts[k].ts);
  let longest: { s: number; atMin: number } | null = null;
  gaps.forEach((g, k) => {
    if (!longest || g > longest.s) longest = { s: g, atMin: minutes(pts[k].ts, trip.start) };
  });
  const hours = (trip.end - trip.start) / 3600;

  const trace: MatchTrace = new Map();
  const matched = index && usable.length >= 2 ? matchLegs(index, pts, trace) : [];

  // Which fixes belong to which claimed ride.
  const near = index ? claimed.map((c) => usable.map((p) => nearLine(index, p, c))) : [];
  const starts = index ? splitByLines(near, usable.length) : [];
  const stretch = (k: number) => usable.slice(starts[k], k + 1 < claimed.length ? starts[k + 1] : usable.length);

  const lines: LineDiagnostics[] = claimed.map((c, k) => {
    const w = index ? stretch(k) : [];
    const verdict = !index
      ? "no transit data loaded"
      : (trace.get(`${c.kind}:${c.line}`)?.reason ??
        (index.shapes.some((s) => s.kind === c.kind && s.line === c.line) ? "no leg started on it (never within 60 m with the next fix)" : "line not in the feed"));
    return {
      kind: c.kind,
      line: c.line,
      near60: index ? round2(forwardShare(index, w, c.kind, c.line, 60)) : 0,
      near150: index ? round2(forwardShare(index, w, c.kind, c.line, 150)) : 0,
      fromMin: w.length ? minutes(w[0].ts, trip.start) : null,
      toMin: w.length ? minutes(w[w.length - 1].ts, trip.start) : null,
      verdict,
    };
  });

  const diagnostics: TripDiagnostics = {
    matcher: MATCHER_VERSION,
    points: pts.length,
    usable: usable.length,
    sources: count(pts.map((p) => p.source)),
    activities: count(pts.map((p) => p.activity)),
    medianGapS: median(gaps),
    maxGapS: gaps.length ? Math.max(...gaps) : null,
    longestGap: longest,
    coarseShare: pts.length ? round2(pts.filter((p) => p.accuracy != null && p.accuracy > COARSE_M).length / pts.length) : 0,
    avgKmh: hours > 0 ? Math.round((trip.distanceM / 1000 / hours) * 10) / 10 : null,
    detectorMode: trip.detectorMode,
    shownMode: trip.shownMode,
    matched: matched.map(legLabel),
    claimed: lines,
  };

  return { diagnostics, legs: estimateLegs(index, usable, trip, claimed, matched, near, starts) };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Times, stops and distance of each claimed ride: the matcher's leg when it
 * found that line in order, else the fixes near the line within the ride's
 * stretch, else an even share of the trip's time.
 */
function estimateLegs(
  index: TransitIndex | null,
  usable: TrackPoint[],
  trip: TripInfo,
  claimed: ClaimedLeg[],
  matched: Leg[],
  near: boolean[][],
  starts: number[],
): EstimatedLeg[] {
  const out: EstimatedLeg[] = [];
  let next = 0; // matched legs are used in order
  const span = (trip.end - trip.start) / Math.max(1, claimed.length);
  claimed.forEach((c, k) => {
    const prev = k > 0 ? claimed[k - 1].transferStop?.trim() || null : null;
    const transfer = c.transferStop?.trim() || null;
    const mi = matched.findIndex((l, i) => i >= next && l.kind === c.kind && l.lines.includes(c.line));
    if (mi >= 0) {
      const l = matched[mi];
      next = mi + 1;
      out.push({
        kind: c.kind,
        lines: [c.line],
        fromStop: prev ?? l.fromStop,
        toStop: transfer ?? l.toStop,
        startedAt: iso(l.start),
        endedAt: iso(l.end),
        distance: Math.round(l.distanceM),
      });
      return;
    }
    const end = k + 1 < claimed.length ? starts[k + 1] : usable.length;
    const w = index && starts.length ? usable.slice(starts[k], end).filter((_, i) => near[k][starts[k] + i]) : [];
    if (index && w.length >= 1) {
      const a = w[0];
      const b = w[w.length - 1];
      out.push({
        kind: c.kind,
        lines: [c.line],
        fromStop: prev ?? index.nearestStop(a.lat, a.lon),
        toStop: transfer ?? index.nearestStop(b.lat, b.lon),
        startedAt: iso(a.ts),
        endedAt: iso(b.ts),
        distance: Math.round(pathM(w)),
      });
      return;
    }
    out.push({
      kind: c.kind,
      lines: [c.line],
      fromStop: prev,
      toStop: transfer,
      startedAt: iso(trip.start + k * span),
      endedAt: iso(trip.start + (k + 1) * span),
      distance: Math.round(trip.distanceM / Math.max(1, claimed.length)),
    });
  });
  // Rides follow each other: an estimate never starts before the previous one ended.
  for (let k = 1; k < out.length; k++)
    if (out[k].startedAt < out[k - 1].endedAt) out[k].startedAt = out[k - 1].endedAt;
  for (const l of out) if (l.endedAt < l.startedAt) l.endedAt = l.startedAt;
  return out;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const tally = (r: Record<string, number>) =>
  Object.entries(r)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(",");

/** The one compact log line for a correction (no coordinates). */
export function diagnosticsLine(d: TripDiagnostics, ctx: { correctionId: string | number; mode: string; claimed: ClaimedLeg[] }): string {
  const parts = [
    `[correction] #${ctx.correctionId} ${d.shownMode}→${ctx.mode}${ctx.claimed.length ? ` (${ctx.claimed.map((c) => `${c.kind} ${c.line}`).join(" > ")})` : ""}`,
    `pts ${d.points} usable ${d.usable} src ${tally(d.sources)} act ${tally(d.activities)}`,
    `gap med ${d.medianGapS ?? "-"}s max ${d.maxGapS ?? "-"}s${d.longestGap ? ` @${d.longestGap.atMin}min` : ""}`,
    `acc>100m ${pct(d.coarseShare)} avg ${d.avgKmh ?? "-"}km/h detector ${d.detectorMode}`,
    `matcher v${d.matcher}: ${d.matched.length ? d.matched.join(" + ") : "none"}`,
    ...d.claimed.map(
      (c) =>
        `${c.kind} ${c.line}: 60m ${pct(c.near60)} 150m ${pct(c.near150)}${c.fromMin != null ? ` min ${c.fromMin}-${c.toMin}` : ""} -> ${c.verdict}`,
    ),
  ];
  return parts.join(" | ");
}
