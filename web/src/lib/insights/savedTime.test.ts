import { describe, expect, it } from "vitest";
import { savedPlaceMonth } from "./savedTime";
import { startOfDay } from "./time";

const TZ = "Europe/Helsinki";
const H = 3_600_000;
const v = (placeId: number, date: string, from: number, hours: number) => {
  const s = startOfDay(date, TZ) + from * H;
  return { placeId, start: s, end: s + hours * H };
};

describe("savedPlaceMonth", () => {
  const places = [
    { placeId: 1, name: "Mom's", kind: "home" as const },
    { placeId: 2, name: "Dad's", kind: "family" as const },
    { placeId: 3, name: "School", kind: "school" as const },
  ];

  it("sums time inside the month and counts nights mostly spent there", () => {
    const visits = [
      v(1, "2026-09-30", 20, 12), // 30 Sep 20:00 → 1 Oct 08:00: 8 h in October, the night of 1 Oct
      v(3, "2026-10-01", 9, 6),
      v(1, "2026-10-01", 16, 10), // night of 2 Oct: 00–02 only (2 h of 6): not mostly
      v(2, "2026-10-02", 2, 20), // night of 2 Oct: 02–06 (4 h): mostly at dad's
      v(2, "2026-10-31", 20, 12), // 4 h in October, its night (1 Nov) is November's
    ];
    const out = savedPlaceMonth(places, visits, "2026-10", TZ);
    expect(out.map((r) => [r.name, r.seconds / 3600, r.nights])).toEqual([
      ["Dad's", 24, 1],
      ["Mom's", 18, 1],
      ["School", 6, 0],
    ]);
  });

  it("leaves out saved places not visited that month", () => {
    expect(savedPlaceMonth(places, [v(3, "2026-09-01", 9, 6)], "2026-10", TZ)).toEqual([]);
  });
});
