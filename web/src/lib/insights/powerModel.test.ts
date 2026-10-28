import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  POWER_CALIBRATION,
  POWER_MODEL,
  estimatePower,
  powerModel,
  profileFor,
  receiverOnFraction,
} from "./powerModel";

const c = POWER_CALIBRATION;

describe("power model", () => {
  it("derives the constants from the calibration", () => {
    expect(POWER_MODEL.gnssMa).toBeCloseTo(75.6, 1);
    // 20 of 120 active minutes on, of which 0.7/30 is the fix pulses.
    expect(POWER_MODEL.overheadFraction).toBeCloseTo(20 / 120 - 0.7 / 30, 4);
    expect(POWER_MODEL.perFixMah).toBeCloseTo(0.01, 4);
    expect(POWER_MODEL.recordingMa).toBeCloseTo((34.3 - 25.2 - 4) / 15.23, 4);
  });

  it("reproduces the calibration cycle", () => {
    const e = estimatePower(
      { activeS: c.activeMinutes * 60, standbyS: (c.hoursOnBattery * 60 - c.activeMinutes) * 60, fixes: c.fixes },
      profileFor("balanced"),
    );
    expect(e.gnssMah).toBeCloseTo(c.gnssMah, 0);
    expect(e.mAh).toBeCloseTo(c.matkaTotalMah, 0);
    expect(e.percent).toBeCloseTo((34.3 / 6000) * 100, 2);
  });

  it("orders the presets by receiver time", () => {
    const f = (p: string) => receiverOnFraction(profileFor(p));
    expect(f("low")).toBe(0);
    expect(f("balanced")).toBeCloseTo(1 / 6, 3);
    expect(f("precise")).toBeGreaterThan(f("balanced"));
    expect(f("max")).toBe(1);
    expect(receiverOnFraction(profileFor("custom", { accuracy: "balanced", time: 10_000 }))).toBe(0);
    expect(receiverOnFraction(profileFor("custom", { accuracy: "highest", time: 2_000 }))).toBe(1);
    expect(profileFor("unknown")).toEqual(profileFor("balanced"));
  });

  it("battery capacity and calibration are configurable", () => {
    const u = { activeS: 3600, standbyS: 0, fixes: 0 };
    expect(estimatePower(u, profileFor("max"), POWER_MODEL, 3000).percent).toBeCloseTo(
      2 * estimatePower(u, profileFor("max")).percent,
      1,
    );
    const m = powerModel({ ...c, gnssOnMinutes: 40, gnssMah: 50.4 });
    expect(m.gnssMa).toBeCloseTo(75.6, 1);
    expect(m.overheadFraction).toBeGreaterThan(POWER_MODEL.overheadFraction);
  });

  it("the phone app has an identical copy", () => {
    const web = readFileSync(path.join(__dirname, "powerModel.ts"), "utf8");
    const mobile = readFileSync(path.join(__dirname, "../../../../mobile/src/power-model.ts"), "utf8");
    expect(mobile).toBe(web);
  });
});
