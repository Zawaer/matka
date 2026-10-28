// What the recorder did per local day and preset, for Matka's battery estimate
// (power-model.ts) and the heartbeat (device_daily_usage on the server); plus
// whole-phone battery measurements (current draw, charge counter). Pure,
// unit-tested; usage.ts persists the state in the kv store.
//
// Time is attributed at each event (fix batch, mode switch, preset change,
// watchdog run) to the state that held since the previous event; a silence
// longer than USAGE_RULES.maxGapMs (phone off, app killed) is not counted.

import type { RawBattery } from "../modules/matka-activity";

export type RecorderMode = "active" | "standby" | "off";
export type Motion = "moving" | "still";

/** Current samples in one state: count, sum (mA) and a histogram in `binMa` bins for the median. */
export type CurrentAgg = { n: number; sum: number; hist: Record<string, number> };

export type Bucket = {
  activeS: number;
  standbyS: number;
  offS: number;
  fixes: number;
  movingS: number;
  stillS: number;
  /** Unplugged current: screen off with GPS active, screen off in standby, screen on. */
  cur: { active: CurrentAgg; standby: CurrentAgg; screen: CurrentAgg };
  /** Charge-counter fall while unplugged (mAh) and the time it covers (s). */
  dropMah: number;
  dropS: number;
};

export type UsageState = {
  v: 1;
  /** Last event, and the recorder state and preset since then. */
  at: number | null;
  mode: RecorderMode;
  preset: string;
  motion: Motion | null;
  motionAt: number | null;
  /** Last unplugged charge-counter reading (mAh). */
  charge: { at: number; mah: number } | null;
  /** Current units, once a reading gave them away (sticky). */
  unit: "uA" | "mA" | null;
  /** day (YYYY-MM-DD, local) → preset → bucket. */
  days: Record<string, Record<string, Bucket>>;
};

export const USAGE_RULES = {
  /** Longer silences between events aren't attributed (phone off, app killed). */
  maxGapMs: 3 * 60 * 60_000,
  /** Motion readings come every ~30 s; a longer gap counts only this much. */
  motionMaxGapMs: 5 * 60_000,
  /** Charge-counter readings further apart than this aren't paired. */
  chargeMaxGapMs: 3 * 60 * 60_000,
  /** Days kept (today and the two before). */
  keepDays: 3,
  /** Histogram bin for current medians (mA). */
  binMa: 10,
  /** |raw current| at or above this is µA (no phone draws 10 A); below, mA unless µA was seen. */
  microampFrom: 10_000,
  /** A charge counter above this is µAh (a 6000 mAh battery at 1 % is 60 000 µAh). */
  microampHourFrom: 50_000,
};

/** Local calendar: the day of an instant and the next local midnight after it. */
export type Calendar = { dayOf(ms: number): string; nextDay(ms: number): number };

const pad = (n: number) => String(n).padStart(2, "0");
export const localCalendar: Calendar = {
  dayOf: (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },
  nextDay: (ms) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  },
};

const emptyAgg = (): CurrentAgg => ({ n: 0, sum: 0, hist: {} });
export const emptyBucket = (): Bucket => ({
  activeS: 0,
  standbyS: 0,
  offS: 0,
  fixes: 0,
  movingS: 0,
  stillS: 0,
  cur: { active: emptyAgg(), standby: emptyAgg(), screen: emptyAgg() },
  dropMah: 0,
  dropS: 0,
});

export const INITIAL_USAGE: UsageState = {
  v: 1,
  at: null,
  mode: "off",
  preset: "balanced",
  motion: null,
  motionAt: null,
  charge: null,
  unit: null,
  days: {},
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function parseAgg(v: unknown): CurrentAgg {
  if (!v || typeof v !== "object") return emptyAgg();
  const o = v as Record<string, unknown>;
  const hist: Record<string, number> = {};
  if (o.hist && typeof o.hist === "object") {
    for (const [k, c] of Object.entries(o.hist as Record<string, unknown>)) if (num(c) > 0) hist[k] = num(c);
  }
  return { n: num(o.n), sum: num(o.sum), hist };
}

function parseBucket(v: unknown): Bucket {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const cur = (o.cur && typeof o.cur === "object" ? o.cur : {}) as Record<string, unknown>;
  return {
    activeS: num(o.activeS),
    standbyS: num(o.standbyS),
    offS: num(o.offS),
    fixes: num(o.fixes),
    movingS: num(o.movingS),
    stillS: num(o.stillS),
    cur: { active: parseAgg(cur.active), standby: parseAgg(cur.standby), screen: parseAgg(cur.screen) },
    dropMah: num(o.dropMah),
    dropS: num(o.dropS),
  };
}

/** Reads the stored state; anything malformed starts fresh. */
export function parseUsage(json: string | null | undefined): UsageState {
  let o: Record<string, unknown>;
  try {
    const v: unknown = json ? JSON.parse(json) : null;
    if (!v || typeof v !== "object" || Array.isArray(v)) return { ...INITIAL_USAGE, days: {} };
    o = v as Record<string, unknown>;
  } catch {
    return { ...INITIAL_USAGE, days: {} };
  }
  const days: UsageState["days"] = {};
  if (o.days && typeof o.days === "object") {
    for (const [day, presets] of Object.entries(o.days as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !presets || typeof presets !== "object") continue;
      days[day] = {};
      for (const [p, b] of Object.entries(presets as Record<string, unknown>)) days[day][p] = parseBucket(b);
    }
  }
  const c = o.charge as Record<string, unknown> | null | undefined;
  return {
    v: 1,
    at: numOrNull(o.at),
    mode: o.mode === "active" || o.mode === "standby" ? o.mode : "off",
    preset: typeof o.preset === "string" ? o.preset : INITIAL_USAGE.preset,
    motion: o.motion === "moving" || o.motion === "still" ? o.motion : null,
    motionAt: numOrNull(o.motionAt),
    charge: c && numOrNull(c.at) != null && numOrNull(c.mah) != null ? { at: c.at as number, mah: c.mah as number } : null,
    unit: o.unit === "uA" || o.unit === "mA" ? o.unit : null,
    days,
  };
}

function bucket(s: UsageState, day: string, preset: string): Bucket {
  const d = (s.days[day] ??= {});
  return (d[preset] ??= emptyBucket());
}

/** Calls `add(day, seconds)` for each local day [from, to) touches. */
function split(from: number, to: number, cal: Calendar, add: (day: string, s: number) => void) {
  let t = from;
  while (t < to) {
    const end = Math.min(to, cal.nextDay(t));
    add(cal.dayOf(t), (end - t) / 1000);
    t = end;
  }
}

/** Drops all but the newest `keepDays` days. */
function prune(s: UsageState) {
  const keep = Object.keys(s.days).sort().slice(-USAGE_RULES.keepDays);
  for (const d of Object.keys(s.days)) if (!keep.includes(d)) delete s.days[d];
}

const clone = (s: UsageState): UsageState => JSON.parse(JSON.stringify(s)) as UsageState;

/**
 * An event at `now`: the time since the last one goes to the state that held
 * (its mode, under its preset), then `next` holds from now on.
 */
export function noteState(
  prev: UsageState,
  now: number,
  next: { mode: RecorderMode; preset: string },
  cal: Calendar = localCalendar,
): UsageState {
  const s = clone(prev);
  if (s.at != null && now > s.at && now - s.at <= USAGE_RULES.maxGapMs) {
    const key = s.mode === "active" ? "activeS" : s.mode === "standby" ? "standbyS" : "offS";
    split(s.at, now, cal, (day, sec) => {
      bucket(s, day, s.preset)[key] += sec;
    });
  }
  if (s.at == null || now >= s.at) s.at = now;
  s.mode = next.mode;
  s.preset = next.preset;
  prune(s);
  return s;
}

/** Fixes received at `now` (under the current preset). */
export function noteFixes(prev: UsageState, now: number, n: number, cal: Calendar = localCalendar): UsageState {
  const s = clone(prev);
  if (n > 0) bucket(s, cal.dayOf(now), s.preset).fixes += n;
  prune(s);
  return s;
}

/** A motion reading: the time since the previous one (capped) goes to the previous motion. */
export function noteMotion(prev: UsageState, now: number, motion: Motion | null, cal: Calendar = localCalendar): UsageState {
  const s = clone(prev);
  if (s.motion && s.motionAt != null && now > s.motionAt) {
    const from = Math.max(s.motionAt, now - USAGE_RULES.motionMaxGapMs);
    const key = s.motion === "moving" ? "movingS" : "stillS";
    split(from, now, cal, (day, sec) => {
      bucket(s, day, s.preset)[key] += sec;
    });
  }
  s.motion = motion;
  s.motionAt = now;
  prune(s);
  return s;
}

/**
 * Discharge current in mA (positive) from BATTERY_PROPERTY_CURRENT_NOW, or
 * null. Only meaningful unplugged (then the battery can only discharge, so the
 * sign the OEM uses doesn't matter). Units: µA at or above `microampFrom`, and
 * from then on for this phone (`unit`); mA below it until µA has been seen.
 */
export function normaliseCurrent(
  raw: number | null | undefined,
  unit: "uA" | "mA" | null,
): { ma: number | null; unit: "uA" | "mA" | null } {
  if (raw == null || !Number.isFinite(raw) || raw === 0) return { ma: null, unit };
  const abs = Math.abs(raw);
  const u = abs >= USAGE_RULES.microampFrom ? "uA" : unit === "uA" ? "uA" : "mA";
  const ma = u === "uA" ? abs / 1000 : abs;
  return { ma: ma > 20_000 ? null : Math.round(ma * 10) / 10, unit: abs >= USAGE_RULES.microampFrom ? "uA" : unit };
}

/** Charge counter in mAh from BATTERY_PROPERTY_CHARGE_COUNTER (µAh, some OEMs mAh), or null. */
export function normaliseCounter(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  return raw > USAGE_RULES.microampHourFrom ? raw / 1000 : raw;
}

function addSample(a: CurrentAgg, ma: number) {
  a.n += 1;
  a.sum += ma;
  const bin = String(Math.floor(ma / USAGE_RULES.binMa));
  a.hist[bin] = (a.hist[bin] ?? 0) + 1;
}

/**
 * A battery reading at `now` (in the current mode and preset). Unplugged:
 * the current goes to "screen" when the screen is on, else to the recorder's
 * mode (nothing while recording is off); the charge counter's fall since the
 * previous unplugged reading goes to today. Plugged: the pairing restarts.
 */
export function noteBattery(prev: UsageState, now: number, raw: RawBattery | null, cal: Calendar = localCalendar): UsageState {
  if (!raw) return prev;
  const s = clone(prev);
  if (raw.plugged !== false) {
    s.charge = null;
    return s;
  }
  const b = bucket(s, cal.dayOf(now), s.preset);
  const { ma, unit } = normaliseCurrent(raw.currentNow, s.unit);
  s.unit = unit;
  if (ma != null) {
    if (raw.interactive === true) addSample(b.cur.screen, ma);
    else if (raw.interactive === false && s.mode !== "off") addSample(b.cur[s.mode], ma);
  }
  const mah = normaliseCounter(raw.chargeCounter);
  if (mah != null) {
    const c = s.charge;
    if (c && now > c.at && now - c.at <= USAGE_RULES.chargeMaxGapMs && mah <= c.mah) {
      b.dropMah += c.mah - mah;
      b.dropS += (now - c.at) / 1000;
    }
    s.charge = { at: now, mah };
  }
  prune(s);
  return s;
}

/** Median (mA) from the histogram: the middle sample's bin centre. */
export function medianMa(a: CurrentAgg): number | null {
  if (a.n === 0) return null;
  const bins = Object.entries(a.hist)
    .map(([k, c]) => [Number(k), c] as const)
    .sort((x, y) => x[0] - y[0]);
  let seen = 0;
  for (const [k, c] of bins) {
    seen += c;
    if (seen >= a.n / 2) return (k + 0.5) * USAGE_RULES.binMa;
  }
  return null;
}

export type CurrentSummary = { n: number; mean: number | null; median: number | null };
const summary = (a: CurrentAgg): CurrentSummary => ({
  n: a.n,
  mean: a.n ? Math.round((a.sum / a.n) * 10) / 10 : null,
  median: medianMa(a),
});

/** One heartbeat row (docs/API.md → heartbeat `usage`). */
export type UsageRow = {
  day: string;
  preset: string;
  activeS: number;
  standbyS: number;
  offS: number;
  fixes: number;
  movingS: number;
  stillS: number;
  current: { active: CurrentSummary; standby: CurrentSummary; screen: CurrentSummary };
  dropMah: number;
  dropS: number;
};

/** Rows for the given days (today and yesterday), whole seconds. */
export function usageRows(s: UsageState, days: string[]): UsageRow[] {
  const out: UsageRow[] = [];
  for (const day of days) {
    for (const [preset, b] of Object.entries(s.days[day] ?? {})) {
      out.push({
        day,
        preset,
        activeS: Math.round(b.activeS),
        standbyS: Math.round(b.standbyS),
        offS: Math.round(b.offS),
        fixes: b.fixes,
        movingS: Math.round(b.movingS),
        stillS: Math.round(b.stillS),
        current: { active: summary(b.cur.active), standby: summary(b.cur.standby), screen: summary(b.cur.screen) },
        dropMah: Math.round(b.dropMah * 10) / 10,
        dropS: Math.round(b.dropS),
      });
    }
  }
  return out;
}

/** Today's buckets summed over presets, for the Recorder screen. */
export function dayTotals(s: UsageState, day: string) {
  const bs = Object.values(s.days[day] ?? {});
  const sum = (f: (b: Bucket) => number) => bs.reduce((a, b) => a + f(b), 0);
  const merge = (k: "active" | "standby" | "screen"): CurrentAgg => {
    const hist: Record<string, number> = {};
    for (const b of bs) for (const [bin, c] of Object.entries(b.cur[k].hist)) hist[bin] = (hist[bin] ?? 0) + c;
    return { n: sum((b) => b.cur[k].n), sum: sum((b) => b.cur[k].sum), hist };
  };
  return {
    activeS: sum((b) => b.activeS),
    standbyS: sum((b) => b.standbyS),
    fixes: sum((b) => b.fixes),
    movingS: sum((b) => b.movingS),
    stillS: sum((b) => b.stillS),
    current: { active: summary(merge("active")), standby: summary(merge("standby")), screen: summary(merge("screen")) },
    dropMah: Math.round(sum((b) => b.dropMah)),
    dropS: sum((b) => b.dropS),
  };
}

const span = (s: number) => (s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);
const mAh = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * The Recorder screen's lines: Matka's estimate, then the whole-phone
 * measurements (null when there are none yet).
 */
export function usageLines(
  t: ReturnType<typeof dayTotals>,
  estimate: { mAh: number; percent: number },
): { estimate: string; draw: string | null; drop: string | null } {
  const pct = estimate.percent < 1 ? estimate.percent.toFixed(1) : String(Math.round(estimate.percent));
  const draw = [
    t.current.active.median != null ? `Phone draw while recording: ~${Math.round(t.current.active.median)} mA` : null,
    t.current.standby.median != null
      ? `${t.current.active.median != null ? "in" : "Phone draw in"} standby: ~${Math.round(t.current.standby.median)} mA`
      : null,
  ].filter((x): x is string => x != null);
  return {
    estimate: `Battery today: ≈ ${pct} % (≈ ${mAh(estimate.mAh)} mAh) · GPS active ${span(t.activeS)} · standby ${span(t.standbyS)}`,
    draw: draw.length ? draw.join(" · ") : null,
    drop: t.dropS > 0 ? `Measured drop today: ${mAh(t.dropMah)} mAh unplugged (${span(t.dropS)})` : null,
  };
}
