import { describe, expect, it } from "vitest";
import {
  type PresetChange,
  type QualityFix,
  QUALITY_ANNOTATIONS,
  mergeSamples,
  presetPeriods,
  qualityLogLine,
  qualityReport,
  qualitySamples,
  quantile,
  segmentDeviation,
  statsBetween,
} from "./quality";
import { startOfDay } from "./time";

const TZ = "Europe/Helsinki";
const S = 1000;
const M = 60_000;
const H = 3_600_000;
const LAT = 60.17;
const LON = 24.94;
/** Metres per degree of latitude / of longitude at LAT. */
const MLAT = (6_371_000 * Math.PI) / 180;
const MLON = MLAT * Math.cos((LAT * Math.PI) / 180);

/** A straight walk north at `speed` m/s, a fix every `stepS` s for `minutes`. */
function walk(
  at: number,
  minutes: number,
  stepS: number,
  o: { speed?: number; accuracy?: (i: number) => number | null; jitter?: (i: number) => number; activity?: string | null } = {},
): QualityFix[] {
  const speed = o.speed ?? 1.4;
  const n = Math.floor((minutes * 60) / stepS);
  const out: QualityFix[] = [];
  for (let i = 0; i <= n; i++) {
    const north = speed * i * stepS;
    out.push({
      ts: at + i * stepS * S,
      lat: LAT + north / MLAT,
      lon: LON + (o.jitter?.(i) ?? 0) / MLON,
      accuracy: o.accuracy ? o.accuracy(i) : 8,
      speed,
      activity: o.activity === undefined ? "walking" : o.activity,
    });
  }
  return out;
}

/** A still phone: one fix every `stepS` s, no speed, no displacement. */
function still(at: number, minutes: number, stepS: number, accuracy = 60, lat = LAT): QualityFix[] {
  const n = Math.floor((minutes * 60) / stepS);
  return Array.from({ length: n + 1 }, (_, i) => ({
    ts: at + i * stepS * S,
    lat,
    lon: LON,
    accuracy,
    speed: 0,
    activity: "still",
  }));
}

describe("helpers", () => {
  it("quantile interpolates like percentile_cont", () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([4], 0.9)).toBe(4);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([0, 10], 0.9)).toBe(9);
  });

  it("segmentDeviation measures the distance from the neighbours' segment", () => {
    const a = { ts: 0, lat: LAT, lon: LON, accuracy: null, speed: null, activity: null };
    const b = { ...a, lat: LAT + 100 / MLAT };
    const p = { ...a, lat: LAT + 50 / MLAT, lon: LON + 7 / MLON };
    expect(segmentDeviation(p, a, b)).toBeCloseTo(7, 1);
    // Beyond the end: distance to the nearer end.
    const q = { ...a, lat: LAT + 130 / MLAT };
    expect(segmentDeviation(q, a, b)).toBeCloseTo(30, 1);
  });
});

describe("qualitySamples / statsBetween", () => {
  const t0 = startOfDay("2026-10-20", TZ) + 9 * H;

  it("Balanced-like 30 s vs Precise-like 10 s intervals", () => {
    const slow = statsBetween(qualitySamples(walk(t0, 30, 30)), t0, t0 + H);
    const fast = statsBetween(qualitySamples(walk(t0, 30, 10)), t0, t0 + H);
    expect(slow.moving).toMatchObject({ minutes: 30, fixes: 61, fixesPerMinute: 2, secondsPerFix: 30 });
    expect(slow.moving?.intervalMedianS).toBe(30);
    expect(slow.moving?.intervalP90S).toBe(30);
    expect(fast.moving).toMatchObject({ minutes: 30, fixes: 181, fixesPerMinute: 6, secondsPerFix: 10 });
    expect(fast.moving?.intervalMedianS).toBe(10);
    expect(slow.fixes).toBe(61);
    expect(slow.fixesPerHour).toBe(61);
  });

  it("accuracy distribution and shares", () => {
    // 10 fixes per cycle: 5 × 5 m, 3 × 15 m, 1 × 40 m, 1 × 80 m.
    const accs = [5, 5, 5, 5, 5, 15, 15, 15, 40, 80];
    const s = statsBetween(qualitySamples(walk(t0, 99 / 6, 10, { accuracy: (i) => accs[i % 10] })), t0, t0 + H);
    expect(s.moving?.fixes).toBe(100);
    expect(s.moving?.accuracyMedian).toBe(10);
    // p90 falls between the 40 m and the 80 m fixes.
    expect(s.moving?.accuracyP90).toBe(44);
    expect(s.moving?.within10).toBe(0.5);
    expect(s.moving?.within20).toBe(0.8);
    expect(s.moving?.over50).toBe(0.1);
    expect(s.standbyShare).toBe(0.1);
  });

  it("fixes without an accuracy count for intervals but not for the accuracy figures", () => {
    const s = statsBetween(qualitySamples(walk(t0, 10, 30, { accuracy: () => null })), t0, t0 + H);
    expect(s.moving?.minutes).toBe(10);
    expect(s.moving?.accuracyMedian).toBeNull();
    expect(s.moving?.within10).toBeNull();
    expect(s.standbyShare).toBeNull();
  });

  it("standby gaps and still spells are not moving", () => {
    // Walk 10 min, standby (a coarse fix every 2 min while still) for an hour, then a 6 min gap, walk again.
    const first = walk(t0, 10, 30);
    const fixes = [
      ...first,
      ...still(t0 + 12 * M, 60, 120, 60, first[first.length - 1].lat),
      ...walk(t0 + 78 * M, 10, 30, { activity: null }),
    ];
    const s = statsBetween(qualitySamples(fixes), t0, t0 + 2 * H);
    expect(s.moving?.minutes).toBe(20);
    expect(s.moving?.intervalP90S).toBe(30);
    // The standby fixes (31 of 73) are > 50 m.
    expect(s.fixes).toBe(21 + 31 + 21);
    expect(s.standbyShare).toBeCloseTo(31 / 73, 3);
    expect(s.moving?.over50).toBe(0);
  });

  it("a still phone with jitter under 30 m/min is not moving; a car without activity is", () => {
    const jitter = still(t0, 30, 30, 15).map((f, i) => ({ ...f, lat: LAT + ((i % 2) * 10) / MLAT }));
    expect(statsBetween(qualitySamples(jitter), t0, t0 + H).moving).toBeNull();
    const car = walk(t0, 10, 30, { speed: 12, activity: null }).map((f) => ({ ...f, speed: null }));
    expect(statsBetween(qualitySamples(car), t0, t0 + H).moving?.minutes).toBe(10);
  });

  it("path noise is the median sideways deviation", () => {
    const zigzag = walk(t0, 20, 10, { jitter: (i) => (i % 2 ? 4 : -4) });
    const s = statsBetween(qualitySamples(zigzag), t0, t0 + H);
    expect(s.moving?.pathNoise).toBeCloseTo(8, 0);
    const straight = statsBetween(qualitySamples(walk(t0, 20, 10)), t0, t0 + H);
    expect(straight.moving?.pathNoise).toBe(0);
  });

  it("merges devices without interleaving their fixes", () => {
    const a = qualitySamples(walk(t0, 10, 30));
    const b = qualitySamples(walk(t0 + 15 * S, 10, 30, { speed: 1.4 }).map((f) => ({ ...f, lon: f.lon + 0.1 })));
    const s = statsBetween(mergeSamples([a, b]), t0, t0 + H);
    expect(s.moving?.minutes).toBe(20);
    expect(s.moving?.intervalMedianS).toBe(30);
  });
});

describe("presetPeriods", () => {
  it("builds periods from annotations and skips repeats", () => {
    const log: PresetChange[] = [
      { at: Date.parse("2026-10-30T10:00:00Z"), preset: { preset: "precise", custom: null, smartTracking: true } },
      { at: Date.parse("2026-11-01T10:00:00Z"), preset: { preset: "balanced", custom: null, smartTracking: true } },
    ];
    const ps = presetPeriods([...log, ...QUALITY_ANNOTATIONS]);
    expect(ps.map((p) => p.label)).toEqual([
      "Balanced, Smart Tracking off",
      "Balanced",
      "Precise",
      "Balanced",
    ]);
    expect(ps[0].start).toBe(-Infinity);
    expect(ps[2].start).toBe(Date.parse("2026-10-28T09:40:00Z"));
    expect(ps[2].end).toBe(Date.parse("2026-11-01T10:00:00Z"));
    expect(ps[3].end).toBe(Infinity);
  });

  it("without changes: one unknown period", () => {
    expect(presetPeriods([])).toEqual([{ start: -Infinity, end: Infinity, preset: null, label: "Unknown preset" }]);
  });
});

describe("qualityReport", () => {
  const at = Date.parse("2026-10-28T09:40:00Z");
  const day = (d: string, h: number) => startOfDay(d, TZ) + h * H;
  const fixes = [
    ...walk(day("2026-10-26", 8), 30, 30, { accuracy: (i) => (i % 10 === 0 ? 70 : 9) }),
    ...walk(day("2026-10-27", 8), 30, 30, { accuracy: () => 9 }),
    ...walk(day("2026-10-28", 8), 20, 30, { accuracy: () => 9 }),
    ...walk(day("2026-10-28", 15), 30, 10, { accuracy: () => 4 }),
  ];
  const samples = qualitySamples(fixes);
  const now = day("2026-10-28", 20);
  const r = qualityReport(samples, QUALITY_ANNOTATIONS, "2026-10-26", "2026-10-28", TZ, now);

  it("splits days at the change", () => {
    expect(r.periods.map((p) => p.label)).toEqual(["Balanced", "Precise"]);
    const [bal, pre] = r.periods;
    expect(bal.days.map((d) => d.date)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(pre.days.map((d) => d.date)).toEqual(["2026-10-28"]);
    expect(bal.days[2].hours).toBeCloseTo(11 + 40 / 60, 1);
    expect(pre.days[0].hours).toBeCloseTo(20 - 11 - 40 / 60, 1);
    expect(bal.total.moving?.secondsPerFix).toBe(30);
    expect(pre.total.moving?.secondsPerFix).toBe(10);
    expect(pre.total.moving?.accuracyMedian).toBe(4);
    expect(bal.end).toBe(at);
    expect(pre.end).toBeNull();
  });

  it("compares the days around the latest change", () => {
    expect(r.comparison?.at).toBe(at);
    expect(r.comparison?.before.label).toBe("Balanced");
    expect(r.comparison?.before.from).toBe(at - 7 * 24 * H);
    expect(r.comparison?.after.to).toBe(now);
    expect(r.comparison?.after.moving?.fixesPerMinute).toBe(6);
  });

  it("writes one log line with aggregates only", () => {
    const line = qualityLogLine(1, r, TZ);
    expect(line).toMatch(/^\[stats\] quality user 1: Balanced 10-19 20:03–10-28 11:40: moving 80 min 1\/30s/);
    expect(line).toContain(" | Precise 10-28 11:40–: moving 30 min 1/10s");
    expect(line).not.toMatch(/60\.\d|24\.\d{3}/);
  });
});
