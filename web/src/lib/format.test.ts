import { describe, expect, it } from "vitest";
import { formatDateRange, formatDay, formatKm, formatMonth } from "./format";

describe("format", () => {
  it("formats kilometres", () => {
    expect(formatKm(340)).toBe("340 m");
    expect(formatKm(8_440)).toBe("8.4 km");
    expect(formatKm(1_234_567)).toBe("1,235 km");
  });

  it("formats date ranges", () => {
    expect(formatDateRange("2026-10-03", "2026-10-05")).toBe("3–5 Oct 2026");
    expect(formatDateRange("2026-09-28", "2026-10-02")).toBe("28 Sept – 2 Oct 2026");
    expect(formatDateRange("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 – 2 Jan 2027");
    expect(formatDateRange("2026-10-03", "2026-10-03")).toBe("3 Oct 2026");
  });

  it("formats months and days", () => {
    expect(formatMonth("2026-10")).toBe("October 2026");
    expect(formatMonth("2026-10", true)).toBe("Oct");
    expect(formatDay("2026-10-03")).toBe("Saturday 3 October");
  });
});
