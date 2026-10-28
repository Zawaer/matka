// How fast the phone's battery drained while unplugged, per local day, from the
// battery level the app sends with every point. Pure; ./load.ts fetches the
// readings. It is the whole phone's drain (screen, other apps), not Matka's.

import { addDays, daysBetween, startOfDay } from "./time";

/** One battery reading: epoch ms and percent. */
export type Reading = { ts: number; battery: number };

export const BATTERY_RULES = {
  /** A silence longer than this ends a segment (no data: off, or not recording). */
  maxGapMs: 3 * 3_600_000,
  /** A rise of this many points above the segment's lowest level ends it (charging). */
  riseEnds: 2,
  /** Segments shorter than this, or dropping less, are too coarse to rate. */
  minMs: 30 * 60_000,
  minDrop: 3,
  /** The night figure covers the first 7 hours after local midnight… */
  nightHours: 7,
  /** …when at least this much of it is covered. */
  minNightHours: 3,
  /** A day's rate needs this much unplugged time. */
  minDayHours: 1,
};
export type BatteryRules = typeof BATTERY_RULES;

/** A stretch of unplugged readings (battery never 2+ above its lowest so far). */
export type DischargeSegment = {
  readings: Reading[];
  start: number;
  end: number;
  hours: number;
  /** Percentage points used, start level − end level. */
  drop: number;
  /** %/h. */
  rate: number;
};

/** Things that changed the recorder, marked on the chart. */
export type BatteryAnnotation = { at: number; label: string };

/** Smart Tracking reached the user's phone on 19 Oct 2026 at 20:03 Helsinki time. */
export const BATTERY_ANNOTATIONS: BatteryAnnotation[] = [
  { at: Date.parse("2026-10-19T20:03:00+03:00"), label: "Smart Tracking" },
];

/**
 * Discharge segments from readings ordered by time. A segment runs while the
 * level doesn't climb (a 1-point wobble is tolerated); a rise of `riseEnds`
 * above its lowest level (charging) or a gap over `maxGapMs` ends it. It runs
 * from the last reading at its highest level (a full phone on the charger keeps
 * saying 100) to the last reading at its lowest. Only segments of `minMs` and
 * `minDrop` count.
 */
export function dischargeSegments(readings: Reading[], rules: BatteryRules = BATTERY_RULES): DischargeSegment[] {
  const out: DischargeSegment[] = [];
  let cur: Reading[] = [];
  let min = Infinity;
  const close = () => {
    let end = cur.length - 1;
    while (end > 0 && cur[end].battery > min) end--;
    // Start at the last reading at the highest level: the time before it is a
    // phone still on the charger (or the 1-point wobble), and ending at the last
    // reading at the lowest level makes the two ends alike.
    let peak = 0;
    for (let i = 0; i <= end; i++) peak = Math.max(peak, cur[i].battery);
    let start = end;
    while (start > 0 && cur[start].battery < peak) start--;
    const rs = cur.slice(start, end + 1);
    const first = rs[0];
    const last = rs[rs.length - 1];
    const ms = last.ts - first.ts;
    const drop = first.battery - last.battery;
    if (ms >= rules.minMs && drop >= rules.minDrop) {
      const hours = ms / 3_600_000;
      out.push({ readings: rs, start: first.ts, end: last.ts, hours, drop, rate: drop / hours });
    }
  };
  for (const r of readings) {
    if (!Number.isFinite(r.battery) || r.battery < 0 || r.battery > 100) continue;
    const prev = cur[cur.length - 1];
    if (prev && r.ts <= prev.ts) continue;
    if (prev && (r.ts - prev.ts > rules.maxGapMs || r.battery - min >= rules.riseEnds)) {
      close();
      cur = [];
      min = Infinity;
    }
    cur.push(r);
    min = Math.min(min, r.battery);
  }
  if (cur.length) close();
  return out;
}

/** A step between two readings of a segment; its drop is spread evenly over it. */
type Piece = { from: number; to: number; drop: number };

function pieces(segments: DischargeSegment[]): Piece[] {
  const out: Piece[] = [];
  for (const s of segments) {
    for (let i = 1; i < s.readings.length; i++) {
      const a = s.readings[i - 1];
      const b = s.readings[i];
      out.push({ from: a.ts, to: b.ts, drop: a.battery - b.battery });
    }
  }
  return out;
}

/** Unplugged hours and percent used inside [from, to). */
function cover(ps: Piece[], from: number, to: number) {
  let ms = 0;
  let used = 0;
  for (const p of ps) {
    const ov = Math.min(to, p.to) - Math.max(from, p.from);
    if (ov <= 0) continue;
    ms += ov;
    used += (p.drop * ov) / (p.to - p.from);
  }
  return { hours: ms / 3_600_000, used: Math.max(0, used) };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export type Drain = {
  /** Unplugged hours covered by rated segments. */
  hours: number;
  /** Percentage points used in them. */
  used: number;
  /** used / hours, %/h; null when too little is covered. */
  rate: number | null;
  /** 100 / rate: hours a full charge would last at this pace. */
  fullChargeHours: number | null;
};

function drain(c: { hours: number; used: number }, minHours: number): Drain {
  const rate = c.hours >= minHours && c.hours > 0 ? c.used / c.hours : null;
  return {
    hours: r1(c.hours),
    used: r1(c.used),
    rate: rate == null ? null : r1(rate),
    fullChargeHours: rate ? r1(100 / rate) : null,
  };
}

export type BatteryDay = Drain & {
  date: string;
  /** The first `nightHours` after local midnight, when at least `minNightHours` are covered. */
  night: { hours: number; rate: number | null } | null;
};

/** Per local day from `fromDate` to `toDate` (inclusive), every day present. */
export function dailyBattery(
  segments: DischargeSegment[],
  fromDate: string,
  toDate: string,
  tz: string,
  rules: BatteryRules = BATTERY_RULES,
): BatteryDay[] {
  const ps = pieces(segments);
  const n = daysBetween(fromDate, toDate) + 1;
  const out: BatteryDay[] = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(fromDate, i);
    const start = startOfDay(date, tz);
    const end = startOfDay(addDays(date, 1), tz);
    // Only the pieces that touch the day (pieces are at most maxGapMs long).
    const near = ps.filter((p) => p.to > start && p.from < end);
    const day = cover(near, start, end);
    const nightC = cover(near, start, Math.min(end, start + rules.nightHours * 3_600_000));
    out.push({
      date,
      ...drain(day, rules.minDayHours),
      night:
        nightC.hours >= rules.minNightHours
          ? { hours: r1(nightC.hours), rate: r1(nightC.used / nightC.hours) }
          : null,
    });
  }
  return out;
}

/** Drain across [from, to), weighted by time (for before/after comparisons). */
export function drainBetween(
  segments: DischargeSegment[],
  from: number,
  to: number,
  rules: BatteryRules = BATTERY_RULES,
): Drain {
  return drain(cover(pieces(segments), from, to), rules.minDayHours);
}

/** The `days` days before an instant against the `days` after it. */
export function compareAround(segments: DischargeSegment[], at: number, days = 7, rules: BatteryRules = BATTERY_RULES) {
  const span = days * 86_400_000;
  return {
    before: drainBetween(segments, at - span, at, rules),
    after: drainBetween(segments, at, at + span, rules),
  };
}

/**
 * One compact log line, aggregate numbers only:
 * `[stats] battery user 1: 10-18 5.2%/h(9.1h) night 3.0 | 10-19 – | …`
 */
export function batteryLogLine(userId: string | number, days: BatteryDay[]): string {
  const parts = days.map((d) => {
    const md = d.date.slice(5);
    if (d.rate == null) return `${md} –`;
    const night = d.night?.rate != null ? ` night ${d.night.rate.toFixed(1)}` : "";
    return `${md} ${d.rate.toFixed(1)}%/h(${d.hours.toFixed(1)}h)${night}`;
  });
  return `[stats] battery user ${userId}: ${parts.join(" | ")}`;
}
