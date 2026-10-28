import { DEFAULT_CUSTOM } from "../preset-logic";
import { MIN_MOVING_MINUTES, fmtBatteryPercent, parseQualityByPreset, qualityLine } from "../quality-logic";

const moving = (minutes: number, secondsPerFix: number, accuracyMedian: number | null, fixes = 100) => ({
  minutes,
  fixes,
  fixesPerMinute: 60 / secondsPerFix,
  secondsPerFix,
  intervalMedianS: secondsPerFix,
  intervalP90S: secondsPerFix * 2,
  accuracyMedian,
  accuracyP90: accuracyMedian,
  within10: null,
  within20: null,
  over50: null,
  pathNoise: null,
});
const period = (preset: string, m: ReturnType<typeof moving> | null, extra: Record<string, unknown> = {}) => ({
  label: preset,
  preset: { preset, custom: null, smartTracking: true, ...extra },
  start: null,
  end: null,
  total: { fixes: 500, hours: 24, fixesPerHour: 20, standbyShare: 0.3, moving: m },
  days: [],
});
const usage = (preset: string, percent: number, days = 3) => ({ preset, label: preset, days: [], perDay: { days, mAh: 10, percent } });

test("rejects what isn't a quality report", () => {
  expect(parseQualityByPreset(null, DEFAULT_CUSTOM)).toBeNull();
  expect(parseQualityByPreset({ error: "failed" }, DEFAULT_CUSTOM)).toBeNull();
  expect(parseQualityByPreset({ periods: [] }, DEFAULT_CUSTOM)).toEqual({});
});

test("combines a preset's periods by moving time and attaches the battery estimate", () => {
  const body = {
    periods: [
      period("balanced", moving(60, 30, 10, 100), { smartTracking: false }),
      period("balanced", moving(120, 40, 6, 300)),
      period("precise", moving(45, 10, 4)),
      period(null as unknown as string, moving(500, 10, 4)),
      period("max", null),
    ],
    usage: [usage("balanced", 0.42), usage("precise", 1.3, 0), usage("bogus", 9)],
  };
  const q = parseQualityByPreset(body, DEFAULT_CUSTOM)!;
  expect(Object.keys(q).sort()).toEqual(["balanced", "precise"]);
  // 180 min; 3600 s / 30 + 7200 s / 40 = 300 intervals → 10800 s / 300 = 36 s.
  expect(q.balanced!.minutes).toBe(180);
  expect(q.balanced!.secondsPerFix).toBeCloseTo(36);
  // Accuracy medians weighted by fixes: (10·100 + 6·300) / 400 = 7.
  expect(q.balanced!.accuracyMedian).toBeCloseTo(7);
  expect(q.balanced!.batteryPercent).toBe(0.42);
  // No recording days → no battery figure.
  expect(q.precise!.batteryPercent).toBeNull();
});

test("needs enough moving minutes", () => {
  const body = { periods: [period("precise", moving(MIN_MOVING_MINUTES - 1, 10, 4))] };
  expect(parseQualityByPreset(body, DEFAULT_CUSTOM)).toEqual({});
});

test("custom only counts periods with the current custom values", () => {
  const mine = { accuracy: "highest", distance: 10, time: 10_000 } as const;
  const body = {
    periods: [
      period("custom", moving(40, 10, 5), { custom: { ...mine } }),
      period("custom", moving(400, 60, 50), { custom: { accuracy: "balanced", distance: 100, time: 120_000 } }),
    ],
  };
  const q = parseQualityByPreset(body, mine)!;
  expect(q.custom!.minutes).toBe(40);
  expect(q.custom!.accuracyMedian).toBe(5);
  expect(parseQualityByPreset(body, DEFAULT_CUSTOM)).toEqual({});
});

test("the line", () => {
  expect(qualityLine({ minutes: 200, accuracyMedian: 7.6, secondsPerFix: 30.6, batteryPercent: 0.42 })).toBe(
    "On your phone: median 8 m · a point every 31 s while moving · ≈ 0.4% battery a day",
  );
  expect(qualityLine({ minutes: 200, accuracyMedian: null, secondsPerFix: 125, batteryPercent: null })).toBe(
    "On your phone: a point every 2 min 5 s while moving",
  );
  expect(qualityLine({ minutes: 200, accuracyMedian: 0.4, secondsPerFix: 0.3, batteryPercent: 12.4 })).toBe(
    "On your phone: median 1 m · a point every 1 s while moving · ≈ 12% battery a day",
  );
  expect(fmtBatteryPercent(0.01)).toBe("<0.1%");
  expect(fmtBatteryPercent(2.06)).toBe("2.1%");
});
