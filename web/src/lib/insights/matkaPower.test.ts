import { describe, expect, it } from "vitest";
import { type UsageRow, combineCurrent, usageGroups, usageLogText } from "./matkaPower";
import { estimatePower, profileFor } from "./powerModel";

const none = { n: 0, mean: null, median: null };
const row = (day: string, preset: string, o: Partial<UsageRow> = {}): UsageRow => ({
  day,
  preset,
  activeS: 3600,
  standbyS: 18 * 3600,
  offS: 0,
  fixes: 120,
  movingS: 3000,
  stillS: 60_000,
  current: { active: none, standby: none, screen: none },
  dropMah: 0,
  dropS: 0,
  ...o,
});

describe("combineCurrent", () => {
  it("weights by sample count", () => {
    expect(
      combineCurrent([
        { n: 1, mean: 100, median: 100 },
        { n: 3, mean: 200, median: 180 },
        none,
      ]),
    ).toEqual({ n: 4, mean: 175, median: 160 });
    expect(combineCurrent([none])).toEqual(none);
  });
});

describe("usageGroups", () => {
  const rows = [
    row("2026-10-27", "balanced"),
    row("2026-10-28", "balanced", { activeS: 1800, standbyS: 10 * 3600 }),
    row("2026-10-28", "precise", { activeS: 1800, standbyS: 3 * 3600, fixes: 300 }),
    // A second device on the same day and preset is summed.
    row("2026-10-28", "precise", { activeS: 600, standbyS: 0, fixes: 50, current: { active: { n: 2, mean: 400, median: 380 }, standby: none, screen: none } }),
  ];
  const groups = usageGroups(rows);

  it("groups per preset in order of first use, estimating each day", () => {
    expect(groups.map((g) => g.label)).toEqual(["Balanced", "Precise"]);
    const [bal, pre] = groups;
    expect(bal.days.map((d) => d.day)).toEqual(["2026-10-27", "2026-10-28"]);
    expect(bal.days[0].estimate).toEqual(estimatePower(rows[0], profileFor("balanced")));
    expect(pre.days).toHaveLength(1);
    expect(pre.days[0]).toMatchObject({ activeS: 2400, fixes: 350 });
    expect(pre.current.active).toEqual({ n: 2, mean: 400, median: 380 });
    expect(bal.perDay.days).toBe(2);
    expect(bal.perDay.activeS).toBe(2700);
  });

  it("an hour of Precise costs more than an hour of Balanced", () => {
    const u = { activeS: 3600, standbyS: 0, fixes: 0 };
    expect(estimatePower(u, profileFor("precise")).mAh).toBeGreaterThan(estimatePower(u, profileFor("balanced")).mAh);
  });

  it("log text is per day", () => {
    const t = usageLogText(groups);
    expect(t).toMatch(/^10-27 Balanced ≈\d+(\.\d)?mAh [\d.]+% gps 60m sb 18h 120fx; 10-28 Balanced/);
    expect(t).toContain("10-28 Precise");
    expect(t).toContain("draw act 380 sb – scr –mA drop 0mAh/0h");
  });
});
