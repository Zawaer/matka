import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateCompact,
  formatDateRange,
  formatDateShort,
  formatDay,
  formatDayHeading,
  formatDayWithYear,
  formatDistance,
  formatDuration,
  formatKm,
  formatLongDuration,
  formatMonth,
  formatRelativeDay,
} from "./format";

describe("format", () => {
  it("formats kilometres", () => {
    expect(formatKm(340)).toBe("340 m");
    expect(formatKm(8_440)).toBe("8.4 km");
    expect(formatKm(1_234_567)).toBe("1,235 km");
    // A flight: whole kilometres over 100, grouped (not "1136.5 km").
    expect(formatDistance(1_136_500)).toBe("1,137 km");
    expect(formatKm(null)).toBe("—");
  });

  it("formats a single duration", () => {
    expect(formatDuration(30)).toBe("30 s");
    expect(formatDuration(45 * 60)).toBe("45 min");
    expect(formatDuration(6 * 3600 + 34 * 60)).toBe("6 h 34 min");
    expect(formatDuration(1110 * 3600 + 51 * 60)).toBe("1,110 h 51 min");
    expect(formatDuration(0)).toBe("—");
  });

  it("formats long totals of time", () => {
    expect(formatLongDuration(6 * 3600 + 34 * 60)).toBe("6 h 34 min");
    expect(formatLongDuration(26 * 3600)).toBe("1 d 2 h");
    expect(formatLongDuration(12 * 86_400 + 3 * 3600)).toBe("12 d 3 h");
    expect(formatLongDuration(12 * 86_400)).toBe("12 d");
    // 1,110 h 51 min is 46 days.
    expect(formatLongDuration(1110 * 3600 + 51 * 60)).toBe("46 d");
    expect(formatLongDuration(1500 * 86_400)).toBe("1,500 d");
    expect(formatLongDuration(null)).toBe("—");
  });

  it("formats a compact date in the user's zone", () => {
    expect(formatDateCompact("2026-10-18T22:30:00Z", "Europe/Helsinki")).toBe("19 Oct 2026");
    expect(formatDateCompact(null)).toBe("—");
  });

  it("drops the year inside the current year", () => {
    const now = new Date("2026-10-28T10:00:00Z");
    expect(formatDateShort("2026-09-30T10:00:00Z", "Europe/Helsinki", now)).toBe("Wed 30 Sep");
    expect(formatDateShort("2025-09-30T10:00:00Z", "Europe/Helsinki", now)).toBe("Tue 30 Sep 2025");
    expect(formatDate("2026-09-04", "2026-10-28")).toBe("4 Sep");
    expect(formatDate("2025-09-04", "2026-10-28")).toBe("4 Sep 2025");
  });

  it("says recent days relatively", () => {
    const today = "2026-10-28"; // a Wednesday
    expect(formatRelativeDay("2026-10-28", today)).toBe("Today");
    expect(formatRelativeDay("2026-10-27", today)).toBe("Yesterday");
    expect(formatRelativeDay("2026-10-26", today)).toBe("Mon");
    expect(formatRelativeDay("2026-10-20", today)).toBe("20 Oct");
    expect(formatDayHeading("2026-10-26", today)).toBe("Mon 26 Oct");
    expect(formatDayHeading("2026-10-27", today)).toBe("Yesterday");
  });

  it("formats date ranges with one month abbreviation", () => {
    expect(formatDateRange("2026-10-03", "2026-10-05")).toBe("3–5 Oct 2026");
    expect(formatDateRange("2026-09-28", "2026-10-02")).toBe("28 Sep – 2 Oct 2026");
    expect(formatDateRange("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 – 2 Jan 2027");
    expect(formatDateRange("2026-10-03", "2026-10-03")).toBe("3 Oct 2026");
  });

  it("formats months and days", () => {
    expect(formatMonth("2026-10")).toBe("October 2026");
    expect(formatMonth("2026-09", true)).toBe("Sep");
    expect(formatDay("2026-10-03")).toBe("Saturday 3 October");
    expect(formatDayWithYear("2026-09-04")).toBe("Friday 4 September 2026");
  });
});
