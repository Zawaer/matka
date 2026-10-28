// Recording quality per local day and per recording preset, from the fixes the
// phone app uploaded (source 'device'), to compare presets (Balanced vs
// Precise, Smart Tracking). Pure; ./load.ts fetches the fixes and the
// preset change log. No coordinates leave this module: only aggregates.
//
// Definitions (QUALITY_RULES):
// - An interval is two consecutive fixes of one device. It is *moving* when the
//   fixes are at most 5 min apart and the later fix says speed > 1 m/s, or the
//   two are more than 30 m per minute apart, or the later fix's activity is
//   in_vehicle, walking, on_bicycle or running. A moving stretch is a run of
//   moving intervals; its fixes are the *moving fixes*.
// - Moving minutes: the summed length of moving intervals. Fixes per moving
//   minute: moving intervals / moving minutes (= 1 / mean interval).
// - Interval median/p90: over the moving intervals. Accuracy median/p90 and the
//   ≤10 m / ≤20 m / >50 m shares: over moving fixes that report an accuracy.
// - Standby share: of all the day's fixes with an accuracy, those over 50 m
//   (what Smart Tracking's Wi-Fi/cell standby produces), moving or not.
// - Path noise: for each moving fix whose neighbours are in the same stretch,
//   its distance from the segment between them; the median, in metres.
// Days follow the user's time zone; a moving interval belongs to the day and
// preset period of its later fix.

import { type RecordingPreset, presetKey, presetLabel } from "../recordingPreset";
import { addDays, daysBetween, startOfDay } from "./time";

/** One uploaded fix: epoch ms, degrees, metres, m/s, the phone's activity. */
export type QualityFix = {
  ts: number;
  lat: number;
  lon: number;
  accuracy: number | null;
  speed: number | null;
  activity: string | null;
};

export const QUALITY_RULES = {
  /** Fixes further apart than this don't form a moving interval. */
  maxGapMs: 5 * 60_000,
  /** Reported speed above this (m/s) is moving. */
  minSpeed: 1,
  /** Displacement above this many metres per minute is moving. */
  minMetresPerMinute: 30,
  movingActivities: ["in_vehicle", "walking", "on_bicycle", "running"] as readonly string[],
  /** Accuracy thresholds (m): good, fair, and standby-quality (Wi-Fi/cell). */
  good: 10,
  fair: 20,
  standby: 50,
  /** The before/after comparison takes this many days either side of a change. */
  compareDays: 7,
};
export type QualityRules = typeof QUALITY_RULES;

/** The phone switched to `preset` at `at`; `before` says what it used until then, when known. */
export type PresetChange = { at: number; preset: RecordingPreset; before?: RecordingPreset };

const balanced = (smartTracking: boolean): RecordingPreset => ({ preset: "balanced", custom: null, smartTracking });

/**
 * Changes made before the app reported its preset (device_preset_log starts
 * empty): Smart Tracking reached the phone on 19 Oct 2026 20:03 Helsinki time
 * (as in battery.ts), and the user switched Balanced → Precise on 28 Oct 2026
 * at 11:40 Helsinki time.
 */
export const QUALITY_ANNOTATIONS: PresetChange[] = [
  { at: Date.parse("2026-10-19T20:03:00+03:00"), before: balanced(false), preset: balanced(true) },
  {
    at: Date.parse("2026-10-28T09:40:00Z"),
    before: balanced(true),
    preset: { preset: "precise", custom: null, smartTracking: true },
  },
];

/** A span with one preset. `start` may be -Infinity and `end` Infinity. */
export type Period = { start: number; end: number; preset: RecordingPreset | null; label: string };

const labelOf = (p: RecordingPreset | null) => (p ? presetLabel(p) : "Unknown preset");

/**
 * Consecutive periods from preset changes (annotations and log rows, any
 * order). Before the first change: its `before`, if given. A change to the
 * preset already in use starts nothing new.
 */
export function presetPeriods(changes: PresetChange[]): Period[] {
  const sorted = [...changes].sort((a, b) => a.at - b.at);
  let cur: RecordingPreset | null = sorted[0]?.before ?? null;
  let start = -Infinity;
  const out: Period[] = [];
  for (const c of sorted) {
    if (cur && presetKey(cur) === presetKey(c.preset)) continue;
    if (c.at > start) out.push({ start, end: c.at, preset: cur, label: labelOf(cur) });
    cur = c.preset;
    start = c.at;
  }
  out.push({ start, end: Infinity, preset: cur, label: labelOf(cur) });
  return out;
}

// ---- Samples ------------------------------------------------------------------

type Timed = { ts: number; v: number };

/** What the stats are computed from, each list ordered by time. */
export type QualitySamples = {
  /** Every fix; v = accuracy (NaN when absent). */
  fixes: Timed[];
  /** Moving fixes; v = accuracy (NaN when absent). */
  movingFixes: Timed[];
  /** Moving intervals at their later fix; v = length in ms. */
  intervals: Timed[];
  /** Path noise per eligible moving fix; v = metres. */
  deviations: Timed[];
};

const R = 6_371_000;
const RAD = Math.PI / 180;

/** Metres on a local plane around `o`. */
function xy(p: QualityFix, o: QualityFix): [number, number] {
  return [(p.lon - o.lon) * RAD * R * Math.cos(o.lat * RAD), (p.lat - o.lat) * RAD * R];
}

function distance(a: QualityFix, b: QualityFix): number {
  const [x, y] = xy(b, a);
  return Math.hypot(x, y);
}

/** Distance (m) of `p` from the segment a–b. */
export function segmentDeviation(p: QualityFix, a: QualityFix, b: QualityFix): number {
  const [bx, by] = xy(b, a);
  const [px, py] = xy(p, a);
  const len2 = bx * bx + by * by;
  const t = len2 > 0 ? Math.min(1, Math.max(0, (px * bx + py * by) / len2)) : 0;
  return Math.hypot(px - t * bx, py - t * by);
}

const acc = (f: QualityFix) => (f.accuracy != null && Number.isFinite(f.accuracy) && f.accuracy >= 0 ? f.accuracy : NaN);

/** Samples from one device's fixes (any order; duplicates by time are dropped). */
export function qualitySamples(input: QualityFix[], rules: QualityRules = QUALITY_RULES): QualitySamples {
  const fixes = [...input].sort((a, b) => a.ts - b.ts).filter((f, i, a) => i === 0 || f.ts > a[i - 1].ts);
  const n = fixes.length;
  // moving[i]: the interval ending at fix i is moving.
  const moving = new Array<boolean>(n).fill(false);
  for (let i = 1; i < n; i++) {
    const a = fixes[i - 1];
    const b = fixes[i];
    const dt = b.ts - a.ts;
    if (dt > rules.maxGapMs) continue;
    moving[i] =
      (b.speed != null && b.speed > rules.minSpeed) ||
      distance(a, b) / (dt / 60_000) > rules.minMetresPerMinute ||
      (b.activity != null && rules.movingActivities.includes(b.activity));
  }
  const out: QualitySamples = { fixes: [], movingFixes: [], intervals: [], deviations: [] };
  for (let i = 0; i < n; i++) {
    const f = fixes[i];
    out.fixes.push({ ts: f.ts, v: acc(f) });
    const inStretch = moving[i] || (i + 1 < n && moving[i + 1]);
    if (inStretch) out.movingFixes.push({ ts: f.ts, v: acc(f) });
    if (moving[i]) out.intervals.push({ ts: f.ts, v: f.ts - fixes[i - 1].ts });
    if (moving[i] && i + 1 < n && moving[i + 1]) {
      out.deviations.push({ ts: f.ts, v: segmentDeviation(f, fixes[i - 1], fixes[i + 1]) });
    }
  }
  return out;
}

/** Samples of several devices together. */
export function mergeSamples(list: QualitySamples[]): QualitySamples {
  const cat = (k: keyof QualitySamples) => list.flatMap((s) => s[k]).sort((a, b) => a.ts - b.ts);
  return { fixes: cat("fixes"), movingFixes: cat("movingFixes"), intervals: cat("intervals"), deviations: cat("deviations") };
}

// ---- Stats --------------------------------------------------------------------

/** First index with ts >= t. */
function lowerBound(a: Timed[], t: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid].ts < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const slice = (a: Timed[], from: number, to: number) => a.slice(lowerBound(a, from), lowerBound(a, to));

/** Linear-interpolated quantile of sorted values (like SQL percentile_cont). */
export function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r1n = (n: number | null) => (n == null ? null : r1(n));

export type MovingStats = {
  /** Moving minutes covered. */
  minutes: number;
  /** Moving fixes. */
  fixes: number;
  /** Moving intervals per moving minute. */
  fixesPerMinute: number;
  /** 60 / fixesPerMinute: one fix every this many seconds while moving. */
  secondsPerFix: number;
  intervalMedianS: number;
  intervalP90S: number;
  /** Over moving fixes with an accuracy; null when none reports one. */
  accuracyMedian: number | null;
  accuracyP90: number | null;
  /** Shares 0..1 of moving fixes with accuracy ≤ good, ≤ fair, > standby (m). */
  within10: number | null;
  within20: number | null;
  over50: number | null;
  /** Median distance of a moving fix from the segment between its neighbours (m). */
  pathNoise: number | null;
};

export type QualityStats = {
  /** All fixes in the window. */
  fixes: number;
  /** Hours the window covers (up to now). */
  hours: number;
  fixesPerHour: number | null;
  /** Share 0..1 of all fixes (with an accuracy) over 50 m: standby quality. */
  standbyShare: number | null;
  /** Null without a moving interval. */
  moving: MovingStats | null;
};

/** Stats over [from, to). */
export function statsBetween(s: QualitySamples, from: number, to: number, rules: QualityRules = QUALITY_RULES): QualityStats {
  const fixes = slice(s.fixes, from, to);
  const hours = Math.max(0, to - from) / 3_600_000;
  const allAcc = fixes.map((f) => f.v).filter((v) => !Number.isNaN(v));
  const out: QualityStats = {
    fixes: fixes.length,
    hours: r1(hours),
    fixesPerHour: hours > 0 ? r1(fixes.length / hours) : null,
    standbyShare: allAcc.length ? r3(allAcc.filter((v) => v > rules.standby).length / allAcc.length) : null,
    moving: null,
  };
  const intervals = slice(s.intervals, from, to).map((x) => x.v);
  if (intervals.length === 0) return out;
  const ms = intervals.reduce((a, b) => a + b, 0);
  const minutes = ms / 60_000;
  intervals.sort((a, b) => a - b);
  const mf = slice(s.movingFixes, from, to);
  const accs = mf
    .map((f) => f.v)
    .filter((v) => !Number.isNaN(v))
    .sort((a, b) => a - b);
  const share = (p: (v: number) => boolean) => (accs.length ? r3(accs.filter(p).length / accs.length) : null);
  const devs = slice(s.deviations, from, to)
    .map((x) => x.v)
    .sort((a, b) => a - b);
  out.moving = {
    minutes: r1(minutes),
    fixes: mf.length,
    fixesPerMinute: r1(intervals.length / minutes),
    secondsPerFix: r1(ms / 1000 / intervals.length),
    intervalMedianS: r1(quantile(intervals, 0.5)! / 1000),
    intervalP90S: r1(quantile(intervals, 0.9)! / 1000),
    accuracyMedian: r1n(quantile(accs, 0.5)),
    accuracyP90: r1n(quantile(accs, 0.9)),
    within10: share((v) => v <= rules.good),
    within20: share((v) => v <= rules.fair),
    over50: share((v) => v > rules.standby),
    pathNoise: r1n(quantile(devs, 0.5)),
  };
  return out;
}

// ---- Report -------------------------------------------------------------------

export type QualityDay = QualityStats & { date: string };

export type QualityPeriod = {
  label: string;
  preset: RecordingPreset | null;
  /** Epoch ms; null = open-ended (before the first known change / still in use). */
  start: number | null;
  end: number | null;
  /** The whole period inside the report's range. */
  total: QualityStats;
  /** Per local day, oldest first; a day split by a change appears in both periods. */
  days: QualityDay[];
};

export type QualitySide = QualityStats & { label: string; from: number; to: number };
export type QualityComparison = { at: number; days: number; before: QualitySide; after: QualitySide };

export type QualityReport = { periods: QualityPeriod[]; comparison: QualityComparison | null };

/**
 * Per preset period, the local days `fromDate`..`toDate` (inclusive, up to
 * `now`), plus the `compareDays` before vs after the latest change (each side
 * cut at the neighbouring change and at `now`). Periods without any of the
 * range are left out.
 */
export function qualityReport(
  samples: QualitySamples,
  changes: PresetChange[],
  fromDate: string,
  toDate: string,
  tz: string,
  now: number,
  rules: QualityRules = QUALITY_RULES,
): QualityReport {
  const rangeFrom = startOfDay(fromDate, tz);
  const rangeTo = Math.min(now, startOfDay(addDays(toDate, 1), tz));
  const all = presetPeriods(changes);
  const nDays = daysBetween(fromDate, toDate) + 1;
  const periods: QualityPeriod[] = [];
  for (const p of all) {
    const from = Math.max(p.start, rangeFrom);
    const to = Math.min(p.end, rangeTo);
    if (to <= from) continue;
    const days: QualityDay[] = [];
    for (let i = 0; i < nDays; i++) {
      const date = addDays(fromDate, i);
      const a = Math.max(from, startOfDay(date, tz));
      const b = Math.min(to, startOfDay(addDays(date, 1), tz));
      if (b > a) days.push({ date, ...statsBetween(samples, a, b, rules) });
    }
    periods.push({
      label: p.label,
      preset: p.preset,
      start: Number.isFinite(p.start) ? p.start : null,
      end: Number.isFinite(p.end) ? p.end : null,
      total: statsBetween(samples, from, to, rules),
      days,
    });
  }

  let comparison: QualityComparison | null = null;
  const idx = all.findLastIndex((p, i) => i > 0 && p.start <= now);
  if (idx > 0) {
    const prev = all[idx - 1];
    const next = all[idx];
    const span = rules.compareDays * 86_400_000;
    const at = next.start;
    const bFrom = Math.max(prev.start, at - span);
    const aTo = Math.min(next.end, at + span, now);
    comparison = {
      at,
      days: rules.compareDays,
      before: { label: prev.label, from: bFrom, to: at, ...statsBetween(samples, bFrom, at, rules) },
      after: { label: next.label, from: at, to: aTo, ...statsBetween(samples, at, aTo, rules) },
    };
  }
  return { periods, comparison };
}

// ---- Log line -----------------------------------------------------------------

const pct = (v: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);
const num = (v: number | null) => (v == null ? "–" : String(v));

/** "10-19 20:03" in `tz` (UTC offsets are fine for a log). */
function stamp(ms: number, tz: string): string {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** The numbers of one stats block, compact. */
export function statsText(s: QualityStats): string {
  const all = `${s.fixes} fixes ${num(s.fixesPerHour)}/h standby ${pct(s.standbyShare)}`;
  const m = s.moving;
  if (!m) return `no movement; ${all}`;
  return (
    `moving ${Math.round(m.minutes)} min 1/${m.secondsPerFix}s (med ${m.intervalMedianS} p90 ${m.intervalP90S}s) ` +
    `acc med ${num(m.accuracyMedian)} p90 ${num(m.accuracyP90)}m ≤10 ${pct(m.within10)} ≤20 ${pct(m.within20)} ` +
    `>50 ${pct(m.over50)} noise ${num(m.pathNoise)}m; ${all}`
  );
}

/**
 * One line, aggregate numbers only:
 * `[stats] quality user 1: Balanced 10-19 20:03–10-28 11:40: moving 412 min 1/31s … | Precise 10-28 11:40–: …`
 */
export function qualityLogLine(userId: string | number, report: QualityReport, tz: string): string {
  // Periods without fixes in the range say nothing, except the current one.
  const shown = report.periods.filter((p, i, a) => p.total.fixes > 0 || i === a.length - 1);
  const parts = shown.map((p) => {
    const span = `${p.start == null ? "" : stamp(p.start, tz)}–${p.end == null ? "" : stamp(p.end, tz)}`;
    return `${p.label} ${span}: ${statsText(p.total)}`;
  });
  return `[stats] quality user ${userId}: ${parts.join(" | ") || "no data"}`;
}
