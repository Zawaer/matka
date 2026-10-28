import {
  type Calendar,
  INITIAL_USAGE,
  dayTotals,
  medianMa,
  normaliseCounter,
  normaliseCurrent,
  noteBattery,
  noteFixes,
  noteMotion,
  noteState,
  parseUsage,
  usageLines,
  usageRows,
} from "../usage-logic";

// A UTC calendar so the tests don't depend on the machine's time zone.
const pad = (n: number) => String(n).padStart(2, "0");
const utc: Calendar = {
  dayOf: (ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  },
  nextDay: (ms) => {
    const d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  },
};
const M = 60_000;
const H = 60 * M;
const T0 = Date.UTC(2026, 9, 28, 8, 0);
const fresh = () => parseUsage(null);

describe("noteState", () => {
  it("attributes time to the state that held, per preset", () => {
    let s = noteState(fresh(), T0, { mode: "active", preset: "balanced" }, utc);
    s = noteState(s, T0 + 20 * M, { mode: "standby", preset: "balanced" }, utc);
    s = noteState(s, T0 + 2 * H, { mode: "active", preset: "precise" }, utc);
    s = noteState(s, T0 + 2 * H + 10 * M, { mode: "active", preset: "precise" }, utc);
    const day = s.days["2026-10-28"];
    expect(day.balanced).toMatchObject({ activeS: 20 * 60, standbyS: 100 * 60 });
    expect(day.precise).toMatchObject({ activeS: 10 * 60, standbyS: 0 });
  });

  it("splits at midnight and ignores long silences", () => {
    const late = Date.UTC(2026, 9, 27, 23, 30);
    let s = noteState(fresh(), late, { mode: "standby", preset: "balanced" }, utc);
    s = noteState(s, late + H, { mode: "standby", preset: "balanced" }, utc);
    expect(s.days["2026-10-27"].balanced.standbyS).toBe(30 * 60);
    expect(s.days["2026-10-28"].balanced.standbyS).toBe(30 * 60);
    s = noteState(s, late + 5 * H, { mode: "active", preset: "balanced" }, utc);
    expect(s.days["2026-10-28"].balanced.standbyS).toBe(30 * 60);
  });

  it("keeps only the newest days and survives a round trip", () => {
    let s = fresh();
    for (let d = 0; d < 5; d++) {
      s = noteState(s, T0 + d * 24 * H, { mode: "active", preset: "balanced" }, utc);
      s = noteFixes(s, T0 + d * 24 * H, 3, utc);
    }
    expect(Object.keys(s.days).sort()).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(parseUsage(JSON.stringify(s))).toEqual(s);
    expect(parseUsage("{bad")).toEqual(INITIAL_USAGE);
  });
});

describe("noteMotion", () => {
  it("counts moving and still time, capping gaps", () => {
    let s = noteState(fresh(), T0, { mode: "active", preset: "balanced" }, utc);
    s = noteMotion(s, T0, "moving", utc);
    s = noteMotion(s, T0 + 30_000, "moving", utc);
    s = noteMotion(s, T0 + 60_000, "still", utc);
    s = noteMotion(s, T0 + 60_000 + H, "still", utc); // a 1 h gap counts 5 min
    expect(s.days["2026-10-28"].balanced).toMatchObject({ movingS: 60, stillS: 300 });
  });
});

describe("battery normalisation", () => {
  it("current: sign doesn't matter, µA vs mA by magnitude, sticky µA", () => {
    expect(normaliseCurrent(-420_000, null)).toEqual({ ma: 420, unit: "uA" });
    expect(normaliseCurrent(420_000, null)).toEqual({ ma: 420, unit: "uA" });
    expect(normaliseCurrent(-420, null)).toEqual({ ma: 420, unit: null });
    expect(normaliseCurrent(-420, "mA")).toEqual({ ma: 420, unit: "mA" });
    // A deep-sleep 8 mA on a µA phone once µA is known.
    expect(normaliseCurrent(-8000, "uA")).toEqual({ ma: 8, unit: "uA" });
    expect(normaliseCurrent(0, null).ma).toBeNull();
    expect(normaliseCurrent(null, "uA")).toEqual({ ma: null, unit: "uA" });
    expect(normaliseCurrent(Number.NaN, null).ma).toBeNull();
  });

  it("charge counter: µAh or mAh", () => {
    expect(normaliseCounter(4_200_000)).toBe(4200);
    expect(normaliseCounter(4200)).toBe(4200);
    expect(normaliseCounter(-1)).toBeNull();
    expect(normaliseCounter(null)).toBeNull();
  });
});

describe("noteBattery", () => {
  const raw = (currentNow: number, chargeCounter: number, o: { plugged?: boolean; interactive?: boolean } = {}) => ({
    currentNow,
    chargeCounter,
    plugged: o.plugged ?? false,
    interactive: o.interactive ?? false,
  });

  it("aggregates current by state and the charge drop while unplugged", () => {
    let s = noteState(fresh(), T0, { mode: "active", preset: "precise" }, utc);
    s = noteBattery(s, T0, raw(-400_000, 5_000_000), utc);
    s = noteBattery(s, T0 + 10 * M, raw(-440_000, 4_930_000), utc);
    s = noteBattery(s, T0 + 20 * M, raw(-900_000, 4_800_000, { interactive: true }), utc);
    s = noteState(s, T0 + 30 * M, { mode: "standby", preset: "precise" }, utc);
    s = noteBattery(s, T0 + 40 * M, raw(-60_000, 4_790_000), utc);
    // Plugged in: no samples, and the next unplugged reading doesn't pair across it.
    s = noteBattery(s, T0 + 50 * M, raw(1_000_000, 4_900_000, { plugged: true }), utc);
    s = noteBattery(s, T0 + 60 * M, raw(-50_000, 5_000_000), utc);
    const b = s.days["2026-10-28"].precise;
    expect(b.cur.active.n).toBe(2);
    expect(b.cur.screen.n).toBe(1);
    expect(b.cur.standby.n).toBe(2);
    expect(b.dropMah).toBeCloseTo(210, 5);
    expect(b.dropS).toBe(40 * 60);
    const [row] = usageRows(s, ["2026-10-28"]);
    expect(row.current.active).toEqual({ n: 2, mean: 420, median: 405 });
    expect(row.current.standby.median).toBe(55);
    expect(row).toMatchObject({ preset: "precise", activeS: 1800, dropMah: 210, dropS: 2400 });
  });

  it("no current while recording is off unless the screen is on; null readings are ignored", () => {
    let s = fresh();
    s = noteBattery(s, T0, raw(-300_000, 5_000_000), utc);
    s = noteBattery(s, T0 + M, null, utc);
    s = noteBattery(s, T0 + 2 * M, raw(-800_000, 4_990_000, { interactive: true }), utc);
    const b = s.days["2026-10-28"].balanced;
    expect(b.cur.active.n + b.cur.standby.n).toBe(0);
    expect(b.cur.screen.n).toBe(1);
  });
});

describe("medianMa / dayTotals", () => {
  it("median from histogram bins", () => {
    expect(medianMa({ n: 0, sum: 0, hist: {} })).toBeNull();
    expect(medianMa({ n: 3, sum: 0, hist: { "5": 2, "40": 1 } })).toBe(55);
  });

  it("sums presets for the day", () => {
    let s = noteState(fresh(), T0, { mode: "active", preset: "balanced" }, utc);
    s = noteState(s, T0 + 10 * M, { mode: "active", preset: "precise" }, utc);
    s = noteFixes(s, T0 + 10 * M, 5, utc);
    s = noteState(s, T0 + 30 * M, { mode: "active", preset: "precise" }, utc);
    expect(dayTotals(s, "2026-10-28")).toMatchObject({ activeS: 1800, fixes: 5 });
    expect(dayTotals(s, "2026-10-29").activeS).toBe(0);
  });
});

describe("usageLines", () => {
  it("formats the Recorder lines", () => {
    let s = noteState(fresh(), T0, { mode: "active", preset: "balanced" }, utc);
    s = noteState(s, T0 + 22 * M, { mode: "standby", preset: "balanced" }, utc);
    s = noteBattery(s, T0 + 23 * M, { currentNow: -60_000, chargeCounter: 5_000_000, plugged: false, interactive: false }, utc);
    s = noteBattery(s, T0 + 3 * H, { currentNow: -60_000, chargeCounter: 3_760_000, plugged: false, interactive: false }, utc);
    s = noteState(s, T0 + 3 * H, { mode: "standby", preset: "balanced" }, utc);
    const l = usageLines(dayTotals(s, "2026-10-28"), { mAh: 24.6, percent: 0.41 });
    expect(l.estimate).toBe("Battery today: ≈ 0.4 % (≈ 25 mAh) · GPS active 22 min · standby 2.6 h");
    expect(l.draw).toBe("Phone draw in standby: ~65 mA");
    expect(l.drop).toBe("Measured drop today: 1,240 mAh unplugged (2.6 h)");
    expect(usageLines(dayTotals(fresh(), "2026-10-28"), { mAh: 0, percent: 0 })).toMatchObject({ draw: null, drop: null });
  });
});
