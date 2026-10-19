import { describe, expect, it } from "vitest";
import { addDays, addMonths, dayBounds, daysBetween, isDate, isMonth, localDate, monthBounds, startOfDay } from "./time";

const TZ = "Europe/Helsinki";

describe("time", () => {
  it("finds local midnight in summer and winter", () => {
    expect(new Date(startOfDay("2026-07-01", TZ)).toISOString()).toBe("2026-06-30T21:00:00.000Z");
    expect(new Date(startOfDay("2026-01-15", TZ)).toISOString()).toBe("2026-01-14T22:00:00.000Z");
  });

  it("handles a DST day (25 hours in October)", () => {
    const [s, e] = dayBounds("2026-10-25", TZ);
    expect((e - s) / 3_600_000).toBe(25);
  });

  it("gives local dates and month bounds", () => {
    expect(localDate(Date.parse("2026-10-03T22:30:00Z"), TZ)).toBe("2026-10-04");
    const [s, e] = monthBounds("2026-12", TZ);
    expect(new Date(s).toISOString()).toBe("2026-11-30T22:00:00.000Z");
    expect(new Date(e).toISOString()).toBe("2026-12-31T22:00:00.000Z");
  });

  it("does calendar arithmetic", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addMonths("2026-01", -2)).toBe("2025-11");
    expect(daysBetween("2026-09-25", "2026-09-28")).toBe(3);
    expect(isDate("2026-02-30")).toBe(false);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-10")).toBe(true);
  });
});
