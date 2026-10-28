import { describe, expect, it } from "vitest";
import {
  type Reading,
  batteryLogLine,
  compareAround,
  dailyBattery,
  dischargeSegments,
} from "./battery";
import { startOfDay } from "./time";

const TZ = "Europe/Helsinki";
const H = 3_600_000;
const M = 60_000;

/** Readings every `stepMin` minutes from `at`, falling linearly from `from` to `to` over `hours`. */
function fall(at: number, hours: number, from: number, to: number, stepMin = 10): Reading[] {
  const out: Reading[] = [];
  const n = Math.round((hours * 60) / stepMin);
  for (let i = 0; i <= n; i++) out.push({ ts: at + i * stepMin * M, battery: Math.round(from + ((to - from) * i) / n) });
  return out;
}

describe("dischargeSegments", () => {
  const t0 = startOfDay("2026-10-20", TZ) + 8 * H;

  it("rates a plain discharge", () => {
    const [s, ...rest] = dischargeSegments(fall(t0, 4, 80, 60));
    expect(rest).toEqual([]);
    expect(s.hours).toBe(4);
    expect(s.drop).toBe(20);
    expect(s.rate).toBe(5);
  });

  it("splits at charging (a rise of 2+) and cuts back to the lowest level", () => {
    const charge = [
      { ts: t0 + 4 * H + 10 * M, battery: 61 }, // 1-point wobble: still the same segment
      { ts: t0 + 4 * H + 20 * M, battery: 62 }, // 2 above the low: charging
      ...fall(t0 + 4 * H + 30 * M, 1, 70, 90), // rising while plugged
    ];
    const after = fall(t0 + 6 * H, 2, 89, 79); // unplugged at 90 (t0 + 5.5 h)
    const segs = dischargeSegments([...fall(t0, 4, 80, 60), ...charge, ...after]);
    expect(segs.map((s) => [s.start, s.end, s.drop])).toEqual([
      [t0, t0 + 4 * H, 20],
      [t0 + 5.5 * H, t0 + 8 * H, 11],
    ]);
  });

  it("splits at a gap over 3 h and ignores short or flat stretches", () => {
    const segs = dischargeSegments([
      ...fall(t0, 2, 90, 80),
      ...fall(t0 + 5.5 * H, 0.25, 79, 70), // 15 min: too short
      ...fall(t0 + 9 * H, 2, 70, 68), // 2 points: too little
    ]);
    expect(segs).toHaveLength(1);
    expect(segs[0].end).toBe(t0 + 2 * H);
  });

  it("starts at the last reading at the top level (still on the charger)", () => {
    const topUp = [
      { ts: t0, battery: 99 },
      ...[1, 2, 3].map((i) => ({ ts: t0 + i * 20 * M, battery: 100 })),
    ];
    const segs = dischargeSegments([...topUp, ...fall(t0 + H + 10 * M, 2, 99, 90)]);
    expect(segs[0].start).toBe(t0 + H);
  });
});

describe("dailyBattery", () => {
  it("splits drain across days and reports the night", () => {
    const d = startOfDay("2026-10-20", TZ);
    // 20 Oct 18:00 → 21 Oct 06:00, 2 %/h; then 21 Oct 08:00 → 12:00 at 6 %/h.
    const segs = dischargeSegments([...fall(d + 18 * H, 12, 90, 66, 30), ...fall(d + 32 * H, 4, 95, 71)]);
    const days = dailyBattery(segs, "2026-10-19", "2026-10-21", TZ);
    expect(days.map((x) => x.date)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
    expect(days[0]).toMatchObject({ hours: 0, rate: null, night: null });
    expect(days[1]).toMatchObject({ hours: 6, used: 12, rate: 2, fullChargeHours: 50, night: null });
    expect(days[2]).toMatchObject({ hours: 10, used: 36, rate: 3.6, night: { hours: 6, rate: 2 } });
  });

  it("compares the days around a marker, weighted by time", () => {
    const at = startOfDay("2026-10-19", TZ) + 20 * H;
    const segs = dischargeSegments([...fall(at - 30 * H, 5, 100, 70), ...fall(at + 30 * H, 10, 100, 80, 30)]);
    const { before, after } = compareAround(segs, at);
    expect(before.rate).toBe(6);
    expect(after.rate).toBe(2);
  });
});

describe("batteryLogLine", () => {
  it("is compact and aggregate only", () => {
    const line = batteryLogLine(1, [
      { date: "2026-10-18", hours: 9.1, used: 47.3, rate: 5.2, fullChargeHours: 19.2, night: { hours: 7, rate: 3 } },
      { date: "2026-10-19", hours: 0, used: 0, rate: null, fullChargeHours: null, night: null },
    ]);
    expect(line).toBe("[stats] battery user 1: 10-18 5.2%/h(9.1h) night 3.0 | 10-19 –");
  });
});
